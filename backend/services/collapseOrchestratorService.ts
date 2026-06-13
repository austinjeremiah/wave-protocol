import type { Hex } from 'viem'
import { hashReasoningContent } from './delegationService'
import {
  submitReasoningHash,
  waitForTx,
  waitForCollapse,
  type CollapseEvent,
} from './enforcerService'
import type { AgentRunResult } from './veniceAgentService'

export interface CollapseResult extends CollapseEvent {
  hashTxHashes: Hex[] // index === agentId
}

/**
 * Drive the collapse: hash each agent's reasoning, submit all hashes onchain via the
 * backend EOA, then wait for the contract's auto-collapse event.
 *
 * Hashes are submitted SEQUENTIALLY (each tx mined before the next) — they share one
 * EOA nonce, and the 3rd submission is what triggers _collapse() onchain. We start
 * watching for the event before submitting so we never miss it.
 */
export async function runCollapse(params: {
  sessionId: Hex
  agentResults: AgentRunResult[]
  onHashSubmitted?: (agentId: number, txHash: Hex) => void
  onHashConfirmed?: (agentId: number, txHash: Hex) => void
}): Promise<CollapseResult> {
  const { sessionId, agentResults, onHashSubmitted, onHashConfirmed } = params

  // Watch first so the collapse (fired by the final submit) can't slip past us.
  const collapsePromise = waitForCollapse(sessionId)

  const hashTxHashes: Hex[] = []
  // Submit in agentId order so the onchain index matches.
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

    // Wait for inclusion before the next submit so the EOA nonce advances cleanly.
    await waitForTx(txHash)
    onHashConfirmed?.(result.agentId, txHash)
    hashTxHashes[result.agentId] = txHash
  }

  const collapse = await collapsePromise
  return { ...collapse, hashTxHashes }
}
