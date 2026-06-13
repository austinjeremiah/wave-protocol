import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const session = await prisma.session.findUnique({
    where: { sessionId: params.sessionId },
    include: { agentResults: { orderBy: { agentId: 'asc' } } },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session)
}
