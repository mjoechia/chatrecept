import { createSessionClient } from './supabase-server'
import { createServiceClient } from './supabase'
import { NextResponse } from 'next/server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'mjoechia@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

// For use in API routes — checks DB profile first, falls back to env email list for bootstrap
export async function requireAdminSession(): Promise<
  { user: { id: string; email: string }; error: null } |
  { user: null; error: NextResponse }
> {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const svc = createServiceClient()
  const { data: profile } = await svc
    .from('secretariat_profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (profile) {
    if (profile.role === 'admin' && profile.status === 'active') {
      return { user: { id: user.id, email: user.email! }, error: null }
    }
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  // Bootstrap fallback: no profile yet but email is in ADMIN_EMAILS
  if (isAdmin(user.email)) {
    return { user: { id: user.id, email: user.email! }, error: null }
  }

  return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}
