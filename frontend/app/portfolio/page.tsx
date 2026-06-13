"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  listSessions,
  readCompoundBalance,
  basescanTx,
  basescanAddress,
  AGENT_ROLES,
  DEMO_USER_ADDRESS,
  type SessionRecord,
} from "@/lib/wave-api"
import { useWallet } from "@/lib/wallet"
import { ConnectButton } from "@/components/connect-button"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"
import { cn } from "@/lib/utils"

export default function PortfolioPage() {
  const wallet = useWallet()
  const owner = wallet.address ?? DEMO_USER_ADDRESS

  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [liveValue, setLiveValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, bal] = await Promise.all([
        listSessions({ userAddress: owner, limit: 100 }),
        readCompoundBalance(owner).catch(() => null), // RPC hiccup shouldn't blank the page
      ])
      setSessions(list)
      setLiveValue(bal)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    load()
  }, [load])

  const positions = useMemo(
    () => (sessions ?? []).filter((s) => s.status === "EXECUTED" && s.aaveSupplyTx),
    [sessions],
  )
  const pending = useMemo(
    () => (sessions ?? []).filter((s) => !(s.status === "EXECUTED" && s.aaveSupplyTx)),
    [sessions],
  )

  const deployed = useMemo(() => positions.reduce((sum, s) => sum + (s.budgetUsdc ?? 0), 0), [positions])
  const netYield = liveValue !== null ? liveValue - deployed : null

  return (
    <main className="relative min-h-screen px-6 py-12 md:px-12">
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden />
      <div className="glow-ambient" aria-hidden />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <a
              href="/"
              className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
            >
              ← Wave Protocol
            </a>
            <a
              href="/stats"
              className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
            >
              Stats
            </a>
            <a
              href="/explore"
              className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
            >
              Explore
            </a>
            <a
              href="/agents"
              className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
            >
              Agents
            </a>
          </div>
          <ConnectButton
            address={wallet.address}
            connect={() => wallet.connect().catch((e) => setError((e as Error).message))}
            connecting={wallet.connecting}
            hasWallet={wallet.hasWallet}
            disconnect={wallet.disconnect}
          />
        </div>

        {/* title */}
        <div className="mt-10 mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Portfolio</span>
            <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
              YOUR POSITIONS
            </h1>
            <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
              Every collapse deploys your USDC into Compound V3 — credited to you. This is the live,
              onchain proof: your position keeps earning long after the agents agreed.
            </p>
          </div>
          <button
            onClick={load}
            className="glass glass-hover !rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent"
          >
            ↻ Refresh
          </button>
        </div>

        {/* owner line */}
        <div className="mb-8 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Positions owned by{" "}
          <a
            href={basescanAddress(owner)}
            target="_blank"
            rel="noreferrer"
            className="text-foreground/80 hover:text-accent transition-colors"
          >
            {owner.slice(0, 6)}…{owner.slice(-4)} ↗
          </a>
          {!wallet.address && <span className="text-muted-foreground/50">· connect to see your own</span>}
        </div>

        {error && (
          <p className="mb-8 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">
            {error}
          </p>
        )}

        {/* summary tiles */}
        <div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Live · Compound V3" value={fmtUsd(liveValue)} accent loading={loading} hint="balanceOf, onchain" />
          <StatTile label="Principal Deployed" value={fmtUsd(deployed)} loading={loading} hint={`${positions.length} position${positions.length === 1 ? "" : "s"}`} />
          <StatTile
            label="Net Yield"
            value={netYield === null ? "—" : `${netYield >= 0 ? "+" : ""}${netYield.toFixed(4)}`}
            loading={loading}
            tone={netYield === null ? "muted" : netYield >= 0 ? "pos" : "neg"}
            hint="live − principal"
          />
          <StatTile label="Positions" value={loading ? "" : String(positions.length)} loading={loading} hint="executed onchain" />
        </div>

        {/* positions */}
        {loading ? (
          <SkeletonList />
        ) : positions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Active Positions
            </h2>
            {positions.map((s) => (
              <PositionCard key={s.sessionId} session={s} />
            ))}
          </div>
        )}

        {/* in-progress / historical (non-executed) sessions */}
        {!loading && pending.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
              Other Sessions
            </h2>
            {pending.map((s) => (
              <PendingRow key={s.sessionId} session={s} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ── pieces ───────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  hint,
  accent = false,
  tone = "default",
  loading = false,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
  tone?: "default" | "pos" | "neg" | "muted"
  loading?: boolean
}) {
  const valueColor =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-destructive" : accent ? "text-accent" : "text-foreground"
  return (
    <div className="glass p-5">
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/80">{label}</span>
      <div className={cn("mt-3 font-[var(--font-bebas)] text-4xl leading-none tracking-tight", valueColor)}>
        {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-foreground/10" /> : value}
      </div>
      {hint && <span className="mt-2 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">{hint}</span>}
    </div>
  )
}

function PositionCard({ session }: { session: SessionRecord }) {
  const role = winnerRole(session)
  const color = session.winnerAgentId !== null ? AGENT_WAVE_COLORS[session.winnerAgentId] : "var(--accent)"
  const summary = session.agentResults?.find((r) => r.agentId === session.winnerAgentId)?.structuredOutput?.summary

  return (
    <div className="glass glass-hover p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-5 rounded-full" style={{ background: color }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color }}>
              {role} strategy
            </span>
            <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400">
              live
            </span>
          </div>
          {session.userIntent && (
            <p className="mt-3 max-w-xl font-mono text-xs leading-relaxed text-foreground/70 line-clamp-2">
              &ldquo;{session.userIntent}&rdquo;
            </p>
          )}
          {summary && (
            <p className="mt-2 max-w-xl font-mono text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
              {summary}
            </p>
          )}
        </div>

        <div className="text-right">
          <div className="font-[var(--font-bebas)] text-3xl leading-none tracking-tight">
            {session.budgetUsdc?.toFixed(0)}
            <span className="ml-1 font-mono text-[10px] tracking-widest text-muted-foreground">USDC</span>
          </div>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
            {fmtDate(session.createdAt)}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/40 pt-4 font-mono text-[10px] uppercase tracking-widest">
        {session.aaveSupplyTx && (
          <a href={basescanTx(session.aaveSupplyTx)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
            Supply tx ↗
          </a>
        )}
        <a href={`/session/${session.sessionId}`} className="text-muted-foreground hover:text-accent transition-colors">
          View debate →
        </a>
        <code className="ml-auto text-muted-foreground/40 normal-case tracking-normal">
          {session.sessionId.slice(0, 8)}…{session.sessionId.slice(-4)}
        </code>
      </div>
    </div>
  )
}

function PendingRow({ session }: { session: SessionRecord }) {
  return (
    <a
      href={`/session/${session.sessionId}`}
      className="glass glass-hover flex items-center justify-between gap-4 px-5 py-4"
    >
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
        {session.userIntent || session.sessionId}
      </span>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
        {session.status.replaceAll("_", " ").toLowerCase()}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground hover:text-accent">→</span>
    </a>
  )
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">No positions yet</span>
      <p className="max-w-sm font-mono text-sm text-muted-foreground leading-relaxed">
        Deploy idle USDC and let the agents debate a strategy. Once they reach consensus, your
        Compound V3 position shows up here.
      </p>
      <a
        href="/session/new"
        className="glass glass-hover mt-2 inline-flex items-center gap-3 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:text-accent"
      >
        Deploy your USDC →
      </a>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass h-28 animate-pulse" />
      ))}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────

function winnerRole(s: SessionRecord): string {
  if (s.winnerAgentId === null) return "Winning"
  return (
    s.agentResults?.find((r) => r.agentId === s.winnerAgentId)?.role ??
    AGENT_ROLES[s.winnerAgentId] ??
    "Winning"
  )
}

function fmtUsd(v: number | null): string {
  if (v === null) return "—"
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
