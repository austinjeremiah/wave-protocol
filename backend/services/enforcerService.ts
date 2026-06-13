import { parseEventLogs, type Address, type Hex, type Log } from 'viem'
import { getPublicClient, getBackendWalletClient } from './chainService'
import { runExclusive } from '@/lib/mutex'
import { VENICE_COLLAPSE_ENFORCER_ADDRESS } from '@/lib/constants'

/** Minimal ABI for the functions/events we touch on VeniceCollapseEnforcer. */
export const ENFORCER_ABI = [
  {
    type: 'function',
    name: 'initSession',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'agentCount', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitReasoningHash',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'agentId', type: 'uint8' },
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'confidence', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSession',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'submissionCount', type: 'uint8' },
      { name: 'requiredAgents', type: 'uint8' },
      { name: 'winnerAgentId', type: 'uint8' },
      { name: 'collapsed', type: 'bool' },
      { name: 'initiator', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'getAgentSubmission',
    stateMutability: 'view',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'agentId', type: 'uint8' },
    ],
    outputs: [
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'confidence', type: 'uint8' },
      { name: 'submitted', type: 'bool' },
    ],
  },
  {
    type: 'event',
    name: 'WavefunctionCollapsed',
    inputs: [
      { name: 'sessionId', type: 'bytes32', indexed: true },
      { name: 'winnerAgentId', type: 'uint8', indexed: true },
      { name: 'winnerHash', type: 'bytes32', indexed: false },
      { name: 'winnerConfidence', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ReasoningHashSubmitted',
    inputs: [
      { name: 'sessionId', type: 'bytes32', indexed: true },
      { name: 'agentId', type: 'uint8', indexed: true },
      { name: 'reasoningHash', type: 'bytes32', indexed: false },
      { name: 'confidence', type: 'uint8', indexed: false },
    ],
  },
] as const

function enforcerAddress(): Address {
  if (!VENICE_COLLAPSE_ENFORCER_ADDRESS) {
    throw new Error('VENICE_COLLAPSE_ENFORCER_ADDRESS is not set')
  }
  return VENICE_COLLAPSE_ENFORCER_ADDRESS
}

/** Open a collapse session onchain (backend EOA becomes its initiator). */
export async function initSession(sessionId: Hex, agentCount = 3): Promise<Hex> {
  return runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: enforcerAddress(),
      abi: ENFORCER_ABI,
      functionName: 'initSession',
      args: [sessionId, agentCount],
    })
  )
}

/** Commit one agent's reasoning hash + confidence. The final submit auto-collapses. */
export async function submitReasoningHash(params: {
  sessionId: Hex
  agentId: number
  reasoningHash: Hex
  confidence: number
}): Promise<Hex> {
  const { sessionId, agentId, reasoningHash, confidence } = params
  return runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: enforcerAddress(),
      abi: ENFORCER_ABI,
      functionName: 'submitReasoningHash',
      args: [sessionId, agentId, reasoningHash, confidence],
      // Generous fixed gas: the FINAL submit runs _collapse() too, and auto-estimation can come
      // in just under that path — an under-gassed collapse tx is what left a session at 2/3.
      gas: 350_000n,
    })
  )
}

/** Block until a tx is mined and return its receipt. */
export async function waitForTx(hash: Hex) {
  return getPublicClient().waitForTransactionReceipt({ hash })
}

export async function getSessionOnchain(sessionId: Hex) {
  const [submissionCount, requiredAgents, winnerAgentId, collapsed, initiator] =
    await getPublicClient().readContract({
      address: enforcerAddress(),
      abi: ENFORCER_ABI,
      functionName: 'getSession',
      args: [sessionId],
    })
  return { submissionCount, requiredAgents, winnerAgentId, collapsed, initiator }
}

export async function getAgentSubmissionOnchain(sessionId: Hex, agentId: number) {
  const [reasoningHash, confidence, submitted] = await getPublicClient().readContract({
    address: enforcerAddress(),
    abi: ENFORCER_ABI,
    functionName: 'getAgentSubmission',
    args: [sessionId, agentId],
  })
  return { reasoningHash, confidence, submitted }
}

export interface CollapseEvent {
  winnerAgentId: number
  winnerHash: Hex
  winnerConfidence: number
}

/**
 * The contract auto-collapses inside the final submitReasoningHash tx, so the
 * WavefunctionCollapsed event lives in that tx's receipt — parse it directly.
 * Far more reliable than RPC log filters (public RPCs drop filters between polls).
 */
export function parseCollapseFromLogs(logs: Log[]): CollapseEvent | null {
  const events = parseEventLogs({
    abi: ENFORCER_ABI,
    eventName: 'WavefunctionCollapsed',
    logs,
  })
  const e = events[0]
  if (!e) return null
  return {
    winnerAgentId: Number(e.args.winnerAgentId),
    winnerHash: e.args.winnerHash,
    winnerConfidence: Number(e.args.winnerConfidence),
  }
}

/** Fallback: read the collapsed winner straight from contract state. */
export async function readCollapse(sessionId: Hex): Promise<CollapseEvent> {
  const s = await getSessionOnchain(sessionId)
  if (!s.collapsed) throw new Error('Session has not collapsed onchain')
  const win = await getAgentSubmissionOnchain(sessionId, s.winnerAgentId)
  return {
    winnerAgentId: Number(s.winnerAgentId),
    winnerHash: win.reasoningHash,
    winnerConfidence: Number(win.confidence),
  }
}
