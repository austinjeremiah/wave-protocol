// Typed client for the Wave Protocol backend + SSE event types.

import { createPublicClient, http, formatUnits } from "viem"
import { baseSepolia } from "viem/chains"

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001"

/** Roles by agentId (yield-strategist lenses; matches the backend). */
export const AGENT_ROLES = ["Yield", "Risk", "Liquidity"] as const

/** A throwaway address for the no-wallet demo path (replaced by the connected wallet in F3). */
export const DEMO_USER_ADDRESS = "0x000000000000000000000000000000000000dEaD"

export interface CreateSessionInput {
  userIntent: string
  budgetUsdc: number
  userAddress: string
}
export interface CreateSessionResult {
  sessionId: string
  agentAddresses: string[]
  initTxHash: string
}
export interface RunResult {
  winnerAgentId: number
  winnerHash: string
  winnerConfidence: number
  hashTxHashes: string[]
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  return jsonOrThrow(
    await fetch(`${BASE}/api/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  )
}

export async function runSession(sessionId: string): Promise<RunResult> {
  return jsonOrThrow(await fetch(`${BASE}/api/session/${sessionId}/run`, { method: "POST" }))
}

export async function getSession(sessionId: string): Promise<SessionRecord> {
  return jsonOrThrow(await fetch(`${BASE}/api/session/${sessionId}`))
}

/** List sessions (newest first), optionally scoped to one owner address — powers /portfolio. */
export async function listSessions(opts: { userAddress?: string; limit?: number } = {}): Promise<SessionRecord[]> {
  const qs = new URLSearchParams()
  if (opts.userAddress) qs.set("userAddress", opts.userAddress)
  if (opts.limit) qs.set("limit", String(opts.limit))
  const suffix = qs.toString() ? `?${qs}` : ""
  return jsonOrThrow(await fetch(`${BASE}/api/session${suffix}`))
}

export function streamUrl(sessionId: string): string {
  return `${BASE}/api/session/${sessionId}/stream`
}

// ── Wave Market (copy-trading) ───────────────────────────────────

export interface StrategyListing {
  listingId: number
  sessionId: string
  winnerAgentId: number
  reasoningHash: string
  sellerAddress: string
  priceUsdc: number
  purchases: number
  active: boolean
  listTxHash: string | null
  createdAt?: string
  // enriched from the source session
  role: string | null
  confidence: number | null
  reasoningExcerpt: string | null
  userIntent: string | null
}

export interface StrategyPurchaseRecord {
  id: string
  listingId: number
  buyerAddress: string
  deployedUsdc: number
  sellerPaymentTx: string | null
  supplyTxHash: string | null
  createdAt?: string
}

export interface MarketData {
  listings: StrategyListing[]
  purchases: StrategyPurchaseRecord[]
}

export async function getMarket(): Promise<MarketData> {
  return jsonOrThrow(await fetch(`${BASE}/api/market`))
}

export async function getListing(listingId: number): Promise<StrategyListing> {
  return jsonOrThrow(await fetch(`${BASE}/api/market/${listingId}`))
}

/** List a collapsed session's winning strategy on the market (owner action, after collapse). */
export async function listStrategy(input: { sessionId: string; priceUsdc: number }): Promise<StrategyListing> {
  return jsonOrThrow(
    await fetch(`${BASE}/api/market/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  )
}

/** The x402-gated purchase endpoint (used by the buyer-side flow in market-x402.ts). */
export const marketPurchaseUrl = (listingId: number) => `${BASE}/api/market/${listingId}/purchase`

export const basescanTx = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`
export const basescanAddress = (addr: string) => `https://sepolia.basescan.org/address/${addr}`

// ── Compound V3 live position read ───────────────────────────────
// The WaveStrategyVault supplies via `supplyTo(user, …)`, so the USER owns the Compound position.
// `comet.balanceOf(user)` returns its present value in USDC (6 decimals) — and it grows with yield.

export const COMPOUND_COMET_ADDRESS =
  (process.env.NEXT_PUBLIC_COMPOUND_COMET ?? "0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017") as `0x${string}`

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org"),
})

const COMET_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const

/** Live supplied balance (USDC) the address owns in Compound V3 — present value incl. accrued yield. */
export async function readCompoundBalance(account: string): Promise<number> {
  const bal = (await publicClient.readContract({
    address: COMPOUND_COMET_ADDRESS,
    abi: COMET_ABI,
    functionName: "balanceOf",
    args: [account as `0x${string}`],
  })) as bigint
  return Number(formatUnits(bal, USDC_DECIMALS))
}

export const USDC_DECIMALS = 6

/** Persisted session shape (subset we use) returned by GET /api/session/:id. */
export interface SessionRecord {
  sessionId: string
  userIntent: string
  budgetUsdc: number
  status: string
  userAddress: string
  winnerAgentId: number | null
  winnerHash: string | null
  strategyVaultTx: string | null
  aaveSupplyTx: string | null
  createdAt?: string
  updatedAt?: string
  agentResults: {
    agentId: number
    role: string
    reasoningContent: string
    reasoningHash: string
    confidence: number
    round1Confidence: number | null
    revisedConfidence: number | null
    critiqueText: string | null
    convictionBetUsdc: number | null
    structuredOutput: { summary?: string; action?: string; reasoning?: string } | null
    hashTxHash: string | null
  }[]
}

/** Live SSE event union (each event also carries `ts`). */
export type WaveEvent =
  | { type: "agents_started"; agentCount: number; ts: number }
  | { type: "agent_reasoning"; agentId: number; chunk: string; ts: number }
  | { type: "agent_done"; agentId: number; role: string; confidence: number; summary: string; action: string; ts: number }
  // Round 2 — A2A debate
  | { type: "debate_started"; roundNumber: number; ts: number }
  | { type: "agent_debate_reasoning"; agentId: number; chunk: string; ts: number }
  | { type: "confidence_shift"; agentId: number; from: number; to: number; convictionBetUsdc: number; critique: string; revisedAction: string; ts: number }
  | { type: "debate_complete"; results: { agentId: number; from: number; to: number; convictionBetUsdc: number }[]; ts: number }
  // Onchain collapse
  | { type: "hash_submitted"; agentId: number; txHash: string; ts: number }
  | { type: "hash_confirmed"; agentId: number; txHash: string; ts: number }
  | { type: "wavefunction_collapsed"; winnerAgentId: number; winnerHash: string; winnerConfidence: number; ts: number }
  // Strategy execution
  | { type: "execution_started"; winnerAgentId: number; ts: number }
  | { type: "execution_redeemed"; winnerAgentId: number; txHash: string; viaDelegation: boolean; ts: number }
  | { type: "execution_supplied"; winnerAgentId: number; txHash: string; protocol: string; vaultAddress: string; recipient: string; ts: number }
  | { type: "execution_complete"; winnerAgentId: number; ts: number }
  | { type: "error"; message: string; ts: number }
