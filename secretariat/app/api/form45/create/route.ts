import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyApiKey } from '@/lib/api-key'
import { maskNric, validateNric } from '@/lib/nric'
import { overlayForm45 } from '@/lib/pdf'
import { uploadPdf } from '@/lib/storage'
import type { Form45Data } from '@/lib/types'

// POST /api/form45/create — REST API endpoint (API key auth)
// Creates a form and immediately generates the PDF.
export async function POST(req: NextRequest) {
  // Verify API key
  const authorized = await verifyApiKey(req.headers.get('authorization'))
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate required fields
  const required = ['company_name', 'uen', 'director_name']
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
    }
  }

  // Handle NRIC — mask at input, never store raw
  const rawNric = typeof body.nric === 'string' ? body.nric : ''
  if (rawNric && !validateNric(rawNric)) {
    return NextResponse.json({ error: 'Invalid NRIC/FIN format or checksum' }, { status: 400 })
  }
  const nric_display = rawNric ? maskNric(rawNric) : null

  const supabase = createServiceClient()

  // Insert form record
  const { data: form, error: insertErr } = await supabase
    .schema('app_secretariat')
    .from('form45')
    .insert({
      company_name:  body.company_name,
      uen:           body.uen,
      director_name: body.director_name,
      nric_display,
      nationality:   body.nationality ?? 'Singaporean',
      dob:           body.dob ?? null,
      address:       body.address ?? null,
      declarations:  body.declarations ?? {},
      consent_date:  body.consent_date ?? new Date().toISOString().split('T')[0],
      status:        'generating',
      source:        'api',
    })
    .select()
    .single()

  if (insertErr || !form) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Generate PDF synchronously (API clients expect a direct result)
  try {
    const pdfBytes = await overlayForm45(form as Form45Data)
    const pdfPath  = await uploadPdf(form.id, pdfBytes)

    await supabase
      .schema('app_secretariat')
      .from('form45')
      .update({ status: 'generated', pdf_path: pdfPath, updated_at: new Date().toISOString() })
      .eq('id', form.id)

    return NextResponse.json({ id: form.id, status: 'generated' }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase
      .schema('app_secretariat')
      .from('form45')
      .update({ status: 'failed', error_msg: msg })
      .eq('id', form.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
