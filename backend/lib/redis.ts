import Redis from 'ioredis'

/**
 * Redis (Upstash). Use the `rediss://` URL — ioredis auto-negotiates TLS from the scheme.
 *
 * Pub/sub needs TWO kinds of connections: a connection in "subscriber mode" cannot issue
 * normal commands. So:
 *   - `redis`            — shared connection for PUBLISH + normal commands (rate limiting, etc.)
 *   - `createSubscriber()` — a fresh connection per SSE stream for SUBSCRIBE; caller closes it.
 */
function buildClient(): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL is not set')
  return new Redis(url, {
    // Long-lived / pub-sub connections must not cap retries per request.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })
}

const globalForRedis = globalThis as unknown as { redis?: Redis }

export const redis = globalForRedis.redis ?? buildClient()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

/** A dedicated connection for SUBSCRIBE. The caller is responsible for `.quit()`. */
export function createSubscriber(): Redis {
  return buildClient()
}

/** Channel name for a session's real-time event stream. */
export function sessionChannel(sessionId: string): string {
  return `session:${sessionId}`
}
