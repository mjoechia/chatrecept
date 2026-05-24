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

  // After Supabase verifies the recovery token, send the user through our
  // /auth/callback (which will exchange the code for a session) and then
  // on to /auth/set-password so they can pick a real password.
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`

  // Generate the one-time recovery link. supabase-js exposes the action
  // link on data.properties.action_link.
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type:    'recovery',
    email:   target.email,
    options: { redirectTo },
  })
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: `Failed to generate set-password link: ${linkErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  const { subject, html } = buildWelcomeEmail({
    name:           target.name,
    email:          target.email,
    setPasswordUrl: linkData.properties.action_link,
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
