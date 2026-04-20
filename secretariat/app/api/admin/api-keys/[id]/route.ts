import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/admin'

// DELETE /api/admin/api-keys/[id] — revoke a key
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authErr } = await requireAdminSession()
  if (authErr) return authErr

  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase
    .schema('app_secretariat')
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
