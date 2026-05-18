import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { isMasterAdmin } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/users/:id — toggle mapping_enabled or is_admin
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { id } = await ctx.params

  let body: { mapping_enabled?: boolean; is_admin?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.mapping_enabled === 'boolean') updates.mapping_enabled = body.mapping_enabled
  if (typeof body.is_admin === 'boolean')        updates.is_admin = body.is_admin
  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Protect against an admin demoting themselves out of access
  if (body.is_admin === false && id === auth.user.id) {
    return NextResponse.json({ error: 'Cannot demote yourself' }, { status: 400 })
  }

  // Look up the target user to check for master-admin protection
  const svc = createServiceClient()
  const { data: target, error: targetErr } = await svc
    .from('users')
    .select('email')
    .eq('id', id)
    .single()
  if (targetErr || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (isMasterAdmin(target.email)) {
    return NextResponse.json({
      error: 'The master admin account cannot be modified.',
      master_protected: true,
    }, { status: 403 })
  }

  const { data, error } = await svc
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
