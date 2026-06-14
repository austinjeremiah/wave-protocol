"use client"

const links = [
  
  { href: "/explore", label: "Explore" },
  { href: "/market", label: "Market" },
  { href: "/stats", label: "Stats" },
  { href: "/agents", label: "Agents" },
  { href: "/portfolio", label: "Positions" },
]

export function SideNav() {
  return (
    <div className="fixed inset-x-0 top-4 z-50 hidden md:flex justify-center pointer-events-none">
      <nav className="glass pointer-events-auto flex items-center gap-1 px-2 py-2">
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}
