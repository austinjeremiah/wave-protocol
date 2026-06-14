"use client"

// Buyer-side x402 (EIP-3009 transferWithAuthorization), hand-rolled to match the backend's
// x402 `verify`/`settle` exactly (x402@1.2.0 exact-EVM scheme). The connected wallet signs the
// USDC authorization for the seller; the base64 payload becomes the X-PAYMENT header.

import { createWalletClient, custom, getAddress, toHex, type Address } from "viem"
import { baseSepolia } from "viem/chains"
import { getEthereum } from "@/lib/wallet"
import { marketPurchaseUrl } from "@/lib/wave-api"

const AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

/** Subset of the x402 PaymentRequirements the backend returns in its 402 `accepts`. */
export interface PaymentRequirements {
  scheme: string
  network: string
  maxAmountRequired: string
  payTo: string
  asset: string
  maxTimeoutSeconds: number
  extra?: { name?: string; version?: string } | null
  [k: string]: unknown
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/** Build + sign the EIP-3009 authorization and return the base64 X-PAYMENT header. */
export async function signX402Payment(buyer: Address, req: PaymentRequirements): Promise<string> {
  const eth = getEthereum()
  if (!eth) throw new Error("Wallet not found")
  const walletClient = createWalletClient({ account: buyer, chain: baseSepolia, transport: custom(eth) })

  const now = Math.floor(Date.now() / 1000)
  const authorization = {
    from: getAddress(buyer),
    to: getAddress(req.payTo),
    value: req.maxAmountRequired,
    validAfter: (now - 600).toString(), // 10 min skew, matching the x402 client default
    validBefore: (now + (req.maxTimeoutSeconds ?? 300)).toString(),
    nonce: randomNonce(),
  }

  const signature = await walletClient.signTypedData({
    account: buyer,
    domain: {
      name: req.extra?.name,
      version: req.extra?.version,
      chainId: baseSepolia.id,
      verifyingContract: getAddress(req.asset),
    },
    types: AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  })

  const payment = {
    x402Version: 1,
    scheme: req.scheme,
    network: req.network,
    payload: { signature, authorization },
  }
  return btoa(JSON.stringify(payment))
}

export interface PurchaseResult {
  sellerPaymentTx: string
  supplyTxHash: string
  deployedUsdc: number
}

/**
 * Full copy-trade flow: POST to discover the x402 requirements (402), sign the buyer's payment,
 * then POST again with X-PAYMENT to settle the seller fee + re-execute the strategy for the buyer.
 */
export async function buyStrategy(params: {
  listingId: number
  buyerAddress: Address
  deployUsdc: number
}): Promise<PurchaseResult> {
  const url = marketPurchaseUrl(params.listingId)
  const body = JSON.stringify({ buyerAddress: params.buyerAddress, deployUsdc: params.deployUsdc })
  const headers = { "Content-Type": "application/json" }

  // 1) Discover requirements (expects 402 + accepts[0]).
  const probe = await fetch(url, { method: "POST", headers, body })
  if (probe.status !== 402) {
    if (probe.ok) return probe.json() // already paid somehow
    const err = await probe.json().catch(() => ({}))
    throw new Error(err.error ?? `${probe.status} ${probe.statusText}`)
  }
  const { accepts } = (await probe.json()) as { accepts: PaymentRequirements[] }
  const req = accepts?.[0]
  if (!req) throw new Error("No payment requirements returned")

  // 2) Sign the EIP-3009 authorization.
  const paymentHeader = await signX402Payment(params.buyerAddress, req)

  // 3) Submit with X-PAYMENT → settle to seller + re-execute for buyer.
  const res = await fetch(url, { method: "POST", headers: { ...headers, "X-PAYMENT": paymentHeader }, body })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}
