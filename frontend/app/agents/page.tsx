"use client"

import { useEffect, useMemo, useState } from "react"
import { listSessions, AGENT_ROLES, type SessionRecord } from "@/lib/wave-api"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"
import { cn } from "@/lib/utils"

export default function AgentsPage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const { stats, recent, totals } = useMemo(() => aggregate(sessions ?? []), [sessions])

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
          <a href="/explore" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            E xplore
          </a>
          <a href="/market" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Market
          </a>
          <a href="/portfolio" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Positions
          </a>
          <a href="/graph" className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent hover:text-foreground transition-colors">
            A2A Graph →
          </a>
        </div>

        {/* title */}
        <div className="mt-10 mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Leaderboard</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            THE STRATEGISTS
          </h1>
          <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Three lenses, every collapse on the record. Win rates, conviction staked, and whether
            they were confident when it counted — skin in the game, accumulated over time.
          </p>
        </div>

        {error && (
          <p className="mb-8 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">{error}</p>
        )}

        {/* protocol totals */}
        <div className="mb-12 grid grid-cols-3 gap-4">
          <StatChip label="Sessions run" value={loading ? "" : String(totals.sessions)} loading={loading} />
          <StatChip label="Collapses" value={loading ? "" : String(totals.collapses)} loading={loading} accent />
          <StatChip label="Conviction staked" value={loading ? "" : `$${totals.totalStaked.toFixed(4)}`} loading={loading} hint="real USDC · x402" />
        </div>

        {/* leaderboard */}
        {loading ? (
          <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="glass h-44 animate-pulse" />)}</div>
        ) : totals.collapses === 0 ? (
          <EmptyState />
        ) : (
          <>
            <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Standings</h2>
            <div className="space-y-4">
              {stats.map((a, i) => (
                <AgentCard key={a.agentId} stat={a} rank={i + 1} leader={i === 0 && a.wins > 0} />
              ))}
            </div>

            {recent.length > 0 && (
              <div className="mt-12">
                <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Recent Collapses
                </h2>
                <div className="space-y-2">
                  {recent.map((r) => (
                    <RecentRow key={r.sessionId} row={r} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

// ── pieces ───────────────────────────────────────────────────────

function AgentCard({ stat, rank, leader }: { stat: AgentStat; rank: number; leader: boolean }) {
  const color = AGENT_WAVE_COLORS[stat.agentId] ?? "var(--accent)"
  return (
    <div
      className="glass glass-hover p-6"
      style={leader ? { borderColor: color, boxShadow: `0 0 28px ${color}22` } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* identity */}
        <div className="flex items-center gap-4">
          <span className="font-[var(--font-bebas)] text-3xl leading-none text-muted-foreground/40">
            {String(rank).padStart(2, "0")}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-6 rounded-full" style={{ background: color }} />
              <span className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color }}>
                {stat.role}
              </span>
              {leader && (
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest"
                  style={{ color, border: `1px solid ${color}55` }}
                >
                  ◆ leader
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-[var(--font-bebas)] text-5xl leading-none tracking-tight text-foreground">
                {stat.wins}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                wins · {Math.round(stat.winRate * 100)}%
              </span>
              {stat.streak > 1 && (
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color }}>
                  · {stat.streak}🔥 streak
                </span>
              )}
            </div>
          </div>
        </div>

        {/* sub-stats */}
        <div className="flex gap-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <Stat label="Debates" value={String(stat.appearances)} />
          <Stat label="Avg conf" value={stat.avgConf.toFixed(0)} />
          <Stat label="Staked" value={`$${stat.staked.toFixed(4)}`} />
        </div>
      </div>

      {/* win-rate bar */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${stat.winRate * 100}%`, background: color }} />
      </div>

      {/* calibration insight */}
      {stat.avgWinConf !== null && stat.avgLossConf !== null && (
        <p className="mt-3 font-mono text-[10px] tracking-wide text-muted-foreground/70">
          {stat.avgWinConf >= stat.avgLossConf ? "confident when right" : "overconfident on losses"} ·{" "}
          <span className="text-foreground/70">{stat.avgWinConf.toFixed(0)}</span> avg conf on wins vs{" "}
          <span className="text-foreground/70">{stat.avgLossConf.toFixed(0)}</span> on losses
        </p>
      )}

      {/* hall of arguments */}
      {stat.bestCritique && (
        <p className="mt-3 border-t border-border/40 pt-3 font-mono text-[10px] leading-relaxed text-muted-foreground/80 line-clamp-2">
          &ldquo;{stat.bestCritique}&rdquo;
        </p>
      )}
    </div>
  )
}

function RecentRow({ row }: { row: RecentCollapse }) {
  const color = AGENT_WAVE_COLORS[row.winnerAgentId] ?? "var(--accent)"
  return (
    <a
      href={`/session/${row.sessionId}`}
      className="glass glass-hover flex items-center gap-3 px-5 py-3"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest" style={{ color }}>
        {row.role}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/60">
        {row.intent || row.sessionId}
      </span>
      {row.conf !== null && (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
          {row.conf} conf
        </span>
      )}
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
        {fmtDate(row.createdAt)}
      </span>
    </a>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="font-[var(--font-bebas)] text-xl leading-none tracking-tight text-foreground">{value}</div>
      <span className="mt-1 block text-[8px] tracking-[0.2em] text-muted-foreground/60">{label}</span>
    </div>
  )
}

function StatChip({ label, value, hint, accent, loading }: { label: string; value: string; hint?: string; accent?: boolean; loading?: boolean }) {
  return (
    <div className="glass p-5">
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/80">{label}</span>
      <div className={cn("mt-3 font-[var(--font-bebas)] text-4xl leading-none tracking-tight", accent ? "text-accent" : "text-foreground")}>
        {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-foreground/10" /> : value}
      </div>
      {hint && <span className="mt-2 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">{hint}</span>}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">No collapses yet</span>
      <p className="max-w-sm font-mono text-sm text-muted-foreground leading-relaxed">
        Run a session and the agents start building their track records here.
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

// ── aggregation ──────────────────────────────────────────────────

interface AgentStat {
  agentId: number
  role: string
  wins: number
  appearances: number
  winRate: number
  avgConf: number
  avgWinConf: number | null
  avgLossConf: number | null
  staked: number
  streak: number
  bestCritique: string
}

interface RecentCollapse {
  sessionId: string
  winnerAgentId: number
  role: string
  conf: number | null
  createdAt?: string
  intent: string
}

function aggregate(sessions: SessionRecord[]) {
  const completed = sessions.filter((s) => s.winnerAgentId !== null) // newest-first from the API

  const acc = [0, 1, 2].map((id) => ({
    agentId: id,
    role: AGENT_ROLES[id] ?? `Agent ${id}`,
    wins: 0,
    appearances: 0,
    confSum: 0,
    winConfSum: 0,
    winConfN: 0,
    lossConfSum: 0,
    lossConfN: 0,
    staked: 0,
    streak: 0,
    bestCritique: "",
  }))

  let totalStaked = 0
  for (const s of completed) {
    for (const r of s.agentResults ?? []) {
      const a = acc[r.agentId]
      if (!a) continue
      a.appearances++
      const conf = r.revisedConfidence ?? r.confidence ?? 0
      a.confSum += conf
      if (s.winnerAgentId === r.agentId) {
        a.wins++
        a.winConfSum += conf
        a.winConfN++
      } else {
        a.lossConfSum += conf
        a.lossConfN++
      }
      const bet = r.convictionBetUsdc ?? 0
      a.staked += bet
      totalStaked += bet
      if (r.critiqueText && r.critiqueText.length > a.bestCritique.length) a.bestCritique = r.critiqueText
    }
  }

  // Current win streak — walk newest→oldest among sessions the agent appeared in.
  for (const a of acc) {
    for (const s of completed) {
      const appeared = (s.agentResults ?? []).some((r) => r.agentId === a.agentId)
      if (!appeared) continue
      if (s.winnerAgentId === a.agentId) a.streak++
      else break
    }
  }

  const stats: AgentStat[] = acc
    .map((a) => ({
      agentId: a.agentId,
      role: a.role,
      wins: a.wins,
      appearances: a.appearances,
      winRate: a.appearances ? a.wins / a.appearances : 0,
      avgConf: a.appearances ? a.confSum / a.appearances : 0,
      avgWinConf: a.winConfN ? a.winConfSum / a.winConfN : null,
      avgLossConf: a.lossConfN ? a.lossConfSum / a.lossConfN : null,
      staked: a.staked,
      streak: a.streak,
      bestCritique: a.bestCritique,
    }))
    .sort((x, y) => y.wins - x.wins || y.winRate - x.winRate)

  const recent: RecentCollapse[] = completed.slice(0, 8).map((s) => {
    const w = s.agentResults?.find((r) => r.agentId === s.winnerAgentId)
    return {
      sessionId: s.sessionId,
      winnerAgentId: s.winnerAgentId as number,
      role: w?.role ?? AGENT_ROLES[s.winnerAgentId as number] ?? "—",
      conf: w?.revisedConfidence ?? w?.confidence ?? null,
      createdAt: s.createdAt,
      intent: s.userIntent,
    }
  })

  return { stats, recent, totals: { sessions: sessions.length, collapses: completed.length, totalStaked } }
}

function fmtDate(iso?: string): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
