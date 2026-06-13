"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { basescanTx } from "@/lib/wave-api"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"

export interface AgentView {
  agentId: number
  role: string
  status: "idle" | "thinking" | "debating" | "done"
  reasoning: string
  confidence: number | null      // current (revised after debate if applicable)
  round1Confidence: number | null // pre-debate
  convictionBet: number | null   // USDC paid in Round 2 conviction bet
  critiqueText: string | null
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
        "glass relative flex flex-col min-h-[440px] p-6 overflow-hidden",
        collapsed && isWinner && "!border-accent shadow-[0_0_32px_oklch(0.7_0.2_45/0.18)]",
        dimmed && "grayscale",
      )}
    >
      {/* live reasoning glow */}
      {agent.status === "thinking" && !collapsed && (
        <div className="absolute inset-0 bg-accent/[0.06] animate-pulse pointer-events-none" />
      )}
      {/* debate glow — slightly different shade to mark the second round */}
      {agent.status === "debating" && !collapsed && (
        <div className="absolute inset-0 bg-orange-400/[0.09] animate-pulse pointer-events-none" />
      )}

      {/* header */}
      <div className="relative z-10 flex items-baseline justify-between mb-6">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.3em]"
          style={{ color: AGENT_WAVE_COLORS[agent.agentId] ?? "var(--accent)" }}
        >
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
            {/* Show confidence delta after debate */}
            {agent.round1Confidence !== null && agent.round1Confidence !== agent.confidence && (
              <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "font-mono text-[10px] tracking-widest",
                  (agent.confidence ?? 0) > agent.round1Confidence ? "text-accent" : "text-destructive",
                )}
              >
                {(agent.confidence ?? 0) > agent.round1Confidence ? "+" : ""}
                {(agent.confidence ?? 0) - agent.round1Confidence}
              </motion.span>
            )}
          </motion.div>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
            {agent.status === "thinking" ? "reasoning…" : agent.status === "debating" ? "debating…" : "awaiting"}
          </span>
        )}
      </div>
      {/* Conviction bet display */}
      {agent.convictionBet !== null && (
        <div className="relative z-10 mb-3">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
            conviction bet · ${agent.convictionBet.toFixed(4)} usdc
          </span>
        </div>
      )}

      {/* reasoning stream (clamped) */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <p className="font-mono text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap line-clamp-[8]">
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
  if (status === "debating") return "debating"
  if (status === "done") return "committed"
  return "idle"
}
