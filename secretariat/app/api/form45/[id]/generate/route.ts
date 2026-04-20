import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { overlayForm45 } from '@/lib/pdf'
import { uploadPdf } from '@/lib/storage'
import type { Form45Data } from '@/lib/types'

// POST /api/form45/[id]/generate — trigger PDF generation for a draft form
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Atomically claim the form (draft → generating). Returns null if already claimed.
  const { data: claimed, error: claimErr } = await supabase
    .rpc('claim_form45_for_generation', { form_id: id })

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }
  if (!claimed) {
    return NextResponse.json({ error: 'Form is already generating or has been generated' }, { status: 409 })
  }

  const form = claimed as Form45Data

  try {
    const pdfBytes = await overlayForm45(form)
    const pdfPath  = await uploadPdf(id, pdfBytes)

    await supabase
      .schema('app_secretariat')
      .from('form45')
      .update({ status: 'generated', pdf_path: pdfPath, updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ id, status: 'generated' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase
      .schema('app_secretariat')
      .from('form45')
      .update({ status: 'failed', error_msg: msg, updated_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
