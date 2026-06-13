import { type NextRequest } from 'next/server'
import { createSubscriber, sessionChannel } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Server-Sent Events stream for a session. Subscribes to the session's Redis channel on a
 * dedicated connection and forwards every published event to the client as `data: …`.
 *
 * NOTE: pub/sub is fire-and-forget — open this stream BEFORE triggering /run, or early
 * events are missed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const channel = sessionChannel(params.sessionId)
  const sub = createSubscriber()
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  async function cleanup() {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    try {
      await sub.unsubscribe(channel)
    } catch {
      /* ignore */
    }
    try {
      sub.disconnect()
    } catch {
      /* ignore */
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(data))
          } catch {
            /* controller already closed */
          }
        }
      }

      sub.on('message', (_ch, message) => send(`data: ${message}\n\n`))
      sub.on('error', () => {})
      await sub.subscribe(channel)

      send(`: connected ${params.sessionId}\n\n`)
      heartbeat = setInterval(() => send(`: ping\n\n`), 15_000)

      req.signal.addEventListener('abort', () => {
        void cleanup().then(() => {
          try {
            controller.close()
          } catch {
            /* ignore */
          }
        })
      })
    },
    async cancel() {
      await cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // SSE is cross-origin (frontend :3000 → backend :3001). Set ACAO here; the CORS
      // middleware deliberately skips /stream to avoid a duplicate header.
      'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    },
  })
}
