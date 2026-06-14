"use client"

import { useEffect, useMemo, useState } from "react"
import { listSessions, readCompoundBalance, AGENT_ROLES, type SessionRecord } from "@/lib/wave-api"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"
import { cn } from "@/lib/utils"

export default function StatsPage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [liveTvl, setLiveTvl] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const list = await listSessions({ limit: 100 })
        setSessions(list)
        // Live TVL — sum the live Compound balance across each unique owner that has deployed.
        const owners = [
          ...new Set(
            list.filter((s) => s.status === "EXECUTED" && s.aaveSupplyTx).map((s) => s.userAddress.toLowerCase()),
          ),
        ].slice(0, 15)
        const bals = await Promise.all(owners.map((o) => readCompoundBalance(o).catch(() => 0)))
        setLiveTvl(bals.reduce((a, b) => a + b, 0))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const m = useMemo(() => metrics(sessions ?? []), [sessions])
  const tvl = liveTvl ?? m.deployed

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
          <a href="/explore" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Explore
          </a>
          <a href="/market" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Market
          </a>
          <a href="/agents" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Agents
          </a>
          <a href="/portfolio" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Positions
          </a>
        </div>

        {/* title */}
        <div className="mt-10 mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Protocol</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            STATE OF THE WAVE
          </h1>
          <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            The whole protocol at a glance — capital deployed, debates collapsed, and the real USDC
            agents have put behind their convictions. All onchain, Base Sepolia.
          </p>
        </div>

        {error && (
          <p className="mb-8 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">{error}</p>
        )}

        {/* hero TVL */}
        <div className="glass mb-6 p-8" style={{ borderColor: "oklch(0.7 0.2 45 / 0.4)" }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                Total Value Locked · Compound V3
              </span>
              <div className="mt-3 font-[var(--font-bebas)] text-7xl md:text-8xl leading-none tracking-tight text-foreground">
                {loading ? (
                  <span className="inline-block h-16 w-56 animate-pulse rounded bg-foreground/10" />
                ) : (
                  fmtUsd(tvl)
                )}
              </div>
            </div>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {liveTvl !== null ? "live onchain" : "deployed principal"}
            </span>
          </div>
        </div>

        {/* tiles */}
        <div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-3">
          <Tile label="Collapses" value={loading ? "" : String(m.collapses)} loading={loading} accent hint="debates resolved onchain" />
          <Tile label="Conviction staked" value={loading ? "" : `$${m.staked.toFixed(4)}`} loading={loading} hint="real USDC · x402" />
          <Tile label="Capital deployed" value={loading ? "" : fmtUsd(m.deployed)} loading={loading} hint={`${m.executed} positions`} />
          <Tile label="Sessions run" value={loading ? "" : String(m.sessions)} loading={loading} />
          <Tile label="Participants" value={loading ? "" : String(m.participants)} loading={loading} hint="unique addresses" />
          <Tile
            label="Execution rate"
            value={loading ? "" : `${Math.round(m.execRate * 100)}%`}
            loading={loading}
            hint="collapses → deployed"
          />
        </div>

        {/* win distribution */}
        {!loading && m.collapses > 0 && (
          <div className="glass p-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Wins by lens
            </span>
            <div className="mt-5 space-y-4">
              {[0, 1, 2].map((id) => {
                const wins = m.winsByLens[id]
                const share = m.collapses ? wins / m.collapses : 0
                const color = AGENT_WAVE_COLORS[id] ?? "var(--accent)"
                return (
                  <div key={id}>
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
                      <span className="flex items-center gap-2" style={{ color }}>
                        <span className="h-1.5 w-5 rounded-full" style={{ background: color }} />
                        {AGENT_ROLES[id]}
                      </span>
                      <span className="text-muted-foreground">
                        {wins} {wins === 1 ? "win" : "wins"} · {Math.round(share * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share * 100}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {m.avgWinConf !== null && (
              <p className="mt-5 border-t border-border/40 pt-4 font-mono text-[10px] tracking-wide text-muted-foreground/70">
                Average winning conviction · <span className="text-foreground/80">{m.avgWinConf.toFixed(0)}</span> / 100
              </p>
            )}
          </div>
        )}

        {!loading && m.collapses === 0 && (
          <div className="glass flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">No data yet</span>
            <a
              href="/session/new"
              className="glass glass-hover inline-flex items-center gap-3 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:text-accent"
            >
              Run the first debate →
            </a>
          </div>
        )}
      </div>
    </main>
  )
}

// ── pieces ───────────────────────────────────────────────────────

function Tile({ label, value, hint, accent, loading }: { label: string; value: string; hint?: string; accent?: boolean; loading?: boolean }) {
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

// ── metrics ──────────────────────────────────────────────────────

function metrics(sessions: SessionRecord[]) {
  const completed = sessions.filter((s) => s.winnerAgentId !== null)
  const executed = sessions.filter((s) => s.status === "EXECUTED" && s.aaveSupplyTx)

  let staked = 0
  let winConfSum = 0
  let winConfN = 0
  const winsByLens = [0, 0, 0]

  for (const s of sessions) {
    for (const r of s.agentResults ?? []) staked += r.convictionBetUsdc ?? 0
  }
  for (const s of completed) {
    const id = s.winnerAgentId as number
    if (winsByLens[id] !== undefined) winsByLens[id]++
    const w = s.agentResults?.find((r) => r.agentId === id)
    const conf = w?.revisedConfidence ?? w?.confidence
    if (conf != null) {
      winConfSum += conf
      winConfN++
    }
  }

  return {
    sessions: sessions.length,
    collapses: completed.length,
    executed: executed.length,
    deployed: executed.reduce((sum, s) => sum + (s.budgetUsdc ?? 0), 0),
    staked,
    participants: new Set(sessions.map((s) => s.userAddress.toLowerCase())).size,
    execRate: completed.length ? executed.length / completed.length : 0,
    winsByLens,
    avgWinConf: winConfN ? winConfSum / winConfN : null,
  }
}

function fmtUsd(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
