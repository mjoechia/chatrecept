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

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

function isBootstrapAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

// Get an existing user record OR create one for a first-time Google sign-in.
// Default policy: mapping_enabled = true. Admin status comes from ADMIN_EMAILS.
export async function upsertUser(args: {
  authUserId: string
  email:      string
  name?:      string | null
}): Promise<ClawsUser> {
  const svc = createServiceClient()
  const admin = isBootstrapAdmin(args.email)

  // Try to fetch first
  const { data: existing } = await svc
    .from('users')
    .select('*')
    .eq('auth_user_id', args.authUserId)
    .single()

  if (existing) {
    // Auto-promote if their email is in ADMIN_EMAILS but flag isn't set yet
    if (admin && !existing.is_admin) {
      const { data: promoted } = await svc
        .from('users')
        .update({ is_admin: true, updated_at: new Date().toISOString() })
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
