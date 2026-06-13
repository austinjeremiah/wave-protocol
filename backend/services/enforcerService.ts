import type { Address, Hex } from 'viem'
import { getPublicClient, getBackendWalletClient } from './chainService'
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
  return getBackendWalletClient().writeContract({
    address: enforcerAddress(),
    abi: ENFORCER_ABI,
    functionName: 'initSession',
    args: [sessionId, agentCount],
  })
}

/** Commit one agent's reasoning hash + confidence. The 3rd submit auto-collapses. */
export async function submitReasoningHash(params: {
  sessionId: Hex
  agentId: number
  reasoningHash: Hex
  confidence: number
}): Promise<Hex> {
  const { sessionId, agentId, reasoningHash, confidence } = params
  return getBackendWalletClient().writeContract({
    address: enforcerAddress(),
    abi: ENFORCER_ABI,
    functionName: 'submitReasoningHash',
    args: [sessionId, agentId, reasoningHash, confidence],
  })
}

/** Block until a tx is mined. */
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

export interface CollapseEvent {
  winnerAgentId: number
  winnerHash: Hex
  winnerConfidence: number
}

/** Resolve when the contract emits WavefunctionCollapsed for this session. */
export function waitForCollapse(sessionId: Hex, timeoutMs = 90_000): Promise<CollapseEvent> {
  const client = getPublicClient()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unwatch()
      reject(new Error(`Collapse timeout after ${timeoutMs}ms for session ${sessionId}`))
    }, timeoutMs)

    const unwatch = client.watchContractEvent({
      address: enforcerAddress(),
      abi: ENFORCER_ABI,
      eventName: 'WavefunctionCollapsed',
      args: { sessionId },
      onLogs: (logs) => {
        const log = logs.find(
          (l) => l.args.sessionId?.toLowerCase() === sessionId.toLowerCase()
        )
        if (!log) return
        clearTimeout(timer)
        unwatch()
        resolve({
          winnerAgentId: Number(log.args.winnerAgentId),
          winnerHash: log.args.winnerHash as Hex,
          winnerConfidence: Number(log.args.winnerConfidence),
        })
      },
      onError: (err) => {
        clearTimeout(timer)
        unwatch()
        reject(err)
      },
    })
  })
}
