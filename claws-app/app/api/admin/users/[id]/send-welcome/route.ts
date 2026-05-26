import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { buildWelcomeEmail } from '@/lib/welcome-email'

export const dynamic = 'force-dynamic'

// POST /api/admin/users/:id/send-welcome
// Sends the welcome / set-password email to a claws user. Generates a
// one-time Supabase recovery link (via the auth admin API), embeds it in
// the templated email, then sends through Resend. Non-destructive — the
// user's existing password is only replaced if they click the link and
// pick a new one.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { id } = await ctx.params
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

  // Stamp the send so the admin UI can show "Sent {date}" and the admin
  // can avoid double-sending without thinking.
  const { data: updated, error: stampErr } = await svc
    .from('users')
    .update({
      welcome_sent_at: new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (stampErr) {
    // Email already went out, so don't 500 — just warn.
    return NextResponse.json({
      ok: true,
      warning: `Email sent but failed to record timestamp: ${stampErr.message}`,
    })
  }

  return NextResponse.json({ ok: true, user: updated })
}
