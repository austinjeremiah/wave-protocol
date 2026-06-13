import Redis from 'ioredis'
import { logger } from './logger'

/**
 * Redis (Upstash). Use the `rediss://` URL — ioredis negotiates TLS from the scheme.
 *
 * Two connection kinds:
 *   - `redis`            — shared connection for PUBLISH + commands (rate limiting). Fails FAST
 *                          if Redis is unreachable so routes degrade gracefully (never hang).
 *   - `createSubscriber()` — a fresh long-lived connection per SSE stream for SUBSCRIBE.
 *
 * Both attach an error handler (so a bad/unreachable REDIS_URL logs ONCE instead of flooding the
 * terminal with "Unhandled error event") and back off their reconnect attempts.
 */
function buildClient(opts?: { subscriber?: boolean }): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL is not set')

  const client = new Redis(url, {
    // Subscriber holds a long-lived subscription (no per-request cap). The shared client fails
    // fast so PUBLISH / rate-limit reject quickly when Redis is down (caught by callers).
    maxRetriesPerRequest: opts?.subscriber ? null : 2,
    commandTimeout: opts?.subscriber ? undefined : 5_000,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 300, 5_000),
  })

  let loggedError = false
  client.on('error', (err) => {
    if (!loggedError) {
      logger.error(
        `Redis error: ${err.message} — check REDIS_URL (live streaming + rate limiting degrade until it reconnects)`
      )
      loggedError = true
    }
  })
  client.on('ready', () => {
    if (loggedError) logger.info('Redis reconnected')
    loggedError = false
  })

  return client
}

const globalForRedis = globalThis as unknown as { redis?: Redis }

export const redis = globalForRedis.redis ?? buildClient()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

/** A dedicated long-lived connection for SUBSCRIBE. The caller is responsible for `.quit()`. */
export function createSubscriber(): Redis {
  return buildClient({ subscriber: true })
}

/** Channel name for a session's real-time event stream. */
export function sessionChannel(sessionId: string): string {
  return `session:${sessionId}`
}
