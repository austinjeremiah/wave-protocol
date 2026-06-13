"use client"

import { motion } from "framer-motion"
import type { AgentView } from "@/components/agent-orb"
import { cn } from "@/lib/utils"

/**
 * The Debate Floor — the A2A coordination made visible. During Round 2 the three agents take
 * the floor (chairs), read each other's proposals, and argue. Each podium shows the agent's
 * live confidence + how it shifted, what it STAKED (conviction bet, real USDC via x402), and
 * its actual critique of the others. The pulses traveling the bus are the agents exchanging
 * arguments — the literal "agents talking to each other" the protocol is built on.
 */
export function DebateFloor({ agents, active }: { agents: AgentView[]; active: boolean }) {
  const hasDebate = agents.some((a) => a.critiqueText || a.convictionBet !== null)
  if (!active && !hasDebate) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-8 border border-orange-400/30 bg-[oklch(0.07_0_0)] p-6 md:p-8"
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-orange-400">Debate Floor</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
            Round 02 · agent-to-agent
          </span>
        </div>
        {active && (
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-orange-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" /> live
          </span>
        )}
      </div>

      {/* Cross-talk bus — pulses travel between the agents (the A2A exchange). */}
      <div className="relative mb-5 h-5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-orange-400/20" />
        {[0, 1, 2].map((dotIndex) => (
          <span key={dotIndex} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${16 + dotIndex * 34}%` }}>
            <span className="block h-2 w-2 rounded-full bg-orange-400/70" />
          </span>
        ))}
        {active &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={`pulse-${i}`}
              className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.9)]"
              animate={{ left: ["16%", "84%", "16%"], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, delay: i * 0.85, ease: "easeInOut" }}
            />
          ))}
      </div>

      {/* The three debaters at their chairs. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {agents.map((a) => (
          <Podium key={a.agentId} agent={a} active={active} />
        ))}
      </div>
    </motion.section>
  )
}

function Podium({ agent, active }: { agent: AgentView; active: boolean }) {
  const delta =
    agent.round1Confidence !== null && agent.confidence !== null
      ? agent.confidence - agent.round1Confidence
      : null
  const speaking = active && agent.status === "debating"

  return (
    <div
      className={cn(
        "relative flex flex-col border bg-card p-4 min-h-[200px]",
        speaking ? "border-orange-400/50" : "border-border/50",
      )}
    >
      {speaking && <div className="absolute inset-0 bg-orange-400/[0.05] animate-pulse pointer-events-none" />}

      <div className="relative z-10 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-400">
          {String(agent.agentId + 1).padStart(2, "0")} / {agent.role}
        </span>
        {speaking && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-orange-400/70">speaking…</span>
        )}
      </div>

      {/* Confidence + how it shifted in the debate */}
      <div className="relative z-10 mt-3 flex items-baseline gap-2">
        <span className="font-[var(--font-bebas)] text-4xl leading-none text-foreground">
          {agent.confidence ?? "—"}
        </span>
        {delta !== null && delta !== 0 && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("font-mono text-[11px] tracking-wide", delta > 0 ? "text-orange-400" : "text-destructive")}
          >
            {delta > 0 ? `↑ +${delta}` : `↓ ${delta}`}
          </motion.span>
        )}
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">conf</span>
      </div>

      {/* Conviction stake (real USDC paid via x402, scaled by belief) */}
      {agent.convictionBet !== null && (
        <span className="relative z-10 mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
          staked&nbsp; ${agent.convictionBet.toFixed(4)} usdc
        </span>
      )}

      {/* The actual argument — full text (scrolls if long) */}
      <div className="relative z-10 mt-3 max-h-64 flex-1 overflow-y-auto border-t border-border/40 pt-3">
        {agent.critiqueText ? (
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
            &ldquo;{agent.critiqueText}&rdquo;
          </p>
        ) : (
          <p className="font-mono text-[10px] text-muted-foreground/40">
            {speaking ? "forming argument…" : "awaiting the floor"}
          </p>
        )}
      </div>
    </div>
  )
}
