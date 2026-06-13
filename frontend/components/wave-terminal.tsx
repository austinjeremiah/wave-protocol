"use client"

import { useEffect, useRef } from "react"
import { type WaveEvent, basescanTx } from "@/lib/wave-api"
import { cn } from "@/lib/utils"

type Tone = "muted" | "accent" | "win" | "exec" | "error"

interface LogLine {
  id: string
  icon: string
  text: string
  txHash?: string
  tone: Tone
}

const TONE: Record<Tone, string> = {
  muted: "text-foreground/75",
  accent: "text-accent",
  win: "text-accent font-semibold",
  exec: "text-emerald-400",
  error: "text-destructive",
}

/**
 * Map the raw SSE event stream to a clean terminal feed — only the MAIN milestones (drops the
 * noisy per-token reasoning chunks). Every onchain step carries its tx hash so the user can jump
 * straight to Basescan from the UI.
 */
function toLines(events: WaveEvent[]): LogLine[] {
  const lines: LogLine[] = []
  events.forEach((e, i) => {
    const id = `${e.type}-${i}`
    switch (e.type) {
      case "agents_started":
        lines.push({ id, icon: "◆", text: `superposition · ${e.agentCount} agents reasoning (venice × x402)`, tone: "accent" })
        break
      case "agent_done":
        lines.push({ id, icon: "✓", text: `agent ${e.agentId} · ${e.role.toLowerCase()} · confidence ${e.confidence}`, tone: "muted" })
        break
      case "debate_started":
        lines.push({ id, icon: "⚡", text: `debate round — agents critiquing peers + placing conviction bets`, tone: "accent" })
        break
      case "confidence_shift":
        lines.push({
          id,
          icon: "↕",
          text: `agent ${e.agentId} · ${e.from}→${e.to} conf · staked $${e.convictionBetUsdc.toFixed(4)}`,
          tone: "muted",
        })
        if (e.critique)
          lines.push({ id: `${id}-c`, icon: "💬", text: `agent ${e.agentId}: “${e.critique}”`, tone: "accent" })
        break
      case "debate_complete":
        lines.push({ id, icon: "✓", text: `debate locked — revised confidences set`, tone: "muted" })
        break
      case "hash_submitted":
        lines.push({ id, icon: "↑", text: `agent ${e.agentId} reasoning hash → base sepolia`, txHash: e.txHash, tone: "muted" })
        break
      case "wavefunction_collapsed":
        lines.push({
          id,
          icon: "★",
          text: `WAVEFUNCTION COLLAPSED → winner agent ${e.winnerAgentId} (conf ${e.winnerConfidence})`,
          tone: "win",
        })
        break
      case "execution_started":
        lines.push({ id, icon: "⚙", text: `executing winner strategy → compound v3`, tone: "exec" })
        break
      case "execution_redeemed":
        lines.push({
          id,
          icon: "$",
          text: e.viaDelegation ? `delegation redeemed — your USDC → vault` : `treasury funded — USDC → vault`,
          txHash: e.txHash,
          tone: "exec",
        })
        break
      case "execution_supplied":
        lines.push({ id, icon: "🌊", text: `supplied to ${e.protocol.toLowerCase()} — you own it, earning yield`, txHash: e.txHash, tone: "exec" })
        break
      case "execution_complete":
        lines.push({ id, icon: "◆", text: `session complete`, tone: "accent" })
        break
      case "error":
        lines.push({ id, icon: "✗", text: e.message.slice(0, 100), tone: "error" })
        break
    }
  })
  return lines
}

export function WaveTerminal({
  events,
  connected,
}: {
  events: WaveEvent[]
  connected: boolean
}) {
  const lines = toLines(events)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the log to the latest line.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      {/* terminal header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-destructive/60" />
          <span className="h-2 w-2 rounded-full bg-accent/60" />
          <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">wave.log</span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
          <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-border")} />
          {connected ? "live" : "idle"}
        </span>
      </div>

      {/* log body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-muted-foreground/60">
            {connected ? "› awaiting agents…" : "› connecting…"}
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent/60 align-middle" />
          </p>
        ) : (
          <div className="space-y-1.5">
            {lines.map((l) => (
              <div key={l.id} className="flex items-start gap-2">
                <span className={cn("shrink-0 select-none", TONE[l.tone])}>{l.icon}</span>
                <span className={cn("flex-1 break-words", TONE[l.tone])}>
                  {l.text}
                  {l.txHash && (
                    <a
                      href={basescanTx(l.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-0.5 rounded-md border border-current/50 px-1.5 py-0.5 text-[9px] uppercase tracking-widest opacity-90 transition-opacity hover:opacity-100 hover:underline"
                    >
                      explorer ↗
                    </a>
                  )}
                </span>
              </div>
            ))}
            {/* blinking cursor */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-accent/60">›</span>
              <span className="inline-block h-3 w-1.5 animate-pulse bg-accent/60" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
