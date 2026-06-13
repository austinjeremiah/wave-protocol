import { NextResponse, type NextRequest } from 'next/server'
import OpenAI from 'openai'
import { settle, verify } from 'x402/facilitator'
import {
  createConnectedClient,
  settleResponseHeader,
  PaymentPayloadSchema,
  type PaymentRequirements,
} from 'x402/types'
import { processPriceToAtomicAmount, safeBase64Decode } from 'x402/shared'
import { VENICE_API_URL, VENICE_MODEL } from '@/lib/constants'
import { getBackendAccount, getBackendWalletClient } from '@/services/chainService'
import { runExclusive } from '@/lib/mutex'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NETWORK = 'base-sepolia' as const
const PRICE = process.env.X402_PRICE_USDC ?? '$0.01'

/** Build the x402 payment requirements for one inference (USDC on Base Sepolia). */
function buildRequirements(resource: string): PaymentRequirements {
  const priced = processPriceToAtomicAmount(PRICE, NETWORK) as
    | { maxAmountRequired: string; asset: { address: `0x${string}`; eip712: Record<string, unknown> } }
    | { error: string }
  if ('error' in priced) throw new Error(priced.error)

  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: priced.maxAmountRequired,
    resource: resource as `${string}://${string}`,
    description: 'Wave Protocol Venice inference (x402-gated)',
    mimeType: 'application/json',
    payTo: getBackendAccount().address,
    maxTimeoutSeconds: 300,
    asset: priced.asset.address,
    extra: priced.asset.eip712,
  }
}

/**
 * x402-gated Venice inference. An agent must pay a small USDC toll (settled onchain on
 * Base Sepolia) to get an inference. Venice runs behind the paywall with the API key.
 *
 * Flow: no X-PAYMENT → 402 + requirements. With X-PAYMENT → verify → run Venice → settle
 * onchain → return result + X-PAYMENT-RESPONSE.
 */
export async function POST(req: NextRequest) {
  const resource = `${req.nextUrl.origin}${req.nextUrl.pathname}`

  let requirements: PaymentRequirements
  try {
    requirements = buildRequirements(resource)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const header = req.headers.get('X-PAYMENT')
  if (!header) {
    return NextResponse.json(
      { x402Version: 1, error: 'X-PAYMENT header is required', accepts: [requirements] },
      { status: 402 }
    )
  }

  // Decode + verify the signed payment.
  let payment
  try {
    payment = PaymentPayloadSchema.parse(JSON.parse(safeBase64Decode(header)))
  } catch {
    return NextResponse.json(
      { x402Version: 1, error: 'Malformed X-PAYMENT header', accepts: [requirements] },
      { status: 402 }
    )
  }

  const verification = await verify(createConnectedClient(NETWORK), payment, requirements)
  if (!verification.isValid) {
    return NextResponse.json(
      { x402Version: 1, error: verification.invalidReason ?? 'Payment invalid', accepts: [requirements] },
      { status: 402 }
    )
  }
  logger.info(`  💳 x402 payment verified — payer ${String(verification.payer).slice(0, 12)}… — running Venice`)

  const body = (await req.json().catch(() => ({}))) as {
    systemPrompt?: string
    userIntent?: string
  }
  if (!body.systemPrompt || !body.userIntent) {
    return NextResponse.json({ error: 'systemPrompt and userIntent are required' }, { status: 400 })
  }

  // SETTLE NOW — before Venice. The EIP-3009 authorization has a limited validity window;
  // Venice can take minutes, so settling after it would expire the authorization
  // (invalid_exact_evm_payload_authorization_valid_before). Tradeoff: a tiny toll is charged
  // even if Venice errors.
  //
  // runExclusive serializes settlements process-wide: the 3 agents call this route in parallel,
  // so their settlement txs (from the SAME backend EOA) would otherwise race on the nonce and
  // exceed Base Sepolia's in-flight-tx limit. One-at-a-time keeps nonces clean and ≤1 pending.
  let settlement: Awaited<ReturnType<typeof settle>>
  try {
    settlement = await runExclusive(() =>
      settle(getBackendWalletClient() as unknown as Parameters<typeof settle>[0], payment, requirements)
    )
  } catch (err) {
    // A thrown settle (RPC/nonce/revert) — return a hard error (NOT 402, which x402-fetch would
    // treat as "pay again" and retry). Surface the first line so the cause is visible in logs.
    const reason = (err as Error).message?.split('\n')[0]?.slice(0, 200) ?? 'unknown'
    logger.error(`  ✗ x402 settle threw — ${reason}`)
    return NextResponse.json({ error: `Settlement error: ${reason}` }, { status: 500 })
  }
  if (!settlement.success) {
    logger.error({ reason: settlement.errorReason }, 'x402 settlement failed')
    return NextResponse.json(
      { error: `Payment settlement failed: ${settlement.errorReason}` },
      { status: 402 }
    )
  }
  logger.info(`  💲 x402 USDC settled onchain — ${String(settlement.transaction).slice(0, 16)}…`)

  // Payment taken — now run Venice (its latency no longer risks the payment authorization).
  const venice = new OpenAI({ apiKey: process.env.VENICE_API_KEY, baseURL: VENICE_API_URL })
  const completion = await venice.chat.completions.create({
    model: VENICE_MODEL,
    messages: [
      { role: 'system', content: body.systemPrompt },
      { role: 'user', content: body.userIntent },
    ],
    temperature: 0.7,
  })
  const message = completion.choices[0]?.message
  const reasoning_content =
    (message as { reasoning_content?: string } | undefined)?.reasoning_content ?? ''
  const content = message?.content ?? ''

  const res = NextResponse.json({
    content,
    reasoning_content,
    payment: { txHash: settlement.transaction, payer: settlement.payer },
  })
  res.headers.set('X-PAYMENT-RESPONSE', settleResponseHeader(settlement))
  return res
}
