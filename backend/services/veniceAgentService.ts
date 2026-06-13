import { wrapFetchWithPayment, createSigner } from 'x402-fetch'
import type { Hex } from 'viem'
import { AgentOutputSchema, type AgentOutput } from '@/schemas/agentOutputSchema'
import { AGENT_ROLES } from '@/lib/constants'

/**
 * Each agent pays a small USDC toll (x402, Base Sepolia) per inference to the gateway at
 * /api/x402/inference, which runs Venice behind the paywall. The agent wallet signs the
 * payment; the gateway settles it onchain. This is the "agents pay for inference" flow.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const INFERENCE_URL = `${APP_URL}/api/x402/inference`

const AGENT_KEYS = [
  process.env.AGENT_A_PRIVATE_KEY,
  process.env.AGENT_B_PRIVATE_KEY,
  process.env.AGENT_C_PRIVATE_KEY,
] as (Hex | undefined)[]

// One x402-paying fetch per agent (the signer is created async, so cache the promise).
const paidFetchers: Record<number, Promise<ReturnType<typeof wrapFetchWithPayment>>> = {}
function getPaidFetch(agentId: number): Promise<ReturnType<typeof wrapFetchWithPayment>> {
  if (!paidFetchers[agentId]) {
    const key = AGENT_KEYS[agentId]
    if (!key || !key.startsWith('0x')) {
      return Promise.reject(
        new Error(`AGENT_${String.fromCharCode(65 + agentId)}_PRIVATE_KEY is not set`)
      )
    }
    paidFetchers[agentId] = createSigner('base-sepolia', key).then((signer) =>
      wrapFetchWithPayment(fetch, signer)
    )
  }
  return paidFetchers[agentId]
}

const SYSTEM_PROMPT = (role: string) =>
  `You are a specialist AI agent performing ${role} for a user's intent.
Respond with ONLY a JSON object with these exact fields — no prose, no code fences:
{
  "summary": "brief summary of your finding",
  "confidence": <integer 0-100, how confident you are this is the best path>,
  "action": "the single concrete action you recommend",
  "reasoning": "your reasoning, condensed"
}`

export interface AgentRunResult {
  agentId: number
  role: string
  reasoningContent: string
  confidence: number
  output: AgentOutput
}

export async function runAgent(params: {
  agentId: number
  userIntent: string
  onReasoning?: (chunk: string) => void
}): Promise<AgentRunResult> {
  const { agentId, userIntent, onReasoning } = params
  const role = AGENT_ROLES[agentId] ?? `Agent ${agentId}`
  const paidFetch = await getPaidFetch(agentId)

  const res = await paidFetch(INFERENCE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt: SYSTEM_PROMPT(role), userIntent }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`x402 inference failed for agent ${agentId}: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as { content?: string; reasoning_content?: string }
  let reasoningContent = data.reasoning_content ?? ''
  let content = data.content ?? ''

  if (!reasoningContent) {
    const think = content.match(/<think>([\s\S]*?)<\/think>/)
    if (think) {
      reasoningContent = think[1].trim()
      content = content.replace(think[0], '').trim()
    }
  }

  if (onReasoning && reasoningContent) onReasoning(reasoningContent)

  const parsed = AgentOutputSchema.safeParse(extractJson(content))
  if (!parsed.success) {
    throw new Error(
      `Agent ${agentId} (${role}) returned invalid structured output: ${parsed.error.message}`
    )
  }

  return {
    agentId,
    role,
    reasoningContent,
    confidence: parsed.data.confidence,
    output: parsed.data,
  }
}

/** Reasoning models often wrap JSON in prose or code fences — pull the object out. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* fall through */
    }
  }
  const obj = trimmed.match(/\{[\s\S]*\}/)
  if (obj) {
    try {
      return JSON.parse(obj[0])
    } catch {
      /* fall through */
    }
  }
  return null
}
