import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { upsertUser, getPerUserDailyCap, isMasterAdmin } from '@/lib/claws-users'
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
      authUserId: user.id,
      email:      user.email,
      name:       (user.user_metadata?.full_name as string | undefined) ?? null,
    })

    return NextResponse.json({
      authenticated:    true,
      email:            claws.email,
      name:             claws.name,
      is_admin:         claws.is_admin,
      is_master:        isMasterAdmin(claws.email),
      mapping_enabled:  claws.mapping_enabled,
      spend_today_sgd:  Number(claws.spend_today_sgd),
      spend_cap_sgd:    getPerUserDailyCap(),
    })
  } catch (e) {
    console.error('[api/me]', e)
    return NextResponse.json({ authenticated: false, error: String(e) })
  }
}
