"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createSession, DEMO_USER_ADDRESS, type CreateSessionResult } from "@/lib/wave-api"
import { useWallet } from "@/lib/wallet"
import { useGrantDelegation } from "@/hooks/use-grant-delegation"
import { ConnectButton } from "@/components/connect-button"

const SUGGESTIONS = [
  "Recommend one low-risk onchain strategy to grow idle stablecoins for a beginner",
  "Research the best Ethereum L2 for a low-cost consumer payments app and pick one",
  "Decide whether to bridge or swap to move USDC from Base to Arbitrum cheaply",
]

type Phase = "" | "creating" | "granting"

export default function NewSessionPage() {
  const router = useRouter()
  const wallet = useWallet()
  const { grant } = useGrantDelegation()

  const [intent, setIntent] = useState("")
  const [budget, setBudget] = useState(5)
  const [grantEnabled, setGrantEnabled] = useState(true)
  const [phase, setPhase] = useState<Phase>("")
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateSessionResult | null>(null)

  const tooShort = intent.trim().length < 20
  const tooLong = intent.trim().length > 500
  const busy = phase !== ""

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tooShort || tooLong || busy) return
    setError(null)
    try {
      setPhase("creating")
      const session = created ?? (await createSession({
        userIntent: intent.trim(),
        budgetUsdc: budget,
        userAddress: wallet.address ?? DEMO_USER_ADDRESS,
      }))
      setCreated(session)

      if (wallet.address && grantEnabled) {
        setPhase("granting")
        try {
          await grant({
            sessionId: session.sessionId,
            account: wallet.address,
            delegateAddress: session.agentAddresses[0] as `0x${string}`,
            budgetUsdc: budget,
          })
        } catch (err) {
          // Grant is best-effort — the collapse still runs without it.
          setError(`Delegation skipped: ${(err as Error).message}`)
          setPhase("")
          return
        }
      }
      router.push(`/session/${session.sessionId}`)
    } catch (err) {
      setError((err as Error).message)
      setPhase("")
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 py-20">
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden />

      <div className="relative z-10 w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
          >
            ← Wave Protocol
          </a>
          <ConnectButton
            address={wallet.address}
            connect={() => wallet.connect().catch((e) => setError((e as Error).message))}
            connecting={wallet.connecting}
            hasWallet={wallet.hasWallet}
            disconnect={wallet.disconnect}
          />
        </div>

        <div className="mt-8 mb-12">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">New Session</span>
          <h1 className="mt-4 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            RUN A COLLAPSE
          </h1>
          <p className="mt-4 font-mono text-sm text-muted-foreground leading-relaxed max-w-md">
            Submit one intent and a budget. Three agents will explore it in superposition; the chain
            collapses to the winner.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-10">
          {/* Intent */}
          <div>
            <label className="flex items-baseline justify-between mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Intent</span>
              <span className={`font-mono text-[10px] ${tooLong ? "text-destructive" : "text-muted-foreground/50"}`}>
                {intent.trim().length}/500
              </span>
            </label>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={4}
              placeholder="Research X and recommend one decision…"
              className="w-full resize-none bg-card border border-border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent transition-colors"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setIntent(s)}
                  className="font-mono text-[10px] text-muted-foreground/70 border border-border/60 px-2 py-1 hover:border-accent hover:text-accent transition-colors text-left"
                >
                  {s.length > 42 ? s.slice(0, 42) + "…" : s}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="flex items-baseline justify-between mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Budget</span>
              <span className="font-mono text-xs text-accent">{budget.toFixed(0)} USDC</span>
            </label>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-[oklch(0.7_0.2_45)]"
            />
            <p className="mt-2 font-mono text-[10px] text-muted-foreground/60">
              Split across agents — 40% Research · 35% Analysis · 25% Execution.
            </p>
          </div>

          {/* ERC-7715 grant toggle (only when a wallet is connected) */}
          {wallet.address && (
            <label className="flex items-start gap-3 border border-border/60 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={grantEnabled}
                onChange={(e) => setGrantEnabled(e.target.checked)}
                className="mt-0.5 accent-[oklch(0.7_0.2_45)]"
              />
              <span>
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground">
                  Delegate USDC budget (ERC-7715)
                </span>
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground/70 leading-relaxed">
                  Sign a spending cap to Agent A in MetaMask Flask. The winning agent can then spend within it.
                </span>
              </span>
            </label>
          )}

          {error && <p className="font-mono text-xs text-destructive border border-destructive/40 px-4 py-3">{error}</p>}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={tooShort || tooLong || busy}
              className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
            >
              {phase === "creating" ? "Initializing onchain…" : phase === "granting" ? "Awaiting signature…" : "Run a Collapse"}
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>

            {/* If the grant failed, let the demo proceed without it */}
            {created && error && (
              <button
                type="button"
                onClick={() => router.push(`/session/${created.sessionId}`)}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
              >
                Skip & continue →
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
