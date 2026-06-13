"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createSession, DEMO_USER_ADDRESS } from "@/lib/wave-api"

const SUGGESTIONS = [
  "Recommend one low-risk onchain strategy to grow idle stablecoins for a beginner",
  "Research the best Ethereum L2 for a low-cost consumer payments app and pick one",
  "Decide whether to bridge or swap to move USDC from Base to Arbitrum cheaply",
]

export default function NewSessionPage() {
  const router = useRouter()
  const [intent, setIntent] = useState("")
  const [budget, setBudget] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = intent.trim().length < 20
  const tooLong = intent.trim().length > 500

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tooShort || tooLong || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const { sessionId } = await createSession({
        userIntent: intent.trim(),
        budgetUsdc: budget,
        userAddress: DEMO_USER_ADDRESS,
      })
      router.push(`/session/${sessionId}`)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 py-20">
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden />

      <div className="relative z-10 w-full max-w-2xl">
        <a
          href="/"
          className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
        >
          ← Wave Protocol
        </a>

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
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Intent
              </span>
              <span
                className={`font-mono text-[10px] ${
                  tooLong ? "text-destructive" : "text-muted-foreground/50"
                }`}
              >
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
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Budget
              </span>
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

          {error && (
            <p className="font-mono text-xs text-destructive border border-destructive/40 px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={tooShort || tooLong || submitting}
            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
          >
            {submitting ? "Initializing onchain…" : "Run a Collapse"}
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
          {tooShort && intent.length > 0 && (
            <span className="ml-4 font-mono text-[10px] text-muted-foreground/60">min 20 characters</span>
          )}
        </form>
      </div>
    </main>
  )
}
