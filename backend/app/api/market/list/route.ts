import { NextResponse, type NextRequest } from 'next/server'
import { listStrategy } from '@/services/marketService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/market/list — { sessionId, priceUsdc } → list a collapsed session's winning strategy. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; priceUsdc?: number }
  if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  const priceUsdc = Number(body.priceUsdc ?? 0.5)
  if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
    return NextResponse.json({ error: 'priceUsdc must be a positive number' }, { status: 400 })
  }
  try {
    const listing = await listStrategy({ sessionId: body.sessionId, priceUsdc })
    return NextResponse.json(listing)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
