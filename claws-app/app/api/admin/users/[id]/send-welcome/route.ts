import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { buildWelcomeEmail } from '@/lib/welcome-email'

export const dynamic = 'force-dynamic'

type GrantTier = 'map_once_daily' | 'trial'

interface SendWelcomeBody {
  tier?:       GrantTier   // required — admin must elect to lift them out of pending
  trial_days?: number      // only used when tier='trial', clamped to [1, 365]
}

// POST /api/admin/users/:id/send-welcome { tier, trial_days? }
// Sends the welcome / set-password email AND lifts the user out of
// 'pending' tier in the same operation, so they can actually use the app
// after picking a password. Two valid tier choices: 'map_once_daily'
// (conservative, no expiry, one fresh lookup/day) or 'trial' (full
// mapping until trial_ends_at).
//
// Non-destructive on the auth side — the user's existing password is
// only replaced if they click the link and pick a new one. The tier is
// updated unconditionally, which matches admin intent: if they're
// hitting "Send welcome" they're committing to grant access.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { id } = await ctx.params

  let body: SendWelcomeBody = {}
  try { body = await req.json() } catch { /* empty body — handled below */ }
  if (body.tier !== 'map_once_daily' && body.tier !== 'trial') {
    return NextResponse.json(
      { error: 'tier is required (map_once_daily or trial)' },
      { status: 400 },
    )
  }
  const grantTier = body.tier
  const trialDays = Math.max(1, Math.min(365, Math.floor(body.trial_days ?? 14)))

  const svc = createServiceClient()

  // Look up target user — we need email + name + auth_user_id
  const { data: target, error: targetErr } = await svc
    .from('users')
    .select('id, email, name, auth_user_id')
    .eq('id', id)
    .single()
  if (targetErr || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Origin for the post-link landing. Railway's internal host header isn't
  // the public origin, so prefer x-forwarded-host (same trick as the OAuth
  // callback).
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(req.url).origin

  // Generate the one-time recovery link. We only need the hashed_token
  // off it — we'll build our own URL pointing at /auth/callback so the
  // user lands directly in our app's session flow (the action_link goes
  // through Supabase's verify endpoint first, which requires a PKCE
  // code_verifier cookie that doesn't exist for admin-generated links).
  const setPasswordPath = '/auth/set-password'
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type:  'recovery',
    email: target.email,
    options: {
      // redirectTo is the final destination Supabase puts in the action_link;
      // we pass /auth/set-password so even if a user clicks an old-style
      // action_link from a previous build it still ends up in the right place.
      redirectTo: `${origin}${setPasswordPath}`,
    },
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: `Failed to generate set-password link: ${linkErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // Build our own URL that points at /auth/callback with the token hash
  // and type — callback will call verifyOtp (no PKCE) and then redirect
  // to /auth/set-password.
  const setPasswordUrl =
    `${origin}/auth/callback` +
    `?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
    `&type=recovery` +
    `&next=${encodeURIComponent(setPasswordPath)}`

  const { subject, html } = buildWelcomeEmail({
    name:           target.name,
    email:          target.email,
    setPasswordUrl,
  })

  try {
    await sendEmail({ to: target.email, subject, html })
  } catch (e) {
    return NextResponse.json(
      { error: `Email send failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Stamp the send AND grant access in one update so the user isn't left
  // stuck in 'pending' after picking their password. trial_ends_at is
  // computed when granting trial; cleared otherwise so old trial expiry
  // dates don't linger when downgrading to map_once_daily.
  const updates: Record<string, unknown> = {
    welcome_sent_at: new Date().toISOString(),
    tier:            grantTier,
    trial_ends_at:   grantTier === 'trial'
      ? new Date(Date.now() + trialDays * 86400000).toISOString()
      : null,
    daily_map_count: 0,
    daily_map_day:   null,
    updated_at:      new Date().toISOString(),
  }

  const { data: updated, error: stampErr } = await svc
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (stampErr) {
    // Email already went out, so don't 500 — just warn so the admin knows
    // they may need to set the tier manually via the dropdown.
    return NextResponse.json({
      ok: true,
      warning: `Email sent but failed to set tier / record timestamp: ${stampErr.message}`,
    })
  }

  return NextResponse.json({ ok: true, user: updated })
}
