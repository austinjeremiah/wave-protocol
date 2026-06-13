import {
  createDelegation,
  ScopeType,
  type Delegation,
} from '@metamask/smart-accounts-kit'
import {
  keccak256,
  toBytes,
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem'
import type { Hex } from 'viem'
import { getAgentWallets } from './agentWalletService'
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
  VENICE_COLLAPSE_ENFORCER_ADDRESS,
  AGENT_BUDGET_SPLIT,
} from '@/lib/constants'

export interface SubDelegationSet {
  sessionId: Hex
  agentDelegations: Delegation[] // signed; index === agentId
}

/**
 * Create + sign the 3 sub-delegations (Agent A → each agent) under the user's root
 * delegation. Each is scoped to a USDC budget cap and carries the VeniceCollapseEnforcer
 * caveat encoding (sessionId, agentId). Signing is OFFCHAIN (EIP-712) — no gas, no tx.
 * The enforcer later gates which of these is redeemable (the collapse winner).
 */
export async function createSubDelegations(params: {
  sessionId: Hex
  rootDelegation: Delegation | Hex // User → Agent A (from the ERC-7715 grant)
  budgets: [bigint, bigint, bigint] // per-agent USDC caps (6-decimal units)
}): Promise<SubDelegationSet> {
  const { sessionId, rootDelegation, budgets } = params
  if (!VENICE_COLLAPSE_ENFORCER_ADDRESS) {
    throw new Error('VENICE_COLLAPSE_ENFORCER_ADDRESS is not set')
  }
  // Capture the narrowed value in a local const so it stays non-undefined inside the closure.
  const enforcerAddr = VENICE_COLLAPSE_ENFORCER_ADDRESS
  const agents = await getAgentWallets()
  const agentA = agents[0]

  const agentDelegations = await Promise.all(
    agents.map(async (target, agentId): Promise<Delegation> => {
      // Matches the contract: abi.decode(terms, (bytes32, uint8))
      const terms = encodeAbiParameters(
        parseAbiParameters('bytes32 sessionId, uint8 agentId'),
        [sessionId, agentId]
      )

      const delegation = createDelegation({
        environment: agentA.smartAccount.environment,
        from: agentA.smartAccount.address,
        to: target.smartAccount.address,
        parentDelegation: rootDelegation,
        scope: {
          type: ScopeType.Erc20TransferAmount,
          tokenAddress: USDC_ADDRESS,
          maxAmount: budgets[agentId],
        },
        caveats: [{ enforcer: enforcerAddr, terms, args: '0x' }],
      })

      // signDelegation returns the signature Hex; attach it to the unsigned delegation.
      const signature = await agentA.smartAccount.signDelegation({ delegation })
      return { ...delegation, signature }
    })
  )

  return { sessionId, agentDelegations }
}

/** keccak256 of an agent's Venice reasoning_content — committed onchain. */
export function hashReasoningContent(reasoningContent: string): Hex {
  return keccak256(toBytes(reasoningContent))
}

/** Split a human USDC budget into the 3 agent caps (6-decimal bigints). */
export function splitBudget(budgetUsdc: number): [bigint, bigint, bigint] {
  return AGENT_BUDGET_SPLIT.map((pct) =>
    parseUnits((budgetUsdc * pct).toFixed(USDC_DECIMALS), USDC_DECIMALS)
  ) as [bigint, bigint, bigint]
}
