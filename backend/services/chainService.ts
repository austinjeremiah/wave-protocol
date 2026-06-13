import { createPublicClient, createWalletClient, http } from 'viem'
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
    _backendAccount = privateKeyToAccount(key)
  }
  return _backendAccount
}

function buildBackendWalletClient() {
  return createWalletClient({
    account: getBackendAccount(),
    chain: baseSepolia,
    transport: http(RPC_URL),
  })
}

let _backendWalletClient: ReturnType<typeof buildBackendWalletClient> | undefined
export function getBackendWalletClient() {
  if (!_backendWalletClient) _backendWalletClient = buildBackendWalletClient()
  return _backendWalletClient
}
