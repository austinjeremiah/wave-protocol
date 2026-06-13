import { NextResponse, type NextRequest } from 'next/server'
import { keccak256, toBytes } from 'viem'
import { NewSessionSchema } from '@/schemas/sessionSchema'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { checkRateLimit, clientIp } from '@/lib/rateLimit'
import { getAgentWallets } from '@/services/agentWalletService'
import { initSession, waitForTx } from '@/services/enforcerService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  // Rate limit: 5 creates / IP / minute.
  const rl = await checkRateLimit({ key: `rl:create:${clientIp(req)}`, limit: 5, windowSec: 60 })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded (5 per minute)' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = NewSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { userIntent, budgetUsdc, userAddress } = parsed.data

  try {
    const sessionId = keccak256(
      toBytes(`${userAddress}-${Date.now()}-${crypto.randomUUID()}`)
    )
    const agents = await getAgentWallets()

    // Open the session onchain (backend EOA becomes its initiator); wait for inclusion
    // so the later submitReasoningHash calls can't race ahead of it.
    const initTxHash = await initSession(sessionId, agents.length)
    await waitForTx(initTxHash)

    await prisma.session.create({
      data: { sessionId, userAddress, userIntent, budgetUsdc, status: 'PENDING' },
    })

    logger.info({ sessionId, initTxHash }, 'session created')
    return NextResponse.json({
      sessionId,
      agentAddresses: agents.map((a) => a.address),
      initTxHash,
    })
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'session create failed')
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
