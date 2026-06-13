import { NextResponse, type NextRequest } from 'next/server'

/**
 * CORS for the local frontend (:3000) → backend (:3001). This middleware runs on the Edge
 * runtime and does NOT touch Redis/Prisma — it only sets headers + answers OPTIONS preflight.
 * (Rate limiting stays in the route handlers, which run on nodejs.)
 *
 * The SSE /stream route sets its own ACAO header — streaming responses + middleware header
 * merging are unreliable — so we skip it here to avoid a duplicate Access-Control-Allow-Origin.
 */
const ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000'

function withCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', ORIGIN)
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  res.headers.set('Access-Control-Max-Age', '86400')
  return res
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/stream')) {
    return NextResponse.next()
  }
  if (req.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }))
  }
  return withCors(NextResponse.next())
}

export const config = {
  matcher: '/api/:path*',
}
