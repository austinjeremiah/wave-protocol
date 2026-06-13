import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Hex } from 'viem'
import {
  createExecution,
  ExecutionMode,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { getBackendWalletClient } from './chainService'
import { runExclusive } from '@/lib/mutex'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/constants'

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
