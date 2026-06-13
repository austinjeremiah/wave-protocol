import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * List sessions — powers the /portfolio view. Optionally filter by userAddress (the owner of
 * the resulting Compound V3 positions). Ordered newest-first, capped to a sane page size.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const userAddress = url.searchParams.get('userAddress')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 100)

  const sessions = await prisma.session.findMany({
    where: userAddress
      ? { userAddress: { equals: userAddress, mode: 'insensitive' } }
      : undefined,
    include: { agentResults: { orderBy: { agentId: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(sessions)
}
