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
  TERRITORY: 30 * 24 * 60 * 60,   // 30 days
  PLACE:     90 * 24 * 60 * 60,   // 90 days
  DOMAIN:   180 * 24 * 60 * 60,   // 180 days
}
