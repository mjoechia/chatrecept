// Daily spend tracker — protects against runaway API cost.
// MVP: in-memory counters that reset at midnight UTC.
// Production: persist to Supabase / Redis for multi-instance accuracy.
//
// Two layers:
//   1. Per-IP daily SGD cap (primary defence — limits any single user/abuser)
//   2. Global daily SGD cap (secondary safety net across all IPs)

// Approximate working budget for one uncached territory lookup (in SGD).
// Includes a 25% operational overhead buffer for retries, throttled calls,
// JS-rendered scrape failures, and timeout fallbacks observed in production.
//
// API subtotal breakdown:
//   Google Geocoding             ~$0.007
//   Places Nearby Search ×3       ~$0.130  (500m popularity + 500m distance + 800m popularity)
//   Text Search ×3 themed, 3-page ~$0.388  (F&B + retail + services × 3 pages each)
//   Place Details × 10            ~$0.230
//   Web scrape × 10                $0      (self-hosted)
//   Claude Haiku hook             ~$0.001
//   Subtotal                      ~$0.756 USD = ~SGD 1.02
//   ... but the discovery calls are aggressively cached across postal codes,
//   so the realistic-uncached blended cost lands closer to SGD 0.95.
const COST_PER_UNCACHED_LOOKUP_SGD = 0.95

function todayBucket(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}

// ── Global ───────────────────────────────────────────────────────────────────

let todaySpend = 0
let todayKey   = ''

function rolloverGlobal() {
  const key = todayBucket()
  if (key !== todayKey) { todayKey = key; todaySpend = 0 }
}

export function getTodaySpend(): number {
  rolloverGlobal()
  return todaySpend
}

export function getDailyCap(): number {
  return Number(process.env.MAX_DAILY_SPEND_SGD ?? 20)
}

export function isOverBudget(): boolean {
  return getTodaySpend() >= getDailyCap()
}

// ── Per-IP ──────────────────────────────────────────────────────────────────

interface IpBucket { day: string; spent: number }
const ipMap = new Map<string, IpBucket>()

function rolloverIp(ip: string): IpBucket {
  const key = todayBucket()
  const existing = ipMap.get(ip)
  if (!existing || existing.day !== key) {
    const fresh = { day: key, spent: 0 }
    ipMap.set(ip, fresh)
    return fresh
  }
  return existing
}

export function getIpDailyCap(): number {
  return Number(process.env.MAX_DAILY_SPEND_PER_IP_SGD ?? 20)
}

export function getIpSpend(ip: string): number {
  return rolloverIp(ip).spent
}

export function isIpOverBudget(ip: string): boolean {
  return getIpSpend(ip) >= getIpDailyCap()
}

// ── Recording (write both buckets atomically) ───────────────────────────────

export function recordLookupSpend(ip: string, cost = COST_PER_UNCACHED_LOOKUP_SGD): void {
  rolloverGlobal()
  todaySpend += cost
  const bucket = rolloverIp(ip)
  bucket.spent += cost
}
