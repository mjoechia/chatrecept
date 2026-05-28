// Phase 1 policy engine for map-lookup access control. Consolidates every
// gating check into one side-effect-free function so map/route.ts stays a
// simple `if (!policy.allowed) reject(policy)` rather than an if/if/if
// chain. Pairs with the existing tier system (claws-users.ts) and the
// per-user spend tracking it owns.
//
// As Phase 2 lands (Redis-backed counters, dynamic costing), this is the
// file to split into evaluateAccessPolicy + calculateLookupCost +
// recordUsage. See jc/claws_cost.md §6a + Lever 7 future-split note.

import type { ClawsUser, Tier } from './claws-users'

export interface TierLimits {
  dailyCountMax: number  // max fresh lookups per UTC day
  dailySgdMax:   number  // hard SGD ceiling per UTC day
  monthlySgdMax: number  // hard SGD ceiling per calendar month UTC
}

// Per-tier defaults. Tunable in code (per-tier shape) + env (the SGD
// ceilings — single value applies to every non-zero tier). pending/none
// are zeroed to make blocked tiers explicit in the same shape.
const TIER_DAILY_COUNT: Record<Tier, number> = {
  pending:        0,
  none:           0,
  map_once_daily: 1,
  trial:          20,
}

// Admins use the same SGD ceiling but a higher daily count so internal
// dev / demos don't hit the trial-user cap.
const ADMIN_DAILY_COUNT = 100

export function getEffectiveLimits(claws: ClawsUser): TierLimits {
  const dailyCountMax = claws.is_admin
    ? ADMIN_DAILY_COUNT
    : TIER_DAILY_COUNT[claws.tier]

  // Env overrides — same value applies to every tier that has any access.
  // Pending/none users still get 0 dailyCountMax even with the env set,
  // because TIER_DAILY_COUNT[pending] is 0.
  const dailySgdMax   = Number(process.env.MAX_DAILY_SPEND_PER_USER_SGD   ?? 20)
  const monthlySgdMax = Number(process.env.MAX_MONTHLY_SPEND_PER_USER_SGD ?? 150)

  return { dailyCountMax, dailySgdMax, monthlySgdMax }
}

export type PolicyReason =
  | 'pending'
  | 'none'
  | 'trial_expired'
  | 'daily_count'
  | 'daily_sgd'
  | 'monthly_sgd'

export interface PolicyDecision {
  allowed: boolean
  reason?: PolicyReason
  copy?:   string
  status?: 403 | 429
  // Detail values surfaced back to the client so the UI can render
  // count-based breakdowns. Intentionally no SGD fields — pricing
  // detail stays out of user-visible response envelopes.
  detail?: {
    daily_count?: number
    daily_max?:   number
  }
}

export interface PolicyContext {
  postcode: string
  // Caller-determined: true when the same user+postcode hit the live
  // pipeline within the dedup window (Lever 5). Set to true to bypass
  // all caps — re-opens of recently-paid zones are always free.
  dedupHit: boolean
}

// Side-effect free. Safe to call from /api/me for display purposes as
// well as from map/route.ts as the live gate. Burst limiting is
// separate (see lib/burst-limit.ts) because it mutates state and
// shouldn't fire on every /api/me poll.
export function evaluateLookupPolicy(
  claws: ClawsUser,
  ctx: PolicyContext,
): PolicyDecision {
  // Dedup wins over everything else — same zone within window is free.
  if (ctx.dedupHit) return { allowed: true }

  const limits = getEffectiveLimits(claws)
  const now    = new Date()
  const today  = now.toISOString().slice(0, 10)
  const month  = today.slice(0, 7)

  // Tier gating (admins skip tier gates — already encoded via getEffectiveLimits).
  if (!claws.is_admin) {
    if (claws.tier === 'pending') {
      return {
        allowed: false, reason: 'pending', status: 403,
        copy: 'Your account is pending admin approval.',
      }
    }
    if (claws.tier === 'none') {
      return {
        allowed: false, reason: 'none', status: 403,
        copy: 'Your account does not have mapping access. Reply on WhatsApp to discuss.',
      }
    }
    if (claws.tier === 'trial' && claws.trial_ends_at && new Date(claws.trial_ends_at) <= now) {
      return {
        allowed: false, reason: 'trial_expired', status: 403,
        copy: `Your trial wrapped on ${new Date(claws.trial_ends_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}. Reply on WhatsApp to renew.`,
      }
    }
  }

  // Daily fresh-count.
  const dailyCount = claws.daily_map_day === today ? Number(claws.daily_map_count ?? 0) : 0
  if (dailyCount >= limits.dailyCountMax) {
    return {
      allowed: false, reason: 'daily_count', status: 429,
      copy: limits.dailyCountMax === 1
        ? "You've used today's lookup. Cached zones below still load instantly. Come back tomorrow."
        : `${limits.dailyCountMax} fresh zones today — that's a heavy session. Cached zones below still load instantly. Tomorrow's allowance refreshes at midnight SGT.`,
      detail: { daily_count: dailyCount, daily_max: limits.dailyCountMax },
    }
  }

  // Daily SGD (defence layer behind the count cap). User-facing copy
  // omits the dollar amount; detail omitted so DevTools can't surface
  // the figure either.
  const dailySpend = claws.spend_day === today ? Number(claws.spend_today_sgd ?? 0) : 0
  if (dailySpend >= limits.dailySgdMax) {
    return {
      allowed: false, reason: 'daily_sgd', status: 429,
      copy: `Today's data quota's wrapped up. New zones unlock at midnight SGT. Cached zones stay open — keep browsing.`,
    }
  }

  // Monthly SGD (the durable ceiling). User-facing copy intentionally
  // omits the dollar amount — pricing detail belongs in /admin only.
  const monthlySpend = claws.spend_month === month ? Number(claws.spend_month_sgd ?? 0) : 0
  if (monthlySpend >= limits.monthlySgdMax) {
    return {
      allowed: false, reason: 'monthly_sgd', status: 429,
      copy: `This month's mapping is wrapped. It refreshes on the 1st. Reply on WhatsApp to extend early.`,
    }
  }

  // Count-only detail for the "you're fine" path — used nowhere today,
  // kept minimal so future callers can read N/max without pulling SGD.
  return {
    allowed: true,
    detail: {
      daily_count: dailyCount,
      daily_max:   limits.dailyCountMax,
    },
  }
}
