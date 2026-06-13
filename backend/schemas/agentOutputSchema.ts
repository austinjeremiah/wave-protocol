import { z } from 'zod'

/**
 * The structured JSON every agent must return. `confidence` (0–100) is what the
 * VeniceCollapseEnforcer compares onchain to pick the winning agent.
 */
export const AgentOutputSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(100),
  action: z.string(),
  reasoning: z.string(),
})

export type AgentOutput = z.infer<typeof AgentOutputSchema>
