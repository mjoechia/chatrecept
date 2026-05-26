import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Statuses valid on the engagement column. Kept as a const so a typo on
// the client gets a clean 400 rather than silently writing junk.
const VALID_STATUSES = [
  'new', 'contacted', 'meeting_booked', 'meeting_done', 'won', 'lost', 'dropped',
] as const

type Status = typeof VALID_STATUSES[number]

interface PatchBody {
  status?: Status
  notes?:  string
}

// PATCH /api/admin/lookups/:id — update engagement state on a lookup row.
// Body: { status?, notes? }. When status flips to 'contacted' the
// contacted_at timestamp is stamped; meeting_* booleans denormalise the
// status so dashboard filters stay simple.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { id } = await ctx.params

  let body: PatchBody
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }
    updates.status = body.status
    if (body.status === 'contacted')      updates.contacted_at = new Date().toISOString()
    if (body.status === 'meeting_booked') updates.meeting_booked = true
    if (body.status === 'meeting_done')   {
      updates.meeting_booked    = true
      updates.meeting_completed = true
    }
  }

  if (typeof body.notes === 'string') updates.notes = body.notes

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('demo_lookups')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
