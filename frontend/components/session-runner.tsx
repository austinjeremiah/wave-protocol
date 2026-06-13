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
import { WaveField, AGENT_WAVE_COLORS } from "@/components/wave-field"
import { DebateFloor } from "@/components/debate-floor"
import { WaveTerminal } from "@/components/wave-terminal"
import type { AgentView } from "@/components/agent-orb"
import { cn } from "@/lib/utils"

type Mode = "loading" | "live" | "replay" | "error"
type Phase = "connecting" | "reasoning" | "debating" | "collapsed" | "executing" | "error"

export function SessionRunner({ sessionId }: { sessionId: string }) {
  const startedRef = useRef(false)
  const [mode, setMode] = useState<Mode>("loading")
  const [stored, setStored] = useState<SessionRecord | null>(null)
  const [intent, setIntent] = useState("")
  const [runError, setRunError] = useState<string | null>(null)
  const [needsRun, setNeedsRun] = useState(false)

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
          setMode("live") // already in flight — just watch
        } else {
          // New session: go live, but DON'T run yet — wait for the stream to be subscribed
          // (the `ready` event) so we don't lose the early events to fire-and-forget pub/sub.
          setMode("live")
          setNeedsRun(true)
        }
      } catch (e) {
        setRunError((e as Error).message)
        setMode("error")
      }
    })()
  }, [sessionId])

  const { events, connected, ready } = useSessionStream(sessionId, mode === "live")

  // Trigger the run ONLY once the SSE stream is subscribed — fixes the race where the run
  // published agents_started/reasoning before the browser was listening (so nothing animated).
  const runStartedRef = useRef(false)
  useEffect(() => {
    if (mode === "live" && needsRun && ready && !runStartedRef.current) {
      runStartedRef.current = true
      console.log("%c[wave] stream ready → starting run", "color:#f97316")
      runSession(sessionId).catch((e) => setRunError((e as Error).message))
    }
  }, [mode, needsRun, ready, sessionId])

  // Once the live run collapses, pull the full persisted record (for the winner's `action`).
  const fetchedFinalRef = useRef(false)
  const collapsedLive = useMemo(() => events.some((e) => e.type === "wavefunction_collapsed"), [events])
  useEffect(() => {
    if (mode === "live" && collapsedLive && !fetchedFinalRef.current) {
      fetchedFinalRef.current = true
      getSession(sessionId).then(setStored).catch(() => {})
    }
  }, [mode, collapsedLive, sessionId])

  const { agents, winnerId, winner, phase, errored, supplied, supplyTxHash, recipient } = useMemo(
    () => (mode === "replay" ? deriveStored(stored) : deriveLive(events)),
    [mode, stored, events],
  )

  const collapsed = winnerId !== null
  const winnerAgent = agents.find((a) => a.agentId === winnerId) ?? null
  const winnerAction =
    stored?.agentResults?.find((r) => r.agentId === winnerId)?.structuredOutput?.action ?? null

  // The terminal feeds off live SSE events; on replay we synthesize them from the stored record.
  const displayEvents = mode === "replay" ? eventsFromStored(stored) : events

  return (
    <main className="relative min-h-screen px-6 py-12 md:px-12">
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden />
      <div className="glow-ambient" aria-hidden />

      <div className="relative z-10 mx-auto max-w-7xl lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
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
                {collapsed ? "WAVE COLLAPSED" : phase === "debating" ? "DEBATE ROUND" : "SUPERPOSITION"}
              </h1>
            </div>
            <code className="font-mono text-[10px] text-muted-foreground/70">
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
          <p className="mb-8 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">
            {runError ?? errored}
          </p>
        )}

        {/* Hero: the live wave-interference field — superposition collapsing to the winner. */}
        <div className="glass relative mb-8 h-[42vh] min-h-[280px] overflow-hidden">
          <WaveField agents={agents} collapsed={collapsed} winnerId={winnerId} supplied={supplied} />

          {/* Legend — which colored wave is which lens, + how to read the field. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-x-5 gap-y-1.5 p-4">
            {agents.map((a) => {
              const isWin = collapsed && winnerId === a.agentId
              return (
                <span
                  key={a.agentId}
                  className={cn(
                    "flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest transition-opacity duration-500",
                    collapsed && !isWin ? "opacity-30 text-muted-foreground" : "text-foreground/85",
                  )}
                >
                  <span className="h-1 w-5 rounded-full" style={{ background: AGENT_WAVE_COLORS[a.agentId] }} />
                  {a.role}
                  {a.confidence != null && <span className="text-foreground/55">{a.confidence}</span>}
                </span>
              )
            })}
            <span className="ml-auto hidden font-mono text-[9px] tracking-wide text-foreground/45 lg:block">
              amplitude = conviction · the 3 waves superpose, then collapse to the winner
            </span>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
              {collapsed
                ? `★ collapsed → ${String((winnerId ?? 0) + 1).padStart(2, "0")} ${winnerAgent?.role ?? ""}`
                : phase === "debating"
                  ? "debate round · conviction bets onchain"
                  : "superposition · 3 waves interfering"}
            </span>
            {!collapsed ? (
              <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/70">
                {phase === "debating" ? "agents critiquing peers…" : phase === "reasoning" ? "agents reasoning…" : connected ? "linked" : "linking…"}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/65">
                {winner?.winnerConfidence ?? winnerAgent?.confidence} conf · onchain
              </span>
            )}
          </div>
        </div>

        {/* Debate Floor — the A2A round made visible (chairs, arguments, conviction stakes). */}
        <DebateFloor agents={agents} active={phase === "debating"} />

        <WaveCollapse agents={agents} winnerId={winnerId} collapsed={collapsed} />

        {collapsed && winnerAgent && (
          <ResultCard
            winnerAgent={winnerAgent}
            winnerHash={winner?.winnerHash ?? null}
            action={winnerAction}
            supplyTxHash={supplyTxHash ?? stored?.aaveSupplyTx ?? null}
            recipient={recipient ?? stored?.userAddress ?? null}
          />
        )}
        </div>

        {/* Live log — every milestone + one-click Basescan links (no backend terminal needed). */}
        <aside className="mt-8 h-[420px] lg:mt-0 lg:sticky lg:top-12 lg:h-[calc(100vh-6rem)]">
          <WaveTerminal events={displayEvents} connected={connected} />
        </aside>
      </div>
    </main>
  )
}

function ResultCard({
  winnerAgent,
  winnerHash,
  action,
  supplyTxHash,
  recipient,
}: {
  winnerAgent: AgentView
  winnerHash: string | null
  action: string | null
  supplyTxHash: string | null
  recipient: string | null
}) {
  return (
    <section className="glass mt-10 !border-accent/40 p-8">
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

      {/* Your Compound V3 position — the user owns the yield */}
      {supplyTxHash && (
        <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-400">
            Your Position · Compound V3
          </span>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70 leading-relaxed">
            Your USDC is now supplied to Compound V3 on Base Sepolia, earning real yield —{" "}
            <span className="text-foreground/80">you own this position</span> and can withdraw anytime.
            The agents chose the strategy; the enforcer guaranteed they couldn&#39;t touch anything else.
          </p>
          {recipient && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              credited to{" "}
              <a
                href={`https://sepolia.basescan.org/address/${recipient}`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                {recipient.slice(0, 6)}…{recipient.slice(-4)} ↗
              </a>
            </p>
          )}
          <a
            href={basescanTx(supplyTxHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-mono text-[10px] uppercase tracking-widest text-emerald-400 hover:underline"
          >
            View your supply tx ↗
          </a>
        </div>
      )}

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
        round1Confidence: null,
        convictionBet: null,
        critiqueText: null,
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
  let supplied = false
  let supplyTxHash: string | null = null
  let recipient: string | null = null

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
        a.round1Confidence = e.confidence
        a.confidence = e.confidence
        a.summary = e.summary
        a.role = e.role
        break
      }
      case "debate_started":
        for (const a of map.values()) if (a.status === "done") a.status = "debating"
        phase = "debating"
        break
      case "agent_debate_reasoning": {
        const a = ensure(e.agentId)
        if (a.status !== "debating") a.status = "debating"
        break
      }
      case "confidence_shift": {
        const a = ensure(e.agentId)
        a.confidence = e.to
        a.convictionBet = e.convictionBetUsdc
        a.critiqueText = e.critique
        break
      }
      case "debate_complete":
        for (const a of map.values()) if (a.status === "debating") a.status = "done"
        break
      case "hash_submitted":
      case "hash_confirmed":
        ensure(e.agentId).txHash = e.txHash
        break
      case "wavefunction_collapsed":
        winner = { winnerAgentId: e.winnerAgentId, winnerHash: e.winnerHash, winnerConfidence: e.winnerConfidence }
        phase = "collapsed"
        break
      case "execution_started":
        phase = "executing"
        break
      case "execution_supplied":
        supplied = true
        supplyTxHash = e.txHash
        recipient = e.recipient
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
    supplied,
    supplyTxHash,
    recipient,
  }
}

function deriveStored(s: SessionRecord | null) {
  if (!s) {
    return { agents: [] as AgentView[], winnerId: null, winner: null, phase: "connecting" as Phase, errored: null, supplied: false, supplyTxHash: null, recipient: null }
  }
  const agents: AgentView[] = (s.agentResults ?? [])
    .map((r) => ({
      agentId: r.agentId,
      role: r.role,
      status: "done" as const,
      reasoning: r.reasoningContent ?? "",
      confidence: r.confidence,
      round1Confidence: r.round1Confidence ?? null,
      convictionBet: r.convictionBetUsdc ?? null,
      critiqueText: r.critiqueText ?? null,
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

  return {
    agents,
    winnerId,
    winner,
    phase: (winner ? "collapsed" : "reasoning") as Phase,
    errored: null,
    supplied: !!s.aaveSupplyTx,
    supplyTxHash: s.aaveSupplyTx ?? null,
    recipient: s.userAddress ?? null,
  }
}

/** Rebuild a terminal-feed event list from a persisted session (replay / reload). */
function eventsFromStored(s: SessionRecord | null): WaveEvent[] {
  if (!s || !s.agentResults?.length) return []
  const out: WaveEvent[] = []
  const sorted = [...s.agentResults].sort((a, b) => a.agentId - b.agentId)

  out.push({ type: "agents_started", agentCount: sorted.length, ts: 0 })
  for (const r of sorted) {
    out.push({
      type: "agent_done",
      agentId: r.agentId,
      role: r.role,
      confidence: r.round1Confidence ?? r.confidence,
      summary: r.structuredOutput?.summary ?? "",
      action: r.structuredOutput?.action ?? "",
      ts: 0,
    })
  }

  const debated = sorted.some((r) => r.round1Confidence != null && r.revisedConfidence != null)
  if (debated) {
    out.push({ type: "debate_started", roundNumber: 2, ts: 0 })
    for (const r of sorted) {
      if (r.round1Confidence != null && r.revisedConfidence != null) {
        out.push({
          type: "confidence_shift",
          agentId: r.agentId,
          from: r.round1Confidence,
          to: r.revisedConfidence,
          convictionBetUsdc: r.convictionBetUsdc ?? 0,
          critique: r.critiqueText ?? "",
          revisedAction: "",
          ts: 0,
        })
      }
    }
    out.push({ type: "debate_complete", results: [], ts: 0 })
  }

  for (const r of sorted) {
    if (r.hashTxHash) out.push({ type: "hash_submitted", agentId: r.agentId, txHash: r.hashTxHash, ts: 0 })
  }
  if (s.winnerAgentId != null) {
    const w = sorted.find((r) => r.agentId === s.winnerAgentId)
    out.push({
      type: "wavefunction_collapsed",
      winnerAgentId: s.winnerAgentId,
      winnerHash: s.winnerHash ?? "",
      winnerConfidence: w?.confidence ?? 0,
      ts: 0,
    })
  }
  if (s.strategyVaultTx)
    out.push({ type: "execution_redeemed", winnerAgentId: s.winnerAgentId ?? 0, txHash: s.strategyVaultTx, viaDelegation: false, ts: 0 })
  if (s.aaveSupplyTx)
    out.push({ type: "execution_supplied", winnerAgentId: s.winnerAgentId ?? 0, txHash: s.aaveSupplyTx, protocol: "Compound V3", vaultAddress: "", recipient: s.userAddress ?? "", ts: 0 })
  if (s.winnerAgentId != null) out.push({ type: "execution_complete", winnerAgentId: s.winnerAgentId, ts: 0 })

  return out
}

function statusLine(mode: Mode, phase: Phase, connected: boolean) {
  if (mode === "loading") return "Loading session…"
  if (mode === "error") return "Error"
  if (phase === "executing") return "Executing strategy → Compound V3"
  if (phase === "collapsed") return "Collapsed / Onchain"
  if (mode === "replay") return "Result"
  if (phase === "debating") return "Agents debating — conviction bets live"
  if (phase === "reasoning") return "Agents reasoning…"
  return connected ? "Connected / Awaiting agents" : "Connecting…"
}
