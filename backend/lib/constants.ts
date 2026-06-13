/**
 * Chain + protocol constants. Base Sepolia ONLY — no mainnet anywhere in this app.
 */

export const CHAIN_ID = 84532 as const
export const CHAIN_NAME = 'baseSepolia' as const

/** Circle USDC on Base Sepolia (6 decimals). */
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
export const USDC_DECIMALS = 6 as const

/**
 * 1Shot relayer. Host confirmed live via the JWKS endpoint (returns an Ed25519 key).
 * The exact relay/transaction path is resolved in oneShotRelayerService (Phase 4) against
 * the 1Shot API — kept env-overridable so we don't hardcode a guessed path here.
 */
export const ONESHOT_API_BASE = process.env.ONESHOT_API_BASE ?? 'https://relayer.1shotapi.com'
export const ONESHOT_JWKS_URL = `${ONESHOT_API_BASE}/.well-known/jwks.json`

/** VeniceCollapseEnforcer — deployed to Base Sepolia in Phase 2, address from env. */
export const VENICE_COLLAPSE_ENFORCER_ADDRESS = process.env
  .VENICE_COLLAPSE_ENFORCER_ADDRESS as `0x${string}` | undefined

/** Venice reasoning model id (override via env if Venice renames it). */
export const VENICE_MODEL = process.env.VENICE_MODEL ?? 'deepseek-r1-671b'

/**
 * MetaMask DelegationManager is NOT hardcoded — it is resolved per-chain at runtime via
 * getSmartAccountsEnvironment(CHAIN_ID) from @metamask/smart-accounts-kit (see Phase 4).
 */
