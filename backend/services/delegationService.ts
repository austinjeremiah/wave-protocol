import {
  createDelegation,
  ScopeType,
  type Delegation,
} from '@metamask/smart-accounts-kit'
import { redelegatePermissionContextOpenAction } from '@metamask/smart-accounts-kit/actions'
import {
  keccak256,
  toBytes,
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
  createWalletClient,
  custom,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
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

export interface AgentContext {
  agentId: number
  permissionContext: Hex
}

/**
 * F3b path: from the user's ERC-7715 root permission context, redelegate to each agent —
 * producing per-agent REDEEMABLE permission contexts (each carrying the VeniceCollapseEnforcer
 * caveat with its agentId). Agent A signs the redelegations. Used only when the user granted a
 * wallet delegation; the no-wallet demo path skips this entirely.
 *
 *  Untested without MetaMask Flask producing a real context — validate live (F4).
 */
export async function redelegateAgentContexts(params: {
  sessionId: Hex
  rootContext: Hex
  budgets: [bigint, bigint, bigint]
}): Promise<AgentContext[]> {
  const { sessionId, rootContext, budgets } = params
  if (!VENICE_COLLAPSE_ENFORCER_ADDRESS) {
    throw new Error('VENICE_COLLAPSE_ENFORCER_ADDRESS is not set')
  }
  const enforcerAddr = VENICE_COLLAPSE_ENFORCER_ADDRESS

  const agents = await getAgentWallets()
  const agentA = agents[0]
  const agentAKey = process.env.AGENT_A_PRIVATE_KEY as Hex | undefined
  if (!agentAKey) throw new Error('AGENT_A_PRIVATE_KEY is not set')
  const eoa = privateKeyToAccount(agentAKey)

  // Agent A is the root delegate; it signs the redelegations to each agent.
  //
  // `redelegatePermissionContextAction` signs the child delegation by calling
  // eth_signTypedData_v4 *through the client's transport*, passing the SMART-ACCOUNT
  // address as the signer — so viem's normal local-account signing path is bypassed.
  // A plain http() transport forwards that to the RPC node, which holds no keys, giving
  // "rpc method is unsupported". This transport intercepts the signing method and signs
  // locally with Agent A's owner EOA (exactly what MetaMask does in the browser), and
  // forwards every other method to the real RPC.
  const rpc = http(process.env.BASE_SEPOLIA_RPC_URL)({ chain: baseSepolia })
  const localSigner = {
    request: async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
      if (method === 'eth_signTypedData_v4') {
        const raw = (params as [string, string | object])[1]
        const typed = typeof raw === 'string' ? JSON.parse(raw) : raw
        const types = { ...(typed.types ?? {}) }
        delete types.EIP712Domain // viem derives this from `domain`; including it can clash.
        return eoa.signTypedData({
          domain: typed.domain,
          types,
          primaryType: typed.primaryType,
          message: typed.message,
        } as Parameters<typeof eoa.signTypedData>[0])
      }
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return [eoa.address]
      }
      return (rpc.request as (a: { method: string; params?: unknown }) => Promise<unknown>)({
        method,
        params,
      })
    },
  }
  const signer = createWalletClient({
    account: eoa,
    chain: baseSepolia,
    transport: custom(localSigner as Parameters<typeof custom>[0]),
  })

  const out: AgentContext[] = []
  for (const target of agents) {
    const terms = encodeAbiParameters(
      parseAbiParameters('bytes32 sessionId, uint8 agentId'),
      [sessionId, target.agentId]
    )
    // OPEN redelegation (delegate = ANY_DELEGATE): the backend EOA relays the redeem tx,
    // so the leaf delegate can't be a specific agent smart account (that would revert with
    // InvalidDelegate — msg.sender wouldn't match). The VeniceCollapseEnforcer still gates by
    // (sessionId, agentId), so only the collapse winner's context is redeemable; losers revert.
    const { permissionContext } = await redelegatePermissionContextOpenAction(signer, {
      account: agentA.smartAccount.address,
      environment: agentA.smartAccount.environment,
      permissionContext: rootContext,
      scope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress: USDC_ADDRESS,
        maxAmount: budgets[target.agentId],
      },
      caveats: [{ enforcer: enforcerAddr, terms, args: '0x' }],
    })
    out.push({ agentId: target.agentId, permissionContext })
  }
  return out
}
