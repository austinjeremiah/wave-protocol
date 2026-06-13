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
  // `ready` flips true once the backend confirms its Redis subscription is live (the `ready`
  // event). Only then is it safe to trigger /run, or early events would be lost (fire-and-forget).
  const [ready, setReady] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !sessionId) return
    setReady(false)

    const es = new EventSource(streamUrl(sessionId))
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      console.log(`%c[wave] SSE connected → ${sessionId.slice(0, 12)}…`, "color:#f97316")
    }
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as WaveEvent | { type: "ready" }
        if (evt.type === "ready") {
          setReady(true)
          console.log("%c[wave] stream ready — safe to run", "color:#f97316")
          return
        }
        console.log(`%c[wave] ${evt.type}`, "color:#f97316", evt)
        setEvents((prev) => [...prev, evt as WaveEvent])
      } catch {
        /* ignore non-JSON keepalives */
      }
    }
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      esRef.current = null
      setConnected(false)
      setReady(false)
    }
  }, [sessionId, enabled])

  return { events, connected, ready }
}
