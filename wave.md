# Wave Protocol — Complete Technical Architecture & Implementation Guide

> *Three AI agents simultaneously explore possible actions using Venice AI — their private reasoning collapses into one onchain permission, enforced by a custom caveat, settled by 1Shot, visible as a quantum waveform collapsing in real time.*

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Full System Architecture](#2-full-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Smart Contract Architecture](#4-smart-contract-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Database Design](#7-database-design)
8. [API Design](#8-api-design)
9. [Authentication & Authorization](#9-authentication--authorization)
10. [Infrastructure & Deployment](#10-infrastructure--deployment)
11. [Monitoring, Logging & Observability](#11-monitoring-logging--observability)
12. [Security Considerations](#12-security-considerations)
13. [Folder Structure](#13-folder-structure)
14. [Naming Conventions](#14-naming-conventions)
15. [Required Libraries & Dependencies](#15-required-libraries--dependencies)
16. [Development Workflow](#16-development-workflow)
17. [Testing Strategy](#17-testing-strategy)
18. [Phase-by-Phase Implementation Plan](#18-phase-by-phase-implementation-plan)
19. [Environment Variables Reference](#19-environment-variables-reference)

---

## 1. Project Overview

### What Wave Protocol Does

Wave Protocol is a multi-agent coordination system built on ERC-7710 delegation chains. A user submits a single high-level intent (e.g. "Research X and give me a decision") with a budget. Three specialist AI agents (Research, Analysis, Execution) simultaneously explore that intent in a quantum superposition. Each agent pays for Venice AI inference via x402 — wallet as identity, no API key. Their private `reasoning_content` is hashed and committed onchain. A custom Solidity caveat enforcer (`VeniceCollapseEnforcer`) reads all three hashes, picks the winner by confidence score, and collapses the superposition. Losing agent delegations are revoked in real time via the 1Shot relayer. The winning agent executes within its delegated scope. The frontend animates the whole collapse as a waveform.

### Hackathon Track Coverage

| Track | Mechanism |
|---|---|
| Best A2A Coordination | 3-hop ERC-7710 redelegation + superposition/collapse |
| Best Venice AI | x402 self-funded inference, `reasoning_content` as oracle input |
| Best 1Shot Relayer | x402 facilitator role + EIP-7710 relay + Ed25519 webhook cascade |
| Best x402 + ERC-7710 | x402 pays Venice, ERC-7710 enforces collapse result |

### Why Every Tool Is Load-Bearing

- **Remove MetaMask Smart Accounts Kit** → no scoped permissions, agents get full wallet access
- **Remove Venice AI** → no private inference, no `reasoning_content`, no collapse oracle
- **Remove 1Shot** → no gas abstraction, no x402 settlement, no real-time webhook cascade
- **Remove custom caveat enforcer** → Venice output is decorative, not enforced onchain

---

## 2. Full System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                               │
│  MetaMask Flask (ERC-7715 Advanced Permissions)                     │
│  Next.js 14 App  ←──SSE/WebSocket──  Backend Event Stream          │
└──────────────────┬──────────────────────────────────────────────────┘
                   │  1. Grant root delegation (ERC-7715)
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       BACKEND (Next.js API Routes)                  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Agent A     │  │  Agent B     │  │  Agent C     │             │
│  │  (Research)  │  │  (Analysis)  │  │  (Execution) │             │
│  │  EOA wallet  │  │  EOA wallet  │  │  EOA wallet  │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                  │                     │
│         ▼                 ▼                  ▼                     │
│  ┌─────────────────────────────────────────────────────┐           │
│  │              Venice AI (x402 via 1Shot)             │           │
│  │  venice-x402-client  →  /v1/chat/completions        │           │
│  │  reasoning_content extracted per agent              │           │
│  │  confidence score parsed from structured output     │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────┐           │
│  │          CollapseOrchestrator Service               │           │
│  │  - Hash each agent's reasoning_content (keccak256)  │           │
│  │  - Submit hashes onchain via 1Shot relayer          │           │
│  │  - Monitor VeniceCollapseEnforcer events            │           │
│  │  - Trigger disableDelegation for losers             │           │
│  │  - Stream events to frontend                        │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  1Shot       │  │  PostgreSQL  │  │  Redis       │             │
│  │  Relayer     │  │  (sessions)  │  │  (event bus) │             │
│  │  JSON-RPC    │  │              │  │              │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└──────────────────────────────────────────────────────────────────┬──┘
                                                                   │
                   ┌───────────────────────────────────────────────┘
                   │  EIP-7710 relayed transactions (USDC gas)
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           BASE SEPOLIA                              │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  DelegationManager (MetaMask, 0xdb9B1e94...47dB3)          │    │
│  │  - redeemDelegations(permissionContexts, modes, calldata)  │    │
│  │  - disableDelegation(delegation)                           │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  VeniceCollapseEnforcer.sol  (custom caveat enforcer)      │    │
│  │  - submitReasoningHash(agentId, hash, confidence)          │    │
│  │  - collapseWavefunction() → emits WavefunctionCollapsed    │    │
│  │  - enforceBeforeHook(terms, mode, executionCalldata)       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  User Smart Account (EIP-7702 upgraded EOA)                        │
│  Agent A Smart Account (EIP-7702 upgraded EOA)                     │
│  Agent B Smart Account (EIP-7702 upgraded EOA)                     │
│  Agent C Smart Account (EIP-7702 upgraded EOA)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Narrative

1. User opens app → connects MetaMask Flask → grants root delegation (ERC-7715) with `VeniceCollapseEnforcer` caveat
2. Backend receives root delegation → creates 3 sub-delegations (A→B, A→C, A→D) programmatically, each with narrowing `erc20TransferAmount` caveats
3. 3 agent workers spin up simultaneously → each calls Venice via `venice-x402-client` (wallet = identity, USDC on Base pays inference)
4. Each agent streams `reasoning_content` back to frontend via Server-Sent Events
5. Each agent's `reasoning_content` is structured-output parsed for a 0–100 confidence score
6. Each `reasoning_content` is keccak256 hashed → hash + confidence submitted to `VeniceCollapseEnforcer` via 1Shot relayer
7. `collapseWavefunction()` called → emits `WavefunctionCollapsed(winnerId, winnerHash)`
8. Losing agents: `disableDelegation()` called via 1Shot relayer (Ed25519-signed webhook confirms)
9. Winning agent: `redeemDelegations()` called → executes within delegated scope
10. Frontend receives SSE events throughout → animates waveform collapse in real time

---

## 3. Technology Stack

### Core

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 14.x (App Router) |
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x LTS |
| Package Manager | pnpm | 9.x |
| Smart Contracts | Solidity | 0.8.23 |
| Contract Toolchain | Foundry | latest |

### Blockchain & Wallet

| Tool | Package | Purpose |
|---|---|---|
| MetaMask Smart Accounts Kit | `@metamask/smart-accounts-kit` | ERC-7710 delegation, ERC-7715 permissions, EIP-7702 upgrade |
| Viem | `viem` | EVM client, signing, encoding |
| Venice x402 | `venice-x402-client` | Wallet-native AI inference payments |
| 1Shot Relayer | JSON-RPC direct | EIP-7710 relay, x402 facilitation |
| MetaMask Delegation Framework | `forge install metamask/delegation-framework@v1.3.0` | Base contracts, caveat enforcer interface |

### Backend Services

| Tool | Package | Purpose |
|---|---|---|
| OpenAI SDK (Venice-compatible) | `openai` | Chat completions with Venice base URL |
| Jose | `jose` | Ed25519 JWKS verification for 1Shot webhooks |
| Prisma | `prisma` + `@prisma/client` | ORM for PostgreSQL |
| Redis | `ioredis` | Event bus, session cache |
| Zod | `zod` | Runtime schema validation |

### Frontend

| Tool | Package | Purpose |
|---|---|---|
| React | (via Next.js) | UI |
| Tailwind CSS | `tailwindcss` | Styling |
| Framer Motion | `framer-motion` | Waveform collapse animations |
| D3.js | `d3` | Probability orb physics |
| Wagmi | `wagmi` | React hooks for wallet |
| TanStack Query | `@tanstack/react-query` | Server state |
| Zustand | `zustand` | Client state |

### Infrastructure

| Tool | Purpose |
|---|---|
| Vercel | Next.js hosting, edge functions |
| PlanetScale / Neon | Serverless PostgreSQL |
| Upstash Redis | Serverless Redis |
| Base Sepolia | Testnet |
| Base Sepolia | Demo / Deployment |

---

## 4. Smart Contract Architecture

### 4.1 VeniceCollapseEnforcer.sol

This is the core custom caveat enforcer. It lives in `/contracts/src/VeniceCollapseEnforcer.sol`. The Delegation Manager calls `beforeHook` before permitting any agent to redeem a delegation — if the wavefunction has not collapsed to that agent's ID, execution reverts.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ICaveatEnforcer } from "delegation-framework/src/interfaces/ICaveatEnforcer.sol";
import { ModeCode } from "delegation-framework/src/utils/Types.sol";

/**
 * @title VeniceCollapseEnforcer
 * @notice Caveat enforcer that gates execution on a Venice AI reasoning hash being
 *         submitted onchain and selected as the winning collapse candidate.
 *
 * @dev How it works:
 *  1. Backend submits keccak256(reasoning_content) + confidence (0-100) for each
 *     of the three agents via submitReasoningHash().
 *  2. Once all 3 hashes are submitted, collapseWavefunction() selects the highest-
 *     confidence entry as the winner.
 *  3. The winning agent's delegation has a caveat term encoding:
 *       abi.encode(sessionId, agentId)
 *     The enforcer checks that (sessionId, agentId) == (collapsedSession, collapsedWinner).
 *  4. Losing agents attempting redeemDelegations() will be reverted by this enforcer.
 *
 * @dev Caveat terms ABI encoding:
 *     bytes terms = abi.encode(bytes32 sessionId, uint8 agentId)
 */
contract VeniceCollapseEnforcer is ICaveatEnforcer {

    // ─────────────────────────────────────────────────────── Events ──
    event ReasoningHashSubmitted(
        bytes32 indexed sessionId,
        uint8   indexed agentId,
        bytes32         reasoningHash,
        uint8           confidence
    );

    event WavefunctionCollapsed(
        bytes32 indexed sessionId,
        uint8   indexed winnerAgentId,
        bytes32         winnerHash,
        uint8           winnerConfidence
    );

    // ─────────────────────────────────────────────────────── Types ───
    struct AgentSubmission {
        bytes32 reasoningHash;
        uint8   confidence;      // 0–100
        bool    submitted;
    }

    struct Session {
        mapping(uint8 => AgentSubmission) agents;  // agentId => submission
        uint8   submissionCount;
        uint8   requiredAgents;                    // set at session init (3)
        uint8   winnerAgentId;
        bool    collapsed;
        address initiator;                         // backend EOA that may submit
    }

    // ─────────────────────────────────────────────────── Storage ─────
    mapping(bytes32 => Session) public sessions;

    // ─────────────────────────────────────── Session Lifecycle ────────

    /**
     * @notice Initialize a new collapse session.
     * @param sessionId  Unique ID derived from the user's intent hash.
     * @param agentCount Number of agents in superposition (typically 3).
     */
    function initSession(bytes32 sessionId, uint8 agentCount) external {
        require(sessions[sessionId].initiator == address(0), "Session exists");
        require(agentCount > 0 && agentCount <= 10, "Invalid agent count");
        sessions[sessionId].requiredAgents = agentCount;
        sessions[sessionId].initiator = msg.sender;
    }

    /**
     * @notice Submit a Venice AI reasoning hash for an agent.
     * @param sessionId     Session to submit into.
     * @param agentId       Agent index (0, 1, 2).
     * @param reasoningHash keccak256(reasoning_content string).
     * @param confidence    0–100 score parsed from Venice structured output.
     */
    function submitReasoningHash(
        bytes32 sessionId,
        uint8   agentId,
        bytes32 reasoningHash,
        uint8   confidence
    ) external {
        Session storage s = sessions[sessionId];
        require(s.initiator != address(0),       "Session not found");
        require(msg.sender == s.initiator,        "Not session initiator");
        require(!s.collapsed,                     "Already collapsed");
        require(agentId < s.requiredAgents,       "Invalid agentId");
        require(!s.agents[agentId].submitted,     "Already submitted");
        require(confidence <= 100,                "Confidence out of range");

        s.agents[agentId] = AgentSubmission({
            reasoningHash: reasoningHash,
            confidence:    confidence,
            submitted:     true
        });
        s.submissionCount++;

        emit ReasoningHashSubmitted(sessionId, agentId, reasoningHash, confidence);

        // Auto-collapse when all agents have submitted.
        if (s.submissionCount == s.requiredAgents) {
            _collapse(sessionId);
        }
    }

    /**
     * @dev Pick the highest-confidence agent as the winner.
     */
    function _collapse(bytes32 sessionId) internal {
        Session storage s = sessions[sessionId];
        uint8 winnerAgentId;
        uint8 highestConf;

        for (uint8 i = 0; i < s.requiredAgents; i++) {
            if (s.agents[i].confidence > highestConf) {
                highestConf  = s.agents[i].confidence;
                winnerAgentId = i;
            }
        }

        s.winnerAgentId = winnerAgentId;
        s.collapsed     = true;

        emit WavefunctionCollapsed(
            sessionId,
            winnerAgentId,
            s.agents[winnerAgentId].reasoningHash,
            highestConf
        );
    }

    // ─────────────────────────────────── ICaveatEnforcer Interface ────

    /**
     * @notice Called by DelegationManager before executing a delegation.
     *         Reverts if the wavefunction has not collapsed to this agentId.
     * @param terms  ABI-encoded (bytes32 sessionId, uint8 agentId)
     */
    function beforeHook(
        bytes calldata terms,
        bytes calldata, /* args   */
        ModeCode,       /* mode   */
        bytes calldata, /* executionCalldata */
        bytes32,        /* delegationHash   */
        address,        /* delegator        */
        address         /* redeemer         */
    ) external view override {
        (bytes32 sessionId, uint8 agentId) = abi.decode(terms, (bytes32, uint8));
        Session storage s = sessions[sessionId];

        require(s.collapsed,                  "Wavefunction not yet collapsed");
        require(s.winnerAgentId == agentId,   "This agent did not win collapse");
    }

    /**
     * @notice afterHook — not used; required by interface.
     */
    function afterHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {
        // No-op
    }

    // ─────────────────────────────────────────── View Helpers ─────────

    function getSession(bytes32 sessionId)
        external
        view
        returns (
            uint8   submissionCount,
            uint8   requiredAgents,
            uint8   winnerAgentId,
            bool    collapsed,
            address initiator
        )
    {
        Session storage s = sessions[sessionId];
        return (
            s.submissionCount,
            s.requiredAgents,
            s.winnerAgentId,
            s.collapsed,
            s.initiator
        );
    }

    function getAgentSubmission(bytes32 sessionId, uint8 agentId)
        external
        view
        returns (bytes32 reasoningHash, uint8 confidence, bool submitted)
    {
        AgentSubmission storage a = sessions[sessionId].agents[agentId];
        return (a.reasoningHash, a.confidence, a.submitted);
    }
}
```

### 4.2 Foundry Setup

**`/contracts/foundry.toml`**

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

**Install dependencies:**

```bash
cd contracts
forge install metamask/delegation-framework@v1.3.0 --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
```

**Deploy script (`/contracts/script/Deploy.s.sol`):**

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

```bash
forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  --private-key $DEPLOYER_PRIVATE_KEY \
  -vvvv
```

### 4.3 Delegation Chain Structure

```
User Smart Account (EIP-7702 upgraded)
  └── Root Delegation (User → Agent A)
        scope: erc20TransferAmount, USDC, max $10
        caveats:
          - erc20TransferAmount: max $10
          - VeniceCollapseEnforcer: terms = abi.encode(sessionId, agentId=0)
        signed: by User via ERC-7715

        ├── Sub-delegation A→B (Research Agent)
        │     scope: erc20TransferAmount, USDC, max $4
        │     caveats:
        │       - erc20TransferAmount: max $4
        │       - allowedTargets: [Venice x402 endpoint address]
        │       - VeniceCollapseEnforcer: terms = abi.encode(sessionId, agentId=0)
        │     signed: by Agent A (server-side)
        │
        ├── Sub-delegation A→C (Analysis Agent)
        │     scope: erc20TransferAmount, USDC, max $3.5
        │     caveats:
        │       - erc20TransferAmount: max $3.50
        │       - allowedTargets: [Venice x402 endpoint address]
        │       - VeniceCollapseEnforcer: terms = abi.encode(sessionId, agentId=1)
        │     signed: by Agent A (server-side)
        │
        └── Sub-delegation A→D (Execution Agent)
              scope: erc20TransferAmount, USDC, max $2.5
              caveats:
                - erc20TransferAmount: max $2.50
                - allowedTargets: [Venice x402 endpoint address]
                - VeniceCollapseEnforcer: terms = abi.encode(sessionId, agentId=2)
              signed: by Agent A (server-side)
```

**Important:** Caveats are accumulative and monotonic. Each child inherits all parent restrictions and may only add more — never remove them.

---

## 5. Backend Architecture

### 5.1 Overview

The backend is structured as a set of Next.js API Routes (App Router) with a clear service layer. Long-running processes (agent execution, event streaming) use Next.js Route Handlers with streaming responses.

### 5.2 Service Layer

#### `AgentWalletService`

Manages server-side EOA wallets for Agent A, B, C. Wallets are derived from environment-variable private keys and represented as `MetaMaskSmartAccount` instances.

```typescript
// services/agentWalletService.ts
import {
  createWalletClient,
  http,
  privateKeyToAccount,
} from 'viem'
import {
  toMetaMaskSmartAccount,
  Implementation,
} from '@metamask/smart-accounts-kit'
import { baseSepolia } from 'viem/chains'
import type { Address, Hex } from 'viem'

export type AgentId = 0 | 1 | 2

interface AgentWallet {
  account:      ReturnType<typeof privateKeyToAccount>
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>
  address:      Address
}

const AGENT_KEYS: [Hex, Hex, Hex] = [
  process.env.AGENT_A_PRIVATE_KEY as Hex,
  process.env.AGENT_B_PRIVATE_KEY as Hex,
  process.env.AGENT_C_PRIVATE_KEY as Hex,
]

let _agents: AgentWallet[] | null = null

export async function getAgentWallets(): Promise<AgentWallet[]> {
  if (_agents) return _agents

  const chain = baseSepolia

  _agents = await Promise.all(
    AGENT_KEYS.map(async (key) => {
      const account = privateKeyToAccount(key)
      const client  = createWalletClient({ account, chain, transport: http() })

      const smartAccount = await toMetaMaskSmartAccount({
        client,
        implementation: Implementation.Hybrid,
        deployParams:   [account.address, [], [], []],
        deploySalt:     '0x0',
        signer:         account,
      })

      return { account, smartAccount, address: smartAccount.address }
    })
  )

  return _agents
}
```

#### `DelegationService`

Handles the full delegation lifecycle: creating root delegation, sub-delegations, committing hashes, disabling losing delegations.

```typescript
// services/delegationService.ts
import {
  createDelegation,
  ScopeType,
  type Delegation,
  type SignedDelegation,
} from '@metamask/smart-accounts-kit'
import { parseUnits, keccak256, toBytes, encodeAbiParameters, parseAbiParameters } from 'viem'
import { getAgentWallets }          from './agentWalletService'
import { OneShotRelayerService }    from './oneShotRelayerService'
import type { Address, Hex }        from 'viem'

export interface SubDelegationSet {
  sessionId:        Hex
  agentDelegations: SignedDelegation[]   // index 0=Research, 1=Analysis, 2=Execution
}

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address // Base Sepolia USDC
const ENFORCER_ADDRESS = process.env.VENICE_COLLAPSE_ENFORCER_ADDRESS as Address

/**
 * Create the 3 sub-delegations (Agent A → B, A → C, A → D)
 * from a signed root delegation that the user granted to Agent A.
 */
export async function createSubDelegations(params: {
  sessionId:       Hex
  rootDelegation:  SignedDelegation  // User → Agent A
  budgets:         [bigint, bigint, bigint]  // [researchMax, analysisMax, executionMax] in USDC smallest unit
}): Promise<SubDelegationSet> {
  const { sessionId, rootDelegation, budgets } = params
  const agents = await getAgentWallets()
  const agentA = agents[0]

  const agentDelegations: SignedDelegation[] = await Promise.all(
    [0, 1, 2].map(async (agentId) => {
      const targetAgent = agents[agentId]

      const terms = encodeAbiParameters(
        parseAbiParameters('bytes32 sessionId, uint8 agentId'),
        [sessionId, agentId]
      )

      const delegation = createDelegation({
        scope: {
          type:         ScopeType.Erc20TransferAmount,
          tokenAddress: USDC_ADDRESS,
          maxAmount:    budgets[agentId],
        },
        to:              targetAgent.smartAccount.address,
        from:            agentA.smartAccount.address,
        parentDelegation: rootDelegation,
        environment:     agentA.smartAccount.environment,
        caveats: [
          {
            enforcer: ENFORCER_ADDRESS,
            terms,
            args:     '0x',
          },
        ],
      })

      return agentA.smartAccount.signDelegation({ delegation })
    })
  )

  return { sessionId, agentDelegations }
}

/**
 * Hash the reasoning content from Venice AI.
 * Returns a keccak256 hex digest.
 */
export function hashReasoningContent(reasoningContent: string): Hex {
  return keccak256(toBytes(reasoningContent))
}

/**
 * Disable a losing agent's delegation via 1Shot relayer.
 */
export async function disableLoserDelegation(
  relayer: OneShotRelayerService,
  delegation: SignedDelegation
): Promise<string> {
  return relayer.disableDelegation(delegation)
}
```

#### `VeniceAgentService`

Runs one agent: calls Venice via x402, streams `reasoning_content`, parses structured output, returns `{ reasoning, confidence }`.

```typescript
// services/veniceAgentService.ts
import { VeniceClient }    from 'venice-x402-client'
import { z }               from 'zod'
import type { Hex }        from 'viem'

// One VeniceClient per agent wallet private key
const agentClients: Record<number, VeniceClient> = {}

function getClient(agentPrivateKey: Hex): VeniceClient {
  // Cache by key — VeniceClient handles x402 auth internally
  const key = agentPrivateKey.slice(0, 10)
  if (!agentClients[key as any]) {
    agentClients[key as any] = new VeniceClient(agentPrivateKey, {
      autoTopUp: { enabled: true, amount: 5 },
    })
  }
  return agentClients[key as any]
}

// Structured output schema Venice must return
const AgentOutputSchema = z.object({
  summary:    z.string(),
  confidence: z.number().min(0).max(100),
  action:     z.string(),
  reasoning:  z.string(),
})

export type AgentOutput = z.infer<typeof AgentOutputSchema>

export interface AgentResult {
  agentId:          number
  reasoning_content: string
  confidence:       number
  output:           AgentOutput
}

const SYSTEM_PROMPT = (role: string) => `
You are a specialist AI agent performing ${role} for a user intent.
You MUST respond with a JSON object containing these exact fields:
{
  "summary":    "brief summary of your finding",
  "confidence": <integer 0-100 representing your confidence this is the best path>,
  "action":     "the concrete action you recommend",
  "reasoning":  "your full reasoning chain"
}
Do not include any text outside the JSON object.
`

const ROLES = ['Research', 'Analysis', 'Execution']

/**
 * Run a single agent against Venice AI using x402 wallet auth.
 * Returns the full agent result including reasoning_content.
 */
export async function runAgent(params: {
  agentId:         number
  agentPrivateKey: Hex
  userIntent:      string
  onChunk?:        (chunk: string) => void   // streaming callback
}): Promise<AgentResult> {
  const { agentId, agentPrivateKey, userIntent, onChunk } = params
  const client = getClient(agentPrivateKey)

  const rawResponse = await client.chat({
    model: 'deepseek-r1-671b',  // Venice model with reasoning_content support
    messages: [
      { role: 'system',  content: SYSTEM_PROMPT(ROLES[agentId]) },
      { role: 'user',    content: userIntent },
    ],
    venice_parameters: {
      include_venice_system_prompt: false,
    },
  })

  const reasoning_content: string =
    (rawResponse.choices[0]?.message as any)?.reasoning_content ?? ''
  const rawContent = rawResponse.choices[0]?.message?.content ?? '{}'

  if (onChunk) onChunk(reasoning_content)

  const parsed = AgentOutputSchema.safeParse(JSON.parse(rawContent))
  if (!parsed.success) {
    throw new Error(`Agent ${agentId} returned invalid structured output: ${parsed.error.message}`)
  }

  return {
    agentId,
    reasoning_content,
    confidence: parsed.data.confidence,
    output:     parsed.data,
  }
}
```

#### `OneShotRelayerService`

Wraps the 1Shot JSON-RPC relayer for all onchain operations.

```typescript
// services/oneShotRelayerService.ts
import type { SignedDelegation } from '@metamask/smart-accounts-kit'
import {
  DelegationManager,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import type { Address, Hex }    from 'viem'

const RELAYER_ENDPOINT = 'https://relayer.1shotapi.com/relayers'
const CHAIN_ID = 84532 // Base Sepolia

interface RelayerCapabilities {
  targetAddress: Address
  feeCollector:  Address
  tokens: Array<{
    address: Address
    symbol:  string
    decimals: number
  }>
}

let _capabilities: RelayerCapabilities | null = null

export class OneShotRelayerService {

  async getCapabilities(): Promise<RelayerCapabilities> {
    if (_capabilities) return _capabilities
    const res = await fetch(RELAYER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method:  'relayer_getCapabilities',
        params:  [{ chainId: CHAIN_ID }],
        id:      1,
      }),
    })
    const data = await res.json()
    _capabilities = data.result as RelayerCapabilities
    return _capabilities
  }

  async getFeeData(params: {
    chainId:       number
    tokenAddress:  Address
    targetAddress: Address
  }) {
    const res = await fetch(RELAYER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method:  'relayer_getFeeData',
        params:  [params],
        id:      2,
      }),
    })
    const data = await res.json()
    return data.result // { gasPrice, rate, minFee, expiry, context }
  }

  /**
   * Relay an EIP-7710 transaction through the 1Shot permissionless relayer.
   * Returns a TaskId for status polling or webhook receipt.
   */
  async send7710Transaction(params: {
    delegationContext:  Hex
    transactions:       Hex[]
    destinationUrl?:    string
    authorizationList?: any[]
  }): Promise<string> {
    const capabilities = await this.getCapabilities()
    const feeData      = await this.getFeeData({
      chainId:      CHAIN_ID,
      tokenAddress: capabilities.tokens[0].address,
      targetAddress: capabilities.targetAddress,
    })

    const res = await fetch(RELAYER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method:  'relayer_send7710Transaction',
        params:  [{
          chainId:           CHAIN_ID,
          delegationContext:  params.delegationContext,
          transactions:       params.transactions,
          context:            feeData.context,  // price-locked context
          destinationUrl:     params.destinationUrl,
          authorizationList:  params.authorizationList,
        }],
        id: 3,
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(`1Shot error: ${JSON.stringify(data.error)}`)
    return data.result.taskId as string
  }

  /**
   * Disable a delegation (for losing agents) via the 1Shot relayer.
   */
  async disableDelegation(delegation: SignedDelegation): Promise<string> {
    const env = getSmartAccountsEnvironment(CHAIN_ID)
    const calldata = DelegationManager.encode.disableDelegation({ delegation })

    // This is a direct call to DelegationManager — encode as a simple execution
    return this.send7710Transaction({
      permissionContext: '0x',  // no delegation needed; initiator is direct caller
      executions: [calldata],
      destinationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/1shot`,
    })
  }

  /**
   * Poll for task status. Use webhooks in production.
   */
  async getStatus(taskId: string): Promise<{
    status: 'Pending' | 'Submitted' | 'Confirmed' | 'Rejected' | 'Reverted'
    txHash?: Hex
  }> {
    const res = await fetch(RELAYER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method:  'relayer_getStatus',
        params:  [{ taskId }],
        id:      4,
      }),
    })
    const data = await res.json()
    return data.result
  }
}
```

#### `CollapseOrchestratorService`

Coordinates the full collapse lifecycle after Venice returns.

```typescript
// services/collapseOrchestratorService.ts
import { keccak256, toBytes, encodeAbiParameters, parseAbiParameters } from 'viem'
import { hashReasoningContent } from './delegationService'
import { OneShotRelayerService } from './oneShotRelayerService'
import { getPublicClient }       from './chainService'
import type { AgentResult }      from './veniceAgentService'
import type { Hex, Address }     from 'viem'

const ENFORCER_ABI = [
  {
    name: 'submitReasoningHash',
    type: 'function',
    inputs: [
      { name: 'sessionId',     type: 'bytes32' },
      { name: 'agentId',       type: 'uint8'   },
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'confidence',    type: 'uint8'   },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'WavefunctionCollapsed',
    type: 'event',
    inputs: [
      { name: 'sessionId',        type: 'bytes32', indexed: true  },
      { name: 'winnerAgentId',    type: 'uint8',   indexed: true  },
      { name: 'winnerHash',       type: 'bytes32', indexed: false },
      { name: 'winnerConfidence', type: 'uint8',   indexed: false },
    ],
  },
] as const

export interface CollapseResult {
  sessionId:     Hex
  winnerAgentId: number
  winnerHash:    Hex
  taskIds:       string[]   // 1Shot task IDs for hash submissions
}

export class CollapseOrchestratorService {
  constructor(
    private relayer:          OneShotRelayerService,
    private enforcerAddress:  Address
  ) {}

  /**
   * Submit all agent reasoning hashes to VeniceCollapseEnforcer.
   * Returns task IDs from 1Shot relayer.
   */
  async submitHashes(params: {
    sessionId:    Hex
    agentResults: AgentResult[]
    webhookUrl:   string
  }): Promise<string[]> {
    const { sessionId, agentResults, webhookUrl } = params

    const taskIds = await Promise.all(
      agentResults.map(async (result) => {
        const reasoningHash = hashReasoningContent(result.reasoning_content)

        const calldata = encodeFunctionData({
          abi:          ENFORCER_ABI,
          functionName: 'submitReasoningHash',
          args:         [sessionId, result.agentId, reasoningHash, result.confidence],
        })

        return this.relayer.send7710Transaction({
          permissionContext: '0x',
          executions:        [calldata],
          destinationUrl:    webhookUrl,
        })
      })
    )

    return taskIds
  }

  /**
   * Watch for WavefunctionCollapsed event onchain.
   */
  async waitForCollapse(sessionId: Hex): Promise<{
    winnerAgentId: number
    winnerHash:    Hex
  }> {
    const publicClient = getPublicClient()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unwatch()
        reject(new Error('Collapse timeout after 60s'))
      }, 60_000)

      const unwatch = publicClient.watchContractEvent({
        address:   this.enforcerAddress,
        abi:       ENFORCER_ABI,
        eventName: 'WavefunctionCollapsed',
        args:      { sessionId },
        onLogs: (logs) => {
          if (logs.length > 0) {
            clearTimeout(timeout)
            unwatch()
            const log = logs[0]
            resolve({
              winnerAgentId: Number(log.args.winnerAgentId),
              winnerHash:    log.args.winnerHash as Hex,
            })
          }
        },
      })
    })
  }
}

// Need encodeFunctionData from viem
import { encodeFunctionData } from 'viem'
```

### 5.3 API Route Handlers

#### `POST /api/session/create`

Creates a new Wave Protocol session. Initializes the enforcer contract.

**Request:**
```json
{
  "userIntent": "Research Ethereum L2 scaling solutions and recommend the best investment",
  "budgetUsdc":  10.00,
  "userAddress": "0x..."
}
```

**Response:**
```json
{
  "sessionId":       "0xabc123...",
  "agentAddresses":  ["0x...", "0x...", "0x..."],
  "delegationSetup": "pending"
}
```

#### `POST /api/session/:sessionId/grant-delegation`

Called after user grants root delegation via ERC-7715 in the frontend.

**Request:**
```json
{
  "permissionContext": "0x...",
  "delegationManager": "0x...",
  "accountMetadata": []
}
```

#### `GET /api/session/:sessionId/stream` (Server-Sent Events)

Streams real-time events to the frontend throughout the collapse lifecycle.

**Event types:**
```
event: agent_reasoning
data: {"agentId": 0, "chunk": "Analyzing market data..."}

event: hash_submitted
data: {"agentId": 0, "taskId": "abc", "hash": "0x..."}

event: hash_confirmed
data: {"agentId": 0, "txHash": "0x...", "confidence": 87}

event: wavefunction_collapsed
data: {"winnerAgentId": 1, "winnerHash": "0x...", "winnerConfidence": 87}

event: delegation_disabled
data: {"agentId": 0, "taskId": "xyz"}

event: execution_complete
data: {"agentId": 1, "result": {...}, "txHash": "0x..."}
```

#### `POST /api/webhook/1shot`

Receives signed webhook callbacks from the 1Shot relayer. Verifies Ed25519 signature against JWKS.

```typescript
// app/api/webhook/1shot/route.ts
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { redis }                          from '@/lib/redis'
import type { NextRequest }               from 'next/server'

const JWKS_URL = 'https://relayer.1shotapi.com/.well-known/jwks.json'
const jwks     = createRemoteJWKSet(new URL(JWKS_URL))

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('x-signature') ?? ''

  // Verify Ed25519 signature
  try {
    await jwtVerify(signature, jwks)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const event = JSON.parse(body) as {
    taskId: string
    status: 'Confirmed' | 'Rejected' | 'Reverted'
    txHash?: string
    meta?:   Record<string, string>
  }

  // Publish to Redis for SSE consumers
  await redis.publish(
    `session:${event.meta?.sessionId}`,
    JSON.stringify({ type: 'task_update', ...event })
  )

  return new Response('OK', { status: 200 })
}
```

#### `POST /api/session/:sessionId/run`

Triggers the full agent execution pipeline.

```typescript
// app/api/session/[sessionId]/run/route.ts
import { runAgent }                       from '@/services/veniceAgentService'
import { createSubDelegations }           from '@/services/delegationService'
import { CollapseOrchestratorService }    from '@/services/collapseOrchestratorService'
import { OneShotRelayerService }          from '@/services/oneShotRelayerService'
import { getAgentWallets }                from '@/services/agentWalletService'
import { redis }                          from '@/lib/redis'
import { db }                             from '@/lib/db'
import type { NextRequest }               from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params
  const { userIntent } = await req.json()

  const session = await db.session.findUniqueOrThrow({
    where: { sessionId },
  })

  const agents  = await getAgentWallets()
  const relayer = new OneShotRelayerService()

  // Emit: agents starting
  await redis.publish(`session:${sessionId}`, JSON.stringify({
    type: 'agents_started',
  }))

  // Run all 3 agents in parallel
  const agentResults = await Promise.all(
    [0, 1, 2].map((agentId) =>
      runAgent({
        agentId,
        agentPrivateKey: (agents[agentId].account as any).source.privateKey,
        userIntent,
        onChunk: async (chunk) => {
          await redis.publish(`session:${sessionId}`, JSON.stringify({
            type:    'agent_reasoning',
            agentId,
            chunk,
          }))
        },
      })
    )
  )

  // Submit hashes onchain via 1Shot
  const orchestrator = new CollapseOrchestratorService(
    relayer,
    process.env.VENICE_COLLAPSE_ENFORCER_ADDRESS as `0x${string}`
  )

  const taskIds = await orchestrator.submitHashes({
    sessionId:    sessionId as `0x${string}`,
    agentResults,
    webhookUrl:   `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/1shot`,
  })

  // Wait for collapse event onchain
  const { winnerAgentId, winnerHash } = await orchestrator.waitForCollapse(
    sessionId as `0x${string}`
  )

  // Disable losing delegations
  const loserIds = [0, 1, 2].filter((id) => id !== winnerAgentId)
  await Promise.all(
    loserIds.map((loserId) =>
      relayer.disableDelegation(session.agentDelegations[loserId])
    )
  )

  await redis.publish(`session:${sessionId}`, JSON.stringify({
    type:          'wavefunction_collapsed',
    winnerAgentId,
    winnerHash,
    winnerOutput:  agentResults[winnerAgentId].output,
  }))

  return Response.json({ winnerAgentId, winnerHash })
}
```

---

## 6. Frontend Architecture

### 6.1 Pages & Routing Structure

The app uses the Next.js 14 App Router. Below is the complete routing structure.

```
app/
├── layout.tsx                    # Root layout — providers, global CSS
├── page.tsx                      # Landing / Home page
├── session/
│   ├── new/
│   │   └── page.tsx              # Intent input + wallet connection
│   └── [sessionId]/
│       ├── page.tsx              # Live session view (waveform + orbs)
│       └── result/
│           └── page.tsx          # Post-collapse result + block explorer
├── about/
│   └── page.tsx                  # How it works + architecture
└── api/
    └── ...                       # Route handlers (see backend section)
```

### 6.2 Pages — Purpose & Components

#### Page 1: Landing (`/`)

**Purpose:** Marketing/explainer. One-click CTA to start a session.

**Components:**
- `HeroSection` — title, tagline, animated background of quantum orbs
- `HowItWorksSection` — 4-step visual flow
- `TrackBadges` — showing 4 hackathon tracks covered
- `CTAButton` — routes to `/session/new`

#### Page 2: New Session (`/session/new`)

**Purpose:** Wallet connection, intent input, budget setting, ERC-7715 permission grant.

**Components:**
- `WalletConnector` — MetaMask connection using `wagmi`
- `IntentInput` — textarea for the user's intent
- `BudgetSlider` — sets total USDC budget ($1–$50)
- `AgentPreview` — shows the 3 agent roles and budget split
- `PermissionGrantButton` — triggers ERC-7715 `wallet_grantPermissions` call
- `PermissionStatus` — shows pending/granted state

**State (Zustand):**
```typescript
interface NewSessionStore {
  intent:          string
  budgetUsdc:      number
  walletConnected: boolean
  permissionState: 'idle' | 'pending' | 'granted' | 'error'
  sessionId:       string | null
  setIntent:       (v: string) => void
  setBudget:       (v: number) => void
  grantPermission: () => Promise<void>
}
```

**ERC-7715 grant flow:**
```typescript
// hooks/usePermissionGrant.ts
import { useWalletClient }   from 'wagmi'
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions'

export function usePermissionGrant() {
  const { data: walletClient } = useWalletClient()

  return async (params: {
    sessionId:        string
    agentAAddress:    `0x${string}`
    budgetUsdc:       number
    enforcerAddress:  `0x${string}`
  }) => {
    if (!walletClient) throw new Error('No wallet connected')

    const client = walletClient.extend(erc7715ProviderActions())

    const [permissionResponse] = await walletClient.requestExecutionPermissions([{
      chainId: 84532,   // Base Sepolia
      expiry:  Math.floor(Date.now() / 1000) + 3600,  // 1 hour
      to: params.agentAAddress,
      permission: {
        type:                'erc20-token-periodic',
        isAdjustmentAllowed: false,
        data: {
          tokenAddress:   '0x036CbD53842c5426634e7929541eC2318f3dCF7e',  // USDC Base Sepolia
          periodDuration: 3600,
          periodAmount:   BigInt(Math.floor(params.budgetUsdc * 1e6)),
        },
      },
    }])

    return permissionResponse
  }
}
```

#### Page 3: Live Session (`/session/[sessionId]`)

**Purpose:** The core demo page. Shows the quantum superposition in real time, then collapses.

**Sub-components:**

| Component | Description |
|---|---|
| `WaveformCanvas` | D3/Canvas animated waveform showing 3 overlapping probability waves |
| `OrbCluster` | 3 glowing orbs using Framer Motion. Each orb has a probability label |
| `AgentPanel` | 3 side-by-side panels, one per agent, showing `reasoning_content` as it streams |
| `CollapseOverlay` | Full-screen dramatic collapse animation when winner is chosen |
| `HashTimeline` | Timeline of: hashes submitted → confirmed → collapsed → delegations disabled |
| `BlockExplorerLink` | Links to block explorer for each onchain tx |

**SSE Client Hook:**
```typescript
// hooks/useSessionEvents.ts
import { useEffect, useState } from 'react'

export interface SessionEvent {
  type:            string
  agentId?:        number
  chunk?:          string
  hash?:           string
  txHash?:         string
  winnerAgentId?:  number
  winnerOutput?:   any
}

export function useSessionEvents(sessionId: string) {
  const [events, setEvents] = useState<SessionEvent[]>([])

  useEffect(() => {
    if (!sessionId) return

    const source = new EventSource(`/api/session/${sessionId}/stream`)

    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as SessionEvent
      setEvents((prev) => [...prev, event])
    }

    return () => source.close()
  }, [sessionId])

  return events
}
```

**Framer Motion collapse animation:**
```typescript
// components/OrbCluster.tsx
import { motion, AnimatePresence } from 'framer-motion'

interface Orb {
  agentId:     number
  label:       string
  probability: number
  isWinner?:   boolean
  isLoser?:    boolean
}

export function OrbCluster({ orbs, collapsed }: { orbs: Orb[], collapsed: boolean }) {
  return (
    <div className="relative flex items-center justify-center gap-16 h-64">
      {orbs.map((orb) => (
        <AnimatePresence key={orb.agentId}>
          {!orb.isLoser && (
            <motion.div
              className="relative"
              initial={{ scale: 1, opacity: 1 }}
              animate={collapsed && orb.isWinner
                ? { scale: 1.5, opacity: 1, filter: 'brightness(2)' }
                : {}}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
            >
              {/* Probability orb */}
              <div
                className="w-24 h-24 rounded-full border-2"
                style={{
                  background: `radial-gradient(circle, #6366f1 ${orb.probability}%, transparent)`,
                  boxShadow: `0 0 ${orb.probability}px rgba(99,102,241,0.8)`,
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-white font-bold">
                {orb.probability}%
              </span>
              <span className="block text-center text-sm mt-2 text-gray-400">{orb.label}</span>
            </motion.div>
          )}
        </AnimatePresence>
      ))}
    </div>
  )
}
```

#### Page 4: Result (`/session/[sessionId]/result`)

**Purpose:** Post-collapse summary. Shows what the winning agent recommended, all onchain evidence, and block explorer links.

**Components:**
- `WinnerCard` — shows winning agent, confidence score, reasoning, recommendation
- `EvidenceTimeline` — all onchain tx hashes with block explorer links
- `DelegationDisabledBadge` — for each losing agent, shows `disabledDelegations(hash) = true`
- `ShareButton` — share the result URL

#### Page 5: About (`/about`)

**Purpose:** Architecture explainer for judges and curious users.

**Components:**
- `ArchitectureDiagram` — SVG architecture diagram
- `TrackBreakdown` — how each track is hit
- `FAQ` — technical FAQ

### 6.3 State Management

**Zustand Stores:**

```typescript
// store/sessionStore.ts
interface SessionStore {
  // Session state
  sessionId:       string | null
  userIntent:      string
  budgetUsdc:      number
  permissionCtx:   string | null

  // Agent state
  agents: {
    id:          number
    label:       string
    probability: number
    reasoning:   string
    confidence:  number | null
    hash:        string | null
    txHash:      string | null
    status:      'idle' | 'running' | 'hashed' | 'confirmed' | 'winner' | 'loser'
  }[]

  // Collapse state
  collapsed:       boolean
  winnerAgentId:   number | null
  winnerOutput:    any | null

  // Actions
  setSessionId:    (id: string) => void
  setPermissionCtx: (ctx: string) => void
  appendReasoning: (agentId: number, chunk: string) => void
  setAgentHash:    (agentId: number, hash: string) => void
  collapseToWinner: (winnerId: number) => void
}
```

**React Query for server state:**
```typescript
// hooks/useSession.ts
import { useQuery } from '@tanstack/react-query'

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn:  () => fetch(`/api/session/${sessionId}`).then((r) => r.json()),
    refetchInterval: 5000,
  })
}
```

### 6.4 Component Architecture

```
components/
├── ui/                          # Primitive UI components (shadcn-style)
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Input.tsx
│   ├── Badge.tsx
│   └── Spinner.tsx
├── wallet/
│   ├── WalletConnector.tsx      # MetaMask connect button
│   ├── WalletStatus.tsx         # Connected address display
│   └── PermissionGrantButton.tsx # ERC-7715 grant trigger
├── session/
│   ├── IntentInput.tsx
│   ├── BudgetSlider.tsx
│   └── AgentPreview.tsx
├── live/
│   ├── WaveformCanvas.tsx       # D3 animated waveform
│   ├── OrbCluster.tsx           # Framer Motion orbs
│   ├── AgentPanel.tsx           # Reasoning stream display
│   ├── HashTimeline.tsx         # Onchain event timeline
│   └── CollapseOverlay.tsx      # Full-screen collapse animation
├── result/
│   ├── WinnerCard.tsx
│   ├── EvidenceTimeline.tsx
│   └── DelegationDisabledBadge.tsx
└── layout/
    ├── Header.tsx
    ├── Footer.tsx
    └── Providers.tsx            # wagmi, TanStack Query, Zustand providers
```

### 6.5 Providers Setup

```typescript
// components/layout/Providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { baseSepolia }                        from 'wagmi/chains'
import { metaMask }                           from 'wagmi/connectors'
import { useState }                           from 'react'

const wagmiConfig = createConfig({
  chains:     [baseSepolia],
  connectors: [metaMask()],
  transports: {
    [baseSepolia.id]: http(),
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### 6.6 UI Library Recommendations

Use **Tailwind CSS** with a hand-crafted design system (no component library lock-in). Optionally install `shadcn/ui` for primitives (Button, Card, Input). The visual identity should be dark, deep-space, quantum-themed:

- Background: `#050510` (near-black with blue undertone)
- Primary: `#6366f1` (indigo)
- Glow: `rgba(99,102,241,0.6)` with `box-shadow`
- Font: `Inter` for body, `Geist Mono` for hashes and code
- Collapse animation: `framer-motion` with `AnimatePresence` for orb exit + winner scale-up

### 6.7 Form Handling

Use `react-hook-form` + `zod` for the intent input form:

```typescript
// schemas/sessionSchema.ts
import { z } from 'zod'

export const NewSessionSchema = z.object({
  intent:     z.string().min(20, 'Intent must be at least 20 characters').max(500),
  budgetUsdc: z.number().min(1).max(50),
})

export type NewSessionInput = z.infer<typeof NewSessionSchema>
```

---

## 7. Database Design

### 7.1 Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id              String   @id @default(cuid())
  sessionId       String   @unique  // hex bytes32 — matches onchain sessionId
  userAddress     String
  userIntent      String
  budgetUsdc      Float
  status          SessionStatus @default(PENDING)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Root delegation context (from ERC-7715)
  permissionContext  String?  // hex encoded
  delegationManager  String?  // address

  // Agent sub-delegations (JSON — signed Delegation objects)
  agentDelegations   Json?

  // Agent results
  agentResults       AgentResult[]

  // Collapse result
  winnerAgentId      Int?
  winnerHash         String?  // hex
  collapseTaskId     String?  // 1Shot task ID

  @@index([userAddress])
  @@index([status])
}

enum SessionStatus {
  PENDING
  DELEGATION_GRANTED
  AGENTS_RUNNING
  HASHES_SUBMITTED
  COLLAPSED
  EXECUTED
  FAILED
}

model AgentResult {
  id               String   @id @default(cuid())
  sessionId        String
  session          Session  @relation(fields: [sessionId], references: [sessionId])
  agentId          Int      // 0, 1, 2
  role             String   // "Research", "Analysis", "Execution"
  reasoningContent String   @db.Text
  reasoningHash    String   // keccak256 hex
  confidence       Int      // 0–100
  structuredOutput Json
  hashTaskId       String?  // 1Shot task ID
  hashTxHash       String?  // confirmed tx hash
  delegationDisabled Boolean @default(false)
  createdAt        DateTime @default(now())

  @@unique([sessionId, agentId])
  @@index([sessionId])
}

model OneShotTask {
  id           String   @id
  taskId       String   @unique
  sessionId    String
  purpose      String   // "hash_submission" | "disable_delegation" | "execute"
  agentId      Int?
  status       TaskStatus @default(PENDING)
  txHash       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([sessionId])
  @@index([taskId])
}

enum TaskStatus {
  PENDING
  SUBMITTED
  CONFIRMED
  REJECTED
  REVERTED
}
```

### 7.2 Key Queries

```typescript
// lib/db.ts — Prisma client singleton
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

---

## 8. API Design

### 8.1 Complete Endpoint Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/session/create` | Create session, init enforcer |
| `POST` | `/api/session/:id/grant-delegation` | Store granted ERC-7715 context |
| `POST` | `/api/session/:id/run` | Trigger 3-agent execution |
| `GET` | `/api/session/:id/stream` | SSE event stream |
| `GET` | `/api/session/:id` | Get session state |
| `POST` | `/api/webhook/1shot` | 1Shot relayer webhook receiver |

### 8.2 Error Response Format

```typescript
interface APIError {
  error:   string     // human-readable message
  code:    string     // machine-readable e.g. "SESSION_NOT_FOUND"
  details?: unknown   // optional extra context
}
```

### 8.3 SSE Implementation

```typescript
// app/api/session/[sessionId]/stream/route.ts
import { redis } from '@/lib/redis'
import type { NextRequest } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params

  const encoder = new TextEncoder()
  const stream  = new ReadableStream({
    start(controller) {
      const subscriber = redis.duplicate()
      subscriber.subscribe(`session:${sessionId}`, (err) => {
        if (err) controller.close()
      })

      subscriber.on('message', (_, message) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`))
      })

      req.signal.addEventListener('abort', () => {
        subscriber.unsubscribe()
        subscriber.quit()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
```

---

## 9. Authentication & Authorization

### 9.1 User Authentication

Wave Protocol does not require a traditional login. The user's Ethereum address is their identity. All actions are tied to the address that connected MetaMask.

Session creation requires the caller to provide a valid `userAddress`. The session is bound to that address. No JWT tokens are used for the public demo. If you add account persistence, use `next-auth` with `siwe` (Sign-In With Ethereum).

### 9.2 Backend Agent Security

- Agent private keys (`AGENT_A_PRIVATE_KEY`, `AGENT_B_PRIVATE_KEY`, `AGENT_C_PRIVATE_KEY`) are stored as environment variables, never committed to git.
- Agent wallets only ever hold enough USDC to cover Venice inference + gas for the current session.
- All agent operations are scoped by the delegation caveats — they physically cannot exceed their authorized budget.

### 9.3 Webhook Security (1Shot)

```typescript
// lib/verifyOneShotWebhook.ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS_URL = 'https://relayer.1shotapi.com/.well-known/jwks.json'
const jwks     = createRemoteJWKSet(new URL(JWKS_URL))

export async function verifyOneShotWebhook(
  token: string
): Promise<boolean> {
  try {
    await jwtVerify(token, jwks, {
      algorithms: ['EdDSA'],
    })
    return true
  } catch {
    return false
  }
}
```

### 9.4 Smart Contract Authorization

The `VeniceCollapseEnforcer` stores `initiator` per session — only the backend EOA that called `initSession()` can submit hashes. This prevents unauthorized hash injection.

---

## 10. Infrastructure & Deployment

### 10.1 Environments

One environment: **Base Sepolia (84532)**. Deploy to Vercel directly.

### 10.2 Vercel Configuration

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["sin1"],
  "env": {
    "DATABASE_URL": "@database-url",
    "REDIS_URL":    "@redis-url"
  },
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

**Note:** SSE streaming on Vercel requires `maxDuration` to be increased. Edge Runtime does not support persistent Redis pub/sub — use Node.js runtime for SSE routes:

```typescript
// app/api/session/[sessionId]/stream/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

### 10.3 Environment Variables

See Section 19 for the full reference. Create `.env.local` for development and configure these in Vercel for production.

---

## 11. Monitoring, Logging & Observability

### 12.1 Structured Logging

```typescript
// lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base:  { service: 'waveagent' },
  ...(process.env.NODE_ENV === 'development' ? {
    transport: { target: 'pino-pretty' },
  } : {}),
})
```

**Log every critical step:**
```typescript
logger.info({ sessionId, agentId, taskId }, 'hash_submitted_to_relayer')
logger.info({ sessionId, winnerAgentId },   'wavefunction_collapsed')
logger.error({ sessionId, error },           'collapse_failed')
```

### 12.2 Onchain Event Monitoring

Use `viem`'s `watchContractEvent` in a long-running Next.js process (or a separate worker) to track `WavefunctionCollapsed` events. Mirror them to the database and Redis pub/sub.

### 12.3 Key Metrics to Track

| Metric | Source |
|---|---|
| Session creation rate | Database |
| Venice inference latency per agent | Timer in `veniceAgentService` |
| 1Shot relay confirmation time | `relayer_getStatus` polling |
| Collapse success rate | Session status transitions |
| x402 balance per agent wallet | `venice-x402-client` balance |
| USDC gas spend per session | 1Shot fee data |

### 12.4 Alerts

Set up Vercel alerts for:
- Function timeouts (SSE route > 270s)
- 5xx error rate > 1% over 5 minutes
- Database connection pool exhaustion

---

## 12. Security Considerations

### 13.1 Private Key Management

- Agent private keys are 3 dedicated EOAs used only for this application. Keep balances minimal — top up only per session.
- Never log or expose private keys in error messages or stack traces.
- Rotate keys if any are ever committed or exposed.

### 13.2 Delegation Security

- The `VeniceCollapseEnforcer` stores `initiator` per session. Only the server EOA that initialized the session can submit hashes — preventing an attacker from injecting a fake hash and forcing a different winner.
- Sub-delegations are monotonically narrowing: Agent B and C cannot exceed Agent A's budget even if the enforcer were bypassed.
- Root delegation uses ERC-7715 in MetaMask Flask with explicit user consent.

### 13.3 Webhook Security

- Verify all 1Shot webhook payloads against the JWKS before processing. Reject requests without a valid `x-signature` header.
- Use a webhook secret for additional HMAC verification if 1Shot supports it.

### 13.4 Input Validation

- Validate `userIntent` on both frontend and API using Zod.
- Sanitize `userIntent` before passing to Venice — prevent prompt injection by wrapping in a structured system prompt that returns JSON-only output.
- The structured output schema (`AgentOutputSchema`) prevents the frontend from ever receiving raw unstructured AI output.

### 13.5 Rate Limiting

Apply rate limiting to session creation (`/api/session/create`) to prevent abuse:

```typescript
// middleware.ts
import { NextResponse }   from 'next/server'
import type { NextRequest } from 'next/server'
import { redis }          from '@/lib/redis'

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/session/create') {
    const ip    = req.ip ?? 'unknown'
    const key   = `ratelimit:session:${ip}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 60)  // 1 minute window
    if (count > 5) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
  }
  return NextResponse.next()
}
```

### 13.6 USDC Balance Guards

Before starting any session, the backend checks that each agent wallet has sufficient USDC for Venice inference + estimated gas:

```typescript
async function assertAgentBalances(agents: AgentWallet[]): Promise<void> {
  for (const agent of agents) {
    const client  = getVeniceClient(agent.privateKey)
    const balance = await client.getBalance()
    if (!balance.canConsume) {
      await client.topUp(5)  // top up $5 USDC on Base
    }
  }
}
```

---

## 13. Folder Structure

```
waveagent/
├── app/                              # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx                      # Landing
│   ├── session/
│   │   ├── new/
│   │   │   └── page.tsx
│   │   └── [sessionId]/
│   │       ├── page.tsx              # Live session
│   │       └── result/
│   │           └── page.tsx
│   ├── about/
│   │   └── page.tsx
│   └── api/
│       ├── session/
│       │   ├── create/
│       │   │   └── route.ts
│       │   └── [sessionId]/
│       │       ├── route.ts          # GET session
│       │       ├── grant-delegation/
│       │       │   └── route.ts
│       │       ├── run/
│       │       │   └── route.ts
│       │       └── stream/
│       │           └── route.ts     # SSE
│       └── webhook/
│           └── 1shot/
│               └── route.ts
│
├── components/                       # React components
│   ├── ui/
│   ├── wallet/
│   ├── session/
│   ├── live/
│   ├── result/
│   └── layout/
│
├── services/                         # Business logic layer
│   ├── agentWalletService.ts
│   ├── delegationService.ts
│   ├── veniceAgentService.ts
│   ├── oneShotRelayerService.ts
│   ├── collapseOrchestratorService.ts
│   └── chainService.ts
│
├── hooks/                            # React hooks
│   ├── useSessionEvents.ts
│   ├── usePermissionGrant.ts
│   ├── useSession.ts
│   └── useCollapseAnimation.ts
│
├── store/                            # Zustand stores
│   └── sessionStore.ts
│
├── lib/                              # Shared utilities
│   ├── db.ts                         # Prisma client
│   ├── redis.ts                      # ioredis client
│   ├── logger.ts                     # Pino logger
│   ├── verifyOneShotWebhook.ts
│   └── constants.ts                  # Chain IDs, addresses
│
├── schemas/                          # Zod schemas
│   ├── sessionSchema.ts
│   └── agentOutputSchema.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── contracts/                        # Foundry project
│   ├── foundry.toml
│   ├── src/
│   │   └── VeniceCollapseEnforcer.sol
│   ├── test/
│   │   └── VeniceCollapseEnforcer.t.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   └── lib/                          # forge install dependencies
│       ├── delegation-framework/
│       └── openzeppelin-contracts/
│
├── public/
│   └── fonts/
│
├── .env.local                        # Not committed
├── .env.example                      # Committed — template
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

---

## 14. Naming Conventions

### TypeScript

| Item | Convention | Example |
|---|---|---|
| Files | `camelCase` | `veniceAgentService.ts` |
| Components | `PascalCase` | `OrbCluster.tsx` |
| Types/Interfaces | `PascalCase` | `AgentResult`, `SessionStore` |
| Constants | `SCREAMING_SNAKE_CASE` | `USDC_ADDRESS` |
| Functions | `camelCase` verb+noun | `runAgent()`, `submitHashes()` |
| Hooks | `use` prefix | `useSessionEvents()` |
| Zustand stores | `use` + `Store` suffix | `useSessionStore()` |
| API routes | lowercase + hyphens in path | `/api/session/grant-delegation` |

### Solidity

| Item | Convention | Example |
|---|---|---|
| Contracts | `PascalCase` | `VeniceCollapseEnforcer` |
| Functions | `camelCase` | `submitReasoningHash()` |
| Events | `PascalCase` | `WavefunctionCollapsed` |
| State vars | `camelCase` | `sessions`, `winnerAgentId` |
| Constants | `SCREAMING_SNAKE_CASE` | (none in this contract) |

### Database

| Item | Convention | Example |
|---|---|---|
| Models | `PascalCase` | `Session`, `AgentResult` |
| Fields | `camelCase` | `sessionId`, `winnerAgentId` |
| Enums | `SCREAMING_SNAKE_CASE` | `PENDING`, `COLLAPSED` |

---

## 15. Required Libraries & Dependencies

### `package.json` (root)

```json
{
  "name": "waveagent",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev":        "next dev",
    "build":      "next build",
    "start":      "next start",
    "lint":       "next lint",
    "type-check": "tsc --noEmit",
    "db:push":    "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio":  "prisma studio",
    "test":       "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next":                           "14.2.x",
    "react":                          "18.x",
    "react-dom":                      "18.x",

    "@metamask/smart-accounts-kit":   "^0.3.0",
    "viem":                           "^2.x",
    "wagmi":                          "^2.x",
    "venice-x402-client":             "^1.x",

    "@prisma/client":                 "^5.x",
    "ioredis":                        "^5.x",
    "openai":                         "^4.x",
    "zod":                            "^3.x",
    "pino":                           "^9.x",
    "jose":                           "^5.x",

    "@tanstack/react-query":          "^5.x",
    "zustand":                        "^4.x",
    "framer-motion":                  "^11.x",
    "d3":                             "^7.x",
    "react-hook-form":                "^7.x",
    "@hookform/resolvers":            "^3.x",

    "tailwindcss":                    "^3.x",
    "clsx":                           "^2.x",
    "tailwind-merge":                 "^2.x"
  },
  "devDependencies": {
    "typescript":              "^5.x",
    "@types/node":             "^20.x",
    "@types/react":            "^18.x",
    "@types/react-dom":        "^18.x",
    "@types/d3":               "^7.x",
    "prisma":                  "^5.x",
    "vitest":                  "^1.x",
    "@vitejs/plugin-react":    "^4.x",
    "pino-pretty":             "^11.x",
    "eslint":                  "^8.x",
    "eslint-config-next":      "14.x"
  }
}
```

### Foundry (`contracts/`)

```bash
# Install contract dependencies
forge install metamask/delegation-framework@v1.3.0 --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge install foundry-rs/forge-std --no-commit
```

---

## 16. Development Workflow

### 16.1 Initial Setup

```bash
# Clone repo
git clone https://github.com/your-org/waveagent.git
cd waveagent

# Install Node dependencies
pnpm install

# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install contract deps
cd contracts
forge install metamask/delegation-framework@v1.3.0 --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge install foundry-rs/forge-std --no-commit
cd ..

# Copy env template and fill in values
cp .env.example .env.local

# Set up database
pnpm db:push

# Start dev server
pnpm dev
```

### 16.2 Local Blockchain Setup (Optional — for contract dev)

```bash
# Terminal 1: Run anvil (local EVM)
anvil --fork-url $BASE_SEPOLIA_RPC_URL

# Terminal 2: Deploy contracts to local fork
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Note deployed address, set VENICE_COLLAPSE_ENFORCER_ADDRESS in .env.local
```

### 16.3 Daily Dev Flow

```bash
# Feature branch
git checkout -b feat/phase-2-delegation-chain

# Run tests on change
pnpm test:watch

# Run forge tests
cd contracts && forge test -vvv --watch

# Push + PR
git push origin feat/phase-2-delegation-chain
```

### 16.4 Deploy Contract

```bash
# Fund agent wallets with testnet USDC (Base Sepolia faucet or Coinbase)

cd contracts
forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify

# Copy the logged address into .env.local
VENICE_COLLAPSE_ENFORCER_ADDRESS=0x...
```

---

## 17. Testing Strategy

### 17.1 Contract Tests (Foundry)

`/contracts/test/VeniceCollapseEnforcer.t.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/VeniceCollapseEnforcer.sol";

contract VeniceCollapseEnforcerTest is Test {
    VeniceCollapseEnforcer enforcer;
    address                initiator = makeAddr("initiator");
    bytes32                SESSION   = keccak256("test-session-1");

    function setUp() public {
        enforcer = new VeniceCollapseEnforcer();
        vm.prank(initiator);
        enforcer.initSession(SESSION, 3);
    }

    function test_SubmitAndCollapse() public {
        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), 60);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), 87);  // winner
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), 45);
        vm.stopPrank();

        (,, uint8 winner, bool collapsed,) = enforcer.getSession(SESSION);
        assertTrue(collapsed);
        assertEq(winner, 1);  // agent 1 had highest confidence (87)
    }

    function test_BeforeHook_SucceedsForWinner() public {
        // Submit all hashes
        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), 60);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), 87);
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), 45);
        vm.stopPrank();

        bytes memory terms = abi.encode(SESSION, uint8(1));  // winner is agent 1
        // Should not revert
        enforcer.beforeHook(terms, "", ModeCode.wrap(0), "", bytes32(0), address(0), address(0));
    }

    function test_BeforeHook_RevertsForLoser() public {
        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), 60);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), 87);
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), 45);
        vm.stopPrank();

        bytes memory terms = abi.encode(SESSION, uint8(0));  // loser agent 0
        vm.expectRevert("This agent did not win collapse");
        enforcer.beforeHook(terms, "", ModeCode.wrap(0), "", bytes32(0), address(0), address(0));
    }

    function test_BeforeHook_RevertsBeforeCollapse() public {
        bytes memory terms = abi.encode(SESSION, uint8(0));
        vm.expectRevert("Wavefunction not yet collapsed");
        enforcer.beforeHook(terms, "", ModeCode.wrap(0), "", bytes32(0), address(0), address(0));
    }

    function test_OnlyInitiatorCanSubmitHash() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert("Not session initiator");
        enforcer.submitReasoningHash(SESSION, 0, keccak256("fake"), 99);
    }

    function testFuzz_CollapseAlwaysPicksHighestConfidence(
        uint8 c0, uint8 c1, uint8 c2
    ) public {
        vm.assume(c0 <= 100 && c1 <= 100 && c2 <= 100);
        // Avoid ties for simplicity (first submission wins on tie in current impl)

        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), c0);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), c1);
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), c2);
        vm.stopPrank();

        (,, uint8 winner,,) = enforcer.getSession(SESSION);
        uint8[3] memory confs = [c0, c1, c2];
        uint8 expectedWinner;
        uint8 highest;
        for (uint8 i = 0; i < 3; i++) {
            if (confs[i] > highest) { highest = confs[i]; expectedWinner = i; }
        }
        assertEq(winner, expectedWinner);
    }
}
```

### 17.2 Unit Tests (Vitest)

```typescript
// services/__tests__/veniceAgentService.test.ts
import { describe, it, expect, vi } from 'vitest'
import { hashReasoningContent }     from '../delegationService'
import { AgentOutputSchema }         from '../../schemas/agentOutputSchema'

describe('hashReasoningContent', () => {
  it('produces consistent keccak256 hex hash', () => {
    const input = 'After careful analysis of the problem...'
    const hash1 = hashReasoningContent(input)
    const hash2 = hashReasoningContent(input)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('different inputs produce different hashes', () => {
    const h1 = hashReasoningContent('reasoning A')
    const h2 = hashReasoningContent('reasoning B')
    expect(h1).not.toBe(h2)
  })
})

describe('AgentOutputSchema', () => {
  it('validates correct structured output', () => {
    const output = {
      summary:    'Market analysis complete',
      confidence: 87,
      action:     'Invest in ETH L2s',
      reasoning:  'Strong network effects...',
    }
    expect(AgentOutputSchema.safeParse(output).success).toBe(true)
  })

  it('rejects confidence out of range', () => {
    const output = { summary: 'x', confidence: 150, action: 'y', reasoning: 'z' }
    expect(AgentOutputSchema.safeParse(output).success).toBe(false)
  })
})
```

### 17.3 Integration Tests

Test the full session lifecycle against Base Sepolia. Use a dedicated test wallet with a small USDC balance. Mark these tests with `@integration` and skip in CI unless `RUN_INTEGRATION=true`.

```typescript
// __tests__/integration/fullSession.test.ts
import { describe, it, expect } from 'vitest'

describe.skipIf(!process.env.RUN_INTEGRATION)('Full session flow', () => {
  it('creates session, runs agents, collapses wavefunction', async () => {
    // 1. POST /api/session/create
    // 2. POST /api/session/:id/grant-delegation (mock delegation context)
    // 3. POST /api/session/:id/run
    // 4. Wait for wavefunction_collapsed event via SSE
    // 5. Verify onchain: disabledDelegations(loserHash) == true
  }, 120_000)
})
```

### 17.4 E2E Tests (Playwright)

```typescript
// e2e/session.spec.ts
import { test, expect } from '@playwright/test'

test('user can create and observe a session collapse', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="connect-wallet"]')
  // MetaMask automation requires the MetaMask extension fixture
  // Use playwright-metamask for browser extension mocking
  await expect(page.locator('[data-testid="orb-cluster"]')).toBeVisible()
})
```

---

## 18. Phase-by-Phase Implementation Plan

### Phase 1 — Foundation (Day 1, ~4 hours)

**Goal:** Running Next.js app, deployed smart contract, basic wallet connection.

**Tasks:**
1. `npx create-next-app@latest waveagent --typescript --tailwind --app --src-dir=false`
2. `pnpm add @metamask/smart-accounts-kit viem wagmi @tanstack/react-query zustand`
3. Set up Foundry project in `/contracts`
4. Install contract dependencies (`forge install`)
5. Write and test `VeniceCollapseEnforcer.sol` with Foundry
6. Deploy to Base Sepolia, record address
7. Scaffold Prisma schema, push to dev database
8. Set up Redis (Upstash or local Docker)
9. Implement `Providers.tsx` with wagmi + Query
10. Build landing page with MetaMask connect button
11. Verify: wallet connects, network is Base Sepolia

**Deliverable:** App loads, wallet connects, contract deployed and verified on Basescan.

---

### Phase 2 — Delegation Chain (Day 1–2, ~5 hours)

**Goal:** Full 3-hop delegation chain created and verifiable. User→A root delegation + A→B/C/D sub-delegations.

**Tasks:**
1. Implement `agentWalletService.ts` — generate/load 3 agent EOAs
2. Implement `usePermissionGrant.ts` — ERC-7715 `wallet_grantPermissions` call
3. Build `/session/new` page with intent input + budget + permission grant button
4. Implement `POST /api/session/create` — creates DB record, inits enforcer contract onchain via 1Shot
5. Implement `POST /api/session/:id/grant-delegation` — stores permission context, creates sub-delegations programmatically
6. Implement `delegationService.ts` — `createSubDelegations()` with VeniceCollapseEnforcer caveat
7. Test: verify all 3 signed delegations are valid, caveat terms correctly encode `sessionId + agentId`
8. Smoke test: manually call `redeemDelegations` for winning agent, confirm enforcer reverts before collapse

**Blockers to watch:**
- MetaMask Flask required for ERC-7715. Ensure your test browser has Flask installed.
- `erc7715ProviderActions()` requires the user's account to be a smart account. The EIP-7702 upgrade must happen first.
- `targetAddress` in 1Shot capabilities response must be used as the delegation `to` address. Don't hardcode.

**Deliverable:** 3 signed sub-delegations in the database. Console log shows delegation hashes for block explorer verification.

---

### Phase 3 — Venice AI + x402 (Day 2, ~4 hours)

**Goal:** Each agent calls Venice via `venice-x402-client`, streams `reasoning_content`, returns structured output with confidence score.

**Tasks:**
1. `pnpm add venice-x402-client`
2. Fund 3 agent wallets with USDC on Base Sepolia
3. Implement `veniceAgentService.ts` — `runAgent()` with x402 wallet auth
4. Write structured output prompt for each agent role (Research, Analysis, Execution)
5. Test Venice call: verify `reasoning_content` returns, structured JSON parses
6. Implement `hashReasoningContent()` — keccak256 of full reasoning string
7. Implement SSE endpoint (`/api/session/:id/stream`) + Redis pub/sub
8. Connect `runAgent()` → publish to Redis → SSE client receives chunks
9. Build `AgentPanel` component — displays streaming reasoning per agent
10. Build `WaveformCanvas` — D3 animated waveform with 3 overlapping sinusoidal waves

**Model choice:** Use `deepseek-r1-671b` or `qwen3-235b-a22b-thinking-2507` on Venice — these models expose `reasoning_content` in the API response. Check Venice model list for current availability.

**Deliverable:** Opening `/session/:id` shows 3 panels with streaming Venice reasoning. Waveform animates.

---

### Phase 4 — 1Shot Relayer + Hash Submission (Day 2–3, ~4 hours)

**Goal:** Agent reasoning hashes submitted onchain via 1Shot relayer, webhooks confirm, enforcer auto-collapses.

**Tasks:**
1. Implement `oneShotRelayerService.ts` — `getCapabilities()`, `getFeeData()`, `send7710Transaction()`
2. Implement `POST /api/webhook/1shot` — Ed25519 JWKS verification + Redis publish
3. Implement `collapseOrchestratorService.ts` — `submitHashes()` + `waitForCollapse()`
4. Wire `POST /api/session/:id/run` — runs agents → submits hashes → waits for collapse
5. Implement `disableLoserDelegation()` — calls `disableDelegation` via relayer for 2 losing agents
6. Test full flow: 3 hashes submitted → VeniceCollapseEnforcer emits WavefunctionCollapsed → losing delegations disabled

**1Shot integration specifics:**
- Call `relayer_getCapabilities` first, every time (don't cache long-term)
- Use `relayer_getFeeData` to get a price-locked `context` — include this in `relayer_send7710Transaction`
- Set `destinationUrl` to your webhook endpoint for all submissions
- Verify webhook signature before processing — use `jose` + JWKS

**Deliverable:** Block explorer shows: 3 hash submission txs, 1 `WavefunctionCollapsed` event, 2 `disableDelegation` txs. All relayed via 1Shot, gas paid in USDC.

---

### Phase 5 — Collapse Animation + Result Page (Day 3, ~3 hours)

**Goal:** Frontend shows the full quantum collapse dramatically. Result page shows winner + all evidence.

**Tasks:**
1. Implement `OrbCluster` — Framer Motion orbs with probability labels, animated exit for losers
2. Implement `CollapseOverlay` — full-screen animation triggered by `wavefunction_collapsed` SSE event
3. Implement `HashTimeline` — shows each onchain event as it arrives, with block explorer links
4. Build `/session/:id/result` page — `WinnerCard`, `EvidenceTimeline`, `DelegationDisabledBadge`
5. Add probability animation: orbs should fluctuate during agent reasoning, then snap to winner

**Animation sequence:**
- T+0: 3 orbs appear, all at ~33% probability, waveform oscillating
- T+agent_done: orbs' probabilities update to match confidence scores from Venice
- T+collapse: losing orbs dissolve (`AnimatePresence` exit), winner orb scales up + glows
- T+execution: winner orb snaps to a final "executed" state

**Deliverable:** 90-second demo flow works end to end. Visually compelling.

---

### Phase 6 — Polish + Demo (Day 4, ~3 hours)

**Goal:** Everything running on Base Sepolia. Record demo video. Submit.

**Tasks:**
1. Build `/about` page with architecture diagram and track breakdown
2. Add `DelegationDisabledBadge` pulling live state from `disabledDelegations(hash)` view
3. Fund agent wallets with testnet USDC (Base Sepolia faucet or Coinbase)
4. Run full end-to-end session — verify all txs on Basescan Sepolia
5. Deploy to Vercel — set all env vars in Vercel dashboard
6. Record demo video — must show MetaMask Smart Accounts Kit, Venice reasoning, 1Shot, onchain enforcer
7. Submit

**Critical checklist before submitting:**
- [ ] EIP-7702 account upgrade goes through 1Shot relayer (hackathon requirement)
- [ ] EIP-7710 transactions relay through 1Shot relayer (hackathon requirement)
- [ ] Venice called via x402 (no API key visible in code)
- [ ] `reasoning_content` visibly drives collapse — show it in demo
- [ ] Block explorer (Basescan Sepolia) shows: custom caveat enforcer address, hash verification, delegation disables
- [ ] Webhook-driven status updates (not polling) — 1Shot `destinationUrl` set

---

## 19. Environment Variables Reference

```bash
# .env.example

# ─────────────────────────────────────────────── Next.js ──────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─────────────────────────────────────────── Database / Redis ─────────
DATABASE_URL=postgresql://user:pass@host:5432/waveagent
REDIS_URL=redis://localhost:6379

# ─────────────────────────────────────────────── Blockchain ───────────
# Base Sepolia only (chain 84532)
CHAIN_ID=84532
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Contract Addresses
VENICE_COLLAPSE_ENFORCER_ADDRESS=0x...         # Your deployed VeniceCollapseEnforcer
# MetaMask DelegationManager — resolve via getSmartAccountsEnvironment(chainId), do NOT hardcode
# DELEGATION_MANAGER_ADDRESS=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3

# ─────────────────────────────────────────────── Agent Wallets ────────
# These are dedicated EOAs for agent operation — keep USDC-funded
DEPLOYER_PRIVATE_KEY=0x...   # For contract deployment only
AGENT_A_PRIVATE_KEY=0x...    # Agent A (Research)
AGENT_B_PRIVATE_KEY=0x...    # Agent B (Analysis)
AGENT_C_PRIVATE_KEY=0x...    # Agent C (Execution)

# ─────────────────────────────────────────────── Venice AI ────────────
# VENICE_API_KEY is NOT needed if using x402 wallet auth
# Keep this for fallback / non-x402 testing only
VENICE_API_KEY=

# ─────────────────────────────────────────────── Foundry ──────────────
BASESCAN_API_KEY=

# ─────────────────────────────────────────────── Misc ────────────────
LOG_LEVEL=info
NODE_ENV=development
```

---

## Appendix A — Venice Models with `reasoning_content`

The following Venice models return a visible chain-of-thought in `response.choices[0].message.reasoning_content`:

| Model ID | Context | Notes |
|---|---|---|
| `deepseek-r1-671b` | 128k | Best reasoning quality, slower |
| `deepseek-v4-flash` | 64k | Fast, lower cost |
| `qwen3-235b-a22b-thinking-2507` | 128k | Strong reasoning |
| `kimi-k2-6` | 128k | Strong on analysis tasks |

Always call `GET https://api.venice.ai/api/v1/models` at runtime to get the current model list. IDs can change.

---

## Appendix B — 1Shot Relayer Quick Reference

```
Endpoint:     https://relayer.1shotapi.com/relayers
Auth:         None (permissionless)
JWKS:         https://relayer.1shotapi.com/.well-known/jwks.json

Methods:
  relayer_getCapabilities           → chain support, accepted tokens, feeCollector, targetAddress
  relayer_getFeeData                → gasPrice, rate, minFee, expiry, context (price lock)
  relayer_send7710Transaction       → submit same-chain relay, returns taskId
  relayer_send7710TransactionMultichain → cross-chain fee + execution
  relayer_estimate7710Transaction   → estimate without submitting
  relayer_getStatus                 → poll by taskId

Webhook event statuses:
  Pending, Submitted (non-terminal)
  Confirmed, Rejected, Reverted (terminal)

Supported stablecoins: USDC, USDT, USDG, MUSD
Supported chains: Verify live via relayer_getCapabilities — includes Base, Ethereum, Optimism, Arbitrum, Polygon
```

---

## Appendix C — MetaMask Smart Accounts Kit Quick Reference

```bash
# Install
pnpm add @metamask/smart-accounts-kit

# Bootstrap project (optional full starter)
npx create-gator-app

# Forge contracts
forge install metamask/delegation-framework@v1.3.0

# Key imports
import {
  toMetaMaskSmartAccount,
  Implementation,
  createDelegation,
  ScopeType,
  DelegationManager,
  getSmartAccountsEnvironment,
  erc7715ProviderActions,
  erc7710WalletActions,
  erc7710BundlerActions,
} from '@metamask/smart-accounts-kit'
```

---

*This document is the complete technical specification for Wave Protocol. Build phase by phase. When in doubt, re-read this file.*