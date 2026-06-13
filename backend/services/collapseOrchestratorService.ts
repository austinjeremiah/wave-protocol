import type { Hex } from 'viem'
import { hashReasoningContent } from './delegationService'
import {
  submitReasoningHash,
  waitForTx,
  parseCollapseFromLogs,
  readCollapse,
  type CollapseEvent,
} from './enforcerService'
import type { AgentRunResult } from './veniceAgentService'

export interface CollapseResult extends CollapseEvent {
  hashTxHashes: Hex[] // index === agentId
}

/**
 * Drive the collapse: hash each agent's reasoning, submit all hashes onchain via the
 * backend EOA (sequentially — shared EOA nonce), then read the winner.
 *
 * The contract auto-collapses inside the FINAL submitReasoningHash tx, so we parse the
 * WavefunctionCollapsed event straight from that tx's receipt (no RPC log filters, which
 * public RPCs drop unreliably). Falls back to a contract-state read if parsing misses.
 */
export async function runCollapse(params: {
  sessionId: Hex
  agentResults: AgentRunResult[]
  onHashSubmitted?: (agentId: number, txHash: Hex) => void
  onHashConfirmed?: (agentId: number, txHash: Hex) => void
}): Promise<CollapseResult> {
  const { sessionId, agentResults, onHashSubmitted, onHashConfirmed } = params

  const hashTxHashes: Hex[] = []
  let lastReceipt: Awaited<ReturnType<typeof waitForTx>> | undefined

  // Submit in agentId order; wait for each to mine so the EOA nonce advances cleanly.
  const ordered = [...agentResults].sort((a, b) => a.agentId - b.agentId)
  for (const result of ordered) {
    const reasoningHash = hashReasoningContent(result.reasoningContent)
    const txHash = await submitReasoningHash({
      sessionId,
      agentId: result.agentId,
      reasoningHash,
      confidence: result.confidence,
    })
    onHashSubmitted?.(result.agentId, txHash)
    lastReceipt = await waitForTx(txHash)
    onHashConfirmed?.(result.agentId, txHash)
    hashTxHashes[result.agentId] = txHash
  }

  // Collapse happened in the last submit tx — read it from that receipt.
  let collapse = lastReceipt ? parseCollapseFromLogs([...lastReceipt.logs]) : null
  if (!collapse) collapse = await readCollapse(sessionId)

  return { ...collapse, hashTxHashes }
}
