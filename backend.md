# Wave Protocol — Backend Build Guide

> Phase-by-phase. After each phase: **commit + push**, then continue.
> Backend lives in `/backend` — a standalone Next.js project (API routes only).
> Frontend is separate in `/frontend`. Chain: **Base Sepolia (84532)** only.

---

## ⚠️ API Corrections (verified against live docs — these differ from wave.md)

| Location | wave.md says | Actual API |
|---|---|---|
| `oneShotRelayerService.ts` | `permissionContext` field | `delegationContext` |
| `oneShotRelayerService.ts` | `executions` field | `transactions` |
| Frontend hook (Phase 6) | `import { erc7715ProviderActions } from '@metamask/smart-accounts-kit'` | `from '@metamask/smart-accounts-kit/actions'` |
| Frontend hook (Phase 6) | `client.grantPermissions([...])` | `walletClient.requestExecutionPermissions([...])` |
| Frontend hook (Phase 6) | `data.token`, `periodInSeconds`, `initialAmount` | `data.tokenAddress`, `periodDuration`, `periodAmount` |

Everything else in wave.md matches the verified APIs exactly.

---

## Repo Structure

```
wave/
├── backend/          ← you build this
│   ├── app/
│   │   └── api/
│   ├── services/
│   ├── lib/
│   ├── schemas/
│   ├── prisma/
│   └── contracts/    ← Foundry lives inside backend
├── frontend/         ← already exists, leave it
├── wave.md
└── backend.md        ← this file
```

---

## Prerequisites (before Phase 1)

Get these ready — you'll need them for `.env.local`:

| Item | Where |
|---|---|
| `DATABASE_URL` | [neon.tech](https://neon.tech) — free tier, create a project, copy the connection string |
| `REDIS_URL` | [upstash.com/redis](https://upstash.com/redis) — free tier, create DB, copy `REDIS_URL` |
| `DEPLOYER_PRIVATE_KEY` | Fresh EOA wallet — needs a tiny bit of Base Sepolia ETH for deploying contract |
| `AGENT_A_PRIVATE_KEY` | Fresh EOA — needs Base Sepolia USDC for Venice x402 payments |
| `AGENT_B_PRIVATE_KEY` | Same as above |
| `AGENT_C_PRIVATE_KEY` | Same as above |
| `BASESCAN_API_KEY` | [basescan.org/apis](https://basescan.org/apis) — free, used for contract verification |
| Foundry | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |

**Base Sepolia faucet for test ETH:** https://www.alchemy.com/faucets/base-sepolia

**Base Sepolia USDC faucet:** Coinbase Wallet → Bridge → Base Sepolia, or use Circle's testnet faucet.

---

## Phase 1 — Project Scaffold

**Goal:** `cd backend && pnpm install` works. TypeScript compiles. Nothing else yet.

### Files to create

**`backend/package.json`**
```json
{
  "name": "waveagent-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev":        "next dev --port 3001",
    "build":      "next build",
    "start":      "next start --port 3001",
    "lint":       "next lint",
    "type-check": "tsc --noEmit",
    "db:push":    "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio":  "prisma studio",
    "test":       "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next":                          "14.2.x",
    "react":                         "18.x",
    "react-dom":                     "18.x",
    "@metamask/smart-accounts-kit":  "^0.3.0",
    "viem":                          "^2.x",
    "wagmi":                         "^2.x",
    "venice-x402-client":            "^1.x",
    "@prisma/client":                "^5.x",
    "ioredis":                       "^5.x",
    "openai":                        "^4.x",
    "zod":                           "^3.x",
    "pino":                          "^9.x",
    "jose":                          "^5.x"
  },
  "devDependencies": {
    "typescript":           "^5.x",
    "@types/node":          "^20.x",
    "@types/react":         "^18.x",
    "@types/react-dom":     "^18.x",
    "prisma":               "^5.x",
    "vitest":               "^1.x",
    "@vitejs/plugin-react": "^4.x",
    "pino-pretty":          "^11.x",
    "eslint":               "^8.x",
    "eslint-config-next":   "14.x"
  }
}
```

**`backend/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "contracts"]
}
```

**`backend/next.config.ts`**
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
}

export default nextConfig
```

**`backend/vercel.json`**
```json
{
  "framework": "nextjs",
  "functions": {
    "app/api/session/[sessionId]/run/route.ts": {
      "maxDuration": 60
    },
    "app/api/session/[sessionId]/stream/route.ts": {
      "maxDuration": 300
    }
  }
}
```

**`backend/.env.example`**
```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Database (Neon)
DATABASE_URL=postgresql://user:pass@host.neon.tech/waveagent?sslmode=require

# Redis (Upstash)
REDIS_URL=rediss://default:token@host.upstash.io:6380

# Chain — Base Sepolia only
CHAIN_ID=84532
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Contract (set after deploying in Phase 2)
VENICE_COLLAPSE_ENFORCER_ADDRESS=0x

# Wallets
DEPLOYER_PRIVATE_KEY=0x
AGENT_A_PRIVATE_KEY=0x
AGENT_B_PRIVATE_KEY=0x
AGENT_C_PRIVATE_KEY=0x

# Venice (x402 uses wallet auth — API key is fallback only)
VENICE_API_KEY=

# Basescan
BASESCAN_API_KEY=

# Logging
LOG_LEVEL=info
NODE_ENV=development
```

**`backend/.gitignore`**
```
# deps
node_modules/
.pnpm-store/

# Next.js
.next/
out/

# env
.env
.env.local
.env.*.local

# prisma generated
prisma/migrations/

# misc
.DS_Store
*.log
```

**`backend/app/layout.tsx`** (minimal — needed so Next.js builds)
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

### Commands
```bash
cd backend
pnpm install
pnpm type-check   # should pass (no app code yet)
```

### Commit message
```
feat: scaffold backend project — package.json, tsconfig, next.config, env template
```

---

## Phase 2 — Contracts (Foundry)

**Goal:** `forge test` passes with 5 tests. Contract deployed to Base Sepolia. Address in `.env.local`.

### Setup
```bash
# From backend/ directory
mkdir -p contracts/src contracts/script contracts/test
cd contracts
forge init --no-git .
forge install metamask/delegation-framework@v1.3.0 --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge install foundry-rs/forge-std --no-commit
```

### Files to create

**`backend/contracts/foundry.toml`**
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc-version = "0.8.23"
optimizer = true
optimizer-runs = 200
via_ir = true

[profile.default.fuzz]
runs = 1000

[rpc_endpoints]
base_sepolia = "${BASE_SEPOLIA_RPC_URL}"

[etherscan]
base_sepolia = { key = "${BASESCAN_API_KEY}", url = "https://api-sepolia.basescan.org/api" }
```

**`backend/contracts/src/VeniceCollapseEnforcer.sol`**

Full contract — implements `ICaveatEnforcer` from delegation-framework:

- `initSession(bytes32 sessionId, uint8 agentCount)` — backend EOA calls this, stored as `initiator`
- `submitReasoningHash(bytes32 sessionId, uint8 agentId, bytes32 reasoningHash, uint8 confidence)` — only initiator can call, auto-collapses when all 3 submitted
- `_collapse(bytes32 sessionId)` — internal, picks highest-confidence agent as winner, emits `WavefunctionCollapsed`
- `beforeHook(bytes calldata terms, ...)` — ICaveatEnforcer hook; decodes `(bytes32 sessionId, uint8 agentId)` from terms, reverts if wavefunction hasn't collapsed to that agentId
- `afterHook(...)` — no-op
- Events: `ReasoningHashSubmitted`, `WavefunctionCollapsed`

See full Solidity in `wave.md` → Section 4.1.

**`backend/contracts/script/Deploy.s.sol`**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/VeniceCollapseEnforcer.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        VeniceCollapseEnforcer enforcer = new VeniceCollapseEnforcer();
        console.log("VeniceCollapseEnforcer deployed at:", address(enforcer));
        vm.stopBroadcast();
    }
}
```

**`backend/contracts/test/VeniceCollapseEnforcer.t.sol`**

5 tests:
1. `test_SubmitAndCollapse` — 3 hashes in, agent 1 wins (confidence 87)
2. `test_BeforeHook_SucceedsForWinner` — winner's beforeHook doesn't revert
3. `test_BeforeHook_RevertsForLoser` — loser's beforeHook reverts "This agent did not win collapse"
4. `test_BeforeHook_RevertsBeforeCollapse` — reverts "Wavefunction not yet collapsed"
5. `test_OnlyInitiatorCanSubmitHash` — attacker gets "Not session initiator"
6. `testFuzz_CollapseAlwaysPicksHighestConfidence` — fuzz test, always picks max confidence

See full Solidity in `wave.md` → Section 18.1.

### Deploy
```bash
# From backend/contracts
forge test -vvv                   # must pass before deploying

# Set env vars first
source ../.env.local

forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  --private-key $DEPLOYER_PRIVATE_KEY \
  -vvvv
```

Copy the logged address → set `VENICE_COLLAPSE_ENFORCER_ADDRESS=0x...` in `.env.local`.

### Commit message
```
feat: add VeniceCollapseEnforcer contract — deploy script + foundry tests
```

---

## Phase 3 — Lib Layer + Prisma Schema

**Goal:** `pnpm db:push` succeeds. DB tables exist. Redis client connects.

### Files to create

**`backend/lib/constants.ts`**
```ts
export const CHAIN_ID     = 84532 as const
export const CHAIN_NAME   = 'baseSepolia' as const

// Base Sepolia USDC
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`

export const RELAYER_ENDPOINT = 'https://relayer.1shotapi.com/relayers'
export const ONESHOT_JWKS_URL = 'https://relayer.1shotapi.com/.well-known/jwks.json'

export const DELEGATION_MANAGER_ADDRESS = undefined // resolved via getSmartAccountsEnvironment(CHAIN_ID)
```

**`backend/lib/db.ts`** — Prisma singleton (standard pattern)

**`backend/lib/redis.ts`** — ioredis singleton using `REDIS_URL` env var

**`backend/lib/logger.ts`** — pino with `{ service: 'waveagent' }`, pino-pretty in dev

**`backend/lib/verifyOneShotWebhook.ts`**
```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ONESHOT_JWKS_URL } from './constants'

const jwks = createRemoteJWKSet(new URL(ONESHOT_JWKS_URL))

export async function verifyOneShotWebhook(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, jwks, { algorithms: ['EdDSA'] })
    return true
  } catch {
    return false
  }
}
```

**`backend/prisma/schema.prisma`**

Three models:

```prisma
model Session {
  id                 String        @id @default(cuid())
  sessionId          String        @unique   // bytes32 hex — matches onchain
  userAddress        String
  userIntent         String
  budgetUsdc         Float
  status             SessionStatus @default(PENDING)
  permissionContext  String?
  delegationManager  String?
  agentDelegations   Json?
  agentResults       AgentResult[]
  winnerAgentId      Int?
  winnerHash         String?
  collapseTaskId     String?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  @@index([userAddress])
  @@index([status])
}

enum SessionStatus {
  PENDING DELEGATION_GRANTED AGENTS_RUNNING
  HASHES_SUBMITTED COLLAPSED EXECUTED FAILED
}

model AgentResult {
  id                 String   @id @default(cuid())
  sessionId          String
  session            Session  @relation(fields: [sessionId], references: [sessionId])
  agentId            Int
  role               String
  reasoningContent   String   @db.Text
  reasoningHash      String
  confidence         Int
  structuredOutput   Json
  hashTaskId         String?
  hashTxHash         String?
  delegationDisabled Boolean  @default(false)
  createdAt          DateTime @default(now())
  @@unique([sessionId, agentId])
  @@index([sessionId])
}

model OneShotTask {
  id        String     @id
  taskId    String     @unique
  sessionId String
  purpose   String     // "hash_submission" | "disable_delegation" | "execute"
  agentId   Int?
  status    TaskStatus @default(PENDING)
  txHash    String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  @@index([sessionId])
  @@index([taskId])
}

enum TaskStatus {
  PENDING SUBMITTED CONFIRMED REJECTED REVERTED
}
```

### Commands
```bash
cd backend
pnpm db:push     # creates tables in Neon
pnpm type-check  # should still pass
```

### Commit message
```
feat: lib layer (constants, db, redis, logger, webhook verify) + prisma schema
```

---

## Phase 4 — Schemas + Services

**Goal:** All 6 services compile with zero TS errors. No runtime yet.

### Schemas

**`backend/schemas/agentOutputSchema.ts`**
```ts
import { z } from 'zod'

export const AgentOutputSchema = z.object({
  summary:    z.string(),
  confidence: z.number().min(0).max(100),
  action:     z.string(),
  reasoning:  z.string(),
})

export type AgentOutput = z.infer<typeof AgentOutputSchema>
```

**`backend/schemas/sessionSchema.ts`**
```ts
import { z } from 'zod'

export const NewSessionSchema = z.object({
  intent:     z.string().min(20, 'Intent must be at least 20 characters').max(500),
  budgetUsdc: z.number().min(1).max(50),
})

export type NewSessionInput = z.infer<typeof NewSessionSchema>
```

### Services

#### `backend/services/chainService.ts`
- `getPublicClient()` — `createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) })`
- Singleton pattern (cache after first call)

#### `backend/services/agentWalletService.ts`
- Reads `AGENT_A/B/C_PRIVATE_KEY` from env
- `getAgentWallets()` → `Promise<AgentWallet[]>` — each wallet is `{ account, smartAccount, address }`
- Uses `toMetaMaskSmartAccount({ implementation: Implementation.Hybrid, ... })` on `baseSepolia`
- Singleton — initialise once, reuse

#### `backend/services/delegationService.ts`
- `createSubDelegations({ sessionId, rootDelegation, budgets })` → 3 signed sub-delegations (A→B, A→C, A→D)
  - Each caveat: `{ enforcer: ENFORCER_ADDRESS, terms: abi.encode(sessionId, agentId), args: '0x' }`
  - Each scope: `ScopeType.Erc20TransferAmount`, USDC, budget[i]
- `hashReasoningContent(content: string): Hex` → `keccak256(toBytes(content))`
- `disableLoserDelegation(relayer, delegation)` → calls `relayer.disableDelegation(delegation)`

#### `backend/services/veniceAgentService.ts`
- One `VeniceClient` per agent private key (cached)
- `runAgent({ agentId, agentPrivateKey, userIntent, onChunk? })` → `AgentResult`
  - Calls Venice with `deepseek-r1-671b`, `venice_parameters: { include_venice_system_prompt: false }`
  - Extracts `reasoning_content` from `choices[0].message.reasoning_content`
  - Parses structured JSON through `AgentOutputSchema.safeParse()`
  - Calls `onChunk(reasoning_content)` for streaming

System prompt forces JSON output with `{ summary, confidence, action, reasoning }`.

#### `backend/services/oneShotRelayerService.ts`
- `OneShotRelayerService` class
- `getCapabilities()` → chain support, feeCollector, targetAddress, accepted tokens (cached)
- `getFeeData({ chainId, tokenAddress, targetAddress })` → price-locked `context`
- `send7710Transaction({ delegationContext, transactions, destinationUrl?, authorizationList? })` → `taskId`
  - ⚠️ Field names are `delegationContext` (not `permissionContext`) and `transactions` (not `executions`) — confirmed from 1Shot docs
  - Always calls `getCapabilities` + `getFeeData` first to get fresh `context`
- `disableDelegation(delegation)` → encodes `DelegationManager.encode.disableDelegation({ delegation })`, sends as transaction
- `getStatus(taskId)` → `{ status, txHash? }`

#### `backend/services/collapseOrchestratorService.ts`
- `CollapseOrchestratorService` class, takes `(relayer: OneShotRelayerService, enforcerAddress: Address)`
- `submitHashes({ sessionId, agentResults, webhookUrl })` → `string[]` (task IDs)
  - For each agent: `encodeFunctionData({ abi: ENFORCER_ABI, functionName: 'submitReasoningHash', args: [...] })`
  - Submit via `relayer.send7710Transaction`
  - **Note:** Import `encodeFunctionData` from `viem` at the TOP of the file
- `waitForCollapse(sessionId)` → `{ winnerAgentId, winnerHash }`
  - Uses `publicClient.watchContractEvent` on `WavefunctionCollapsed`, 60s timeout

ENFORCER_ABI defined inline — only `submitReasoningHash` function + `WavefunctionCollapsed` event.

### Commands
```bash
cd backend
pnpm type-check   # must pass — zero errors
```

### Commit message
```
feat: zod schemas + all 6 services (chain, agentWallet, delegation, venice, 1shot, orchestrator)
```

---

## Phase 5 — API Routes

**Goal:** `pnpm dev` runs. All routes respond correctly. Full flow works end-to-end.

### Route files

#### `backend/app/api/session/create/route.ts` — `POST`

Request body: `{ userIntent: string, budgetUsdc: number, userAddress: string }`

Logic:
1. Validate with `NewSessionSchema`
2. Generate `sessionId` = `keccak256(toBytes(userAddress + Date.now()))` as `0x${string}`
3. Get agent wallets → extract addresses
4. Call `initSession(sessionId, 3)` on enforcer via 1Shot relayer (`send7710Transaction`)
5. Save `Session` record to DB with status `PENDING`
6. Return `{ sessionId, agentAddresses: [A, B, C] }`

#### `backend/app/api/session/[sessionId]/route.ts` — `GET`

Returns full session from DB including agentResults.

#### `backend/app/api/session/[sessionId]/grant-delegation/route.ts` — `POST`

Request body: `{ permissionContext: string, delegationManager: string, accountMetadata: [] }`

Logic:
1. Load session from DB, verify exists
2. Parse budgetUsdc → split into `[40%, 35%, 25%]` USDC amounts (in 6-decimal units)
3. Call `createSubDelegations({ sessionId, rootDelegation: permissionContext, budgets })`
4. Save `permissionContext` + `agentDelegations` to DB, update status → `DELEGATION_GRANTED`
5. Return `{ status: 'ok', agentDelegations: [...] }`

#### `backend/app/api/session/[sessionId]/run/route.ts` — `POST`

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

Request body: `{ userIntent: string }`

Logic:
1. Load session, verify `DELEGATION_GRANTED` status
2. Update status → `AGENTS_RUNNING`, publish `agents_started` to Redis
3. Run all 3 agents in parallel (`Promise.all`) — each `runAgent()` publishes `agent_reasoning` chunks to Redis
4. Update status → `HASHES_SUBMITTED`
5. Submit all hashes via `orchestrator.submitHashes()` — publish `hash_submitted` events
6. Watch for `WavefunctionCollapsed` via `orchestrator.waitForCollapse()`
7. Update status → `COLLAPSED`, publish `wavefunction_collapsed` to Redis
8. Disable losing delegations in parallel — publish `delegation_disabled` events
9. Save `AgentResult` records + `winnerAgentId` to DB, update status → `EXECUTED`
10. Return `{ winnerAgentId, winnerHash }`

#### `backend/app/api/session/[sessionId]/stream/route.ts` — `GET`

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

Redis pub/sub → SSE stream:
- Subscribe to `session:${sessionId}` channel
- Pipe messages as `data: ${message}\n\n`
- Unsubscribe on request abort

#### `backend/app/api/webhook/1shot/route.ts` — `POST`

Logic:
1. Get `x-signature` header
2. Verify with `verifyOneShotWebhook(signature)` — reject 401 if invalid
3. Parse body: `{ taskId, status, txHash?, meta? }`
4. Update `OneShotTask` in DB
5. Publish `task_update` to Redis channel `session:${meta.sessionId}`
6. Return `200 OK`

### Rate limiting middleware

**`backend/middleware.ts`**
- Only applies to `POST /api/session/create`
- Redis-backed: 5 requests per IP per 60 seconds
- Returns 429 on breach

### Commands
```bash
cd backend
pnpm dev
# Test in a second terminal:
curl -X POST http://localhost:3001/api/session/create \
  -H "Content-Type: application/json" \
  -d '{"userIntent":"Research Ethereum L2 scaling solutions and recommend the best one for DeFi", "budgetUsdc": 5, "userAddress": "0x1234..."}'
# Expected: { sessionId: "0x...", agentAddresses: ["0x...", "0x...", "0x..."] }

pnpm type-check   # must still pass
```

### Commit message
```
feat: all API routes — session CRUD, run orchestration, SSE stream, 1Shot webhook
```

---

## Phase 6 — Deploy to Vercel

**Goal:** Live URL. All routes respond on Vercel.

### Steps

1. Push all code to GitHub (your main branch)
2. Go to [vercel.com](https://vercel.com) → New Project → import repo → set **Root Directory** to `backend`
3. Add all env vars from `.env.example` in Vercel dashboard (Settings → Environment Variables)
4. Deploy

### Key Vercel settings
- **Root Directory:** `backend`
- **Build Command:** `pnpm build` (auto-detected)
- **Output Directory:** `.next`

### Verify after deploy
```bash
# Replace with your Vercel URL
curl -X POST https://your-app.vercel.app/api/session/create \
  -H "Content-Type: application/json" \
  -d '{"userIntent":"Research Ethereum L2 scaling and recommend best for DeFi", "budgetUsdc": 5, "userAddress": "0x1234"}'
```

### Commit message
```
chore: add vercel.json + deploy config for backend
```

---

## Quick Reference — SSE Event Types

The frontend (when built) subscribes to `GET /api/session/:id/stream` and receives:

```
event: agents_started
event: agent_reasoning    → { agentId, chunk }
event: hash_submitted     → { agentId, taskId, hash }
event: hash_confirmed     → { agentId, txHash, confidence }
event: wavefunction_collapsed → { winnerAgentId, winnerHash, winnerOutput }
event: delegation_disabled → { agentId, taskId }
event: execution_complete → { agentId, result, txHash }
```

---

## Quick Reference — Key Addresses (Base Sepolia)

| Item | Address |
|---|---|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| DelegationManager | resolved via `getSmartAccountsEnvironment(84532)` — do not hardcode |
| VeniceCollapseEnforcer | set after Phase 2 deploy |

---

*Read `wave.md` for full Solidity + TypeScript source for every file listed above.*
