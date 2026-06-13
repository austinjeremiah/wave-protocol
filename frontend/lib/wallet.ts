"use client"

import { useCallback, useEffect, useState } from "react"

/** The injected EVM provider (MetaMask / Flask), or null. */
export function getEthereum(): { request: (a: { method: string; params?: unknown[] }) => Promise<any>; on?: (e: string, cb: (...a: any[]) => void) => void; removeListener?: (e: string, cb: (...a: any[]) => void) => void } | null {
  if (typeof window === "undefined") return null
  return (window as { ethereum?: any }).ethereum ?? null
}

/**
 * Minimal wallet connection over window.ethereum (no wagmi). ERC-7715 needs MetaMask Flask;
 * a regular wallet still connects (for the address) but the grant step will fail gracefully.
 */
export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [hasWallet, setHasWallet] = useState(false)

  useEffect(() => {
    const eth = getEthereum()
    setHasWallet(!!eth)
    if (!eth) return
    eth.request({ method: "eth_accounts" })
      .then((accs: string[]) => setAddress((accs?.[0] as `0x${string}`) ?? null))
      .catch(() => {})
    const onAccounts = (accs: string[]) => setAddress((accs?.[0] as `0x${string}`) ?? null)
    eth.on?.("accountsChanged", onAccounts)
    return () => eth.removeListener?.("accountsChanged", onAccounts)
  }, [])

  const connect = useCallback(async (): Promise<`0x${string}` | null> => {
    const eth = getEthereum()
    if (!eth) throw new Error("No EVM wallet found. Install MetaMask Flask for ERC-7715.")
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

  return { address, connect, connecting, hasWallet }
}
