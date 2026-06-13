"use client"

import { motion } from "framer-motion"
import { AgentOrb, type AgentView } from "@/components/agent-orb"
import { cn } from "@/lib/utils"

/**
 * The superposition → collapse visual: a pulsing "wave strip" (one segment per agent) above
 * the 3 agent panels. On collapse the winner's segment stays lit; the losers flatten.
 */
export function WaveCollapse({
  agents,
  winnerId,
  collapsed,
}: {
  agents: AgentView[]
  winnerId: number | null
  collapsed: boolean
}) {
  return (
    <div>
      <div className="mb-6 flex gap-2">
        {agents.map((a) => {
          const isWinner = collapsed && winnerId === a.agentId
          const dimmed = collapsed && !isWinner
          const pulsing = (a.status === "thinking" || a.status === "debating") && !collapsed
          // Debate phase: faster pulse + slightly brighter to show "in flux"
          const debating = a.status === "debating" && !collapsed
          return (
            <motion.div
              key={a.agentId}
              className={cn(
                "h-1 flex-1",
                isWinner ? "bg-accent" : dimmed ? "bg-border" : debating ? "bg-orange-400/60" : "bg-accent/40"
              )}
              animate={pulsing ? { opacity: debating ? [0.4, 1, 0.4] : [0.3, 1, 0.3] } : { opacity: 1 }}
              transition={
                pulsing
                  ? { duration: debating ? 0.7 : 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
                  : { duration: 0.5 }
              }
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {agents.map((a) => (
          <AgentOrb key={a.agentId} agent={a} collapsed={collapsed} isWinner={winnerId === a.agentId} />
        ))}
      </div>
    </div>
  )
}
