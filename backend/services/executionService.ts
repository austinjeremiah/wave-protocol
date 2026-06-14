import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Hex } from 'viem'
import {
  createExecution,
  ExecutionMode,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { getBackendAccount, getBackendWalletClient, getPublicClient } from './chainService'
import { getAgentWallets } from './agentWalletService'
import { getSessionOnchain } from './enforcerService'
import { runExclusive } from '@/lib/mutex'
import { logger } from '@/lib/logger'
import { CHAIN_ID, USDC_ADDRESS, WAVE_STRATEGY_VAULT_ADDRESS } from '@/lib/constants'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll the enforcer until it reports this session collapsed to `winnerAgentId` on the node we hit.
 *  Guards against read-after-write RPC lag: the collapse tx is mined but a load-balanced node may
 *  still serve a block behind, which would make the redeem revert "Wavefunction not yet collapsed". */
async function waitForCollapseVisible(sessionId: Hex, winnerAgentId: number, tries = 8): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const s = await getSessionOnchain(sessionId)
      if (s.collapsed && s.winnerAgentId === winnerAgentId) return
    } catch {
      /* transient RPC error — retry */
    }
    await sleep(1500)
  }
  logger.warn(`  ⚠ collapse still not visible after ${tries} polls — attempting redeem anyway`)
}

/** ERC-7715 grant dependency — factory call that deploys the user's gator account. */
export interface GatorDependency {
  factory: Address
  factoryData: Hex
}

/** Deploy a counterfactual account via its factory call. Idempotent + best-effort (factories
 *  typically no-op/revert harmlessly when the account already exists). */
async function deployViaFactory(label: string, factory: Address, factoryData: Hex): Promise<void> {
  try {
    const tx = await runExclusive(() =>
      getBackendWalletClient().sendTransaction({ to: factory, data: factoryData })
    )
    await getPublicClient().waitForTransactionReceipt({ hash: tx })
    logger.info(`  🔧 deployed ${label} via factory — ${tx.slice(0, 16)}…`)
  } catch (e) {
    logger.info(`  · ${label} factory call skipped (${(e as Error).message.split('\n')[0].slice(0, 70)})`)
  }
}

/** Ensure Agent A's smart account is deployed — its intermediate redelegation signature is
 *  verified via ERC-1271 at redeem time, which requires the account to exist onchain. */
async function ensureAgentADeployed(): Promise<void> {
  const agents = await getAgentWallets()
  const agentA = agents[0]
  const code = await getPublicClient().getCode({ address: agentA.smartAccount.address })
  if (code && code !== '0x') return
  const { factory, factoryData } = await agentA.smartAccount.getFactoryArgs()
  if (!factory || !factoryData) return
  await deployViaFactory('Agent A smart account', factory, factoryData)
}

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
  recipient: Address // where the delegated USDC goes (the vault)
  amountUsdc: number
  sessionId: Hex // for the collapse-visibility poll (enforcer caveat is gated on this)
  winnerAgentId: number
  accountMetadata?: GatorDependency[] | null // ERC-7715 grant deps — deploy the user's gator first
}): Promise<Hex> {
  const { winnerContext, recipient, amountUsdc, sessionId, winnerAgentId, accountMetadata } = params
  const env = getSmartAccountsEnvironment(CHAIN_ID)

  // Make sure the node we'll query/redeem against actually sees the collapse (RPC read-after-write
  // lag otherwise reverts the redeem with "Wavefunction not yet collapsed").
  await waitForCollapseVisible(sessionId, winnerAgentId)

  // The redeem walks the delegation chain and verifies each delegator's signature via ERC-1271,
  // so every smart account in the chain must be deployed onchain first:
  //   1. the USER's gator (from the ERC-7715 grant `dependencies`)
  //   2. Agent A (the intermediate redelegator)
  // First-time redeems revert without this — that's the missing piece for the live grant path.
  if (Array.isArray(accountMetadata)) {
    for (const dep of accountMetadata) {
      if (dep?.factory && dep?.factoryData) {
        await deployViaFactory('user gator', dep.factory, dep.factoryData)
      }
    }
  }
  await ensureAgentADeployed()

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

  // Simulate before sending so a revert surfaces a DECODED reason in the log (a raw send only
  // gives "Execution reverted for an unknown reason"). Retry on a transient stale-node read.
  const REDEEM_TRIES = 4
  let lastErr: Error | null = null
  for (let i = 0; i < REDEEM_TRIES; i++) {
    try {
      await getPublicClient().call({
        account: getBackendAccount(),
        to: env.DelegationManager as Address,
        data: calldata,
      })
      // Simulation passed → send for real.
      return await runExclusive(() =>
        getBackendWalletClient().sendTransaction({ to: env.DelegationManager, data: calldata })
      )
    } catch (err) {
      lastErr = err as Error
      const msg = lastErr.message ?? ''
      const reason = msg.split('\n').slice(0, 6).join(' | ').slice(0, 400)
      if (/not yet collapsed/i.test(msg) && i < REDEEM_TRIES - 1) {
        logger.warn(`  ⚠ redeem sim stale (collapse not visible) — retry ${i + 1}/${REDEEM_TRIES}`)
        await sleep(2000)
        continue
      }
      logger.warn(`  ⚠ redeem simulation reverted — REASON: ${reason}`)
      throw lastErr
    }
  }
  throw lastErr ?? new Error('redeem failed')
}

/** Minimal ABI for WaveStrategyVault.executeStrategy(bytes32, uint8, address). */
const VAULT_ABI = [
  {
    name: 'executeStrategy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'winnerAgentId', type: 'uint8' },
      { name: 'user', type: 'address' },
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
 * supplies its received USDC to Compound V3 on Base Sepolia — credited to `userAddress`, so the
 * USER owns the position + yield. The vault is gated by the enforcer (only deploys if the swarm
 * collapsed onchain to winnerAgentId). Step 1 (delegation redeem OR treasury funding) must have
 * already sent USDC to the vault.
 */
export async function executeVaultStrategy(params: {
  sessionId: Hex
  winnerAgentId: number
  userAddress: Address
}): Promise<Hex> {
  const vaultAddress = WAVE_STRATEGY_VAULT_ADDRESS
  if (!vaultAddress) throw new Error('WAVE_STRATEGY_VAULT_ADDRESS is not set')

  return runExclusive(() =>
    getBackendWalletClient().writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'executeStrategy',
      args: [params.sessionId, params.winnerAgentId, params.userAddress],
      // Approve + Compound V3 supplyTo costs ~220k; auto-estimation can come in just under
      // and OOG-revert (leaving USDC stuck in the vault). Fixed buffer avoids that.
      gas: 600_000n,
    })
  )
}
