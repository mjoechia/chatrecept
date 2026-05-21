import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { isMasterAdmin, type Tier } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

const VALID_TIERS: Tier[] = ['pending', 'none', 'map_once_daily', 'trial']

interface PatchBody {
  tier?:       Tier
  trial_days?: number    // required when tier='trial', clamped to [1, 365]
  is_admin?:   boolean
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
    .select('email')
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

  const { data, error } = await svc
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
