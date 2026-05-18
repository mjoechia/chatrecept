// In-memory cache with TTL. MVP only — swap to Redis when concurrent demand grows.
// Each entry: { value, expiresAt }

type Entry<T> = { value: T; expiresAt: number }

const store = new Map<string, Entry<unknown>>()

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = store.get(key) as Entry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

// TTLs from the plan §3
export const TTL = {
  TERRITORY: 14 * 24 * 60 * 60,   // 14 days default (per-zone override below)
  PLACE:     90 * 24 * 60 * 60,   // 90 days
  DOMAIN:   180 * 24 * 60 * 60,   // 180 days
}

// Variable territory cache TTL per zone density. SG SMEs churn faster in CBD
// (restaurants, closures, rebrands) than in suburban areas. Postal prefix is
// the cheapest signal we have for zone type.
//
// Returns TTL in seconds for use with cacheSet.
export function ttlForPostal(postalCode: string): number {
  const prefix = postalCode.slice(0, 2)
  // CBD / Marina / Orchard — high turnover
  if (['01','02','03','04','05','06','07','08','17','18','19','22','23'].includes(prefix)) {
    return 7 * 24 * 60 * 60
  }
  // Suburban office / industrial — lower turnover
  if (['60','61','62','63','64','69','70','71','72','73','75','76','79','80'].includes(prefix)) {
    return 21 * 24 * 60 * 60
  }
  // Everything else (heartland mixed) — default 14 days
  return 14 * 24 * 60 * 60
}
