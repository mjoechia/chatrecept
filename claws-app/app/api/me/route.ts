import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { upsertUser, isMasterAdmin } from '@/lib/claws-users'
import { evaluateLookupPolicy, getEffectiveLimits } from '@/lib/limits'
import { authConfigured } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// GET /api/me — returns current user info for the frontend to render auth UI.
// Returns null fields when not logged in (200, not 401) so the page can render
// the anonymous experience without an extra error path.
//
// Drives the AuthedHome UsageBanner: spend / count / monthly progress all
// come from this single call. Uses evaluateLookupPolicy with dedupHit=false
// for the can_map signal — same engine as map/route.ts.
export async function GET() {
  if (!authConfigured()) {
    return NextResponse.json({ authenticated: false, auth_unavailable: true })
  }

  try {
    const supabase = await createSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ authenticated: false })
    }

    const claws = await upsertUser({
      authUserId:     user.id,
      email:          user.email,
      name:           (user.user_metadata?.full_name       as string | undefined) ?? null,
      whatsappNumber: (user.user_metadata?.whatsapp_number as string | undefined) ?? null,
    })

    // Single policy call decides "can this user map right now" using
    // exactly the same rules as the live endpoint. Side-effect free, so
    // safe to call on every /api/me poll.
    const policy = evaluateLookupPolicy(claws, { postcode: '', dedupHit: false })
    const limits = getEffectiveLimits(claws)
    const today  = new Date().toISOString().slice(0, 10)
    const month  = today.slice(0, 7)

    const dailyCount =  claws.daily_map_day   === today ? Number(claws.daily_map_count ?? 0) : 0
    const spendToday = (claws.spend_day       === today ? Number(claws.spend_today_sgd ?? 0) : 0)
    const spendMonth = (claws.spend_month     === month ? Number(claws.spend_month_sgd ?? 0) : 0)

    return NextResponse.json({
      authenticated:     true,
      email:             claws.email,
      name:              claws.name,
      is_admin:          claws.is_admin,
      is_master:         isMasterAdmin(claws.email),
      tier:              claws.tier,
      trial_ends_at:     claws.trial_ends_at,

      can_map:           policy.allowed,
      access_reason:     policy.allowed ? null : policy.reason ?? null,
      access_message:    policy.allowed ? null : policy.copy   ?? null,

      // Daily fresh-count
      daily_count:       dailyCount,
      daily_count_max:   limits.dailyCountMax,

      // Daily SGD
      spend_today_sgd:   spendToday,
      spend_cap_sgd:     limits.dailySgdMax,

      // Monthly SGD (Phase 1 / Lever 2)
      spend_month_sgd:   spendMonth,
      spend_cap_month:   limits.monthlySgdMax,
    })
  } catch (e) {
    console.error('[api/me]', e)
    return NextResponse.json({ authenticated: false, error: String(e) })
  }
}
