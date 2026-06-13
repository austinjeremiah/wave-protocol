// Typed client for the Wave Protocol backend + SSE event types.

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001"

/** Roles by agentId (matches the backend). */
export const AGENT_ROLES = ["Research", "Analysis", "Execution"] as const

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

export function streamUrl(sessionId: string): string {
  return `${BASE}/api/session/${sessionId}/stream`
}

export const basescanTx = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`

/** Persisted session shape (subset we use) returned by GET /api/session/:id. */
export interface SessionRecord {
  sessionId: string
  userIntent: string
  budgetUsdc: number
  status: string
  winnerAgentId: number | null
  winnerHash: string | null
  agentResults: {
    agentId: number
    role: string
    reasoningContent: string
    reasoningHash: string
    confidence: number
    structuredOutput: { summary?: string; action?: string; reasoning?: string } | null
    hashTxHash: string | null
  }[]
}

/** Live SSE event union (each event also carries `ts`). */
export type WaveEvent =
  | { type: "agents_started"; agentCount: number; ts: number }
  | { type: "agent_reasoning"; agentId: number; chunk: string; ts: number }
  | { type: "agent_done"; agentId: number; role: string; confidence: number; summary: string; ts: number }
  | { type: "hash_submitted"; agentId: number; txHash: string; ts: number }
  | { type: "hash_confirmed"; agentId: number; txHash: string; ts: number }
  | { type: "wavefunction_collapsed"; winnerAgentId: number; winnerHash: string; winnerConfidence: number; ts: number }
  | { type: "execution_complete"; winnerAgentId: number; ts: number }
  | { type: "error"; message: string; ts: number }
