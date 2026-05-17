// Daily spend tracker — protects against runaway API cost.
// MVP: in-memory counter that resets at midnight UTC.
// Production: persist to Supabase / Redis for multi-instance accuracy.

// Approximate cost of one uncached territory lookup (in SGD):
// - Google Geocoding: ~0.007
// - Places Nearby Search: ~0.027
// - Place Details × 20: ~0.46
// - Web scrape × 20: ~0.10 (mostly Claude tokens if AI extraction kicks in)
// - Claude Haiku hook: ~0.04
// Sum ≈ SGD 0.60
const COST_PER_UNCACHED_LOOKUP_SGD = 0.60

let todaySpend = 0
let todayKey   = ''

function todayBucket(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}

function rollover() {
  const key = todayBucket()
  if (key !== todayKey) { todayKey = key; todaySpend = 0 }
}

export function recordLookupSpend(cost = COST_PER_UNCACHED_LOOKUP_SGD): void {
  rollover()
  todaySpend += cost
}

export function getTodaySpend(): number {
  rollover()
  return todaySpend
}

export function getDailyCap(): number {
  return Number(process.env.MAX_DAILY_SPEND_SGD ?? 20)
}

export function isOverBudget(): boolean {
  return getTodaySpend() >= getDailyCap()
}

export function remainingBudget(): number {
  return Math.max(0, getDailyCap() - getTodaySpend())
}
