"use client"

import { useEffect, useMemo, useState } from "react"
import {
  listSessions,
  getMarket,
  basescanTx,
  basescanAddress,
  AGENT_ROLES,
  type SessionRecord,
  type MarketData,
} from "@/lib/wave-api"
import { buildGraph, type GraphNode } from "@/lib/graph-data"
import { KnowledgeGraph } from "@/components/knowledge-graph"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"

export default function GraphPage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [market, setMarket] = useState<MarketData>({ listings: [], purchases: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [s, m] = await Promise.all([listSessions({ limit: 200 }), getMarket().catch(() => ({ listings: [], purchases: [] }))])
        setSessions(s)
        setMarket(m as MarketData)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const { nodes, edges } = useMemo(() => buildGraph(sessions ?? [], market), [sessions, market])
  const collapsedCount = useMemo(() => (sessions ?? []).filter((s) => s.winnerAgentId !== null).length, [sessions])

  return (
    <main className="relative min-h-screen px-6 py-12 md:px-12">
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden />
      <div className="glow-ambient" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* header */}
        <div className="flex items-center gap-5">
          <a href="/" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            ← Wave Protocol
          </a>
          <a href="/agents" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Agents
          </a>
          <a href="/explore" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Explore
          </a>
          <a href="/market" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
            Market
          </a>
        </div>

        {/* title */}
        <div className="mt-10 mb-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">A2A</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            THE COORDINATION MAP
          </h1>
          <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Every debate, drawn. Three agents critique each other, collapse to a winner onchain, and
            their proven strategies get copied — the whole agent-to-agent network in one graph.
          </p>
        </div>

        {error && (
          <p className="mb-6 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">{error}</p>
        )}

        {/* legend */}
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
          {AGENT_ROLES.map((role, i) => (
            <span key={role} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: AGENT_WAVE_COLORS[i] }} />
              {role}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5" style={{ background: "rgba(245,158,66,0.7)" }} /> critique</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-white/60" /> winner</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5" style={{ background: "rgba(16,185,129,0.7)" }} /> copy-trade</span>
        </div>

        {/* graph + side panel */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="glass relative h-[68vh] overflow-hidden">
            {loading ? (
              <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
                building the map…
              </div>
            ) : collapsedCount === 0 ? (
              <EmptyState />
            ) : (
              <KnowledgeGraph nodes={nodes} edges={edges} onNodeClick={setSelected} />
            )}
            <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
              {collapsedCount} collapses · drag · scroll to zoom
            </span>
          </div>

          {/* detail panel */}
          <aside className="glass h-[68vh] overflow-y-auto p-5">
            {selected ? (
              <NodeDetail node={selected} />
            ) : (
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/70">
                Click any node — an agent, a session, or a buyer — to inspect it.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}

// ── detail panel ─────────────────────────────────────────────────

function NodeDetail({ node }: { node: GraphNode }) {
  const p = node.payload as Record<string, any>

  if (node.kind === "agent") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-5 rounded-full" style={{ background: node.color }} />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: node.color }}>{p.role}</span>
        </div>
        <Stat label="Wins" value={String(p.wins)} />
        <Stat label="Debates" value={String(p.appearances)} />
        <Stat label="Avg confidence" value={p.avgConfidence != null ? String(p.avgConfidence) : "—"} />
        <Stat label="Critiques made" value={String(p.critiques)} />
      </div>
    )
  }

  if (node.kind === "buyer") {
    return (
      <div className="space-y-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Buyer</span>
        <a href={basescanAddress(p.address)} target="_blank" rel="noreferrer" className="block break-all font-mono text-[11px] text-foreground/80 hover:text-accent">
          {p.address} ↗
        </a>
        <p className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed">Copied a proven strategy — capital redeployed to their own Compound position.</p>
      </div>
    )
  }

  // session
  const s = p.session as SessionRecord
  const winner = s.agentResults?.find((r) => r.agentId === s.winnerAgentId)
  const verifyTx = winner?.hashTxHash ?? s.agentResults?.find((r) => r.hashTxHash)?.hashTxHash ?? null
  return (
    <div className="space-y-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Session</span>
      {s.userIntent && <p className="font-mono text-[11px] leading-relaxed text-foreground/75 italic">&ldquo;{s.userIntent}&rdquo;</p>}
      <div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">Winner</span>
        <p className="mt-1 font-mono text-xs" style={{ color: AGENT_WAVE_COLORS[s.winnerAgentId ?? 0] }}>
          {winner?.role ?? AGENT_ROLES[s.winnerAgentId ?? 0]} · conf {winner?.revisedConfidence ?? winner?.confidence ?? "—"}
        </p>
      </div>
      <div className="flex items-end gap-2">
        {(s.agentResults ?? []).slice().sort((a, b) => a.agentId - b.agentId).map((r) => {
          const conf = r.revisedConfidence ?? r.confidence ?? 0
          const isWin = r.agentId === s.winnerAgentId
          return (
            <div key={r.agentId} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[9px] text-muted-foreground/60">{conf}</span>
              <div className="flex h-10 w-full items-end overflow-hidden rounded bg-foreground/[0.06]">
                <div className="w-full rounded" style={{ height: `${Math.max(8, conf)}%`, background: AGENT_WAVE_COLORS[r.agentId], opacity: isWin ? 0.9 : 0.3 }} />
              </div>
              <span className="font-mono text-[8px] uppercase" style={{ color: AGENT_WAVE_COLORS[r.agentId] }}>{AGENT_ROLES[r.agentId]?.[0]}</span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/40 pt-3 font-mono text-[10px] uppercase tracking-widest">
        {verifyTx && <a href={basescanTx(verifyTx)} target="_blank" rel="noreferrer" className="text-accent hover:underline">verify ↗</a>}
        {s.aaveSupplyTx && <a href={basescanTx(s.aaveSupplyTx)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">supply ↗</a>}
        <a href={`/session/${s.sessionId}`} className="ml-auto text-muted-foreground hover:text-accent">open →</a>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/30 pb-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">{label}</span>
      <span className="font-[var(--font-bebas)] text-2xl leading-none text-foreground">{value}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">No debates yet</span>
      <p className="max-w-sm font-mono text-sm text-muted-foreground leading-relaxed">Run a session to a collapse and the agents + their critiques appear here.</p>
      <a href="/session/new" className="glass glass-hover mt-2 inline-flex px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:text-accent">Start a debate →</a>
    </div>
  )
}
