"use client"

import { useEffect, useMemo, useState } from "react"
import {
  getMarket,
  basescanTx,
  basescanAddress,
  AGENT_ROLES,
  type StrategyListing,
  type StrategyPurchaseRecord,
} from "@/lib/wave-api"
import { buyStrategy } from "@/lib/market-x402"
import { AGENT_WAVE_COLORS } from "@/components/wave-field"
import { useWallet } from "@/lib/wallet"
import { ConnectButton } from "@/components/connect-button"
import { cn } from "@/lib/utils"

export default function MarketPage() {
  const wallet = useWallet()
  const [listings, setListings] = useState<StrategyListing[] | null>(null)
  const [purchases, setPurchases] = useState<StrategyPurchaseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      const data = await getMarket()
      setListings(data.listings)
      setPurchases(data.purchases)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const mine = useMemo(
    () =>
      (listings ?? []).filter(
        (l) => wallet.address && l.sellerAddress.toLowerCase() === wallet.address.toLowerCase(),
      ),
    [listings, wallet.address],
  )
  const active = useMemo(() => (listings ?? []).filter((l) => l.active), [listings])

  return (
    <main className="relative min-h-screen px-6 py-12 md:px-12">
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden />
      <div className="glow-ambient" aria-hidden />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <a href="/" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
              ← Wave Protocol
            </a>
            <a href="/explore" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
              Explore
            </a>
            <a href="/agents" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
              Agents
            </a>
            <a href="/portfolio" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">
              Positions
            </a>
          </div>
          <ConnectButton
            address={wallet.address}
            connect={() => wallet.connect().catch((e) => setError((e as Error).message))}
            connecting={wallet.connecting}
            hasWallet={wallet.hasWallet}
            disconnect={wallet.disconnect}
          />
        </div>

        {/* title */}
        <div className="mt-10 mb-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Market</span>
          <h1 className="mt-3 font-[var(--font-bebas)] text-6xl md:text-7xl tracking-tight leading-none">
            STRATEGIES, TRADED
          </h1>
          <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Every listing is a strategy that already won an onchain collapse. Buy one and the proven
            play re-deploys to <span className="text-foreground">your own</span> Compound position —
            no debate to re-run. You pay the seller in USDC over x402; they earn on every copy.
          </p>
          <p className="mt-3 max-w-xl font-mono text-[10px] text-muted-foreground/60 leading-relaxed">
            On Base Sepolia every strategy deploys to Compound V3 — the trade proves the mechanism:
            verifiable provenance + a real x402 sale rail. Venue differentiation lands at mainnet.
          </p>
        </div>

        {error && (
          <p className="mb-6 rounded-xl border border-destructive/40 px-4 py-3 font-mono text-xs text-destructive">{error}</p>
        )}

        {/* Listed strategies */}
        <SectionHeader label="Listed Strategies" count={active.length} />
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="glass h-56 animate-pulse" />)}</div>
        ) : active.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((l) => (
              <ListingCard
                key={l.listingId}
                listing={l}
                buyer={wallet.address}
                onBought={refresh}
                onError={setError}
              />
            ))}
          </div>
        )}

        {/* My listings */}
        {wallet.address && mine.length > 0 && (
          <>
            <SectionHeader label="My Listings" count={mine.length} className="mt-14" />
            <div className="grid gap-4 md:grid-cols-2">
              {mine.map((l) => (
                <div key={l.listingId} className="glass flex items-center justify-between p-5">
                  <div>
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.25em]"
                      style={{ color: AGENT_WAVE_COLORS[l.winnerAgentId] ?? "var(--accent)" }}
                    >
                      {l.role ?? AGENT_ROLES[l.winnerAgentId]} · #{l.listingId}
                    </span>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                      {l.purchases} {l.purchases === 1 ? "copy" : "copies"} · earned ${(l.purchases * l.priceUsdc).toFixed(2)}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-accent">${l.priceUsdc.toFixed(2)}<span className="text-[9px] text-muted-foreground/60">/copy</span></span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recently purchased */}
        {purchases.length > 0 && (
          <>
            <SectionHeader label="Recently Purchased" count={purchases.length} className="mt-14" />
            <div className="glass divide-y divide-border/30">
              {purchases.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 font-mono text-[11px]">
                  <span className="text-muted-foreground/70">#{p.listingId}</span>
                  <a href={basescanAddress(p.buyerAddress)} target="_blank" rel="noreferrer" className="text-foreground/80 hover:text-accent">
                    {p.buyerAddress.slice(0, 6)}…{p.buyerAddress.slice(-4)}
                  </a>
                  <span className="text-muted-foreground/60">copied · {p.deployedUsdc} USDC deployed</span>
                  <div className="ml-auto flex items-center gap-3">
                    {p.sellerPaymentTx && (
                      <a href={basescanTx(p.sellerPaymentTx)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        x402 ↗
                      </a>
                    )}
                    {p.supplyTxHash && (
                      <a href={basescanTx(p.supplyTxHash)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                        supply ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

// ── pieces ───────────────────────────────────────────────────────

function SectionHeader({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <div className={cn("mb-5 flex items-center gap-3", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground">{label}</span>
      <span className="font-mono text-[10px] text-muted-foreground/50">{count}</span>
      <div className="h-px flex-1 bg-border/30" />
    </div>
  )
}

function ListingCard({
  listing,
  buyer,
  onBought,
  onError,
}: {
  listing: StrategyListing
  buyer: `0x${string}` | null
  onBought: () => void
  onError: (m: string) => void
}) {
  const [deploy, setDeploy] = useState(2)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ sellerPaymentTx: string; supplyTxHash: string } | null>(null)
  const color = AGENT_WAVE_COLORS[listing.winnerAgentId] ?? "var(--accent)"
  const isMine = buyer && listing.sellerAddress.toLowerCase() === buyer.toLowerCase()

  async function onBuy() {
    if (!buyer) return onError("Connect a wallet to buy a strategy")
    setBusy(true)
    onError("")
    try {
      const res = await buyStrategy({ listingId: listing.listingId, buyerAddress: buyer, deployUsdc: deploy })
      setDone({ sellerPaymentTx: res.sellerPaymentTx, supplyTxHash: res.supplyTxHash })
      onBought()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass flex flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-5 rounded-full" style={{ background: color }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color }}>
            {listing.role ?? AGENT_ROLES[listing.winnerAgentId]} · #{listing.listingId}
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
          {listing.purchases} {listing.purchases === 1 ? "copy" : "copies"}
        </span>
      </div>

      {listing.userIntent && (
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-foreground/60 line-clamp-1 italic">
          &ldquo;{listing.userIntent}&rdquo;
        </p>
      )}
      {listing.reasoningExcerpt && (
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-foreground/75 line-clamp-4">
          {listing.reasoningExcerpt}
        </p>
      )}

      <div className="mt-4 flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {listing.confidence !== null && <span>conf {listing.confidence}</span>}
        <code className="normal-case tracking-normal text-muted-foreground/50">
          {listing.reasoningHash.slice(0, 8)}…
        </code>
        {listing.listTxHash && (
          <a href={basescanTx(listing.listTxHash)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            proof ↗
          </a>
        )}
      </div>

      {/* buy controls */}
      <div className="mt-5 border-t border-border/40 pt-4">
        {done ? (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Copied · you own a Compound position</span>
            <div className="flex items-center gap-4 font-mono text-[10px]">
              <a href={basescanTx(done.sellerPaymentTx)} target="_blank" rel="noreferrer" className="text-accent hover:underline">seller paid ↗</a>
              <a href={basescanTx(done.supplyTxHash)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">your supply ↗</a>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-accent">${listing.priceUsdc.toFixed(2)}<span className="text-[9px] text-muted-foreground/60">/copy</span></span>
              <label className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70">
                deploy
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={deploy}
                  onChange={(e) => setDeploy(Math.max(1, Number(e.target.value)))}
                  className="glass w-14 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:!border-accent"
                />
                USDC
              </label>
            </div>
            <button
              onClick={onBuy}
              disabled={busy || !!isMine}
              title={isMine ? "You can't buy your own listing" : undefined}
              className="glass glass-hover px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Signing…" : isMine ? "Yours" : "Buy →"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">No strategies listed yet</span>
      <p className="max-w-sm font-mono text-sm text-muted-foreground leading-relaxed">
        Run a debate to a collapse, then list the winning strategy — it shows up here for anyone to copy.
      </p>
      <a
        href="/session/new"
        className="glass glass-hover mt-2 inline-flex items-center gap-3 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:text-accent"
      >
        Start a debate →
      </a>
    </div>
  )
}
