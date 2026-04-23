import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createSessionClient } from '@/lib/supabase-server'

// POST /api/form45/save — UI form submission (session auth, service client insert)
export async function POST(req: NextRequest) {
  // Verify session
  const sessionSupabase = await createSessionClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Use service client to bypass PostgREST schema restrictions
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .schema('app_secretariat')
    .from('form45')
    .insert({
      company_name:  body.company_name,
      uen:           body.uen,
      director_name: body.director_name,
      nric_display:  body.nric_display ?? null,
      nationality:   body.nationality ?? 'Singaporean',
      dob:           body.dob || null,
      address:       body.address || null,
      declarations:  body.declarations ?? {},
      consent_date:  body.consent_date,
      source:        'ui',
    })
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
