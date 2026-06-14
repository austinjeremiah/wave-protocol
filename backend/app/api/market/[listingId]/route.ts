import { NextResponse, type NextRequest } from 'next/server'
import { getListing } from '@/services/marketService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/market/:listingId — one listing, enriched with its source reasoning. */
export async function GET(_req: NextRequest, { params }: { params: { listingId: string } }) {
  const id = Number(params.listingId)
  if (!Number.isInteger(id) || id < 0) {
    return NextResponse.json({ error: 'invalid listingId' }, { status: 400 })
  }
  const listing = await getListing(id)
  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  return NextResponse.json(listing)
}
