import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Hex } from 'viem'
import {
  createExecution,
  ExecutionMode,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { getBackendWalletClient } from './chainService'
import { runExclusive } from '@/lib/mutex'
import { CHAIN_ID, USDC_ADDRESS, WAVE_STRATEGY_VAULT_ADDRESS } from '@/lib/constants'

/**
 * F3b — the winner spends its delegated USDC. After collapse we redeem the WINNER's
 * permission context (produced from the user's ERC-7715 grant via redelegatePermissionContext)
 * through the DelegationManager. The VeniceCollapseEnforcer's beforeHook gates it: only the
 * collapse winner passes; a loser's redemption reverts.
 *
 * Requires: the user's smart account deployed + funded with USDC, and a valid granted context.
 * Untested without MetaMask Flask — validate live (F4). The backend EOA pays gas.
 */
export async function redeemWinnerDelegation(params: {
  winnerContext: Hex // winner's redeemable permission context (root → Agent A → winner)
  recipient: Address // where the delegated USDC goes (the winning agent)
  amountUsdc: number
}): Promise<Hex> {
  const { winnerContext, recipient, amountUsdc } = params
  const env = getSmartAccountsEnvironment(CHAIN_ID)

  const execution = createExecution({
    target: USDC_ADDRESS,
    value: 0n,
    callData: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, parseUnits(amountUsdc.toString(), 6)],
    }),
  })

  const calldata = DelegationManager.encode.redeemDelegations({
    delegations: [winnerContext],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  })

  return runExclusive(() =>
    getBackendWalletClient().sendTransaction({
      to: env.DelegationManager,
      data: calldata,
    })
  )
}

/** Minimal ABI for WaveStrategyVault.executeStrategy(bytes32, uint8). */
const VAULT_ABI = [
  {
    name: 'executeStrategy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'winnerAgentId', type: 'uint8' },
    ],
    outputs: [],
  },
] as const

/**
 * Fallback funding for the vault: the backend treasury transfers USDC directly into the vault.
 * Used when the user's ERC-7715 delegation can't fund it (no wallet, unfunded/undeployed gator,
 * or a reverting redeem). The downstream Compound V3 supply is identical and fully real — only
 * the funding source differs (treasury vs the user's delegated USDC).
 */
export async function fundVaultFromTreasury(params: { amountUsdc: number }): Promise<Hex> {
  const vaultAddress = WAVE_STRATEGY_VAULT_ADDRESS
  if (!vaultAddress) throw new Error('WAVE_STRATEGY_VAULT_ADDRESS is not set')
  return runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [vaultAddress, parseUnits(params.amountUsdc.toString(), 6)],
    })
  )
}

/**
 * Step 2 of the strategy execution: call WaveStrategyVault.executeStrategy() so the vault
 * supplies its received USDC to Compound V3 on Base Sepolia, earning real yield.
 * Step 1 (the delegation redeem OR treasury funding) must have already sent USDC to the vault.
 */
export async function executeVaultStrategy(params: {
  sessionId: Hex
  winnerAgentId: number
}): Promise<Hex> {
  const vaultAddress = WAVE_STRATEGY_VAULT_ADDRESS
  if (!vaultAddress) throw new Error('WAVE_STRATEGY_VAULT_ADDRESS is not set')

  return runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'executeStrategy',
      args: [params.sessionId, params.winnerAgentId],
    })
  )
}
