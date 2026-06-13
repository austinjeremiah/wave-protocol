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

    es.onopen = () => setConnected(true)
    es.onmessage = (e) => {
      try {
        setEvents((prev) => [...prev, JSON.parse(e.data) as WaveEvent])
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
