import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import type { EmailOtpType } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const OTP_TYPES: EmailOtpType[] = ['recovery', 'invite', 'magiclink', 'signup', 'email_change', 'email']

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const params = url.searchParams
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin

  const supabase = await createSessionClient()

  const tokenHash = params.get('token_hash')
  const rawType   = params.get('type')
  if (tokenHash && rawType) {
    if (!OTP_TYPES.includes(rawType as EmailOtpType)) {
      return NextResponse.redirect(`${origin}/auth/login?error=invalid_otp_type`)
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: rawType as EmailOtpType })
    if (error) return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
  } else {
    const code = params.get('code')
    if (!code) return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(`${origin}/`)
}
