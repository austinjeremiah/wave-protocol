"use client"

import { useRef, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function ColophonSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      // Header slide in
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Grid columns fade up with stagger
      if (gridRef.current) {
        const columns = gridRef.current.querySelectorAll(":scope > div")
        gsap.from(columns, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Footer fade in
      if (footerRef.current) {
        gsap.from(footerRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 95%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="colophon"
      className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-16">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">04 / Colophon</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">CREDITS</h2>
      </div>

      {/* Multi-column layout */}
      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 md:gap-12">
        {/* Contract */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Contract</h4>
          <ul className="space-y-2">
            <li>
              <a
                href="https://sepolia.basescan.org/address/0x3ec6F2c470e57f487709b153f77c02851fe864C5"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                Enforcer ↗
              </a>
            </li>
            <li className="font-mono text-xs text-muted-foreground/60">0x3ec6…64C5</li>
          </ul>
        </div>

        {/* Onchain */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Onchain</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Base Sepolia</li>
            <li className="font-mono text-xs text-foreground/80">USDC · x402</li>
            <li className="font-mono text-xs text-foreground/80">ERC-7710</li>
          </ul>
        </div>

        {/* Agents */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Agents</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Venice AI</li>
            <li className="font-mono text-xs text-foreground/80">Reasoning models</li>
            <li className="font-mono text-xs text-foreground/80">3 in parallel</li>
          </ul>
        </div>

        {/* Tracks */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Tracks</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">x402 + ERC-7710</li>
            <li className="font-mono text-xs text-foreground/80">Best Agent</li>
            <li className="font-mono text-xs text-foreground/80">A2A Coordination</li>
          </ul>
        </div>

        {/* Links */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Links</h4>
          <ul className="space-y-2">
            <li>
              <a
                href="/session/new"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                Run Demo →
              </a>
            </li>
            <li>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                GitHub ↗
              </a>
            </li>
          </ul>
        </div>

        {/* Chain */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Chain</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Base Sepolia</li>
            <li className="font-mono text-xs text-foreground/80">id 84532</li>
          </ul>
        </div>
      </div>

      {/* Bottom copyright */}
      <div
        ref={footerRef}
        className="mt-24 pt-8 border-t border-border/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          © 2025 Wave Protocol. Built on Base Sepolia.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">AI debates. You own the yield. Onchain.</p>
      </div>
    </section>
  )
}
