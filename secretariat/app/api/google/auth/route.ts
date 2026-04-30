import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const SCOPES = 'https://www.googleapis.com/auth/contacts.readonly'

// GET /api/google/auth?template_id=... — redirect user to Google OAuth consent screen
export async function GET(req: NextRequest) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const templateId = searchParams.get('template_id') ?? ''

  const clientId = process.env.GOOGLE_CLIENT_ID
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !appUrl) {
    return NextResponse.json({ error: 'Google OAuth not configured (GOOGLE_CLIENT_ID / NEXT_PUBLIC_APP_URL missing)' }, { status: 500 })
  }

  const redirectUri = `${appUrl}/api/google/callback`
  const state       = Buffer.from(JSON.stringify({ templateId })).toString('base64url')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'online',
    prompt:        'select_account',
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
