import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { upsertUser } from '@/lib/claws-users'
import type { EmailOtpType } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// GET /auth/callback — completes server-side auth for two flows:
//
//  1. OAuth code exchange (Google sign-in): ?code=... — uses PKCE, requires
//     a code_verifier cookie that was set client-side at signInWithOAuth
//     time. exchangeCodeForSession handles it.
//
//  2. Server-generated invite / recovery / magic links: ?token_hash=...&type=...
//     The admin "Send welcome" flow calls supabase.auth.admin.generateLink
//     server-side, so no code_verifier exists in the user's browser when
//     they click the email link. We use verifyOtp(token_hash) instead,
//     which doesn't need PKCE.
const OTP_TYPES: EmailOtpType[] = ['recovery', 'invite', 'magiclink', 'signup', 'email_change', 'email']

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const params = url.searchParams

  // Railway puts the public host in x-forwarded-host; req.url's host header
  // reflects the internal upstream (e.g. localhost:8080), which would send
  // post-login redirects to the wrong origin.
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin

  const next = params.get('next') ?? '/'
  const supabase = await createSessionClient()

  // Branch 2: token-hash flow (admin-generated links — no PKCE).
  const tokenHash = params.get('token_hash')
  const rawType   = params.get('type')
  if (tokenHash && rawType) {
    if (!OTP_TYPES.includes(rawType as EmailOtpType)) {
      return NextResponse.redirect(`${origin}/auth/login?error=invalid_otp_type`)
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type:       rawType as EmailOtpType,
    })
    if (error) {
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
    }
  } else {
    // Branch 1: OAuth code exchange (existing path).
    const code = params.get('code')
    if (!code) {
      return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
    }
  }

  // Upsert the claws user record now that the session is established.
  // Capture the row so we can route admins to /admin by default.
  let isAdmin = false
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    try {
      const claws = await upsertUser({
        authUserId:     user.id,
        email:          user.email,
        name:           (user.user_metadata?.full_name       as string | undefined) ?? null,
        whatsappNumber: (user.user_metadata?.whatsapp_number as string | undefined) ?? null,
      })
      isAdmin = claws.is_admin
    } catch (e) {
      console.error('[auth/callback] upsertUser failed', e)
    }
  }

  // Admin default landing — only when `next` is the bare home route; any
  // explicit destination (e.g. /auth/set-password, /?p=...&autorun=1) wins.
  const destination = isAdmin && next === '/' ? '/admin' : next
  return NextResponse.redirect(`${origin}${destination}`)
}
