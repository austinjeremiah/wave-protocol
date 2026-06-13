"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { basescanTx } from "@/lib/wave-api"

export interface AgentView {
  agentId: number
  role: string
  status: "idle" | "thinking" | "done"
  reasoning: string
  confidence: number | null
  summary: string | null
  txHash: string | null
}

export function AgentOrb({
  agent,
  collapsed,
  isWinner,
}: {
  agent: AgentView
  collapsed: boolean
  isWinner: boolean
}) {
  const dimmed = collapsed && !isWinner

  return (
    <motion.article
      layout
      animate={{ opacity: dimmed ? 0.35 : 1, scale: collapsed ? (isWinner ? 1.02 : 0.97) : 1 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        "relative flex flex-col min-h-[440px] bg-card border p-6 overflow-hidden",
        collapsed && isWinner ? "border-accent" : "border-border/50",
        dimmed && "grayscale",
      )}
    >
      {/* live reasoning glow */}
      {agent.status === "thinking" && !collapsed && (
        <div className="absolute inset-0 bg-accent/[0.06] animate-pulse pointer-events-none" />
      )}

      {/* header */}
      <div className="relative z-10 flex items-baseline justify-between mb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
          {String(agent.agentId + 1).padStart(2, "0")} / {agent.role}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
          {statusLabel(agent.status, collapsed, isWinner)}
        </span>
      </div>

      {/* confidence */}
      <div className="relative z-10 mb-6 h-16 flex items-end">
        {agent.confidence !== null ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-baseline gap-2"
          >
            <span
              className={cn(
                "font-[var(--font-bebas)] text-6xl leading-none tracking-tight",
                collapsed && isWinner ? "text-accent" : "text-foreground",
              )}
            >
              {agent.confidence}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">conf</span>
          </motion.div>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
            {agent.status === "thinking" ? "reasoning…" : "awaiting"}
          </span>
        )}
      </div>

      {/* reasoning stream (clamped) */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap line-clamp-[10]">
          {agent.reasoning}
        </p>
      </div>

      {/* summary */}
      {agent.summary && (
        <p className="relative z-10 mt-4 pt-4 border-t border-border/40 font-mono text-[11px] leading-relaxed text-foreground/80 line-clamp-3">
          {agent.summary}
        </p>
      )}

      {/* footer */}
      <div className="relative z-10 mt-4 flex items-center justify-between">
        {agent.txHash ? (
          <a
            href={basescanTx(agent.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
          >
            onchain ↗
          </a>
        ) : (
          <span />
        )}
        {collapsed &&
          (isWinner ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">winner</span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50">
              gated
            </span>
          ))}
      </div>
    </motion.article>
  )
}

function statusLabel(status: AgentView["status"], collapsed: boolean, isWinner: boolean) {
  if (collapsed) return isWinner ? "selected" : "collapsed"
  if (status === "thinking") return "reasoning"
  if (status === "done") return "committed"
  return "idle"
}
