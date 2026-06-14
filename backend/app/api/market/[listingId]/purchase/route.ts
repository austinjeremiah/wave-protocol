import { NextResponse, type NextRequest } from 'next/server'
import { isAddress, type Address } from 'viem'
import { prisma } from '@/lib/db'
import { buildSellerPaymentRequirements, purchaseStrategy } from '@/services/marketService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/market/:listingId/purchase — x402-gated copy-trade.
 *
 * No X-PAYMENT → 402 + payment requirements (payTo = the SELLER). The buyer signs an EIP-3009
 * USDC authorization for those requirements and retries with X-PAYMENT → we settle the fee to the
 * seller, then re-execute the proven strategy for the buyer (USDC supplied to Compound, credited
 * to the buyer). Body: { buyerAddress, deployUsdc }.
 */
export async function POST(req: NextRequest, { params }: { params: { listingId: string } }) {
  const id = Number(params.listingId)
  if (!Number.isInteger(id) || id < 0) {
    return NextResponse.json({ error: 'invalid listingId' }, { status: 400 })
  }

  const listing = await prisma.strategyListing.findUnique({ where: { listingId: id } })
  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  if (!listing.active) return NextResponse.json({ error: 'Listing is inactive' }, { status: 400 })

  const resource = `${req.nextUrl.origin}${req.nextUrl.pathname}`
  let requirements
  try {
    requirements = buildSellerPaymentRequirements(resource, listing.sellerAddress as Address, listing.priceUsdc)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const header = req.headers.get('X-PAYMENT')
  if (!header) {
    return NextResponse.json(
      { x402Version: 1, error: 'X-PAYMENT header is required', accepts: [requirements] },
      { status: 402 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as { buyerAddress?: string; deployUsdc?: number }
  if (!body.buyerAddress || !isAddress(body.buyerAddress)) {
    return NextResponse.json({ error: 'valid buyerAddress is required' }, { status: 400 })
  }
  const deployUsdc = Number(body.deployUsdc ?? 2)
  if (!Number.isFinite(deployUsdc) || deployUsdc <= 0) {
    return NextResponse.json({ error: 'deployUsdc must be a positive number' }, { status: 400 })
  }

  try {
    const result = await purchaseStrategy({
      listingId: id,
      buyerAddress: body.buyerAddress as Address,
      deployUsdc,
      requirements,
      paymentHeader: header,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
