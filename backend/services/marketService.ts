import { erc20Abi, parseUnits, type Address, type Hex } from 'viem'
import { settle, verify } from 'x402/facilitator'
import { createConnectedClient, PaymentPayloadSchema, type PaymentRequirements } from 'x402/types'
import { processPriceToAtomicAmount, safeBase64Decode } from 'x402/shared'
import { prisma } from '@/lib/db'
import { runExclusive } from '@/lib/mutex'
import { getBackendWalletClient, getPublicClient } from './chainService'
import { getSessionOnchain } from './enforcerService'
import { USDC_ADDRESS, WAVE_MARKET_ADDRESS } from '@/lib/constants'
import { logger } from '@/lib/logger'

/**
 * Wave Market — copy-trading marketplace service.
 *
 * Reuses the EXISTING machinery only: the backend EOA relayer (chainService), the tx mutex
 * (runExclusive), the enforcer read (getSessionOnchain), and x402 settle/verify. Nothing in the
 * debate / vault / delegation path is touched.
 *
 *   listStrategy        — verify a session collapsed onchain → WaveMarket.list → persist.
 *   purchaseStrategy    — x402-settle the buyer's fee to the SELLER, fund the market with the
 *                         buyer's deploy capital, then WaveMarket.purchaseAndExecute(buyer) so the
 *                         proven strategy re-deploys to the buyer's own Compound V3 position.
 */

const NETWORK = 'base-sepolia' as const

const MARKET_ABI = [
  {
    name: 'list',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'winnerAgentId', type: 'uint8' },
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'seller', type: 'address' },
      { name: 'priceUsdc', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'purchaseAndExecute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'buyer', type: 'address' },
    ],
    outputs: [],
  },
  { name: 'listingCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

function marketAddress(): Address {
  if (!WAVE_MARKET_ADDRESS) throw new Error('WAVE_MARKET_ADDRESS is not set')
  return WAVE_MARKET_ADDRESS
}

/**
 * x402 requirements for a strategy purchase — note payTo is the SELLER (a real buyer→seller
 * USDC sale), not the backend. Mirrors the inference route's builder with a custom payTo + price.
 */
export function buildSellerPaymentRequirements(
  resource: string,
  seller: Address,
  priceUsdc: number
): PaymentRequirements {
  const price = `$${Math.max(0.0001, priceUsdc).toFixed(4)}`
  const priced = processPriceToAtomicAmount(price, NETWORK) as
    | { maxAmountRequired: string; asset: { address: `0x${string}`; eip712: Record<string, unknown> } }
    | { error: string }
  if ('error' in priced) throw new Error(priced.error)

  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: priced.maxAmountRequired,
    resource: resource as `${string}://${string}`,
    description: `Wave Market — copy a proven strategy ($${priceUsdc.toFixed(2)} USDC to the seller)`,
    mimeType: 'application/json',
    payTo: seller, // the SELLER earns — a legible product sale, not the circular agent toll
    maxTimeoutSeconds: 300,
    asset: priced.asset.address,
    extra: priced.asset.eip712,
  }
}

/** List a collapsed session's winning strategy on the market. */
export async function listStrategy(params: { sessionId: string; priceUsdc: number }) {
  const session = await prisma.session.findUnique({ where: { sessionId: params.sessionId } })
  if (!session) throw new Error('Session not found')
  if (session.winnerAgentId === null || session.winnerAgentId === undefined) {
    throw new Error('Session has not collapsed to a winner yet')
  }
  const winnerAgentId = session.winnerAgentId

  const existing = await prisma.strategyListing.findFirst({ where: { sessionId: params.sessionId, active: true } })
  if (existing) return existing // idempotent — already listed

  const winner = await prisma.agentResult.findUnique({
    where: { sessionId_agentId: { sessionId: params.sessionId, agentId: winnerAgentId } },
  })
  const reasoningHash = (session.winnerHash ?? winner?.reasoningHash) as Hex | undefined
  if (!reasoningHash) throw new Error('Winner reasoning hash missing')

  // Provenance: confirm the live enforcer agrees this session collapsed to this winner.
  const onchain = await getSessionOnchain(params.sessionId as Hex)
  if (!onchain.collapsed || onchain.winnerAgentId !== winnerAgentId) {
    throw new Error('Onchain consensus not found for this session')
  }

  const seller = session.userAddress as Address
  const price = parseUnits(params.priceUsdc.toString(), 6)

  const { listingId, txHash } = await runExclusive(async () => {
    // id assigned by the contract = current listingCount (it post-increments). Serialized, so stable.
    const count = (await getPublicClient().readContract({
      address: marketAddress(),
      abi: MARKET_ABI,
      functionName: 'listingCount',
    })) as bigint
    const hash = await getBackendWalletClient().writeContract({
      address: marketAddress(),
      abi: MARKET_ABI,
      functionName: 'list',
      args: [params.sessionId as Hex, winnerAgentId, reasoningHash, seller, price],
      gas: 250_000n,
    })
    await getPublicClient().waitForTransactionReceipt({ hash })
    return { listingId: Number(count), txHash: hash }
  })

  logger.info(`  🏷️  strategy listed — id ${listingId} — seller ${seller.slice(0, 10)}… — $${params.priceUsdc}`)

  return prisma.strategyListing.create({
    data: {
      listingId,
      sessionId: params.sessionId,
      winnerAgentId,
      reasoningHash,
      sellerAddress: seller,
      priceUsdc: params.priceUsdc,
      listTxHash: txHash,
    },
  })
}

/** Shape a listing with the source session's winner reasoning for the UI. */
async function enrich(l: Awaited<ReturnType<typeof prisma.strategyListing.findFirst>>) {
  if (!l) return null
  const winner = await prisma.agentResult.findUnique({
    where: { sessionId_agentId: { sessionId: l.sessionId, agentId: l.winnerAgentId } },
  })
  const session = await prisma.session.findUnique({
    where: { sessionId: l.sessionId },
    select: { userIntent: true },
  })
  return {
    ...l,
    role: winner?.role ?? null,
    confidence: winner?.revisedConfidence ?? winner?.confidence ?? null,
    reasoningExcerpt: winner?.reasoningContent?.slice(0, 500) ?? null,
    userIntent: session?.userIntent ?? null,
  }
}

export async function getListings() {
  const listings = await prisma.strategyListing.findMany({ orderBy: { createdAt: 'desc' } })
  return Promise.all(listings.map(enrich))
}

export async function getListing(listingId: number) {
  const listing = await prisma.strategyListing.findUnique({ where: { listingId } })
  return enrich(listing)
}

export async function getRecentPurchases(limit = 20) {
  return prisma.strategyPurchase.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
}

/**
 * Purchase + re-execute a listed strategy. The buyer's X-PAYMENT (signed EIP-3009) settles the
 * fee to the SELLER via x402; then the protocol funds the market with the buyer's deploy capital
 * and re-executes the proven strategy, crediting the BUYER a Compound V3 position.
 */
export async function purchaseStrategy(params: {
  listingId: number
  buyerAddress: Address
  deployUsdc: number
  requirements: PaymentRequirements
  paymentHeader: string
}): Promise<{ sellerPaymentTx: string; supplyTxHash: string; deployedUsdc: number }> {
  const listing = await prisma.strategyListing.findUnique({ where: { listingId: params.listingId } })
  if (!listing) throw new Error('Listing not found')
  if (!listing.active) throw new Error('Listing is inactive')

  // 1) x402 — settle the buyer's signed payment to the SELLER.
  let payment
  try {
    payment = PaymentPayloadSchema.parse(JSON.parse(safeBase64Decode(params.paymentHeader)))
  } catch {
    throw new Error('Malformed X-PAYMENT header')
  }
  const verification = await verify(createConnectedClient(NETWORK), payment, params.requirements)
  if (!verification.isValid) throw new Error(verification.invalidReason ?? 'Payment invalid')

  const settlement = await runExclusive(() =>
    settle(getBackendWalletClient() as unknown as Parameters<typeof settle>[0], payment, params.requirements)
  )
  if (!settlement.success) throw new Error(`Payment settlement failed: ${settlement.errorReason}`)
  const sellerPaymentTx = String(settlement.transaction)
  logger.info(`  💲 x402 strategy fee settled → seller — ${sellerPaymentTx.slice(0, 16)}…`)

  // 2) Fund the market with the buyer's deploy capital (treasury fronts it for the demo, mirroring
  // the existing no-wallet fallback). Wait for confirmation so the supply has a balance to deploy.
  const fundTx = await runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [marketAddress(), parseUnits(params.deployUsdc.toString(), 6)],
    })
  )
  const fundReceipt = await getPublicClient().waitForTransactionReceipt({ hash: fundTx })
  if (fundReceipt.status !== 'success') throw new Error('Funding the market failed onchain')

  // 3) Re-execute the proven strategy for the buyer — supplyTo(buyer) on Compound V3.
  const supplyTxHash = await runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: marketAddress(),
      abi: MARKET_ABI,
      functionName: 'purchaseAndExecute',
      args: [BigInt(params.listingId), params.buyerAddress],
      gas: 600_000n, // approve + Compound supplyTo headroom (same as the vault)
    })
  )
  const supplyReceipt = await getPublicClient().waitForTransactionReceipt({ hash: supplyTxHash })
  if (supplyReceipt.status !== 'success') {
    throw new Error('Strategy re-execution reverted onchain (supply failed)')
  }
  logger.info(`  📈 strategy re-executed for buyer ${params.buyerAddress.slice(0, 10)}… — ${supplyTxHash.slice(0, 16)}…`)

  await prisma.strategyPurchase.create({
    data: {
      listingId: params.listingId,
      buyerAddress: params.buyerAddress,
      deployedUsdc: params.deployUsdc,
      sellerPaymentTx,
      supplyTxHash,
    },
  })
  await prisma.strategyListing.update({
    where: { listingId: params.listingId },
    data: { purchases: { increment: 1 } },
  })

  return { sellerPaymentTx, supplyTxHash, deployedUsdc: params.deployUsdc }
}
