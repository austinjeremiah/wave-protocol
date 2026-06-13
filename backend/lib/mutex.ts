/**
 * Process-wide serialization for backend-EOA transactions.
 *
 * Every onchain write — x402 settlements, reasoning-hash submits, session init, winner redeem —
 * is sent from ONE funded EOA. Firing several at once (e.g. the 3 agents settling their x402
 * tolls in parallel during reasoning) makes them race on that EOA's nonce AND keeps multiple txs
 * pending simultaneously, which Base Sepolia rejects ("in-flight transaction limit reached",
 * "replacement transaction underpriced"). Chaining them through a single promise runs them
 * one-at-a-time: each broadcasts with a clean, advancing nonce, and since settle()/writeContract
 * flows resolve once their tx is sent (settle also waits for its receipt), at most one is pending.
 *
 * Cheap and process-local — fine for this single-process backend. (For multi-instance you'd move
 * this to a Redis lock, but the demo runs one Next.js process.)
 */
let tail: Promise<unknown> = Promise.resolve()

export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  // Run `fn` after whatever is currently queued, regardless of its outcome.
  const result = tail.then(fn, fn)
  // Keep the chain alive even if this task throws — a failed tx must not wedge the lock.
  tail = result.then(
    () => undefined,
    () => undefined
  )
  return result
}
