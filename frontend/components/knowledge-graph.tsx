"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { GraphNode, GraphEdge, EdgeKind, NodeKind } from "@/lib/graph-data"

// react-force-graph-2d touches window/canvas → must not SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

const EDGE_STYLE: Record<EdgeKind, { color: string; width: number; arrow: number; particles: number }> = {
  winner: { color: "rgba(255,255,255,0.45)", width: 1.6, arrow: 3, particles: 0 },
  participate: { color: "rgba(255,255,255,0.05)", width: 0.4, arrow: 0, particles: 0 },
  critique: { color: "rgba(245,158,66,0.5)", width: 1.2, arrow: 3, particles: 1 },
  copy: { color: "rgba(16,185,129,0.55)", width: 1.3, arrow: 3, particles: 1 },
}

// Drawn radius (graph units) — small + fixed so nodes stay legible at any zoom.
const DRAW_R: Record<NodeKind, number> = { agent: 7, session: 2.5, buyer: 4 }
// Physics weight — high values push nodes APART (drives spacing), independent of drawn size.
const PHYS_VAL: Record<NodeKind, number> = { agent: 70, session: 10, buyer: 14 }

export function KnowledgeGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (node: GraphNode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<any>(null)
  const [dims, setDims] = useState({ width: 800, height: 520 })
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setDims({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const graphData = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id))
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e })),
    }
  }, [nodes, edges])

  // Spread the layout out (more repulsion, longer links) + fit to view once it settles.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg?.d3Force) return
    fg.d3Force("charge")?.strength(-260)
    fg.d3Force("link")?.distance(90)
    fg.d3ReheatSimulation?.()
  }, [graphData])

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = DRAW_R[node.kind as NodeKind] ?? 3
      const color: string = node.color ?? "rgba(180,180,190,0.6)"

      if (node.kind === "agent") {
        ctx.beginPath()
        ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI)
        ctx.fillStyle = color.replace("rgb(", "rgba(").replace(")", ",0.18)")
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      // Only the 3 agents are labeled by default; everything else labels on hover (keeps it clean).
      const showLabel = node.kind === "agent" || node.id === hoverId
      if (showLabel) {
        const full = (node.label as string) ?? ""
        const max = node.kind === "agent" ? 16 : 30
        const label = full.length > max ? full.slice(0, max) + "…" : full
        const fontSize = (node.kind === "agent" ? 12 : 10) / globalScale
        ctx.font = `${node.kind === "agent" ? "600 " : ""}${fontSize}px ui-monospace, monospace`
        ctx.fillStyle = node.kind === "agent" ? "#ffffff" : "#ffffffcc"
        ctx.textAlign = "center"
        ctx.fillText(label, node.x, node.y + r + fontSize + 2)
      }
    },
    [hoverId],
  )

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D
        ref={fgRef}
        width={dims.width}
        height={dims.height}
        graphData={graphData}
        nodeVal={(n: any) => PHYS_VAL[n.kind as NodeKind] ?? 6}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace"}
        onNodeClick={(n: any) => onNodeClick?.(n as GraphNode)}
        onNodeHover={(n: any) => setHoverId(n?.id ?? null)}
        onEngineStop={() => fgRef.current?.zoomToFit?.(500, 70)}
        linkColor={(l: any) => EDGE_STYLE[l.kind as EdgeKind]?.color ?? "rgba(255,255,255,0.1)"}
        linkWidth={(l: any) => {
          const st = EDGE_STYLE[l.kind as EdgeKind]
          if (!st) return 0.5
          return l.kind === "critique" ? st.width * Math.min(3, l.weight ?? 1) : st.width
        }}
        linkDirectionalArrowLength={(l: any) => EDGE_STYLE[l.kind as EdgeKind]?.arrow ?? 0}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(l: any) => EDGE_STYLE[l.kind as EdgeKind]?.particles ?? 0}
        linkDirectionalParticleSpeed={0.005}
        backgroundColor="transparent"
        cooldownTicks={200}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.35}
      />
    </div>
  )
}
