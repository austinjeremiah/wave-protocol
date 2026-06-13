"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

const navItems = [
  { id: "hero", label: "Index" },
  { id: "signals", label: "How" },
  { id: "work", label: "Stack" },
  { id: "principles", label: "Principles" },
  { id: "colophon", label: "Colophon" },
]

export function SideNav() {
  const [activeSection, setActiveSection] = useState("hero")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { threshold: 0.3 },
    )

    navItems.forEach(({ id }) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <div className="fixed inset-x-0 top-4 z-50 hidden md:flex justify-center pointer-events-none">
      <nav className="glass pointer-events-auto flex items-center gap-1 px-2 py-2">
        {navItems.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => scrollToSection(id)}
            className={cn(
              "group flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors duration-200",
              activeSection === id ? "text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-all duration-300",
                activeSection === id ? "bg-accent scale-125" : "bg-muted-foreground/40 group-hover:bg-foreground/60",
              )}
            />
            {label}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border/60" />
        <a
          href="/explore"
          className="flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
        >
          Explore
        </a>
        <a
          href="/agents"
          className="flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
        >
          Agents
        </a>
        <a
          href="/portfolio"
          className="flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
        >
          Positions
        </a>
      </nav>
    </div>
  )
}
