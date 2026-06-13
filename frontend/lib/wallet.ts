"use client"

import { useCallback, useEffect, useState } from "react"

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<any>
  on?: (e: string, cb: (...a: any[]) => void) => void
  removeListener?: (e: string, cb: (...a: any[]) => void) => void
}
type Eip6963Detail = { info: { uuid: string; name: string; rdns: string }; provider: Eip1193 }

// EIP-6963: collect all injected wallets so we can pick MetaMask specifically (instead of
// whatever wallet happened to grab window.ethereum).
const discovered: Eip6963Detail[] = []
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const detail = (e as CustomEvent<Eip6963Detail>).detail
    if (detail?.info && !discovered.some((d) => d.info.rdns === detail.info.rdns)) {
      discovered.push(detail)
    }
  })
  window.dispatchEvent(new Event("eip6963:requestProvider"))
}

/** Prefer MetaMask Flask → MetaMask → window.ethereum. */
export function getEthereum(): Eip1193 | null {
  if (typeof window === "undefined") return null
  const flask = discovered.find((d) => /flask/i.test(d.info.rdns) || /flask/i.test(d.info.name))
  if (flask) return flask.provider
  const mm = discovered.find((d) => /metamask/i.test(d.info.rdns) || /metamask/i.test(d.info.name))
  if (mm) return mm.provider
  return (window as { ethereum?: Eip1193 }).ethereum ?? null
}

/**
 * Wallet connection (no wagmi). We do NOT auto-read the connected account on mount — the
 * address only appears after the user explicitly clicks Connect, so no surprise wallet shows.
 * ERC-7715 needs MetaMask Flask; getEthereum() targets it via EIP-6963.
 */
export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [hasWallet, setHasWallet] = useState(false)

  useEffect(() => {
    // Give wallets a tick to announce via EIP-6963, then flag availability.
    const t = setTimeout(() => setHasWallet(!!getEthereum()), 300)
    return () => clearTimeout(t)
  }, [])

  const connect = useCallback(async (): Promise<`0x${string}` | null> => {
    const eth = getEthereum()
    if (!eth) throw new Error("MetaMask not found. Install MetaMask Flask for ERC-7715.")
    setConnecting(true)
    try {
      const accs: string[] = await eth.request({ method: "eth_requestAccounts" })
      const addr = (accs?.[0] as `0x${string}`) ?? null
      setAddress(addr)
      return addr
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => setAddress(null), [])

  return { address, connect, connecting, hasWallet, disconnect }
}
