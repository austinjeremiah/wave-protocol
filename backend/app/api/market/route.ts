import { NextResponse } from 'next/server'
import { getListings, getRecentPurchases } from '@/services/marketService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/market — all listings (newest first) + recent purchases for the feed. */
export async function GET() {
  try {
    const [listings, purchases] = await Promise.all([getListings(), getRecentPurchases()])
    return NextResponse.json({ listings: listings.filter(Boolean), purchases })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
