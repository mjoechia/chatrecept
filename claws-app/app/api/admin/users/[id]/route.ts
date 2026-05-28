import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { isMasterAdmin, type Tier } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

const VALID_TIERS: Tier[] = ['pending', 'none', 'map_once_daily', 'trial']

const EMAIL_PATTERN    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WHATSAPP_PATTERN = /^\+\d{8,15}$/

function normaliseWhatsApp(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('+')) return trimmed.replace(/\D/g, '')
  return '+' + trimmed.slice(1).replace(/\D/g, '')
}

interface PatchBody {
  tier?:            Tier
  trial_days?:      number    // required when tier='trial', clamped to [1, 365]
  is_admin?:        boolean
  // Profile edits — admin Edit-user modal sends these.
  name?:            string
  email?:           string
  whatsapp_number?: string | null   // explicit empty / null clears the column
}

// PATCH /api/admin/users/:id — update tier (with optional trial_days) and/or
// is_admin. Master admin is locked. An admin cannot demote themselves.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { id } = await ctx.params

  let body: PatchBody
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.tier !== undefined) {
    if (!VALID_TIERS.includes(body.tier)) {
      return NextResponse.json({ error: `Invalid tier: ${body.tier}` }, { status: 400 })
    }
    updates.tier = body.tier
    if (body.tier === 'trial') {
      const days = Math.max(1, Math.min(365, Math.floor(body.trial_days ?? 14)))
      updates.trial_ends_at = new Date(Date.now() + days * 86400000).toISOString()
      // Grant / extend trial → reset monthly SGD bucket so the user gets
      // a fresh SGD 150 budget for the new trial period. Daily count also
      // wipes (below) so they start at 0/20 today.
      updates.spend_month_sgd = 0
    } else {
      // Switching away from trial clears the expiry, and switching off of
      // map_once_daily clears the daily counter — keeps the row tidy.
      updates.trial_ends_at = null
    }
    if (body.tier !== 'map_once_daily') {
      updates.daily_map_count = 0
      updates.daily_map_day   = null
    }
  }

  if (typeof body.is_admin === 'boolean') updates.is_admin = body.is_admin

  // Profile fields — validated independently so the admin sees the
  // specific reason for any rejection.
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    updates.name = trimmed
  }

  let newEmail: string | undefined
  if (typeof body.email === 'string') {
    const trimmed = body.email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(trimmed)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    newEmail        = trimmed
    updates.email   = trimmed
  }

  let newWhatsApp: string | null | undefined
  if (body.whatsapp_number !== undefined) {
    if (body.whatsapp_number === null || body.whatsapp_number === '') {
      newWhatsApp                = null
      updates.whatsapp_number    = null
    } else {
      const norm = normaliseWhatsApp(body.whatsapp_number)
      if (!WHATSAPP_PATTERN.test(norm)) {
        return NextResponse.json(
          { error: 'WhatsApp number must include country code, e.g. +65 9123 4567 (or leave blank)' },
          { status: 400 },
        )
      }
      newWhatsApp             = norm
      updates.whatsapp_number = norm
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Prevent an admin from demoting themselves out of access (the master is
  // also blocked below, but this catches non-master admins too).
  if (body.is_admin === false && id === auth.user.id) {
    return NextResponse.json({ error: 'Cannot demote yourself' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data: target, error: targetErr } = await svc
    .from('users')
    .select('email, auth_user_id')
    .eq('id', id)
    .single()
  if (targetErr || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (isMasterAdmin(target.email)) {
    return NextResponse.json({
      error: 'The master admin account cannot be modified.',
      master_protected: true,
    }, { status: 403 })
  }

  // If email / name / whatsapp changed, sync auth.users too so the
  // canonical identity stays consistent. Email is the critical one —
  // app_claws.users.email is just a denormalised copy; auth.users.email
  // is what the user actually signs in with.
  if (newEmail !== undefined || typeof body.name === 'string' || newWhatsApp !== undefined) {
    const authPatch: Record<string, unknown> = {}
    if (newEmail !== undefined) authPatch.email = newEmail
    // user_metadata is what /auth/callback reads to seed claws.users on
    // first sight — keep it in sync so a future re-upsert doesn't undo
    // edits.
    const metadataPatch: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      metadataPatch.name      = body.name.trim()
      metadataPatch.full_name = body.name.trim()
    }
    if (newWhatsApp !== undefined) {
      metadataPatch.whatsapp_number = newWhatsApp
    }
    if (Object.keys(metadataPatch).length > 0) authPatch.user_metadata = metadataPatch

    const { error: authErr } = await svc.auth.admin.updateUserById(target.auth_user_id, authPatch)
    if (authErr) {
      // Most common: duplicate email. Surface verbatim; don't half-update.
      return NextResponse.json({ error: authErr.message }, { status: 400 })
    }
  }

  const { data, error } = await svc
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
