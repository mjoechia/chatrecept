import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { isMasterAdmin, type ClawsUser } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

// GET /api/admin/users — list all claws users (admin only).
// Sorted pending-first so brand-new users land at the top of the dashboard.
// is_master is annotated for the UI so it can lock the master row.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as ClawsUser[]
  const annotated = rows.map(u => ({
    ...u,
    is_master: isMasterAdmin(u.email),
  }))
  // Surface pending users first — they need admin attention
  annotated.sort((a, b) => {
    const ap = a.tier === 'pending' ? 0 : 1
    const bp = b.tier === 'pending' ? 0 : 1
    if (ap !== bp) return ap - bp
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  return NextResponse.json(annotated)
}
