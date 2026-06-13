import { privateKeyToAccount } from 'viem/accounts'
import { toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit'
import type { Address, Hex } from 'viem'
import { getPublicClient } from './chainService'

/**
 * The 3 agents as MetaMask Hybrid smart accounts. Their keys are used ONLY to derive
 * the smart-account address and to sign sub-delegations offchain (EIP-712) — they hold
 * no funds and send no transactions. Agent A (index 0) is also the redelegator.
 */
export interface AgentWallet {
  agentId: number
  account: ReturnType<typeof privateKeyToAccount>
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>
  address: Address
}

const AGENT_KEYS = [
  process.env.AGENT_A_PRIVATE_KEY,
  process.env.AGENT_B_PRIVATE_KEY,
  process.env.AGENT_C_PRIVATE_KEY,
] as (Hex | undefined)[]

let _agents: AgentWallet[] | null = null

export async function getAgentWallets(): Promise<AgentWallet[]> {
  if (_agents) return _agents
  const client = getPublicClient()

  _agents = await Promise.all(
    AGENT_KEYS.map(async (key, agentId): Promise<AgentWallet> => {
      if (!key || !key.startsWith('0x')) {
        throw new Error(`AGENT_${String.fromCharCode(65 + agentId)}_PRIVATE_KEY is not set`)
      }
      const account = privateKeyToAccount(key)
      const smartAccount = await toMetaMaskSmartAccount({
        client,
        implementation: Implementation.Hybrid,
        deployParams: [account.address, [], [], []],
        deploySalt: '0x',
        signer: { account },
      })
      return { agentId, account, smartAccount, address: smartAccount.address }
    })
  )

  return _agents
}
