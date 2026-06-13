import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { redis, sessionChannel } from '@/lib/redis'
import { getAgentWallets } from '@/services/agentWalletService'
import { runAgent } from '@/services/veniceAgentService'
import { runCollapse } from '@/services/collapseOrchestratorService'
import { hashReasoningContent } from '@/services/delegationService'
import { redeemWinnerDelegation } from '@/services/executionService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TERMINAL_OR_RUNNING = ['AGENTS_RUNNING', 'HASHES_SUBMITTED', 'COLLAPSED', 'EXECUTED']

const short = (h: unknown) => (typeof h === 'string' ? `${h.slice(0, 16)}…` : '')
const trunc = (s: unknown) =>
  typeof s === 'string' ? (s.length > 72 ? `${s.slice(0, 72)}…` : s) : ''

/** Demo-friendly terminal play-by-play for each streamed event. */
function logEvent(e: Record<string, unknown>) {
  switch (e.type) {
    case 'agents_started':
      logger.info(`◆ SUPERPOSITION — ${e.agentCount} agents reasoning in parallel (Venice via x402)`)
      break
    case 'agent_done':
      logger.info(`  ✓ agent ${e.agentId} (${e.role})  confidence=${e.confidence}  — ${trunc(e.summary)}`)
      break
    case 'hash_submitted':
      logger.info(`  ↑ agent ${e.agentId} reasoning hash → Base Sepolia  ${short(e.txHash)}`)
      break
    case 'hash_confirmed':
      logger.info(`  ⛓  agent ${e.agentId} hash confirmed onchain`)
      break
    case 'wavefunction_collapsed':
      logger.info(`★ WAVEFUNCTION COLLAPSED → winner = agent ${e.winnerAgentId} (confidence ${e.winnerConfidence})`)
      break
    case 'execution_redeemed':
      logger.info(`  $ winner redeemed delegated USDC  ${short(e.txHash)}`)
      break
    case 'execution_complete':
      logger.info(`◆ SESSION COMPLETE — winner agent ${e.winnerAgentId}`)
      break
    case 'error':
      logger.error(`✗ ${e.message}`)
      break
  }
}

function publish(sessionId: string, event: Record<string, unknown>) {
  logEvent(event)
  return redis
    .publish(sessionChannel(sessionId), JSON.stringify({ ...event, ts: Date.now() }))
    .catch(() => {})
}

/**
 * The collapse run: 3 agents reason in parallel (Venice) → hashes committed onchain →
 * contract auto-collapses → results persisted. Every step is published to Redis so the
 * SSE stream can animate it live. (Grant-delegation is optional — the collapse mechanism
 * doesn't depend on the sub-delegations existing.)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const sessionId = params.sessionId as Hex
  const session = await prisma.session.findUnique({ where: { sessionId } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (TERMINAL_OR_RUNNING.includes(session.status)) {
    return NextResponse.json({ error: `Session already ${session.status}` }, { status: 409 })
  }

  try {
    logger.info(`▶ RUN ${sessionId.slice(0, 12)}…  intent: "${trunc(session.userIntent)}"`)
    const agents = await getAgentWallets()
    await prisma.session.update({ where: { sessionId }, data: { status: 'AGENTS_RUNNING' } })
    await publish(sessionId, { type: 'agents_started', agentCount: agents.length })

    // All agents think in parallel; stream each one's reasoning + result.
    const agentResults = await Promise.all(
      agents.map((a) =>
        runAgent({
          agentId: a.agentId,
          userIntent: session.userIntent,
          onReasoning: (chunk) =>
            void publish(sessionId, { type: 'agent_reasoning', agentId: a.agentId, chunk }),
        }).then((res) => {
          void publish(sessionId, {
            type: 'agent_done',
            agentId: res.agentId,
            role: res.role,
            confidence: res.confidence,
            summary: res.output.summary,
          })
          return res
        })
      )
    )

    await prisma.session.update({ where: { sessionId }, data: { status: 'HASHES_SUBMITTED' } })

    // Commit hashes onchain + wait for the contract's WavefunctionCollapsed event.
    const collapse = await runCollapse({
      sessionId,
      agentResults,
      onHashSubmitted: (agentId, txHash) =>
        void publish(sessionId, { type: 'hash_submitted', agentId, txHash }),
      onHashConfirmed: (agentId, txHash) =>
        void publish(sessionId, { type: 'hash_confirmed', agentId, txHash }),
    })

    await publish(sessionId, {
      type: 'wavefunction_collapsed',
      winnerAgentId: collapse.winnerAgentId,
      winnerHash: collapse.winnerHash,
      winnerConfidence: collapse.winnerConfidence,
    })

    // Persist all agent results + the winner, atomically.
    await prisma.$transaction([
      ...agentResults.map((r) =>
        prisma.agentResult.upsert({
          where: { sessionId_agentId: { sessionId, agentId: r.agentId } },
          create: {
            sessionId,
            agentId: r.agentId,
            role: r.role,
            reasoningContent: r.reasoningContent,
            reasoningHash: hashReasoningContent(r.reasoningContent),
            confidence: r.confidence,
            structuredOutput: r.output as any,
            hashTxHash: collapse.hashTxHashes[r.agentId] ?? null,
          },
          update: {
            reasoningContent: r.reasoningContent,
            confidence: r.confidence,
            structuredOutput: r.output as any,
            hashTxHash: collapse.hashTxHashes[r.agentId] ?? null,
          },
        })
      ),
      prisma.session.update({
        where: { sessionId },
        data: {
          status: 'EXECUTED',
          winnerAgentId: collapse.winnerAgentId,
          winnerHash: collapse.winnerHash,
        },
      }),
    ])

    // F3b — if the user granted a wallet delegation, redeem the winner's context to actually
    // spend the delegated USDC (gated by the enforcer). Best-effort: never breaks the collapse.
    try {
      const granted = session.agentDelegations as unknown as
        | { agentId: number; permissionContext: Hex }[]
        | null
      const winnerCtx = Array.isArray(granted)
        ? granted.find((c) => c.agentId === collapse.winnerAgentId)?.permissionContext
        : undefined
      if (winnerCtx) {
        const winnerAddr = agents.find((a) => a.agentId === collapse.winnerAgentId)!.address
        const redeemTx = await redeemWinnerDelegation({
          winnerContext: winnerCtx,
          recipient: winnerAddr,
          amountUsdc: 0.05,
        })
        await publish(sessionId, {
          type: 'execution_redeemed',
          winnerAgentId: collapse.winnerAgentId,
          txHash: redeemTx,
        })
        logger.info({ sessionId, redeemTx }, 'winner delegation redeemed')
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, sessionId }, 'winner redemption skipped')
    }

    await publish(sessionId, { type: 'execution_complete', winnerAgentId: collapse.winnerAgentId })
    logger.info({ sessionId, winner: collapse.winnerAgentId }, 'collapse complete')

    return NextResponse.json({
      winnerAgentId: collapse.winnerAgentId,
      winnerHash: collapse.winnerHash,
      winnerConfidence: collapse.winnerConfidence,
      hashTxHashes: collapse.hashTxHashes,
    })
  } catch (err) {
    const message = (err as Error).message
    logger.error({ err: message, sessionId }, 'run failed')
    await prisma.session.update({ where: { sessionId }, data: { status: 'FAILED' } }).catch(() => {})
    await publish(sessionId, { type: 'error', message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
