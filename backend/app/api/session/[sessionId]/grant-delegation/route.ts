import { NextResponse, type NextRequest } from 'next/server'
import { parseUnits, type Hex } from 'viem'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { redelegateAgentContexts } from '@/services/delegationService'
import { USDC_DECIMALS } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * The frontend grants a root delegation (User → Agent A) via ERC-7715 and posts the
 * resulting permission context here. We fan it out into 3 budget-scoped, enforcer-gated
 * sub-delegations (signed offchain) and persist them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const sessionId = params.sessionId as Hex
  const session = await prisma.session.findUnique({ where: { sessionId } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  let body: { rootDelegation?: unknown; delegationManager?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.rootDelegation) {
    return NextResponse.json({ error: 'rootDelegation is required' }, { status: 400 })
  }

  try {
    // Scope every agent's redelegation to the FULL deposit so the winner can deploy the whole
    // amount the user set (the enforcer still ensures only the winner redeems). The ERC-7715 root
    // cap (periodAmount) bounds total spend, so this can't exceed what the user granted.
    const full = parseUnits(session.budgetUsdc.toString(), USDC_DECIMALS)
    const budgets: [bigint, bigint, bigint] = [full, full, full]
    // Redelegate the ERC-7715 root context to each agent → per-agent redeemable contexts.
    const agentContexts = await redelegateAgentContexts({
      sessionId,
      rootContext: body.rootDelegation as Hex,
      budgets,
    })

    await prisma.session.update({
      where: { sessionId },
      data: {
        permissionContext:
          typeof body.rootDelegation === 'string'
            ? body.rootDelegation
            : JSON.stringify(body.rootDelegation),
        delegationManager: body.delegationManager ?? null,
        // [{ agentId, permissionContext }] — hex strings, JSON-safe.
        agentDelegations: agentContexts as unknown as object,
        status: 'DELEGATION_GRANTED',
      },
    })

    logger.info({ sessionId, count: agentContexts.length }, 'agent contexts redelegated')
    return NextResponse.json({ status: 'ok', agentContexts })
  } catch (err) {
    logger.error({ err: (err as Error).message, sessionId }, 'grant-delegation failed')
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
