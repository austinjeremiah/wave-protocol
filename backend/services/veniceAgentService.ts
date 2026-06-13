import OpenAI from 'openai'
import { AgentOutputSchema, type AgentOutput } from '@/schemas/agentOutputSchema'
import { VENICE_API_URL, VENICE_MODEL, AGENT_ROLES } from '@/lib/constants'

/**
 * Venice AI via its OpenAI-compatible API (Bearer key auth). Reasoning ("thinking")
 * models return their chain-of-thought in `choices[0].message.reasoning_content`,
 * which we hash onchain. The final structured JSON answer is in `message.content`.
 */
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.VENICE_API_KEY
    if (!apiKey) throw new Error('VENICE_API_KEY is not set (the inference path)')
    _client = new OpenAI({ apiKey, baseURL: VENICE_API_URL })
  }
  return _client
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

  const res = await getClient().chat.completions.create({
    model: VENICE_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT(role) },
      { role: 'user', content: userIntent },
    ],
    temperature: 0.7,
  })

  const message = res.choices[0]?.message
  let reasoningContent =
    (message as { reasoning_content?: string } | undefined)?.reasoning_content ?? ''
  let content = message?.content ?? ''

  // Some models inline their thinking as <think>…</think> in content instead.
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
