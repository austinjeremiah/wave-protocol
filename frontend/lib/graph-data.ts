// Build the A2A coordination graph from the data we already persist — no backend endpoint needed.
// Nodes: 3 agent personas + one per collapsed session + one per market buyer.
// Edges: winner/participate (agent↔session), critique (agent→agent, parsed from critiqueText),
// copy-trade (buyer→session).

import { AGENT_ROLES, type SessionRecord, type MarketData } from "@/lib/wave-api"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"

export type NodeKind = "agent" | "session" | "buyer"
export type EdgeKind = "winner" | "participate" | "critique" | "copy"

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  color: string
  size: number
  payload: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  kind: EdgeKind
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const SESSION_COLOR = "rgba(180,180,190,0.55)"
const BUYER_COLOR = "rgb(245,158,66)" // accent-ish orange

const shortIntent = (s: string | null | undefined, n = 40) =>
  !s ? "session" : s.length > n ? s.slice(0, n) + "…" : s

/** Parse peer agent ids (0..2) a critique references, excluding self. */
function parseCritiquePeers(text: string | null | undefined, self: number): number[] {
  if (!text) return []
  const peers = new Set<number>()
  for (const m of text.matchAll(/agent\s*([0-2])/gi)) {
    const id = Number(m[1])
    if (id !== self && id >= 0 && id <= 2) peers.add(id)
  }
  return [...peers]
}

export function buildGraph(sessions: SessionRecord[], market: MarketData): GraphData {
  const collapsed = sessions.filter((s) => s.winnerAgentId !== null && s.winnerAgentId !== undefined)

  // ── agent persona aggregates ──────────────────────────────────
  const wins = [0, 0, 0]
  const appearances = [0, 0, 0]
  const confSum = [0, 0, 0]
  const critiqueCount = [0, 0, 0]
  // aggregated directed critique edges: key `${from}->${to}` → weight
  const critiqueEdges = new Map<string, number>()

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const s of collapsed) {
    const winner = s.winnerAgentId as number
    wins[winner] = (wins[winner] ?? 0) + 1

    // session node
    const sid = `session:${s.sessionId}`
    nodes.push({
      id: sid,
      kind: "session",
      label: shortIntent(s.userIntent),
      color: SESSION_COLOR,
      size: 3,
      payload: { kind: "session", session: s },
    })

    for (const r of s.agentResults ?? []) {
      const a = r.agentId
      if (a < 0 || a > 2) continue
      appearances[a] += 1
      confSum[a] += r.revisedConfidence ?? r.confidence ?? 0

      // agent → session: only the WINNER edge (drawing all 3 participations is just a hairball;
      // the critique edges below already show the full debate).
      if (a === winner) {
        edges.push({ source: `agent:${a}`, target: sid, kind: "winner", weight: 2 })
      }

      // agent → agent critiques (aggregated across all sessions)
      let peers = parseCritiquePeers(r.critiqueText, a)
      if (peers.length === 0 && r.critiqueText) peers = [0, 1, 2].filter((p) => p !== a) // both-peers fallback
      for (const p of peers) {
        critiqueCount[a] += 1
        const key = `${a}->${p}`
        critiqueEdges.set(key, (critiqueEdges.get(key) ?? 0) + 1)
      }
    }
  }

  // agent persona nodes (always present, even with no data — keeps the map legible)
  for (let a = 0; a < 3; a++) {
    nodes.push({
      id: `agent:${a}`,
      kind: "agent",
      label: AGENT_ROLES[a] ?? `Agent ${a}`,
      color: AGENT_WAVE_COLORS[a] ?? "var(--accent)",
      size: 8 + wins[a] * 1.5,
      payload: {
        kind: "agent",
        agentId: a,
        role: AGENT_ROLES[a] ?? `Agent ${a}`,
        wins: wins[a],
        appearances: appearances[a],
        avgConfidence: appearances[a] ? Math.round(confSum[a] / appearances[a]) : null,
        critiques: critiqueCount[a],
      },
    })
  }

  // aggregated critique edges
  for (const [key, weight] of critiqueEdges) {
    const [from, to] = key.split("->").map(Number)
    edges.push({ source: `agent:${from}`, target: `agent:${to}`, kind: "critique", weight })
  }

  // ── copy-trade edges (buyer → source session) ─────────────────
  const listingToSession = new Map<number, string>()
  for (const l of market.listings ?? []) listingToSession.set(l.listingId, l.sessionId)
  const sessionIds = new Set(collapsed.map((s) => s.sessionId))
  const buyersSeen = new Set<string>()

  for (const p of market.purchases ?? []) {
    const srcSessionId = listingToSession.get(p.listingId)
    if (!srcSessionId || !sessionIds.has(srcSessionId)) continue
    const buyerId = `buyer:${p.buyerAddress.toLowerCase()}`
    if (!buyersSeen.has(buyerId)) {
      buyersSeen.add(buyerId)
      nodes.push({
        id: buyerId,
        kind: "buyer",
        label: `${p.buyerAddress.slice(0, 6)}…${p.buyerAddress.slice(-4)}`,
        color: BUYER_COLOR,
        size: 4,
        payload: { kind: "buyer", address: p.buyerAddress },
      })
    }
    edges.push({ source: buyerId, target: `session:${srcSessionId}`, kind: "copy", weight: 1 })
  }

  return { nodes, edges }
}
