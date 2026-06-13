"use client"

export function ConnectButton({
  address,
  connect,
  connecting,
  hasWallet,
}: {
  address: `0x${string}` | null
  connect: () => void
  connecting: boolean
  hasWallet: boolean
}) {
  if (!hasWallet) {
    return (
      <a
        href="https://docs.metamask.io/snaps/get-started/install-flask/"
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
      >
        Install MetaMask Flask ↗
      </a>
    )
  }

  if (address) {
    return (
      <span className="inline-flex items-center gap-2 border border-accent/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
    )
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="border border-foreground/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all disabled:opacity-40"
    >
      {connecting ? "Connecting…" : "Connect Flask"}
    </button>
  )
}
