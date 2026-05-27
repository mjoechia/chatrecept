// User record helpers — app_claws.users table.
// One row per authenticated user, joined to auth.users by auth_user_id.

import { createServiceClient } from './supabase'

export type Tier = 'pending' | 'none' | 'map_once_daily' | 'trial'

export interface ClawsUser {
  id:               string
  auth_user_id:     string
  email:            string
  name:             string | null
  whatsapp_number:  string | null
  tier:             Tier
  trial_ends_at:    string | null
  daily_map_count:  number
  daily_map_day:    string | null
  is_admin:         boolean
  spend_today_sgd:  number
  spend_day:        string | null
  spend_month_sgd:  number
  spend_month:      string | null      // 'YYYY-MM'
  welcome_sent_at:  string | null
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
// The Phase 1 policy engine in lib/limits.ts now owns gating. checkAccess
// and canMap were replaced by evaluateLookupPolicy — call that from
// map/route.ts and /api/me.

// Bump the daily map counter. As of Phase 1 (Lever 1) this is the
// fresh-lookup count for ALL tiers, not just map_once_daily — the daily
// count cap on `trial` users (default 20/day) reads the same field.
// Caller MUST gate on policy first; this is fire-and-record only.
export async function consumeDailyMapAttempt(authUserId: string): Promise<void> {
  const svc   = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: u } = await svc
    .from('users')
    .select('daily_map_count, daily_map_day')
    .eq('auth_user_id', authUserId)
    .single()
  const current = u?.daily_map_day === today ? Number(u.daily_map_count ?? 0) : 0
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

// Get an existing user record OR create one for a first-time sign-in.
// New users default to tier='pending' — they need admin approval before any
// live lookup. Master admin and bootstrap admins from ADMIN_EMAILS are
// promoted (is_admin=true) which bypasses the tier gate.
//
// whatsapp_number is captured at signup (email/password form) and stored
// here on first sight; it can later drive WhatsApp OTP verification.
export async function upsertUser(args: {
  authUserId:      string
  email:           string
  name?:           string | null
  whatsappNumber?: string | null
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
    // If a whatsapp_number was passed and we don't have one yet, fill it.
    const needsPromotion = (master || admin) && !existing.is_admin
    const needsWhatsApp  = !existing.whatsapp_number && args.whatsappNumber
    if (needsPromotion || needsWhatsApp) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (needsPromotion) updates.is_admin = true
      if (needsWhatsApp)  updates.whatsapp_number = args.whatsappNumber
      const { data: updated } = await svc
        .from('users')
        .update(updates)
        .eq('auth_user_id', args.authUserId)
        .select('*')
        .single()
      return updated as ClawsUser
    }
    return existing as ClawsUser
  }

  const { data: created, error } = await svc
    .from('users')
    .insert({
      auth_user_id:    args.authUserId,
      email:           args.email.toLowerCase(),
      name:            args.name ?? null,
      whatsapp_number: args.whatsappNumber ?? null,
      // Bootstrap admins land with is_admin=true so they don't need to be
      // self-approved. Everyone else defaults to tier='pending' (set by
      // the column default) and is_admin=false.
      is_admin:        admin,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create claws user: ${error.message}`)
  return created as ClawsUser
}

// ── Spend tracking ──────────────────────────────────────────────────────────

// Records SGD spent against both daily and monthly buckets. Rolls each
// bucket independently — when spend_day/spend_month don't match the
// current period, treat the stored value as 0 before adding costSgd.
// Returns the post-update totals so callers can decide what to do next.
//
// Also fires a fire-and-forget Slack alert when the user crosses 50% /
// 80% / 100% of the monthly cap for the first time in the month. The
// import is intentionally inlined to avoid a top-of-file import cycle
// between claws-users → slack → (anything that imports claws-users).
export async function recordUserSpend(
  authUserId: string,
  costSgd: number,
): Promise<{ spent_today: number; spent_month: number }> {
  const svc   = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)

  const { data: u } = await svc
    .from('users')
    .select('email, name, spend_today_sgd, spend_day, spend_month_sgd, spend_month')
    .eq('auth_user_id', authUserId)
    .single()

  const baseToday = (u?.spend_day   === today) ? Number(u.spend_today_sgd ?? 0) : 0
  const baseMonth = (u?.spend_month === month) ? Number(u.spend_month_sgd ?? 0) : 0
  const nextToday = baseToday + costSgd
  const nextMonth = baseMonth + costSgd

  await svc
    .from('users')
    .update({
      spend_today_sgd: nextToday,
      spend_day:       today,
      spend_month_sgd: nextMonth,
      spend_month:     month,
      updated_at:      new Date().toISOString(),
    })
    .eq('auth_user_id', authUserId)

  // Threshold-crossing Slack alerts (Lever 6). Compare pre vs post against
  // 50% / 80% / 100% of monthly cap. Single alert per cross — only fires
  // when the post value crosses a threshold the pre value hadn't yet.
  void notifyThresholdsCrossed({
    email:  u?.email ?? '',
    name:   u?.name  ?? null,
    before: baseMonth,
    after:  nextMonth,
  })

  return { spent_today: nextToday, spent_month: nextMonth }
}

// Internal: fire-and-forget Slack alert when crossing 50/80/100% of cap.
// Inlined here (not in slack.ts) so the threshold logic stays next to
// the data it reads.
const MONTHLY_THRESHOLDS = [0.5, 0.8, 1.0] as const

async function notifyThresholdsCrossed(args: {
  email:  string
  name:   string | null
  before: number
  after:  number
}): Promise<void> {
  const cap = Number(process.env.MAX_MONTHLY_SPEND_PER_USER_SGD ?? 150)
  if (cap <= 0) return
  const pctBefore = args.before / cap
  const pctAfter  = args.after  / cap
  const crossed   = MONTHLY_THRESHOLDS.find(t => pctBefore < t && pctAfter >= t)
  if (!crossed) return
  try {
    const { sendSpendAlert } = await import('./slack')
    await sendSpendAlert({
      email: args.email,
      name:  args.name,
      pct:   crossed,
      spent: args.after,
      cap,
    })
  } catch (e) {
    console.error('[notifyThresholdsCrossed]', e)
  }
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
