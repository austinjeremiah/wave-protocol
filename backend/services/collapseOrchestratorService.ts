import type { Hex } from 'viem'
import { hashReasoningContent } from './delegationService'
import {
  submitReasoningHash,
  waitForTx,
  parseCollapseFromLogs,
  readCollapse,
  getAgentSubmissionOnchain,
  type CollapseEvent,
} from './enforcerService'
import { logger } from '@/lib/logger'
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
  /** If provided, these revised confidences (from debate round) override Round 1. */
  revisedConfidences?: Record<number, number>
  onHashSubmitted?: (agentId: number, txHash: Hex) => void
  onHashConfirmed?: (agentId: number, txHash: Hex) => void
}): Promise<CollapseResult> {
  const { sessionId, agentResults, revisedConfidences, onHashSubmitted, onHashConfirmed } = params

  const hashTxHashes: Hex[] = []
  let lastReceipt: Awaited<ReturnType<typeof waitForTx>> | undefined

  // Submit in agentId order; wait for each to mine so the EOA nonce advances cleanly.
  // The FINAL submit auto-collapses (heaviest tx), so each submit is retried if it reverts —
  // a single dropped/under-gassed collapse tx must not leave the session stuck at 2/3.
  const ordered = [...agentResults].sort((a, b) => a.agentId - b.agentId)
  for (const result of ordered) {
    const reasoningHash = hashReasoningContent(result.reasoningContent)
    // Sanitize → guaranteed valid uint8 (0-100 integer); use revised confidence from the debate.
    const raw = revisedConfidences?.[result.agentId] ?? result.confidence
    const confidence = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)))

    let txHash: Hex | undefined
    let receipt: Awaited<ReturnType<typeof waitForTx>> | undefined
    for (let attempt = 1; attempt <= 3; attempt++) {
      // If a prior attempt already landed onchain (e.g. receipt looked reverted due to RPC lag),
      // don't re-submit — that would revert with "Already submitted".
      const onchain = await getAgentSubmissionOnchain(sessionId, result.agentId)
      if (onchain.submitted) break

      txHash = await submitReasoningHash({ sessionId, agentId: result.agentId, reasoningHash, confidence })
      onHashSubmitted?.(result.agentId, txHash)
      receipt = await waitForTx(txHash)
      if (receipt.status === 'success') break

      logger.warn(
        { sessionId, agentId: result.agentId, attempt, txHash },
        'submitReasoningHash reverted — retrying'
      )
      await new Promise((r) => setTimeout(r, 1500))
    }

    if (txHash) {
      onHashConfirmed?.(result.agentId, txHash)
      hashTxHashes[result.agentId] = txHash
    }
    if (receipt?.status === 'success') lastReceipt = receipt
  }

  // Collapse happened in the last submit tx — read it from that receipt.
  let collapse = lastReceipt ? parseCollapseFromLogs([...lastReceipt.logs]) : null
  if (!collapse) collapse = await readCollapse(sessionId)

  return { ...collapse, hashTxHashes }
}
