"use client"

import { useEffect, useMemo, useState } from "react"
import { listSessions, basescanTx, AGENT_ROLES, type SessionRecord } from "@/lib/wave-api"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"
import { cn } from "@/lib/utils"

type Filter = "all" | "executed" | "collapsed"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "collapsed", label: "Collapsed" },
  { key: "executed", label: "Deployed" },
]

export default function ExplorePage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
        setSessions(await listSessions({ limit: 100 }))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const list = useMemo(() => {
    let l = sessions ?? []
    if (filter === "executed") l = l.filter((s) => s.status === "EXECUTED" && s.aaveSupplyTx)
    else if (filter === "collapsed") l = l.filter((s) => s.winnerAgentId !== null)
    const t = q.trim().toLowerCase()
    if (t) l = l.filter((s) => (s.userIntent ?? "").toLowerCase().includes(t) || s.sessionId.toLowerCase().includes(t))
    return l
  }, [sessions, filter, q])

  const collapses = useMemo(() => (sessions ?? []).filter((s) => s.winnerAgentId !== null).length, [sessions])

  return (
    <main className="relative min-h-screen px-6 py-12 md:px-12">
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden />
      <div className="glow-ambient" aria-hidden />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* header */}
        <div className="flex items-center gap-5">
          <a href="/" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            ← Wave Protocol
          </a>
          <a href="/stats" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Stats
          </a>
          <a href="/agents" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Agents
          </a>
          <a href="/portfolio" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Positions
          </a>
        </div>

        {/* title */}
        <div className="mt-10 mb-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Explore</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            THE LEDGER
          </h1>
          <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Every wave collapse, public and onchain-verifiable. Browse the debates, see which lens won
            and at what conviction, and follow each one straight to Basescan.
          </p>
        </div>

        {error && (
          <p className="mb-8 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">{error}</p>
        )}

        {/* controls */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="glass flex items-center gap-1 !rounded-full p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  filter === f.key ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search intent or id…"
            className="glass w-full max-w-xs px-4 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:!border-accent transition-colors"
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
            {loading ? "…" : `${collapses} collapses on record`}
          </span>
        </div>

        {/* feed */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="glass h-52 animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((s) => (
              <CollapseCard key={s.sessionId} session={s} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ── pieces ───────────────────────────────────────────────────────

function CollapseCard({ session }: { session: SessionRecord }) {
  const collapsed = session.winnerAgentId !== null
  const executed = session.status === "EXECUTED" && !!session.aaveSupplyTx
  const winner = session.agentResults?.find((r) => r.agentId === session.winnerAgentId)
  const winColor = session.winnerAgentId !== null ? AGENT_WAVE_COLORS[session.winnerAgentId] : "var(--accent)"
  const winnerHash = session.winnerHash ?? winner?.reasoningHash ?? null
  const verifyTx = winner?.hashTxHash ?? session.agentResults?.find((r) => r.hashTxHash)?.hashTxHash ?? null

  return (
    <a href={`/session/${session.sessionId}`} className="glass glass-hover flex flex-col p-6">
      {/* top */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {collapsed ? (
            <>
              <span className="h-1.5 w-5 rounded-full" style={{ background: winColor }} />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: winColor }}>
                {winner?.role ?? AGENT_ROLES[session.winnerAgentId as number]}
              </span>
            </>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
              {session.status.replaceAll("_", " ").toLowerCase()}
            </span>
          )}
          <StatusBadge executed={executed} collapsed={collapsed} />
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">{fmtDate(session.createdAt)}</span>
      </div>

      {/* intent */}
      {session.userIntent && (
        <p className="mt-4 font-mono text-xs leading-relaxed text-foreground/75 line-clamp-2">
          &ldquo;{session.userIntent}&rdquo;
        </p>
      )}

      {/* the collapse at a glance — 3 lenses, winner lit */}
      <div className="mt-5 flex items-end gap-3">
        {(session.agentResults ?? [])
          .slice()
          .sort((a, b) => a.agentId - b.agentId)
          .map((r) => {
            const isWin = r.agentId === session.winnerAgentId
            const conf = r.revisedConfidence ?? r.confidence ?? 0
            const color = AGENT_WAVE_COLORS[r.agentId] ?? "var(--accent)"
            return (
              <div key={r.agentId} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={cn("font-mono text-[10px]", isWin ? "text-foreground" : "text-muted-foreground/50")}>{conf}</span>
                <div className="flex h-12 w-full items-end overflow-hidden rounded-md bg-foreground/[0.06]">
                  <div
                    className="w-full rounded-md transition-all"
                    style={{ height: `${Math.max(8, conf)}%`, background: color, opacity: collapsed && !isWin ? 0.25 : 0.85 }}
                  />
                </div>
                <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: collapsed && !isWin ? undefined : color }}>
                  {AGENT_ROLES[r.agentId]?.[0] ?? r.agentId}
                </span>
              </div>
            )
          })}
      </div>

      {/* onchain proof */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 pt-4 font-mono text-[10px] uppercase tracking-widest">
        {winnerHash && (
          <code className="normal-case tracking-normal text-muted-foreground/60">
            {winnerHash.slice(0, 10)}…{winnerHash.slice(-6)}
          </code>
        )}
        {verifyTx && (
          <button
            onClick={(e) => {
              e.preventDefault()
              window.open(basescanTx(verifyTx), "_blank", "noreferrer")
            }}
            className="text-accent hover:underline"
          >
            verify ↗
          </button>
        )}
        {executed && session.aaveSupplyTx && (
          <button
            onClick={(e) => {
              e.preventDefault()
              window.open(basescanTx(session.aaveSupplyTx as string), "_blank", "noreferrer")
            }}
            className="text-emerald-400 hover:underline"
          >
            supply ↗
          </button>
        )}
        <span className="ml-auto text-muted-foreground hover:text-accent">view →</span>
      </div>
    </a>
  )
}

function StatusBadge({ executed, collapsed }: { executed: boolean; collapsed: boolean }) {
  if (executed)
    return (
      <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest text-emerald-400">
        deployed
      </span>
    )
  if (collapsed)
    return (
      <span className="rounded-full border border-accent/40 px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest text-accent">
        collapsed
      </span>
    )
  return null
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">Nothing here yet</span>
      <p className="max-w-sm font-mono text-sm text-muted-foreground leading-relaxed">
        No collapses match this filter. Run a debate and it lands on the public ledger.
      </p>
      <a
        href="/session/new"
        className="glass glass-hover mt-2 inline-flex items-center gap-3 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:text-accent"
      >
        Start a debate →
      </a>
    </div>
  )
}

function fmtDate(iso?: string): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
