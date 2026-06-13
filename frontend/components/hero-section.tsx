"use client"

import { useEffect, useRef } from "react"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { SplitFlapText, SplitFlapMuteToggle, SplitFlapAudioProvider } from "@/components/split-flap-text"
import { AnimatedNoise } from "@/components/animated-noise"
import { BitmapChevron } from "@/components/bitmap-chevron"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !contentRef.current) return

    const ctx = gsap.context(() => {
      gsap.to(contentRef.current, {
        y: -100,
        opacity: 0,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="hero" className="relative min-h-screen flex items-center justify-center px-6 pt-20 pb-16">
      <AnimatedNoise opacity={0.03} />

      {/* Left vertical labels */}
      <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground -rotate-90 origin-left block whitespace-nowrap">
          PROTOCOL
        </span>
      </div>

      {/* Main content */}
      <div ref={contentRef} className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <SplitFlapAudioProvider>
          <div className="relative flex flex-col items-center">
            <SplitFlapText text="WAVE" speed={80} />
            <div className="mt-4">
              <SplitFlapMuteToggle />
            </div>
          </div>
        </SplitFlapAudioProvider>

        <h2 className="font-[var(--font-bebas)] text-foreground/85 text-[clamp(1rem,3vw,2rem)] mt-4 tracking-wide">
          Strategies in superposition. Consensus onchain.
        </h2>

        <p className="mt-12 max-w-md font-mono text-sm text-foreground/70 leading-relaxed">
          Deposit idle USDC. Three AI agents debate in parallel and stake real conviction — a custom
          caveat enforcer collapses them to one consensus strategy onchain. You own the position and
          the yield.
        </p>

        <div className="mt-16 flex items-center justify-center gap-8">
          <a
            href="/session/new"
            className="group glass glass-hover inline-flex items-center gap-3 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:text-accent"
          >
            <ScrambleTextOnHover text="Deploy Your USDC" as="span" duration={0.6} />
            <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
          </a>
          <a
            href="#signals"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            How It Works
          </a>
        </div>
      </div>

      {/* Floating info tag */}
      <div className="absolute bottom-8 right-8 md:bottom-12 md:right-12">
        <div className="glass inline-flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Base Sepolia / Live
        </div>
      </div>
    </section>
  )
}
