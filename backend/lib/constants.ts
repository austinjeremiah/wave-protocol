/**
 * Chain + protocol constants. Base Sepolia ONLY — no mainnet anywhere in this app.
 */

export const CHAIN_ID = 84532 as const
export const CHAIN_NAME = 'baseSepolia' as const

/** Circle USDC on Base Sepolia (6 decimals). */
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
export const USDC_DECIMALS = 6 as const

/** VeniceCollapseEnforcer — deployed to Base Sepolia in Phase 2, address from env. */
export const VENICE_COLLAPSE_ENFORCER_ADDRESS = process.env
  .VENICE_COLLAPSE_ENFORCER_ADDRESS as `0x${string}` | undefined

/** Venice AI — OpenAI-compatible API, authenticated with VENICE_API_KEY. */
export const VENICE_API_URL = process.env.VENICE_API_URL ?? 'https://api.venice.ai/api/v1'
/** Reasoning model id — a Venice "thinking" model that returns reasoning_content. */
export const VENICE_MODEL = process.env.VENICE_MODEL ?? 'zai-org-glm-4.7-flash'

/** USDC budget split across the 3 agents (Research / Analysis / Execution). */
export const AGENT_BUDGET_SPLIT = [0.4, 0.35, 0.25] as const
/** Agent roles, indexed by agentId. */
export const AGENT_ROLES = ['Research', 'Analysis', 'Execution'] as const

/** WaveStrategyVault — deployed to Base Sepolia; accepts delegated USDC and supplies to Compound V3. */
export const WAVE_STRATEGY_VAULT_ADDRESS = process.env.WAVE_STRATEGY_VAULT_ADDRESS as `0x${string}` | undefined

/** Compound V3 Comet on Base Sepolia (baseToken = Circle USDC). */
export const COMPOUND_COMET_ADDRESS = (process.env.COMPOUND_COMET_ADDRESS ?? '0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017') as `0x${string}`

/**
 * MetaMask DelegationManager is NOT hardcoded — it is resolved per-chain at runtime via
 * getSmartAccountsEnvironment(CHAIN_ID) from @metamask/smart-accounts-kit (see Phase 4).
 */
