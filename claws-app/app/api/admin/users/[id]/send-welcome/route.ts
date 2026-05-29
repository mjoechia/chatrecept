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

  // Generate the recovery token. We discard the hashed_token / action_link
  // entirely — those are auto-clickable URLs that get consumed by Outlook
  // Defender / Safe Links / Mimecast etc. before the human recipient ever
  // sees the email. The 6-digit email_otp shares the same underlying
  // token, so once Defender consumes the link the code dies too.
  //
  // Solution: keep only the email_otp. The welcome email contains zero
  // tokenised URLs — just a static link to /auth/verify-otp?email=… (no
  // token, safe for Defender to pre-fetch) and the printed code (plain
  // text, can't be auto-clicked).
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type:  'recovery',
    email: target.email,
    options: {
      redirectTo: `${origin}/auth/set-password`,
    },
  })
  if (linkErr || !linkData?.properties?.email_otp) {
    return NextResponse.json(
      { error: `Failed to generate verification code: ${linkErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // The only URL in the email body. No token in it; Defender's auto-click
  // hits a static page with no side effect. User clicks → email param
  // pre-fills → they type the code → /auth/verify-otp consumes the OTP.
  const verifyOtpUrl = `${origin}/auth/verify-otp?email=${encodeURIComponent(target.email)}`
  const { subject, html } = buildWelcomeEmail({
    name:         target.name,
    email:        target.email,
    emailOtp:     linkData.properties.email_otp,
    verifyOtpUrl,
  })

  try {
    // Welcome emails always send from welcome@chatrecept.chat regardless
    // of the RESEND_FROM_EMAIL default. Keeps the brand consistent and
    // gives the recipient a sensible Reply-To target.
    await sendEmail({
      to:      target.email,
      subject,
      html,
      from:    'JC CLAWs <welcome@chatrecept.chat>',
    })
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
  // Reset monthly SGD bucket on trial grant only — gives the user a fresh
  // SGD 150 month aligned to the customer-conversation moment.
  if (grantTier === 'trial') {
    updates.spend_month_sgd = 0
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
