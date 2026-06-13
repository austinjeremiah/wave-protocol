# Wave Protocol

**Multi-agent intent collapse, onchain.** You submit one intent + a USDC budget. Three AI agents
(Research / Analysis / Execution) explore it in parallel via **Venice AI**, each paying for its own
inference with **x402** (USDC, settled onchain). Every agent's reasoning is hashed and committed to a
custom **ERC-7710 caveat enforcer** on **Base Sepolia**, which auto-**collapses** the superposition to
the highest-confidence winner. With a wallet, the user grants a USDC budget via **ERC-7715** and the
winning agent redeems it — losers are gated by the enforcer.

> Chain: **Base Sepolia (84532)** only. Everything is real and onchain, at ~zero cost.

## Architecture

```
frontend/  Next.js 16 · React 19 · Tailwind v4   (UI + live waveform collapse, :3000)
backend/   Next.js 14 API routes                 (agents, x402, onchain, SSE, :3001)
backend/contracts/  Foundry                       (VeniceCollapseEnforcer.sol)
```

- **VeniceCollapseEnforcer** (Base Sepolia): [`0x3ec6F2c470e57f487709b153f77c02851fe864C5`](https://sepolia.basescan.org/address/0x3ec6F2c470e57f487709b153f77c02851fe864C5)
- Data: **Neon** (Postgres) + **Upstash** (Redis pub/sub → SSE)

## Prerequisites
- Node 20+, `pnpm`
- A **Neon** Postgres URL + an **Upstash** Redis (`rediss://`) URL
- A **Venice AI** API key (free credits) — the inference path
- 4 EOA private keys: 1 **deployer/backend signer** (needs Base Sepolia ETH), 3 **agent** keys
  (need a little Base Sepolia USDC for x402 — free from https://faucet.circle.com)
- (Optional, for the full ERC-7710 flow) **MetaMask Flask** + a USDC-funded account

## Run it

**1 — Backend** (`:3001`)
```bash
cd backend
pnpm install
[ -f .env.local ] || cp .env.example .env.local   # ⚠️ only if missing — don't overwrite a filled one!
                                  # fill in: DATABASE_URL, REDIS_URL, DEPLOYER_PRIVATE_KEY,
                                  # AGENT_A/B/C_PRIVATE_KEY, VENICE_API_KEY, VENICE_COLLAPSE_ENFORCER_ADDRESS
pnpm db:push                      # create tables in Neon
pnpm dev                          # → http://localhost:3001
```

**2 — Frontend** (`:3000`, in a second terminal)
```bash
cd frontend
pnpm install
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:3001" > .env.local
pnpm dev                          # → http://localhost:3000
```

**3 — Use it**
- Open **http://localhost:3000** → **Run a Collapse**
- Enter an intent + budget → submit → watch the live collapse (agents reason → hashes onchain →
  wavefunction collapses → winner). No wallet needed.
- (Full ERC-7710) Connect **MetaMask Flask** (Base Sepolia) → leave "Delegate USDC budget" on →
  the winning agent redeems your delegated USDC after collapse.

## Contracts (Foundry)
```bash
cd backend/contracts
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std   # one-time
forge test -vvv                                                            # 6 tests
# deploy: set env, then
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast -vvvv
```

## Hackathon tracks
- **x402 + ERC-7710** — agents pay per-inference via x402 (onchain) + custom `VeniceCollapseEnforcer`
- **Best Agent** — 3 Venice reasoning agents
- **A2A Coordination** — Agent-A→B/C sub-delegations + onchain collapse consensus

See `backend.md` / `frontend.md` for the phase-by-phase build guides, `wave.md` for the full spec.
