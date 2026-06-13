"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSessionStream } from "@/hooks/use-session-stream"
import {
  getSession,
  runSession,
  basescanTx,
  AGENT_ROLES,
  type WaveEvent,
  type SessionRecord,
} from "@/lib/wave-api"
import { WaveCollapse } from "@/components/wave-collapse"
import type { AgentView } from "@/components/agent-orb"

type Mode = "loading" | "live" | "replay" | "error"
type Phase = "connecting" | "reasoning" | "collapsed" | "error"

export function SessionRunner({ sessionId }: { sessionId: string }) {
  const startedRef = useRef(false)
  const [mode, setMode] = useState<Mode>("loading")
  const [stored, setStored] = useState<SessionRecord | null>(null)
  const [intent, setIntent] = useState("")
  const [runError, setRunError] = useState<string | null>(null)

  // Decide on mount: replay a finished session, watch an in-flight one, or kick off a new run.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const s = await getSession(sessionId)
        setIntent(s.userIntent ?? "")
        if (["EXECUTED", "COLLAPSED"].includes(s.status)) {
          setStored(s)
          setMode("replay")
        } else if (["AGENTS_RUNNING", "HASHES_SUBMITTED"].includes(s.status)) {
          setMode("live")
        } else {
          setMode("live")
          runSession(sessionId).catch((e) => setRunError((e as Error).message))
        }
      } catch (e) {
        setRunError((e as Error).message)
        setMode("error")
      }
    })()
  }, [sessionId])

  const { events, connected } = useSessionStream(sessionId, mode === "live")

  // Once the live run collapses, pull the full persisted record (for the winner's `action`).
  const fetchedFinalRef = useRef(false)
  const collapsedLive = useMemo(() => events.some((e) => e.type === "wavefunction_collapsed"), [events])
  useEffect(() => {
    if (mode === "live" && collapsedLive && !fetchedFinalRef.current) {
      fetchedFinalRef.current = true
      getSession(sessionId).then(setStored).catch(() => {})
    }
  }, [mode, collapsedLive, sessionId])

  const { agents, winnerId, winner, phase, errored } = useMemo(
    () => (mode === "replay" ? deriveStored(stored) : deriveLive(events)),
    [mode, stored, events],
  )

  const collapsed = winnerId !== null
  const winnerAgent = agents.find((a) => a.agentId === winnerId) ?? null
  const winnerAction =
    stored?.agentResults?.find((r) => r.agentId === winnerId)?.structuredOutput?.action ?? null

  return (
    <main className="relative min-h-screen px-6 py-12 md:px-12">
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-10">
          <a
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
          >
            ← Wave Protocol
          </a>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                {statusLine(mode, phase, connected)}
              </span>
              <h1 className="mt-3 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">
                {collapsed ? "WAVE COLLAPSED" : "SUPERPOSITION"}
              </h1>
            </div>
            <code className="font-mono text-[10px] text-muted-foreground/50">
              {sessionId.slice(0, 10)}…{sessionId.slice(-6)}
            </code>
          </div>
          {intent && (
            <p className="mt-4 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              &ldquo;{intent}&rdquo;
            </p>
          )}
        </header>

        {(runError || errored) && (
          <p className="mb-8 border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">
            {runError ?? errored}
          </p>
        )}

        <WaveCollapse agents={agents} winnerId={winnerId} collapsed={collapsed} />

        {collapsed && winnerAgent && (
          <ResultCard winnerAgent={winnerAgent} winnerHash={winner?.winnerHash ?? null} action={winnerAction} />
        )}
      </div>
    </main>
  )
}

function ResultCard({
  winnerAgent,
  winnerHash,
  action,
}: {
  winnerAgent: AgentView
  winnerHash: string | null
  action: string | null
}) {
  return (
    <section className="mt-10 border border-accent/40 bg-card p-8">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Result / Winner</span>
      <h2 className="mt-3 font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight">
        {String(winnerAgent.agentId + 1).padStart(2, "0")} · {winnerAgent.role}
        <span className="ml-4 text-accent">{winnerAgent.confidence}</span>
        <span className="ml-1 font-mono text-xs tracking-widest text-muted-foreground">confidence</span>
      </h2>

      {winnerAgent.summary && (
        <p className="mt-6 max-w-3xl font-mono text-sm leading-relaxed text-foreground/90">{winnerAgent.summary}</p>
      )}

      {action && (
        <div className="mt-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Recommended Action
          </span>
          <p className="mt-2 max-w-3xl font-mono text-sm leading-relaxed text-foreground">{action}</p>
        </div>
      )}

      {winnerAgent.reasoning && (
        <details className="mt-6">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent">
            Full reasoning
          </summary>
          <p className="mt-3 max-w-3xl whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
            {winnerAgent.reasoning}
          </p>
        </details>
      )}

      <div className="mt-8 flex flex-wrap items-end gap-8 border-t border-border/40 pt-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Winner Hash</span>
          <p className="max-w-xs break-all font-mono text-[10px] text-foreground/70">{winnerHash ?? "—"}</p>
        </div>
        {winnerAgent.txHash && (
          <a
            href={basescanTx(winnerAgent.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent"
          >
            View tx ↗
          </a>
        )}
      </div>

      <a
        href="/session/new"
        className="mt-8 inline-flex border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest hover:border-accent hover:text-accent transition-all"
      >
        Run another →
      </a>
    </section>
  )
}

// ── state derivation ─────────────────────────────────────────────

function deriveLive(events: WaveEvent[]) {
  const map = new Map<number, AgentView>()
  const ensure = (id: number): AgentView => {
    let a = map.get(id)
    if (!a) {
      a = {
        agentId: id,
        role: AGENT_ROLES[id] ?? `Agent ${id}`,
        status: "idle",
        reasoning: "",
        confidence: null,
        summary: null,
        txHash: null,
      }
      map.set(id, a)
    }
    return a
  }

  let winner: { winnerAgentId: number; winnerHash: string; winnerConfidence: number } | null = null
  let phase: Phase = "connecting"
  let errored: string | null = null

  for (const e of events) {
    switch (e.type) {
      case "agents_started":
        for (let i = 0; i < e.agentCount; i++) ensure(i).status = "thinking"
        phase = "reasoning"
        break
      case "agent_reasoning": {
        const a = ensure(e.agentId)
        a.reasoning += e.chunk
        if (a.status === "idle") a.status = "thinking"
        break
      }
      case "agent_done": {
        const a = ensure(e.agentId)
        a.status = "done"
        a.confidence = e.confidence
        a.summary = e.summary
        a.role = e.role
        break
      }
      case "hash_submitted":
      case "hash_confirmed":
        ensure(e.agentId).txHash = e.txHash
        break
      case "wavefunction_collapsed":
        winner = { winnerAgentId: e.winnerAgentId, winnerHash: e.winnerHash, winnerConfidence: e.winnerConfidence }
        phase = "collapsed"
        break
      case "error":
        errored = e.message
        phase = "error"
        break
    }
  }

  // Always show 3 panels for layout, even before the first event arrives.
  if (map.size === 0) for (let i = 0; i < 3; i++) ensure(i)

  return {
    agents: [...map.values()].sort((a, b) => a.agentId - b.agentId),
    winnerId: winner?.winnerAgentId ?? null,
    winner,
    phase,
    errored,
  }
}

function deriveStored(s: SessionRecord | null) {
  if (!s) {
    return { agents: [] as AgentView[], winnerId: null, winner: null, phase: "connecting" as Phase, errored: null }
  }
  const agents: AgentView[] = (s.agentResults ?? [])
    .map((r) => ({
      agentId: r.agentId,
      role: r.role,
      status: "done" as const,
      reasoning: r.reasoningContent ?? "",
      confidence: r.confidence,
      summary: r.structuredOutput?.summary ?? null,
      txHash: r.hashTxHash ?? null,
    }))
    .sort((a, b) => a.agentId - b.agentId)

  const winnerId = s.winnerAgentId
  const winner =
    winnerId != null
      ? {
          winnerAgentId: winnerId,
          winnerHash: s.winnerHash ?? "",
          winnerConfidence: agents.find((a) => a.agentId === winnerId)?.confidence ?? 0,
        }
      : null

  return { agents, winnerId, winner, phase: (winner ? "collapsed" : "reasoning") as Phase, errored: null }
}

function statusLine(mode: Mode, phase: Phase, connected: boolean) {
  if (mode === "loading") return "Loading session…"
  if (mode === "error") return "Error"
  if (phase === "collapsed") return "Collapsed / Onchain"
  if (mode === "replay") return "Result"
  if (phase === "reasoning") return "Agents reasoning…"
  return connected ? "Connected / Awaiting agents" : "Connecting…"
}
