// 1 free try per IP per 24 hours.
// MVP: in-memory. Swap to Redis with sliding-window in production.

const store = new Map<string, number[]>() // ip -> timestamps

export function checkRateLimit(ip: string, maxPerDay = 1): { allowed: boolean; resetAt: number } {
  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000
  const history = (store.get(ip) ?? []).filter(t => t > dayAgo)

  if (history.length >= maxPerDay) {
    const resetAt = Math.min(...history) + 24 * 60 * 60 * 1000
    return { allowed: false, resetAt }
  }

  history.push(now)
  store.set(ip, history)
  return { allowed: true, resetAt: now + 24 * 60 * 60 * 1000 }
}

export function getClientIp(headers: Headers): string {
  // Trust the first IP in x-forwarded-for (Railway sets this)
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}
