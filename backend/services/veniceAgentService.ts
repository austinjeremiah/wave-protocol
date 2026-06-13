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
  `You are a DeFi yield strategist (lens: ${role}) on an AI fund-management protocol. The user wants
to put idle USDC stablecoins to work on Base Sepolia. The executable venue is Compound V3 (cUSDCv3) —
supplying USDC earns lending yield. Given the user's goal, decide the best risk-adjusted strategy and
how confident you are it fits them.

Respond with ONLY a JSON object with these exact fields — no prose, no code fences:
{
  "summary": "your recommended stablecoin yield strategy, briefly",
  "confidence": <integer 0-100, how confident you are this is the best risk-adjusted strategy>,
  "action": "the single concrete action (e.g. 'Supply USDC to Compound V3 for lending yield')",
  "reasoning": "your reasoning — yield vs risk, liquidity, why it fits the user"
}`

export interface AgentRunResult {
  agentId: number
  role: string
  reasoningContent: string
  confidence: number
  output: AgentOutput
}

export interface AgentDebateResult {
  agentId: number
  role: string
  critiqueText: string
  round1Confidence: number
  revisedConfidence: number
  revisedAction: string
  revisedSummary: string
  convictionBetUsdc: number
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

const DEBATE_PROMPT = (
  role: string,
  userIntent: string,
  round1Results: AgentRunResult[],
  myResult: AgentRunResult
) =>
  `You are a DeFi yield strategist (lens: ${role}) in a multi-agent debate on an AI fund-management
protocol. The user wants the best risk-adjusted yield for their idle USDC (executable venue:
Compound V3 on Base Sepolia).

User goal: "${userIntent}"

Round 1 strategies from the three strategists:
${round1Results
  .map(
    (r) =>
      `• Agent ${r.agentId} (${r.role}): confidence=${r.confidence}, action="${r.output.action}", summary="${r.output.summary}"`
  )
  .join('\n')}

Your Round 1 strategy: confidence=${myResult.confidence}, action="${myResult.output.action}"

Now DEBATE: critique the others — are they mispricing risk, ignoring liquidity, or over/under-confident?
Defend or revise yours. If a peer changed your mind, adjust your confidence.

This conviction bet is REAL — a higher revisedConfidence means you paid more USDC onchain for this call.
Be honest: would you put your own capital behind this strategy?

Respond with ONLY a JSON object — no prose, no code fences:
{
  "critique": "your honest critique of the other strategists and defense of your own",
  "revisedConfidence": <integer 0-100>,
  "revisedAction": "your final recommended USDC deployment after the debate",
  "revisedSummary": "refined strategy"
}`

/**
 * Round 2 debate inference. Each agent pays a CONVICTION BET (x402 price scaled by its
 * Round 1 confidence) to see all peers' proposals and critique/revise its position.
 * Higher conviction = bigger real USDC bet on this inference.
 */
export async function runAgentDebate(params: {
  agentId: number
  userIntent: string
  round1Results: AgentRunResult[]
  onReasoning?: (chunk: string) => void
}): Promise<AgentDebateResult> {
  const { agentId, userIntent, round1Results, onReasoning } = params
  const role = AGENT_ROLES[agentId] ?? `Agent ${agentId}`
  const myResult = round1Results.find((r) => r.agentId === agentId)
  if (!myResult) throw new Error(`Round 1 result missing for agent ${agentId}`)

  const paidFetch = await getPaidFetch(agentId)
  const conviction = myResult.confidence

  // ?conviction=N scales the x402 price by N/100 — the conviction bet.
  const url = `${INFERENCE_URL}?conviction=${conviction}`
  const betUsdc = parseFloat((process.env.X402_PRICE_USDC ?? '$0.01').replace('$', '')) * (conviction / 100)

  const res = await paidFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt: DEBATE_PROMPT(role, userIntent, round1Results, myResult),
      userIntent,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`x402 debate failed for agent ${agentId}: ${res.status} ${text.slice(0, 200)}`)
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

  // Parse the debate JSON — structure is slightly different from Round 1.
  const raw = extractJson(content) as Record<string, unknown> | null
  const critique = String(raw?.critique ?? reasoningContent.slice(0, 500))
  const revisedConfidence = Math.min(100, Math.max(0, Number(raw?.revisedConfidence ?? myResult.confidence)))
  const revisedAction = String(raw?.revisedAction ?? myResult.output.action)
  const revisedSummary = String(raw?.revisedSummary ?? myResult.output.summary)

  return {
    agentId,
    role,
    critiqueText: critique,
    round1Confidence: myResult.confidence,
    revisedConfidence,
    revisedAction,
    revisedSummary,
    convictionBetUsdc: betUsdc,
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
