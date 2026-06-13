import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { createSubDelegations, splitBudget } from '@/services/delegationService'

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
    const budgets = splitBudget(session.budgetUsdc)
    const { agentDelegations } = await createSubDelegations({
      sessionId,
      rootDelegation: body.rootDelegation as Hex,
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
        // Delegation objects are all hex strings — JSON-safe.
        agentDelegations: agentDelegations as unknown as object,
        status: 'DELEGATION_GRANTED',
      },
    })

    logger.info({ sessionId, count: agentDelegations.length }, 'sub-delegations created')
    return NextResponse.json({ status: 'ok', agentDelegations })
  } catch (err) {
    logger.error({ err: (err as Error).message, sessionId }, 'grant-delegation failed')
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
