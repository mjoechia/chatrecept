import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/admin'
import { DEFAULT_FIELDS, DEFAULT_CHECKBOXES } from '@/lib/pdf'
import type { CoordMap } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/admin/coordinates — returns current coordinate map with its source
export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceClient()

  try {
    const { data } = await supabase
      .from('secretariat_settings')
      .select('value')
      .eq('key', 'form45_coordinates')
      .single()

    if (data?.value) {
      const v = data.value as Partial<CoordMap>
      return NextResponse.json({
        source: 'db',
        fields:     v.fields     ?? DEFAULT_FIELDS,
        checkboxes: v.checkboxes ?? DEFAULT_CHECKBOXES,
      })
    }
  } catch {}

  return NextResponse.json({
    source:     'default',
    fields:     DEFAULT_FIELDS,
    checkboxes: DEFAULT_CHECKBOXES,
  })
}

// POST /api/admin/coordinates — save coordinate map to DB
export async function POST(req: NextRequest) {
  const { error: authError } = await requireAdminSession()
  if (authError) return authError

  let body: CoordMap
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.fields || !body.checkboxes) {
    return NextResponse.json({ error: 'Body must have fields and checkboxes' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('secretariat_settings')
    .upsert({
      key:        'form45_coordinates',
      value:      { fields: body.fields, checkboxes: body.checkboxes },
      updated_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
