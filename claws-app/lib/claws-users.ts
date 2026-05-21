// User record helpers — app_claws.users table.
// One row per authenticated user, joined to auth.users by auth_user_id.

import { createServiceClient } from './supabase'

export type Tier = 'pending' | 'none' | 'map_once_daily' | 'trial'

export interface ClawsUser {
  id:               string
  auth_user_id:     string
  email:            string
  name:             string | null
  tier:             Tier
  trial_ends_at:    string | null
  daily_map_count:  number
  daily_map_day:    string | null
  is_admin:         boolean
  spend_today_sgd:  number
  spend_day:        string | null
  created_at:       string
  updated_at:       string
}

// The master admin can never be demoted or have access removed. Set
// MASTER_ADMIN_EMAIL in Railway if a different person should own the system.
const MASTER_ADMIN_EMAIL = (process.env.MASTER_ADMIN_EMAIL ?? 'mjoechia@gmail.com').toLowerCase()

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export function isMasterAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return email.toLowerCase() === MASTER_ADMIN_EMAIL
}

function isBootstrapAdmin(email: string): boolean {
  return isMasterAdmin(email) || ADMIN_EMAILS.includes(email.toLowerCase())
}

// ── Access decisions ────────────────────────────────────────────────────────

export interface AccessDenied {
  ok: false
  reason: 'pending' | 'none' | 'trial_expired' | 'daily_limit_reached'
  message: string
}
export type AccessResult = { ok: true } | AccessDenied

// Decide whether this user can run a live map lookup *right now*. For
// map_once_daily this only checks the daily quota; consumeDailyMapAttempt
// must be called separately once the lookup actually succeeds, so we don't
// burn a user's only daily attempt on a failure.
export function checkAccess(u: ClawsUser, now: Date = new Date()): AccessResult {
  if (u.is_admin) return { ok: true }

  if (u.tier === 'pending') {
    return { ok: false, reason: 'pending', message: 'Your account is pending admin approval.' }
  }
  if (u.tier === 'none') {
    return { ok: false, reason: 'none', message: 'Your account does not have mapping access. Contact admin to request it.' }
  }
  if (u.tier === 'trial') {
    if (u.trial_ends_at && new Date(u.trial_ends_at) <= now) {
      return { ok: false, reason: 'trial_expired', message: 'Your trial has ended. Contact admin to renew.' }
    }
    return { ok: true }
  }
  if (u.tier === 'map_once_daily') {
    const today = now.toISOString().slice(0, 10)
    const count = u.daily_map_day === today ? u.daily_map_count : 0
    if (count >= 1) {
      return { ok: false, reason: 'daily_limit_reached', message: "You've used today's lookup. Come back tomorrow." }
    }
    return { ok: true }
  }
  // Unreachable for current Tier union, but keep a safe default
  return { ok: false, reason: 'none', message: 'No access.' }
}

// Convenience — true iff checkAccess would return ok. Used by /api/me.
export function canMap(u: ClawsUser, now: Date = new Date()): boolean {
  return checkAccess(u, now).ok
}

// Bump the daily map counter for tier=map_once_daily. No-op for any other
// tier (so it's safe to always call after a successful lookup).
export async function consumeDailyMapAttempt(authUserId: string): Promise<void> {
  const svc = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: u } = await svc
    .from('users')
    .select('tier, daily_map_count, daily_map_day')
    .eq('auth_user_id', authUserId)
    .single()
  if (!u || u.tier !== 'map_once_daily') return
  const current = u.daily_map_day === today ? Number(u.daily_map_count ?? 0) : 0
  await svc
    .from('users')
    .update({
      daily_map_count: current + 1,
      daily_map_day:   today,
      updated_at:      new Date().toISOString(),
    })
    .eq('auth_user_id', authUserId)
}

// ── Upsert on sign-in ───────────────────────────────────────────────────────

// Get an existing user record OR create one for a first-time Google sign-in.
// New users default to tier='pending' — they need admin approval before any
// live lookup. Master admin and bootstrap admins from ADMIN_EMAILS are
// promoted (is_admin=true) which bypasses the tier gate.
export async function upsertUser(args: {
  authUserId: string
  email:      string
  name?:      string | null
}): Promise<ClawsUser> {
  const svc = createServiceClient()
  const master = isMasterAdmin(args.email)
  const admin  = isBootstrapAdmin(args.email)

  const { data: existing } = await svc
    .from('users')
    .select('*')
    .eq('auth_user_id', args.authUserId)
    .single()

  if (existing) {
    // Master + bootstrap admins should always have is_admin=true. Promote on
    // every login (cheap and self-healing if someone toggled them off).
    const needsPromotion = (master || admin) && !existing.is_admin
    if (needsPromotion) {
      const { data: promoted } = await svc
        .from('users')
        .update({
          is_admin:   true,
          updated_at: new Date().toISOString(),
        })
        .eq('auth_user_id', args.authUserId)
        .select('*')
        .single()
      return promoted as ClawsUser
    }
    return existing as ClawsUser
  }

  const { data: created, error } = await svc
    .from('users')
    .insert({
      auth_user_id: args.authUserId,
      email:        args.email.toLowerCase(),
      name:         args.name ?? null,
      // Bootstrap admins land with is_admin=true so they don't need to be
      // self-approved. Everyone else defaults to tier='pending' (set by
      // the column default) and is_admin=false.
      is_admin:     admin,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create claws user: ${error.message}`)
  return created as ClawsUser
}

// ── Spend tracking ──────────────────────────────────────────────────────────

export async function recordUserSpend(
  authUserId: string,
  costSgd: number,
): Promise<{ spent_today: number }> {
  const svc = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: u } = await svc
    .from('users')
    .select('spend_today_sgd, spend_day')
    .eq('auth_user_id', authUserId)
    .single()

  const base = (u?.spend_day === today) ? Number(u.spend_today_sgd ?? 0) : 0
  const next = base + costSgd

  await svc
    .from('users')
    .update({ spend_today_sgd: next, spend_day: today, updated_at: new Date().toISOString() })
    .eq('auth_user_id', authUserId)

  return { spent_today: next }
}

export async function getUserSpend(authUserId: string): Promise<number> {
  const svc = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: u } = await svc
    .from('users')
    .select('spend_today_sgd, spend_day')
    .eq('auth_user_id', authUserId)
    .single()
  if (!u || u.spend_day !== today) return 0
  return Number(u.spend_today_sgd ?? 0)
}

export function getPerUserDailyCap(): number {
  return Number(process.env.MAX_DAILY_SPEND_PER_USER_SGD ?? 20)
}
