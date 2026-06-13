"use client"

import { useEffect, useRef } from "react"

export interface WaveFieldAgent {
  agentId: number
  confidence: number | null
  status: "idle" | "thinking" | "debating" | "done"
}

// One distinct hue per lens so each wave is identifiable: Yield · Risk · Liquidity.
const COLORS: [number, number, number][] = [
  [16, 185, 129], // emerald-500 — Yield
  [251, 146, 60], // orange-400  — Risk
  [56, 189, 248], // sky-400     — Liquidity
]

/** CSS rgb() strings for the same per-lens palette — reused by the legend/labels. */
export const AGENT_WAVE_COLORS = ["rgb(16,185,129)", "rgb(251,146,60)", "rgb(56,189,248)"]
const FREQ = [0.011, 0.016, 0.022]
const SPEED = [1.0, 1.35, 0.75]
const PHASE = [0, 1.8, 3.4]

/**
 * The hero spectacle: a live <canvas> of 3 sine waves (one per agent) that SUPERPOSE into a
 * bright interference wave while the agents reason — amplitude grows with each agent's
 * confidence. On collapse the loser waves flatten to a dead line, the winner snaps into a bold
 * standing wave, and a shockwave + flash ripple out.
 *
 * It animates on requestAnimationFrame — continuously, independent of event timing — so the
 * motion is NEVER static even if a stream event is late or missed. Events only modulate it
 * (confidence → amplitude, collapsed → the collapse). That's the fix for "nothing animates":
 * the visual no longer depends on a fragile sequence of fast React state changes.
 */
export function WaveField({
  agents,
  collapsed,
  winnerId,
  supplied = false,
}: {
  agents: WaveFieldAgent[]
  collapsed: boolean
  winnerId: number | null
  /** True once the Compound V3 supply tx confirms — triggers teal shockwave. */
  supplied?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Latest props in a ref so the rAF loop reads them without re-subscribing every render.
  const live = useRef({ agents, collapsed, winnerId, supplied })
  live.current = { agents, collapsed, winnerId, supplied }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0
    let t = 0
    const amp = [0, 0, 0]
    let collapseT = 0
    let shock = -1
    let flash = 0
    let supplyShock = -1  // second shockwave for Compound V3 supply

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const draw = () => {
      const { agents, collapsed, winnerId, supplied } = live.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const midY = h / 2
      const base = h * 0.13
      t += 0.016

      // Collapse easing + one-shot shockwave/flash the moment it collapses.
      if (collapsed) {
        if (shock < 0) {
          shock = 0
          flash = 1
        }
        collapseT += (1 - collapseT) * 0.05
      }
      if (shock >= 0) shock += Math.max(6, w * 0.012)
      if (flash > 0) flash -= 0.04

      // Ease each wave's amplitude toward its target.
      const anyDebating = agents.some((x) => x.status === "debating")
      for (let i = 0; i < 3; i++) {
        const a = agents.find((x) => x.agentId === i)
        let target: number
        if (collapsed) target = i === winnerId ? h * 0.24 : 0
        else if (!a || a.status === "idle") target = base * 0.45
        else if (a.confidence != null) target = base * (0.55 + (a.confidence / 100) * 0.95)
        else if (a.status === "debating") target = base * 0.55 // in flux during debate
        else target = base * 0.7 // thinking, no confidence yet
        // During debate: add micro-jitter so waves look "in flux"
        const jitter = anyDebating && !collapsed ? (Math.random() - 0.5) * base * 0.04 : 0
        amp[i] += (target - amp[i]) * 0.05 + jitter
      }

      // Track if supply phase started (trigger supply shockwave once)
      if (supplied && supplyShock < 0) supplyShock = 0
      if (supplyShock >= 0) supplyShock += Math.max(4, w * 0.009)

      ctx.clearRect(0, 0, w, h)

      // Faint center axis.
      ctx.strokeStyle = "rgba(255,255,255,0.05)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, midY)
      ctx.lineTo(w, midY)
      ctx.stroke()

      // Individual agent waves (taper at the edges via a sine envelope).
      for (let i = 0; i < 3; i++) {
        const isWinner = collapsed && i === winnerId
        const [r, g, b] = COLORS[i]
        const alpha = collapsed ? (isWinner ? 1 : 0.12) : 0.5
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.lineWidth = isWinner ? 3 : 1.25
        ctx.beginPath()
        for (let x = 0; x <= w; x += 2) {
          const env = Math.sin((x / w) * Math.PI)
          const y = midY + Math.sin(x * FREQ[i] + t * SPEED[i] + PHASE[i]) * amp[i] * env
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // The bright SUPERPOSITION (sum of all three) — the interference, fades out as it collapses.
      // Kept white so it reads as the *combined* signal, distinct from the colored components.
      if (collapseT < 0.6) {
        ctx.strokeStyle = `rgba(245,245,245,${0.85 * (1 - collapseT)})`
        ctx.lineWidth = 2
        ctx.shadowBlur = 18
        ctx.shadowColor = "rgba(245,245,245,0.7)"
        ctx.beginPath()
        for (let x = 0; x <= w; x += 2) {
          const env = Math.sin((x / w) * Math.PI)
          let y = midY
          for (let i = 0; i < 3; i++) {
            y += Math.sin(x * FREQ[i] + t * SPEED[i] + PHASE[i]) * amp[i] * 0.5 * env
          }
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Debate phase: dotted noise overlay waves (signal in flux).
      if (anyDebating && !collapsed) {
        ctx.save()
        ctx.setLineDash([4, 8])
        for (let i = 0; i < 3; i++) {
          const [r, g, b] = COLORS[i]
          ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`
          ctx.lineWidth = 1
          ctx.beginPath()
          for (let x = 0; x <= w; x += 3) {
            const env = Math.sin((x / w) * Math.PI)
            const noise = (Math.random() - 0.5) * amp[i] * 0.35
            const y = midY + Math.sin(x * FREQ[i] * 2.3 + t * SPEED[i] * 1.8 + PHASE[i]) * amp[i] * 0.4 * env + noise
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
        ctx.restore()
      }

      // Collapse shockwave ring — in the winning lens's color.
      if (shock >= 0 && shock < w) {
        const al = Math.max(0, 1 - shock / w)
        const [wr, wg, wb] = winnerId != null ? COLORS[winnerId] : [245, 245, 245]
        ctx.strokeStyle = `rgba(${wr},${wg},${wb},${al * 0.75})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(w / 2, midY, shock, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Supply shockwave ring (green/teal — Compound V3 strategy deployed).
      if (supplyShock >= 0 && supplyShock < w * 1.2) {
        const al = Math.max(0, 1 - supplyShock / w)
        ctx.strokeStyle = `rgba(52,211,153,${al * 0.8})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(w / 2, midY, supplyShock, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Collapse flash.
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`
        ctx.fillRect(0, 0, w, h)
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}
