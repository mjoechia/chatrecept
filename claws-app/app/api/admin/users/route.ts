import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/users — list all claws users (admin only)
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('users')
    .select('id, auth_user_id, email, name, mapping_enabled, is_admin, spend_today_sgd, spend_day, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
