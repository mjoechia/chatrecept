import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

// GET /api/admin/templates/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('form_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/admin/templates/[id] — update name, description, status, coord_map
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['name', 'description', 'status', 'coord_map', 'version']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('form_templates')
    .update(updates)
    .eq('id', id)
    .select('id, name, version, coord_map, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/admin/templates/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('form_templates')
    .update({ status: 'archived' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
