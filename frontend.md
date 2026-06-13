# WaveAgent — Frontend Build Guide

> Phase-by-phase, mirrors `backend.md`. Backend is complete & verified onchain. This wires the
> existing `/frontend` v0 landing page to it and builds the visual demo.
> After each phase: **commit + push**, then continue. Every page reuses the existing style exactly.

## At a glance
- **Pages:** 1 rebranded (`/`) + **2 new** (`/session/new`, `/session/[sessionId]`).
- **Phases:** **4** — F1 wiring + landing rebrand · F2 demo flow · F3 wallet/ERC-7715 · F4 polish.
- **Frontend:** Next 16-canary, React 19, Tailwind v4, GSAP/Lenis/Framer Motion. Dev port **3000**.
- **Backend:** Next 14 API at **3001** (already running, verified onchain).

---

## Design system (MUST match — active `frontend/app/globals.css`)
| Token | Value |
|---|---|
| bg | `oklch(0.08 0 0)` near-black |
| foreground | `oklch(0.95 0 0)` off-white |
| **accent** | `oklch(0.7 0.2 45)` **orange** |
| border | `oklch(0.25 0 0)` · card `oklch(0.12 0 0)` |
| radius | **0 (sharp corners)** |

- Fonts: `font-[var(--font-bebas)]` (Bebas Neue, big titles) · `font-mono` (IBM Plex Mono, labels)
  · `font-sans` (IBM Plex Sans, body). Backgrounds: `.grid-bg` (60px) + `.noise-overlay`.
- **Section header:** `<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">NN /
  Label</span>` + `<h2 className="font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">TITLE</h2>`.
- **Button:** `border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest
  hover:border-accent hover:text-accent`.
- Reuse: `components/{scramble-text,split-flap-text,draw-text,highlight-text,bitmap-chevron}`,
  shadcn `components/ui/*`, framer-motion, gsap. Alias `@/*` → frontend root.

---

## Backend API contract (what the frontend calls)
Base URL = `NEXT_PUBLIC_BACKEND_URL` (`http://localhost:3001`). CORS is enabled (Phase F1).

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/session/create` | `{ userIntent (20–500), budgetUsdc (1–50), userAddress (0x40) }` | `{ sessionId, agentAddresses[], initTxHash }` |
| GET | `/api/session/:id` | — | full session + `agentResults[]` |
| POST | `/api/session/:id/grant-delegation` | `{ rootDelegation, delegationManager? }` | `{ status, agentDelegations }` |
| POST | `/api/session/:id/run` | — | `{ winnerAgentId, winnerHash, winnerConfidence, hashTxHashes[] }` |
| GET | `/api/session/:id/stream` | — | **SSE** (`data: {json}\n\n`) |

**SSE event types** (each has `type` + `ts`):
```
agents_started        { agentCount }
agent_reasoning       { agentId, chunk }
agent_done            { agentId, role, confidence, summary }
hash_submitted        { agentId, txHash }
hash_confirmed        { agentId, txHash }
wavefunction_collapsed{ winnerAgentId, winnerHash, winnerConfidence }
execution_complete    { winnerAgentId }
error                 { message }
```
> Open the SSE stream BEFORE POSTing `/run` (pub/sub is fire-and-forget). Agent roles by id:
> 0 = Research, 1 = Analysis, 2 = Execution. Basescan tx: `https://sepolia.basescan.org/tx/<hash>`.

---

## Phase F1 — Wiring + landing rebrand ✅ DONE
**Backend (wiring):**
- `backend/middleware.ts` (NEW) — CORS for `/api/*` (OPTIONS preflight + ACAO from `FRONTEND_ORIGIN`,
  default `http://localhost:3000`); skips `/stream`.
- `backend/app/api/session/[sessionId]/stream/route.ts` — ACAO header on the SSE response.
- `backend/.env.example` — `FRONTEND_ORIGIN`.

**Frontend (rebrand — copy only, structure/animations preserved):**
- `app/layout.tsx` — metadata → WaveAgent.
- `components/hero-section.tsx` — "WAVEAGENT" split-flap, tagline, CTA "Run a Collapse" → `/session/new`.
- `components/signals-section.tsx` → **HOW IT WORKS** (5 steps).
- `components/work-section.tsx` → **THE STACK** (6 tools, enforcer centerpiece).
- `components/principles-section.tsx` → **WHY THIS WORKS** (Superposition / Consensus / Pay-per-call / Delegation).
- `components/colophon-section.tsx` → credits + Basescan link to the enforcer.
- `components/side-nav.tsx` — labels (Index / How / Stack / Principles / Colophon).

**Commit:** `feat(frontend): rebrand landing to WaveAgent + backend CORS for local wiring`

---

## Phase F2 — Demo flow (new → live → result)  ⏳
**Files (new):**
- `frontend/.env.local` — `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`.
- `lib/waveApi.ts` — typed client (`createSession`, `getSession`, `runSession`, `streamUrl`) + SSE event union.
- `hooks/useSessionStream.ts` — `EventSource` hook → typed events + connection state.
- `app/session/new/page.tsx` — **PAGE 1**: intent textarea (20–500) + budget slider (1–50), in-style;
  submit → `createSession` → push `/session/[id]`. (No wallet yet — fixed demo `userAddress`.)
- `app/session/[sessionId]/page.tsx` — **PAGE 2**: server shell → `<SessionRunner/>`.
- `components/session-runner.tsx` — client: opens SSE, fires `runSession`, drives the animation + result.
- `components/agent-orb.tsx` — one agent panel (reasoning stream, confidence, onchain badge, win/lose state).
- `components/wave-collapse.tsx` — the superposition → collapse visualization.

**Collapse animation:** 3 orange-glow agent panels in superposition → stream each one's reasoning
(`agent_reasoning`, scramble/typewriter) → big Bebas confidence (`agent_done`) → "onchain ✓" +
Basescan link (`hash_confirmed`) → on `wavefunction_collapsed`: losers desaturate/shrink, winner scales
up + split-flap reveals "AGENT N" → inline result card (summary, action, reasoning, `winnerHash`, tx links).

**Done when:** `/session/new` → submit → `/session/[id]` streams agents → hashes → collapse → winner, live.
**Commit:** `feat(frontend): wired demo flow — new session + live waveform collapse (SSE)`

---

## Phase F3 — Wallet + ERC-7715 grant (full ERC-7710 story)  ⏳
Adds **connect → new session → grant delegation → run**. Deps: `viem` + `@metamask/smart-accounts-kit`
(**no wagmi** — use `window.ethereum`/MetaMask Flask directly, minimizing React 19 / Next 16-canary risk).
**Files (new):**
- `lib/wallet.ts` — viem wallet client from `window.ethereum`; Flask detection.
- `components/connect-button.tsx` — connect Flask, show address (in-style).
- `hooks/useGrantDelegation.ts` — ERC-7715 `requestExecutionPermissions`
  (`@metamask/smart-accounts-kit/actions`; fields `tokenAddress`, `periodDuration`, `periodAmount`;
  USDC `0x036CbD…3dCF7e`) → POST `/grant-delegation`.
- Wire into `session/new` (real `userAddress`) + `session/[id]` (grant step before run; show loser gating).

⚠️ Verify smart-accounts-kit/viem on Next 16-canary + React 19 at build; keep F2's no-wallet path as fallback.
**Commit:** `feat(frontend): MetaMask Flask + ERC-7715 delegation grant (full ERC-7710 flow)`

---

## Phase F4 — Polish + end-to-end verification  ⏳
- Root `README.md` / `dev.sh` — run both (`backend` :3001, `frontend` :3000).
- Run both, drive the full flow (with + without wallet); confirm SSE renders, collapse animates, winner/hash
  match `GET /api/session/:id` + Basescan. Fix CORS/animation/compat issues.
**Commit:** `chore(frontend): run scripts + end-to-end verification`

---

## New file tree (F2–F4)
```
frontend/
├── .env.local                         (F2)
├── app/session/
│   ├── new/page.tsx                   (F2 — Page 1)
│   └── [sessionId]/page.tsx           (F2 — Page 2)
├── components/
│   ├── session-runner.tsx             (F2)
│   ├── agent-orb.tsx                  (F2)
│   ├── wave-collapse.tsx              (F2)
│   └── connect-button.tsx             (F3)
├── hooks/
│   ├── use-session-stream.ts          (F2)
│   └── use-grant-delegation.ts        (F3)
└── lib/
    ├── wave-api.ts                    (F2)
    └── wallet.ts                      (F3)
```
