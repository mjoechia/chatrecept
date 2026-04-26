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

  // Use service client with public-schema RPC to bypass PostgREST schema restrictions
  const supabase = createServiceClient()

  // Build audit snapshot if company_id/person_id were provided (pre-fill flow)
  let source_snapshot: Record<string, unknown> | null = null
  if (body.company_id || body.person_id) {
    source_snapshot = {
      company_id:    body.company_id    ?? null,
      person_id:     body.person_id     ?? null,
      company_name:  body.company_name,
      uen:           body.uen,
      director_name: body.director_name,
      nric_display:  body.nric_display  ?? null,
      nationality:   body.nationality   ?? null,
      dob:           body.dob           ?? null,
      address:       body.address       ?? null,
    }
  }

  const { data, error } = await supabase.rpc('insert_form45', {
    p_company_name:    body.company_name,
    p_uen:             body.uen,
    p_director_name:   body.director_name,
    p_nric_display:    body.nric_display ?? null,
    p_nationality:     body.nationality ?? 'Singaporean',
    p_dob:             body.dob || null,
    p_address:         body.address || null,
    p_declarations:    body.declarations ?? {},
    p_consent_date:    body.consent_date,
    p_source:          'ui',
    p_source_snapshot: source_snapshot,
  })

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
