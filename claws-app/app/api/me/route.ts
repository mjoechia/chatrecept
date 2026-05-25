import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { upsertUser, getPerUserDailyCap, isMasterAdmin, checkAccess } from '@/lib/claws-users'
import { authConfigured } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// GET /api/me — returns current user info for the frontend to render auth UI.
// Returns null fields when not logged in (200, not 401) so the page can render
// the anonymous experience without an extra error path.
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
      name:           (user.user_metadata?.full_name      as string | undefined) ?? null,
      whatsappNumber: (user.user_metadata?.whatsapp_number as string | undefined) ?? null,
    })

    const access = checkAccess(claws)
    return NextResponse.json({
      authenticated:    true,
      email:            claws.email,
      name:             claws.name,
      is_admin:         claws.is_admin,
      is_master:        isMasterAdmin(claws.email),
      tier:             claws.tier,
      trial_ends_at:    claws.trial_ends_at,
      can_map:          access.ok,
      access_reason:    access.ok ? null : access.reason,
      access_message:   access.ok ? null : access.message,
      spend_today_sgd:  Number(claws.spend_today_sgd),
      spend_cap_sgd:    getPerUserDailyCap(),
    })
  } catch (e) {
    console.error('[api/me]', e)
    return NextResponse.json({ authenticated: false, error: String(e) })
  }
}
