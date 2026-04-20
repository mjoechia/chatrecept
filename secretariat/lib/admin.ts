import { createSessionClient } from './supabase-server'
import { NextResponse } from 'next/server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'mjoechia@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

// For use in API routes — returns the user if they are an admin, or a 401 response
export async function requireAdminSession(): Promise<
  { user: { id: string; email: string }; error: null } |
  { user: null; error: NextResponse }
> {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdmin(user.email)) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { user: { id: user.id, email: user.email! }, error: null }
}
