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
export const VENICE_MODEL = process.env.VENICE_MODEL ?? 'qwen3-235b-a22b-thinking-2507'

/** USDC budget split across the 3 agents (Research / Analysis / Execution). */
export const AGENT_BUDGET_SPLIT = [0.4, 0.35, 0.25] as const
/** Agent roles, indexed by agentId. */
export const AGENT_ROLES = ['Research', 'Analysis', 'Execution'] as const

/**
 * MetaMask DelegationManager is NOT hardcoded — it is resolved per-chain at runtime via
 * getSmartAccountsEnvironment(CHAIN_ID) from @metamask/smart-accounts-kit (see Phase 4).
 */
