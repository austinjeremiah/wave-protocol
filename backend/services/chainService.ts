import { createPublicClient, createWalletClient, http, nonceManager, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import type { Hex } from 'viem'

/**
 * Chain clients for Base Sepolia. The backend's onchain identity is a single funded EOA
 * (the deployer key) — it is the session "initiator" that calls the enforcer.
 */
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL

function buildPublicClient() {
  return createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) })
}

let _publicClient: ReturnType<typeof buildPublicClient> | undefined
export function getPublicClient() {
  if (!_publicClient) _publicClient = buildPublicClient()
  return _publicClient
}

let _backendAccount: ReturnType<typeof privateKeyToAccount> | undefined
export function getBackendAccount() {
  if (!_backendAccount) {
    const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined
    if (!key || !key.startsWith('0x')) {
      throw new Error('DEPLOYER_PRIVATE_KEY is not set (the backend onchain signer)')
    }
    // nonceManager lets concurrent txs (e.g. 3 parallel x402 settlements) get
    // sequential nonces instead of colliding.
    _backendAccount = privateKeyToAccount(key, { nonceManager })
  }
  return _backendAccount
}

function buildBackendWalletClient() {
  // Extend with publicActions so x402's settle() (which re-verifies signatures via
  // verifyTypedData) works on this same client. writeContract etc. remain available.
  return createWalletClient({
    account: getBackendAccount(),
    chain: baseSepolia,
    transport: http(RPC_URL),
  }).extend(publicActions)
}

let _backendWalletClient: ReturnType<typeof buildBackendWalletClient> | undefined
export function getBackendWalletClient() {
  if (!_backendWalletClient) _backendWalletClient = buildBackendWalletClient()
  return _backendWalletClient
}
