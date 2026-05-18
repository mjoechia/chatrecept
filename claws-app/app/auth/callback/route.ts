import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { upsertUser } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

// GET /auth/callback?code=... — exchanges OAuth code for a Supabase session,
// then upserts the claws.users row.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
  }

  const supabase = await createSessionClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  // Upsert the claws user record now that the session is established
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    try {
      await upsertUser({
        authUserId: user.id,
        email:      user.email,
        name:       (user.user_metadata?.full_name as string | undefined) ?? null,
      })
    } catch (e) {
      console.error('[auth/callback] upsertUser failed', e)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
