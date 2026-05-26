import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { isMasterAdmin } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

// POST /api/admin/users/:id/reset-daily
// Resets the per-day quota for a map_once_daily user — sets
// daily_map_count back to 0 and clears daily_map_day, so the next live
// lookup is treated as the first of the day. Use case: a customer
// burned today's allowance on a typo, or admin wants to grant a bonus
// without changing their tier.
//
// Safe to call on users of any tier (it's a no-op effect for tiers that
// don't read these columns), but the admin UI only exposes the button
// for map_once_daily rows to avoid confusion.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { id } = await ctx.params
  const svc = createServiceClient()

  // Master admin row is locked from any modification (mirrors the tier
  // dropdown / admin toggle pattern). The lookup happens before the
  // update so we can return a clear error.
  const { data: target, error: targetErr } = await svc
    .from('users')
    .select('email')
    .eq('id', id)
    .single()
  if (targetErr || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (isMasterAdmin(target.email)) {
    return NextResponse.json(
      { error: 'The master admin account cannot be modified.' },
      { status: 403 },
    )
  }

  const { data, error } = await svc
    .from('users')
    .update({
      daily_map_count: 0,
      daily_map_day:   null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
