"use client"

import { useState } from "react"
import { createWalletClient, custom, parseUnits } from "viem"
import { baseSepolia } from "viem/chains"
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions"
import { getEthereum } from "@/lib/wallet"

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001"
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const

/**
 * ERC-7715 grant: the user signs a periodic USDC spending cap delegated to Agent A (the
 * lead). MetaMask Flask returns a permission context (the root delegation), which we hand
 * to the backend to fan out into the 3 enforcer-gated sub-delegations.
 */
export function useGrantDelegation() {
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function grant(opts: {
    sessionId: string
    account: `0x${string}`
    delegateAddress: `0x${string}`
    budgetUsdc: number
  }) {
    const eth = getEthereum()
    if (!eth) throw new Error("MetaMask Flask not found (ERC-7715 is Flask-only).")

    setGranting(true)
    setError(null)
    try {
      const client = createWalletClient({
        account: opts.account,
        chain: baseSepolia,
        transport: custom(eth),
      }).extend(erc7715ProviderActions())

      const permissions = await client.requestExecutionPermissions([
        {
          chainId: baseSepolia.id,
          to: opts.delegateAddress, // delegate = Agent A (lead)
          permission: {
            type: "erc20-token-periodic",
            isAdjustmentAllowed: false,
            data: {
              tokenAddress: USDC,
              periodAmount: parseUnits(opts.budgetUsdc.toString(), 6),
              periodDuration: 86_400,
              justification: "Wave Protocol — agent inference + execution budget",
            },
          },
        },
      ])

      const granted = permissions[0]
      const res = await fetch(`${BASE}/api/session/${opts.sessionId}/grant-delegation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootDelegation: granted.context,
          delegationManager: granted.delegationManager,
          accountMetadata: granted.dependencies,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `grant-delegation failed: ${res.status}`)
      }
      return granted
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setGranting(false)
    }
  }

  return { grant, granting, error }
}
