// Per-user in-memory burst limiter (Lever 4). MVP only — swap to Redis
// (Phase 2) before going multi-instance, since each Railway instance
// has its own Map and under-protection compounds with horizontal scale.
// See jc/claws_cost.md §6a for the migration plan.
//
// Anti-abuse, not anti-cost. Real users almost never hit five fresh
// lookups in five minutes. Scripts and click-spam do.

const WINDOW_MS    = 5 * 60 * 1000   // 5 minutes
const MAX_IN_WINDOW = 5

// userId → recent attempt timestamps (oldest first). Trimmed on every
// access so old entries don't pile up.
const store = new Map<string, number[]>()

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS
  let i = 0
  while (i < timestamps.length && timestamps[i] < cutoff) i++
  return i === 0 ? timestamps : timestamps.slice(i)
}

// Returns { ok: false } if the user is already at the limit in the
// current window. Side-effect free — call before deciding to run the
// live pipeline.
export function checkBurst(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now    = Date.now()
  const recent = prune(store.get(userId) ?? [], now)
  store.set(userId, recent)
  if (recent.length < MAX_IN_WINDOW) return { ok: true }

  const oldest    = recent[0]
  const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000))
  return { ok: false, retryAfterSec: retryAfter }
}

// Record a successful burst attempt. Only call when the live pipeline
// is about to run (not on cache / dedup hits — those don't count
// against burst since they're not real load).
export function recordBurst(userId: string): void {
  const now    = Date.now()
  const recent = prune(store.get(userId) ?? [], now)
  recent.push(now)
  store.set(userId, recent)
}
