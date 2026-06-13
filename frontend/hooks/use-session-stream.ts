"use client"

import { useEffect, useRef, useState } from "react"
import { streamUrl, type WaveEvent } from "@/lib/wave-api"

/**
 * Subscribe to a session's SSE stream. Returns accumulated events + connection state.
 * EventSource ignores the backend's `: comment` heartbeats automatically.
 */
export function useSessionStream(sessionId: string, enabled: boolean) {
  const [events, setEvents] = useState<WaveEvent[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !sessionId) return

    const es = new EventSource(streamUrl(sessionId))
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      console.log(`%c[wave] SSE connected → ${sessionId.slice(0, 12)}…`, "color:#f97316")
    }
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as WaveEvent
        console.log(`%c[wave] ${evt.type}`, "color:#f97316", evt)
        setEvents((prev) => [...prev, evt])
      } catch {
        /* ignore non-JSON keepalives */
      }
    }
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      esRef.current = null
    }
  }, [sessionId, enabled])

  return { events, connected }
}
