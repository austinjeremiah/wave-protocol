import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { redis, sessionChannel } from '@/lib/redis'
import { getAgentWallets } from '@/services/agentWalletService'
import { runAgent, runAgentDebate } from '@/services/veniceAgentService'
import { runCollapse } from '@/services/collapseOrchestratorService'
import { hashReasoningContent } from '@/services/delegationService'
import { redeemWinnerDelegation, executeVaultStrategy, fundVaultFromTreasury } from '@/services/executionService'
import { waitForTx } from '@/services/enforcerService'
import { getBackendAccount } from '@/services/chainService'

const DEMO_DEAD = '0x000000000000000000000000000000000000dEaD'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TERMINAL_OR_RUNNING = ['AGENTS_RUNNING', 'AGENTS_DEBATING', 'HASHES_SUBMITTED', 'COLLAPSED', 'EXECUTING', 'EXECUTED']

const short = (h: unknown) => (typeof h === 'string' ? `${h.slice(0, 16)}…` : '')
const trunc = (s: unknown) =>
  typeof s === 'string' ? (s.length > 72 ? `${s.slice(0, 72)}…` : s) : ''

function logEvent(e: Record<string, unknown>) {
  switch (e.type) {
    case 'agents_started':
      logger.info(`◆ SUPERPOSITION — ${e.agentCount} agents reasoning in parallel (Venice × x402)`)
      break
    case 'agent_done':
      logger.info(`  ✓ R1 agent ${e.agentId} (${e.role})  confidence=${e.confidence}  — ${trunc(e.summary)}`)
      break
    case 'debate_started':
      logger.info(`⚡ DEBATE ROUND — agents critiquing peers + placing conviction bets (x402 scaled)`)
      break
    case 'confidence_shift':
      logger.info(
        `  ↕  agent ${e.agentId} confidence: ${e.from} → ${e.to}  (conviction bet: $${e.convictionBetUsdc})`
      )
      if (e.critique) logger.info(`     💬 agent ${e.agentId}: "${String(e.critique).slice(0, 180)}"`)
      break
    case 'debate_complete':
      logger.info(`  ✓ DEBATE COMPLETE — revised confidences locked`)
      break
    case 'hash_submitted':
      logger.info(`  ↑ agent ${e.agentId} hash → Base Sepolia  ${short(e.txHash)}`)
      break
    case 'hash_confirmed':
      logger.info(`  ⛓  agent ${e.agentId} hash confirmed onchain`)
      break
    case 'wavefunction_collapsed':
      logger.info(
        `★ WAVEFUNCTION COLLAPSED → winner = agent ${e.winnerAgentId} (revised confidence ${e.winnerConfidence})`
      )
      break
    case 'execution_started':
      logger.info(`  ⚙  executing winner strategy — USDC → WaveStrategyVault → Compound V3`)
      break
    case 'execution_redeemed':
      logger.info(
        `  $ ${e.viaDelegation ? 'delegation redeemed (user USDC)' : 'treasury funded'} → vault  ${short(e.txHash)}`
      )
      break
    case 'execution_supplied':
      logger.info(
        `  🌊 USDC supplied to Compound V3 — cUSDC credited to ${short(e.recipient)} (user owns it)  ${short(e.txHash)}`
      )
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
 * V2 collapse run — 2-round A2A debate + conviction bets + Compound V3 strategy execution.
 *
 * Round 1: 3 agents reason independently (Venice × x402, flat $0.01 each).
 * Round 2: each agent sees all peers' proposals, critiques them + revises confidence.
 *          conviction bet = x402 price scaled by round 1 confidence (higher belief = bigger bet).
 * Collapse: revised confidences submitted onchain → VeniceCollapseEnforcer picks winner.
 * Execution (wallet path): winner's delegation redeems → USDC → WaveStrategyVault → Compound V3.
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

    // ── ROUND 1: independent reasoning ──────────────────────────────────────────
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
            action: res.output.action,
          })
          return res
        })
      )
    )

    // ── ROUND 2: A2A debate + conviction bets ────────────────────────────────────
    await prisma.session.update({ where: { sessionId }, data: { status: 'AGENTS_DEBATING' } })
    await publish(sessionId, { type: 'debate_started', roundNumber: 2 })

    const debateResults = await Promise.all(
      agents.map((a) =>
        runAgentDebate({
          agentId: a.agentId,
          userIntent: session.userIntent,
          round1Results: agentResults,
          onReasoning: (chunk) =>
            void publish(sessionId, { type: 'agent_debate_reasoning', agentId: a.agentId, chunk }),
        }).then((res) => {
          void publish(sessionId, {
            type: 'confidence_shift',
            agentId: res.agentId,
            from: res.round1Confidence,
            to: res.revisedConfidence,
            convictionBetUsdc: res.convictionBetUsdc,
            critique: res.critiqueText.slice(0, 1000),
            revisedAction: res.revisedAction,
          })
          return res
        })
      )
    )

    const revisedConfidences: Record<number, number> = {}
    for (const d of debateResults) revisedConfidences[d.agentId] = d.revisedConfidence

    await publish(sessionId, {
      type: 'debate_complete',
      results: debateResults.map((d) => ({
        agentId: d.agentId,
        from: d.round1Confidence,
        to: d.revisedConfidence,
        convictionBetUsdc: d.convictionBetUsdc,
      })),
    })

    // ── COLLAPSE: submit revised confidences onchain ──────────────────────────────
    await prisma.session.update({ where: { sessionId }, data: { status: 'HASHES_SUBMITTED' } })

    const collapse = await runCollapse({
      sessionId,
      agentResults,
      revisedConfidences,
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

    // ── PERSIST ───────────────────────────────────────────────────────────────────
    await prisma.$transaction([
      ...agentResults.map((r) => {
        const debate = debateResults.find((d) => d.agentId === r.agentId)
        return prisma.agentResult.upsert({
          where: { sessionId_agentId: { sessionId, agentId: r.agentId } },
          create: {
            sessionId,
            agentId: r.agentId,
            role: r.role,
            reasoningContent: r.reasoningContent,
            reasoningHash: hashReasoningContent(r.reasoningContent),
            confidence: revisedConfidences[r.agentId] ?? r.confidence,
            round1Confidence: r.confidence,
            revisedConfidence: debate?.revisedConfidence ?? null,
            critiqueText: debate?.critiqueText ?? null,
            convictionBetUsdc: debate?.convictionBetUsdc ?? null,
            structuredOutput: r.output as never,
            hashTxHash: collapse.hashTxHashes[r.agentId] ?? null,
          },
          update: {
            confidence: revisedConfidences[r.agentId] ?? r.confidence,
            round1Confidence: r.confidence,
            revisedConfidence: debate?.revisedConfidence ?? null,
            critiqueText: debate?.critiqueText ?? null,
            convictionBetUsdc: debate?.convictionBetUsdc ?? null,
            structuredOutput: r.output as never,
            hashTxHash: collapse.hashTxHashes[r.agentId] ?? null,
          },
        })
      }),
      prisma.session.update({
        where: { sessionId },
        data: {
          status: 'EXECUTING',
          winnerAgentId: collapse.winnerAgentId,
          winnerHash: collapse.winnerHash,
        },
      }),
    ])

    // ── EXECUTION: winner's USDC → vault → Compound V3 (real yield) ───────────────
    // Always runs so the strategy execution is demo-reliable. If the user granted a funded,
    // deployed ERC-7715 delegation, we redeem THEIR USDC (the real ERC-7710 story); otherwise
    // the backend treasury funds the vault so the Compound V3 supply still happens for real.
    try {
      const vaultAddress = process.env.WAVE_STRATEGY_VAULT_ADDRESS
      if (!vaultAddress) throw new Error('WAVE_STRATEGY_VAULT_ADDRESS not set')

      await publish(sessionId, { type: 'execution_started', winnerAgentId: collapse.winnerAgentId })

      // Who owns the resulting Compound position: the connected user; falls back to the backend
      // EOA only when no wallet was connected (so demo funds aren't sent to the dead address).
      const recipient =
        session.userAddress && session.userAddress.toLowerCase() !== DEMO_DEAD.toLowerCase()
          ? (session.userAddress as `0x${string}`)
          : getBackendAccount().address

      const granted = session.agentDelegations as unknown as
        | { agentId: number; permissionContext: Hex }[]
        | null
      const winnerCtx = Array.isArray(granted)
        ? granted.find((c) => c.agentId === collapse.winnerAgentId)?.permissionContext
        : undefined

      // Step 1: get USDC into the vault. Recipient MUST be the vault so it can supply.
      let fundingTx: Hex
      let viaDelegation = false
      if (winnerCtx) {
        try {
          const accountMetadata = session.accountMetadata as unknown as
            | { factory: `0x${string}`; factoryData: `0x${string}` }[]
            | null
          fundingTx = await redeemWinnerDelegation({
            winnerContext: winnerCtx,
            recipient: vaultAddress as `0x${string}`,
            amountUsdc: session.budgetUsdc,
            sessionId: sessionId as `0x${string}`,
            winnerAgentId: collapse.winnerAgentId,
            accountMetadata,
          })
          viaDelegation = true
        } catch (e) {
          logger.warn(
            `  ⚠ delegation redeem reverted (${(e as Error).message.split('\n')[0].slice(0, 90)}) — funding vault from treasury`
          )
          fundingTx = await fundVaultFromTreasury({ amountUsdc: session.budgetUsdc })
        }
      } else {
        fundingTx = await fundVaultFromTreasury({ amountUsdc: session.budgetUsdc })
      }
      await publish(sessionId, {
        type: 'execution_redeemed',
        winnerAgentId: collapse.winnerAgentId,
        txHash: fundingTx,
        viaDelegation,
      })

      // Wait for funding to mine — vault.executeStrategy reads balanceOf(vault).
      await waitForTx(fundingTx)

      // Step 2: vault supplies its USDC to Compound V3 → cUSDC credited to the USER (they own it).
      const supplyTx = await executeVaultStrategy({
        sessionId,
        winnerAgentId: collapse.winnerAgentId,
        userAddress: recipient,
      })
      await publish(sessionId, {
        type: 'execution_supplied',
        winnerAgentId: collapse.winnerAgentId,
        txHash: supplyTx,
        protocol: 'Compound V3',
        vaultAddress,
        recipient,
      })
      await waitForTx(supplyTx)
      await prisma.session.update({
        where: { sessionId },
        data: { strategyVaultTx: fundingTx, aaveSupplyTx: supplyTx, fundedViaDelegation: viaDelegation },
      })
      logger.info(
        { sessionId, fundingTx, supplyTx, viaDelegation },
        `strategy executed — USDC supplied to Compound V3 ${viaDelegation ? '(via delegation)' : '(via treasury)'}`
      )
    } catch (e) {
      logger.warn({ err: (e as Error).message, sessionId }, 'strategy execution failed')
    }

    await prisma.session.update({ where: { sessionId }, data: { status: 'EXECUTED' } })
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
