import { redis } from './redis'

/**
 * Fixed-window rate limit backed by Redis. Used inside route handlers (nodejs runtime) —
 * NOT in Next middleware, which runs on the Edge runtime where ioredis can't open sockets.
 * Fails OPEN if Redis is unreachable (don't block legitimate traffic on infra hiccups).
 */
export async function checkRateLimit(opts: {
  key: string
  limit: number
  windowSec: number
}): Promise<{ ok: boolean; remaining: number }> {
  const { key, limit, windowSec } = opts
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSec)
    return { ok: count <= limit, remaining: Math.max(0, limit - count) }
  } catch {
    return { ok: true, remaining: limit }
  }
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
