import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/google/callback — exchanges Google OAuth code for access token,
// stores it in an HTTP-only cookie, redirects back to /batch/new
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state') ?? ''
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/batch/new?google_error=${encodeURIComponent(error ?? 'cancelled')}`)
  }

  let templateId = ''
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    templateId = decoded.templateId ?? ''
  } catch {
    // state parse failure — proceed without template_id
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  const redirectUri  = `${appUrl}/api/google/callback`

  // Exchange code for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${appUrl}/batch/new?google_error=token_exchange_failed`)
  }

  const { access_token } = await tokenRes.json()
  if (!access_token) {
    return NextResponse.redirect(`${appUrl}/batch/new?google_error=no_token`)
  }

  const dest = `/batch/new?source=google${templateId ? `&template_id=${templateId}` : ''}`
  const res  = NextResponse.redirect(`${appUrl}${dest}`)

  // Store token in HTTP-only cookie — short TTL (5 min), never in URL
  res.cookies.set('google_access_token', access_token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   300, // 5 minutes
    path:     '/api/google',
  })

  return res
}
