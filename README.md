<img width="876" height="242" alt="image" src="https://github.com/user-attachments/assets/c88e2a20-4cdc-4995-af47-a98ac140d689" />


> **An onchain AI yield manager for stablecoins — where you don't have to trust the AI, because the chain enforces it.**

You deposit idle USDC and set a goal. Three AI agents debate the best yield strategy, **pay to think** with real money over x402, and reach **consensus onchain** through a custom ERC-7710 caveat enforcer. The enforcer makes it cryptographically impossible for any agent to touch your funds unless the swarm collapsed to a winner — and only within the budget you granted. The winning strategy deploys into Compound V3, credited to *you*, and becomes a **tradeable asset** anyone can copy.

**Network:** Base Sepolia (chain ID `84532`) · **Tracks:** Best x402 + ERC-7710 · Best Agent · Best A2A Coordination

---

## Table of contents
1. [The problem](#the-problem) · [The guarantee](#the-guarantee)
2. [End-to-end flow](#end-to-end-flow)
3. [Why every standard is load-bearing](#why-every-standard-is-load-bearing)
4. [Architecture](#architecture)
5. [Smart contracts](#smart-contracts)
6. [The delegation lifecycle (ERC-7715 → ERC-7710 → redeem)](#the-delegation-lifecycle)
7. [The x402 layer](#the-x402-layer)
8. [The AI debate](#the-ai-debate)
9. [Backend services](#backend-services)
10. [API reference](#api-reference) · [SSE events](#sse-event-stream)
11. [Data model](#data-model)
12. [Frontend](#frontend)
13. [Tech stack](#tech-stack) · [Deployed addresses](#deployed-addresses)
14. [Repo structure](#repository-structure) · [Getting started](#getting-started)
15. [Onchain tx lifecycle](#onchain-transaction-lifecycle) · [Wave Market](#wave-market) · [Honest notes](#honest-notes)

---

## The problem

Letting an AI agent manage your money means handing a model your funds and *hoping* it behaves. Every "AI + DeFi" product today is a trust exercise — the agent could misallocate, overreach, or drain you, and nothing stops it but good intentions and a system prompt.

## The guarantee

Wave replaces trust with **cryptographic constraint**. The agents reason, debate, and recommend — but the actual movement of funds is gated by an onchain caveat enforcer. Concretely:

- An agent can spend **only up to the cap you signed** (ERC-7715).
- Funds can move **only after the swarm collapses to a winner** onchain — the vault literally reverts otherwise.
- **Only the collapse winner** can redeem; losing agents revert.
- The position is credited to **your** address — the protocol never custodies it.

The AI can act, but only exactly how — and how much — the chain allows.

---

## End-to-end flow

```
Connect → Grant → Redelegate → Debate (R1 + R2) → Collapse → Redeem → Deploy → (List → Copy)
```

1. **Connect & deposit** — `/session/new`. You connect MetaMask Flask, set a goal + amount. `POST /api/session/create` writes the session and calls `initSession(sessionId, 3)` on the enforcer onchain.
2. **Grant (ERC-7715).** You sign an Advanced Permission — a periodic USDC spending cap delegated to the lead agent (Agent A). MetaMask returns a `permissionContext` + `dependencies` (factory data to deploy your gator). Gasless — just a signature.
3. **Redelegate (ERC-7710).** The backend takes your root context and **redelegates** it to all three agent smart accounts via `redelegatePermissionContextOpenAction` — each child delegation carries a custom caveat encoding `(sessionId, agentId)` and is scoped to the USDC budget. Signed offchain by Agent A.
4. **Round 1 — reason (Venice + x402).** Three agents (Yield, Risk, Liquidity) reason in parallel. Each calls the x402-gated inference gateway, signs an EIP-3009 USDC authorization, and the backend `settle`s it onchain *before* running Venice.
5. **Round 2 — debate + conviction bet.** Each agent critiques both peers and revises its confidence. The x402 price for this round **scales with the agent's confidence** (`?conviction=N`) — higher belief = more USDC staked.
6. **Collapse (ERC-7710 enforcer).** Each agent's reasoning is `keccak256`-hashed and committed via `submitReasoningHash`. The third submission triggers `_collapse()` inside the contract — it picks the highest-confidence agent (tie → lowest id), sets the winner, and emits `WavefunctionCollapsed`.
7. **Redeem (DelegationManager).** The backend deploys the user's gator + Agent A's smart account (if needed), waits until the collapse is visible onchain, then calls `redeemDelegations` with the **winner's** permission context. The enforcer's `beforeHook` allows it only because the session collapsed to that agent; a loser would revert. USDC lands in the vault.
8. **Deploy (Compound V3).** `WaveStrategyVault.executeStrategy` re-checks the enforcer, skims a 1% protocol fee, and calls `supplyTo(you, USDC, net)` on Compound V3 — you own the cUSDC position and the yield.
9. **Trade (Wave Market).** Optionally list the winning strategy. A buyer pays you over x402; the protocol re-executes the proven strategy into the buyer's own Compound position.

---

## Why every standard is load-bearing

| Standard | Role in Wave | Remove it and… |
|---|---|---|
| **MetaMask Smart Accounts Kit** | Agents are Hybrid smart accounts; execution via `DelegationManager` | no scoped permissions — agents get full wallet access |
| **ERC-7715 (Advanced Permissions)** | The user's capped, periodic spending grant | no user-controlled budget; trust is back |
| **ERC-7710** | Redelegation to agents + the custom caveat enforcer | the AI can act off-consensus, unbounded |
| **x402** | Pay-per-inference, conviction bets, *and* marketplace settlement | thinking is free (no skin in the game); the market has no rail |
| **Venice AI** | Private multi-agent reasoning (`mistral-31-24b`) | no agents, no debate |
| **Compound V3** | The live yield venue (`supplyTo`) | nowhere to deploy; the user owns nothing |
| **Custom caveat enforcer** | Turns Venice output into an onchain, enforced decision | the AI's "consensus" is decorative, not binding |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER — Next.js 16 / React 19 / Tailwind v4                          │
│  MetaMask Flask ──(ERC-7715 requestExecutionPermissions)──▶            │
│  Live session via SSE ◀── wave-field canvas · debate-floor · wave.log  │
│  Pages: / · /session/new · /session/[id] · /market · /graph ·          │
│         /agents · /explore · /stats · /portfolio                       │
└───────────────┬────────────────────────────────────────────────────────┘
                │ HTTP + SSE
┌───────────────▼────────────────────────────────────────────────────────┐
│  BACKEND — Next.js 14 API routes · TypeScript · pnpm                    │
│                                                                          │
│  veniceAgentService   runAgent (R1) · runAgentDebate (R2)               │
│  x402 gateway         /api/x402/inference — verify → settle → Venice     │
│  delegationService    createSubDelegations · redelegatePermissionContext │
│  collapseOrchestrator submit 3 hashes → enforcer auto-collapse           │
│  executionService     deploy gator+AgentA · redeemDelegations · supplyTo │
│  marketService        listStrategy · purchaseStrategy (x402 → re-exec)   │
│  chainService (viem)  · lib/mutex (serialize EOA txs) · enforcerService  │
│  Prisma → Neon (Postgres)   ·   ioredis → Upstash (pub/sub → SSE)        │
└───────────────┬────────────────────────────────────────────────────────┘
                │ viem (Alchemy RPC) + Foundry
┌───────────────▼────────────────────────────────────────────────────────┐
│  BASE SEPOLIA (84532)                                                   │
│   VeniceCollapseEnforcer   custom ERC-7710 caveat enforcer              │
│   WaveStrategyVault        constrained execution → Compound V3          │
│   WaveMarket               copy-trading marketplace                     │
│   MetaMask DelegationManager · Compound V3 Comet · Circle USDC          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Smart contracts

All in `backend/contracts/` (Solidity `0.8.23`, Foundry). Covered by **no-mock fork tests** that drive the *live* enforcer and assert against the *live* Compound V3 + USDC.

### 1. `VeniceCollapseEnforcer.sol` — the custom ERC-7710 caveat enforcer (the core)

Implements `ICaveatEnforcer`. It records per-session agent submissions, collapses to a winner, and gates delegation redemption.

```solidity
struct AgentSubmission { bytes32 reasoningHash; uint8 confidence; bool submitted; }
struct Session {
  mapping(uint8 => AgentSubmission) agents;
  uint8 submissionCount; uint8 requiredAgents; uint8 winnerAgentId;
  bool collapsed; address initiator;
}
mapping(bytes32 => Session) public sessions;

function initSession(bytes32 sessionId, uint8 agentCount) external;          // backend opens a session
function submitReasoningHash(bytes32 sessionId, uint8 agentId,
                             bytes32 reasoningHash, uint8 confidence) external; // 3rd call auto-collapses
function getSession(bytes32) external view
  returns (uint8 submissionCount, uint8 requiredAgents, uint8 winnerAgentId, bool collapsed, address initiator);

// ICaveatEnforcer — gates the redeem:
function beforeHook(bytes terms, ...) external view {
  (bytes32 sessionId, uint8 agentId) = abi.decode(terms, (bytes32, uint8));
  require(sessions[sessionId].collapsed,             "Wavefunction not yet collapsed");
  require(sessions[sessionId].winnerAgentId == agentId, "This agent did not win collapse");
}
```

- **Collapse rule:** highest `confidence` wins; tie → lowest `agentId`. Happens *inside* the third `submitReasoningHash` tx and emits `WavefunctionCollapsed(sessionId, winnerAgentId, winnerHash, confidence)`.
- **Caveat terms:** `abi.encode(bytes32 sessionId, uint8 agentId)` — baked into each agent's delegation so the enforcer can check the right session + agent at redeem time.

### 2. `WaveStrategyVault.sol` — constrained execution → Compound V3

```solidity
// constructor(comet, usdc, enforcer, treasury, feeBps)   // feeBps = 100 (1%)
function executeStrategy(bytes32 sessionId, uint8 winnerAgentId, address user) external onlyTreasury {
  if (executions[sessionId].executed) revert AlreadyExecuted();
  (, , uint8 win, bool collapsed, ) = IVeniceEnforcer(enforcer).getSession(sessionId);
  if (!collapsed || win != winnerAgentId) revert NoOnchainConsensus();   // constrained AI
  uint256 bal = IERC20(usdc).balanceOf(address(this));
  uint256 fee = (bal * feeBps) / 10_000;
  IERC20(usdc).transfer(treasury, fee);                                  // protocol fee
  IERC20(usdc).approve(comet, bal - fee);
  IComet(comet).supplyTo(user, usdc, bal - fee);                         // USER owns the position
}
```
The vault **re-reads the enforcer** before deploying — even with USDC in hand, it won't move funds unless the chain agrees the swarm collapsed to that winner. `supplyTo(user, …)` credits the position to the user, not the protocol.

### 3. `WaveMarket.sol` — copy-trading marketplace

```solidity
struct Listing { bytes32 originalSessionId; uint8 winnerAgentId; bytes32 reasoningHash;
                 address seller; uint256 priceUsdc; uint256 purchases; bool active; }

function list(bytes32 sessionId, uint8 winnerAgentId, bytes32 reasoningHash,
              address seller, uint256 priceUsdc) external onlyRelayer returns (uint256 id) {
  (, , uint8 win, bool collapsed, ) = IVeniceEnforcer(enforcer).getSession(sessionId);
  require(collapsed && win == winnerAgentId, "not a proven winner");     // provenance gate
  // store listing…
}
function purchaseAndExecute(uint256 id, address buyer) external onlyRelayer {
  // re-verify provenance, then supplyTo(buyer) on Compound with the buyer's deploy capital
}
```
You can only **list a strategy that genuinely won a collapse** (verified against the enforcer). On purchase, the proven strategy is re-deployed into the buyer's own Compound position. The seller fee is paid separately over x402 (see below).

---

## The delegation lifecycle

This is the heart of the "you don't have to trust the AI" guarantee. Files: `services/delegationService.ts`, `services/executionService.ts`.

**1 · The grant (frontend, `hooks/use-grant-delegation.ts`).** The browser extends the wallet client with `erc7715ProviderActions()` and calls `requestExecutionPermissions([{ type: 'erc20-token-periodic', tokenAddress: USDC, periodAmount, periodDuration: 86400, … }])`. MetaMask Flask returns `{ context, delegationManager, dependencies }`. The `dependencies` (`{factory, factoryData}`) are how the user's gator account gets deployed.

**2 · Redelegation (backend).** `redelegateAgentContexts` takes the root context and, for each agent, calls `redelegatePermissionContextOpenAction` with:
- an **open delegation** (`ANY_DELEGATE`) so the backend relayer can redeem the leaf (a fixed delegate would revert with `InvalidDelegate` since the relayer is `msg.sender`),
- a USDC-scoped caveat, **plus the `VeniceCollapseEnforcer` caveat** encoding `(sessionId, agentId)`.
A **custom viem transport** intercepts `eth_signTypedData_v4` and signs locally with Agent A's owner EOA (the SDK otherwise routes signing through the RPC, which holds no keys).

**3 · The redeem (`redeemWinnerDelegation`).** Before redeeming, the backend:
- **deploys the user's gator** from the grant `dependencies` and **ensures Agent A's smart account is deployed** (both must exist onchain for the delegation-chain signatures to verify via ERC-1271),
- **polls the enforcer until the collapse is visible** on the queried RPC node (guards against read-after-write lag that would otherwise revert with "Wavefunction not yet collapsed"),
- **simulates then sends** `DelegationManager.redeemDelegations` with the winner's context, retrying on a transient stale read.

If the grant path is unavailable (no Flask), the backend transparently **falls back to treasury-fronted funding** — still credited to the user — and the UI badge shows which path ran (`ERC-7710 delegation` vs `treasury`).

---

## The x402 layer

x402 (HTTP 402, Payment Required) is used in **three** places — file `app/api/x402/inference/route.ts`, `services/marketService.ts`.

**1 · Pay-per-inference (gateway).** `POST /api/x402/inference` returns `402` with payment requirements unless an `X-PAYMENT` header is present. The agent signs an **EIP-3009** `transferWithAuthorization` (gasless USDC), the backend `verify`s it, then **`settle`s it onchain *before* calling Venice** (the auth has a short validity window; Venice latency would otherwise expire it). All settlements run through a process-wide **mutex** so the agents' parallel txs don't collide on the backend EOA's nonce.

**2 · Conviction bets.** Round-2 requests append `?conviction=N` (the agent's confidence). `buildRequirements` scales the price by `N/100` — a more confident agent literally pays more USDC for its second-round inference.

**3 · Marketplace settlement.** On a purchase, the buyer signs an EIP-3009 authorization with `payTo = seller`. The backend settles it (real buyer→seller USDC), then funds the market contract and calls `purchaseAndExecute`. Here x402 is the **product settlement rail**, not a compute toll. The browser builds the payment client-side in `lib/market-x402.ts` (EIP-3009 typed-data signing → base64 `X-PAYMENT`).

---

## The AI debate

File: `services/veniceAgentService.ts`. Model: **Venice `mistral-31-24b`** (fast, ~4s/call).

- **Three lenses:** Yield (agent 0), Risk (agent 1), Liquidity (agent 2). Each gets a role-specific system prompt and returns structured JSON (`summary`, `confidence` 0–100, `action`, `reasoning`) validated by **zod**.
- **Round 1 (`runAgent`):** independent analysis. Robust to model variance — retries up to 3× on malformed output, then falls back to a valid low-confidence result so one bad roll never kills a run.
- **Round 2 (`runAgentDebate`):** each agent critiques **both** peers by name, revises its confidence, and places its conviction bet. The critique text is what powers the A2A coordination graph.
- **Hashing:** each agent's reasoning is `keccak256`-hashed (`hashReasoningContent`) → committed onchain. Distinct reasoning ⇒ distinct hashes ⇒ a real, verifiable collapse.

---

## Backend services

| Service | Responsibility |
|---|---|
| `veniceAgentService` | Run agents (R1 + R2 debate); structured output + retry/fallback; conviction-bet pricing |
| `agentWalletService` | The 3 agents as `toMetaMaskSmartAccount` Hybrid accounts |
| `delegationService` | Build/sign sub-delegations; ERC-7715 → ERC-7710 redelegation (open, ANY_DELEGATE) |
| `enforcerService` | `initSession`, `submitReasoningHash` (gas-buffered), `getSessionOnchain`, parse collapse logs |
| `collapseOrchestratorService` | Submit all 3 hashes (retry/no-double-submit) → drive the onchain collapse |
| `executionService` | Deploy gator + Agent A, wait-for-collapse, `redeemDelegations`, treasury fallback, `executeVaultStrategy` |
| `marketService` | `listStrategy`, `getListings`, `purchaseStrategy` (x402 settle → fund → `purchaseAndExecute`) |
| `chainService` | viem public + backend wallet clients (single funded EOA w/ nonce manager) |
| `lib/mutex` | `runExclusive` — serializes all backend-EOA txs (settles, submits, redeems, supplies) |
| `lib/redis` | Upstash pub/sub → the SSE event bus |

---

## API reference

Base: backend on `:3001`. CORS allows the frontend origin + `X-PAYMENT`.

| Method · Route | Purpose |
|---|---|
| `POST /api/session/create` | Create a session; `initSession` onchain. Body: `{ userIntent, budgetUsdc, userAddress }` → `{ sessionId, agentAddresses, initTxHash }` |
| `GET /api/session/[id]` | Full session record + agent results |
| `GET /api/session` | List sessions (`?userAddress=&limit=`) — powers Explore / Portfolio |
| `POST /api/session/[id]/grant-delegation` | Accept the ERC-7715 root context; fan out into 3 enforcer-gated sub-delegations; persist `permissionContext`, `accountMetadata`, `agentDelegations` |
| `POST /api/session/[id]/run` | The full pipeline: R1 → R2 debate → collapse → redeem/treasury → Compound supply (`maxDuration 300`) |
| `GET /api/session/[id]/stream` | Server-Sent Events for the live run |
| `POST /api/x402/inference` | x402-gated Venice gateway (agents pay per call; `?conviction=N` scales price) |
| `GET /api/market` | All listings + recent purchases |
| `POST /api/market/list` | List a collapsed session's winning strategy. Body: `{ sessionId, priceUsdc }` |
| `GET /api/market/[id]` | One listing (enriched with reasoning excerpt) |
| `POST /api/market/[id]/purchase` | x402-gated: `402` → requirements (`payTo = seller`); with `X-PAYMENT` → settle + re-execute for buyer |

### SSE event stream
`agents_started · agent_reasoning · agent_done · debate_started · agent_debate_reasoning · confidence_shift · debate_complete · hash_submitted · hash_confirmed · wavefunction_collapsed · execution_started · execution_redeemed (viaDelegation) · execution_supplied (recipient, protocol) · execution_complete · error`

---

## Data model

Prisma + Neon (Postgres). `backend/prisma/schema.prisma`.

- **`Session`** — `sessionId` (bytes32), `userAddress`, `userIntent`, `budgetUsdc`, `status` (`PENDING → DELEGATION_GRANTED → AGENTS_RUNNING → AGENTS_DEBATING → HASHES_SUBMITTED → COLLAPSED → EXECUTING → EXECUTED / FAILED`), `permissionContext`, `delegationManager`, `accountMetadata` (gator deploy deps), `agentDelegations`, `winnerAgentId`, `winnerHash`, `strategyVaultTx`, `aaveSupplyTx` (the Compound supply tx), `fundedViaDelegation`.
- **`AgentResult`** — per agent per session: `agentId`, `role`, `reasoningContent`, `reasoningHash`, `confidence`, `round1Confidence`, `revisedConfidence`, `critiqueText`, `convictionBetUsdc`, `structuredOutput`, `hashTxHash`.
- **`StrategyListing`** — `listingId`, `sessionId`, `winnerAgentId`, `reasoningHash`, `sellerAddress`, `priceUsdc`, `purchases`, `active`, `listTxHash`.
- **`StrategyPurchase`** — `listingId`, `buyerAddress`, `deployedUsdc`, `sellerPaymentTx` (x402), `supplyTxHash`.

---

## Frontend

**Pages (9):**

| Route | Page | What it shows |
|---|---|---|
| `/` | Landing | Hero, flow, the stack, principles |
| `/session/new` | Deploy | Connect, goal + amount, sign the ERC-7715 grant |
| `/session/[id]` | Live run | Wave-interference canvas, debate floor, agent panels, real-time `wave.log` (per-tx Basescan links), result card + ERC-7710 delegation badge, "List on Wave Market" |
| `/market` | Wave Market | List + buy strategies; browser-side x402 purchase; recently-purchased feed |
| `/graph` | Coordination Map | A2A force graph — critique / winner / copy-trade edges, click-to-inspect |
| `/agents` | The Strategists | Leaderboard — win rates, conviction staked, calibration (conf on wins vs losses) |
| `/explore` | The Ledger | Every collapse, public + Basescan-verifiable |
| `/stats` | State of the Wave | Live onchain TVL (read from Compound), collapses, conviction staked |
| `/portfolio` | Your Positions | Live Compound balance, principal vs. value, net yield |

**Key components:** `wave-field` (self-animating wave-interference canvas → collapse shockwave), `debate-floor` (live confidence shifts + critiques + conviction stakes), `wave-terminal` (the `wave.log` SSE feed with Basescan links), `knowledge-graph` (react-force-graph-2d), `session-runner` (orchestrates live + replay), `agent-orb`, `wave-collapse`. **Libs:** `wave-api` (typed client + SSE types), `graph-data` (builds the A2A graph from sessions + market), `market-x402` (browser EIP-3009 signing), `wallet` (EIP-6963 Flask detection).

---

## Tech stack

**Contracts:** Solidity `0.8.23` · Foundry · MetaMask Delegation Framework (`ICaveatEnforcer`) · no-mock fork tests.

**Backend (`/backend`):** Next.js 14 (App Router) · TypeScript · Node 20 · pnpm · **viem 2.52** · **@metamask/smart-accounts-kit 1.6** · **x402 + x402-fetch 1.2** · OpenAI SDK → **Venice AI** (`mistral-31-24b`) · **Prisma 5 + Neon (Postgres)** · **ioredis + Upstash Redis** (→ SSE) · pino · zod.

**Frontend (`/frontend`):** Next.js 16.2 · React 19.2 · Tailwind v4 · framer-motion · GSAP · Lenis · react-force-graph-2d · viem · @metamask/smart-accounts-kit. Dark `oklch` theme, IBM Plex Mono + Bebas Neue, sharp-radius glass.

**Infra:** Base Sepolia · Neon · Upstash · Vercel (frontend) · long-lived Node host (backend, for SSE).

---

## Deployed addresses

| Contract | Address |
|---|---|
| **VeniceCollapseEnforcer** (ERC-7710 caveat enforcer) | [`0x3ec6F2c470e57f487709b153f77c02851fe864C5`](https://sepolia.basescan.org/address/0x3ec6F2c470e57f487709b153f77c02851fe864C5) |
| **WaveStrategyVault** | [`0x2f4D2c924532DA5190FD14C5ECDb4b8446A8161b`](https://sepolia.basescan.org/address/0x2f4D2c924532DA5190FD14C5ECDb4b8446A8161b) |
| **WaveMarket** | [`0xB642aa23F5320999B44bFD011765F6f529320B7b`](https://sepolia.basescan.org/address/0xB642aa23F5320999B44bFD011765F6f529320B7b) |
| MetaMask DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| Compound V3 Comet (cUSDCv3) | `0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Repository structure

```
wave/
├── backend/                          # Next.js 14 API + contracts
│   ├── app/api/
│   │   ├── session/
│   │   │   ├── create/route.ts       # initSession onchain
│   │   │   ├── route.ts              # list sessions
│   │   │   └── [sessionId]/
│   │   │       ├── route.ts          # GET session
│   │   │       ├── run/route.ts      # full pipeline (R1→R2→collapse→deploy)
│   │   │       ├── stream/route.ts   # SSE
│   │   │       └── grant-delegation/route.ts
│   │   ├── market/                   # GET · list · [id] · [id]/purchase (x402)
│   │   └── x402/inference/route.ts   # x402-gated Venice gateway
│   ├── services/                     # venice · delegation · collapse · execution · market · enforcer · chain · agentWallet
│   ├── lib/                          # db · redis · mutex · logger · constants
│   ├── prisma/schema.prisma
│   └── contracts/                    # Foundry: src/ · script/ · test/ (fork tests)
└── frontend/                         # Next.js 16
    ├── app/                          # the 9 pages
    ├── components/                   # wave-field · debate-floor · wave-terminal · knowledge-graph · session-runner …
    └── lib/                          # wave-api · graph-data · market-x402 · wallet
```

---

## Getting started

### Prerequisites
Node 20+, pnpm, Foundry · a Neon (Postgres) DB + Upstash Redis · a Venice AI key · Base Sepolia RPC + testnet ETH/USDC · **MetaMask Flask** (ERC-7715 is Flask-only).

### Run
```bash
# Backend
cd backend
pnpm install
# create .env.local (see below)
pnpm exec prisma db push        # sync schema to Neon
pnpm dev                        # http://localhost:3001

# Frontend (new terminal)
cd frontend
pnpm install
# set NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
pnpm dev                        # http://localhost:3000

# Contracts (optional — already deployed)
cd backend/contracts
forge test --fork-url $BASE_SEPOLIA_RPC_URL
forge script script/Deploy.s.sol       --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast   # enforcer
forge script script/DeployVault.s.sol   --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast  # vault
forge script script/DeployMarket.s.sol  --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast  # market
```

### `backend/.env.local`
```
DATABASE_URL=                        # Neon Postgres
REDIS_URL=                           # Upstash Redis
BASE_SEPOLIA_RPC_URL=                # Alchemy / Base Sepolia
DEPLOYER_PRIVATE_KEY=                # backend relayer / treasury (testnet)
AGENT_A_PRIVATE_KEY=                 # 3 agent signers
AGENT_B_PRIVATE_KEY=
AGENT_C_PRIVATE_KEY=
VENICE_API_KEY=
VENICE_MODEL=mistral-31-24b
X402_PRICE_USDC=$0.01
VENICE_COLLAPSE_ENFORCER_ADDRESS=0x3ec6F2c470e57f487709b153f77c02851fe864C5
WAVE_STRATEGY_VAULT_ADDRESS=0x2f4D2c924532DA5190FD14C5ECDb4b8446A8161b
WAVE_MARKET_ADDRESS=0xB642aa23F5320999B44bFD011765F6f529320B7b
COMPOUND_COMET_ADDRESS=0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017
NEXT_PUBLIC_APP_URL=http://localhost:3001   # backend's own URL (agents x402-call it)
FRONTEND_ORIGIN=http://localhost:3000       # CORS allowlist
```
Frontend `.env.local`: `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`

---

## Onchain transaction lifecycle

Every step leaves a tx on Base Sepolia, linked from the `wave.log` terminal:

1. `initSession` (session create)
2. **x402 inference settle ×3** (round 1, agent EOA → backend, EIP-3009)
3. **x402 conviction settle ×3** (round 2, scaled by confidence)
4. **`submitReasoningHash` ×3** → enforcer
5. **`WavefunctionCollapsed`** event (inside the 3rd hash tx)
6. *(first run)* gator + Agent A factory deploys
7. **`redeemDelegations`** → DelegationManager (winner-only, budget-bounded)
8. **`supplyTo`** → Compound V3, cUSDC credited to the user
9. *(Wave Market)* `list` · x402 buyer→seller payment · `supplyTo` crediting the buyer

---

## Wave Market

A proven strategy shouldn't die after one use. After a collapse, the owner can **list** it:
- **Provenance-gated** — `WaveMarket.list` reverts unless the enforcer confirms that session collapsed to that winner.
- A buyer pays the **creator directly over x402**, and the protocol **re-executes** the proven strategy for the buyer's own capital, into their own Compound position — no debate to re-run, gated by the same enforcer.
- Surfaced on `/market` (listings with conviction, copies, `proof ↗`, and a live purchase feed) and in the A2A graph (copy-trade edges).

---

## Honest notes
- **Testnet.** Everything runs on Base Sepolia. Compound's testnet supply rate is near-zero (no borrowers) — the position is real, the rate is a testnet artifact; the mainnet venue is the production story.
- **ERC-7715 needs MetaMask Flask.** Without it the demo gracefully falls back to treasury-fronted funding (still credited to the user); the result-card badge shows which path ran.
- **Single venue.** Strategies deploy to Compound V3 today; multi-venue (the real differentiator for the marketplace) is the roadmap.

---

## Tracks
- **Best x402 + ERC-7710** — pay-per-thought + conviction bets, gated by a custom ERC-7710 enforcer; winner-only delegated execution.
- **Best Agent** — three debating strategists with real economic skin in the game and onchain track records.
- **Best A2A Coordination** — ERC-7710 redelegation + agent-to-agent critique, with the onchain collapse as the agreement mechanism.

## License
MIT
