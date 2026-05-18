// User record helpers — app_claws.users table.
// One row per authenticated user, joined to auth.users by auth_user_id.

import { createServiceClient } from './supabase'

export interface ClawsUser {
  id:              string
  auth_user_id:    string
  email:           string
  name:            string | null
  mapping_enabled: boolean
  is_admin:        boolean
  spend_today_sgd: number
  spend_day:       string | null
  created_at:      string
  updated_at:      string
}

// The master admin can never be demoted or have mapping disabled. They are
// the root of trust for all access changes. Configurable via env var with a
// safe default — set MASTER_ADMIN_EMAIL in Railway if a different person
// should own the system.
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
  // Master is implicitly an admin; explicit allowlist covers everyone else
  return isMasterAdmin(email) || ADMIN_EMAILS.includes(email.toLowerCase())
}

// Get an existing user record OR create one for a first-time Google sign-in.
// Default policy: mapping_enabled = true. Admin status comes from ADMIN_EMAILS.
// Master admin always has is_admin=true and mapping_enabled=true enforced.
export async function upsertUser(args: {
  authUserId: string
  email:      string
  name?:      string | null
}): Promise<ClawsUser> {
  const svc = createServiceClient()
  const master = isMasterAdmin(args.email)
  const admin  = isBootstrapAdmin(args.email)

  // Try to fetch first
  const { data: existing } = await svc
    .from('users')
    .select('*')
    .eq('auth_user_id', args.authUserId)
    .single()

  if (existing) {
    // For the master account: force is_admin and mapping_enabled every time.
    // For bootstrap admins: promote if not already promoted.
    const needsPromotion = (master && (!existing.is_admin || !existing.mapping_enabled))
                       || (admin  && !existing.is_admin)
    if (needsPromotion) {
      const { data: promoted } = await svc
        .from('users')
        .update({
          is_admin:        admin || master,
          mapping_enabled: master ? true : existing.mapping_enabled,
          updated_at:      new Date().toISOString(),
        })
        .eq('auth_user_id', args.authUserId)
        .select('*')
        .single()
      return promoted as ClawsUser
    }
    return existing as ClawsUser
  }

  // First login → create row
  const { data: created, error } = await svc
    .from('users')
    .insert({
      auth_user_id:    args.authUserId,
      email:           args.email.toLowerCase(),
      name:            args.name ?? null,
      mapping_enabled: true,
      is_admin:        admin,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create claws user: ${error.message}`)
  return created as ClawsUser
}

// Increment a user's per-day spend bucket. Resets when spend_day != today.
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
