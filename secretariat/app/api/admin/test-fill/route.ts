import { NextResponse } from 'next/server'
import { overlayForm45 } from '@/lib/pdf'
import { getSignedUrl } from '@/lib/storage'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/admin'
import type { Form45Data } from '@/lib/types'

// POST /api/admin/test-fill — generate a test PDF and return a signed URL
export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const testData: Form45Data = {
    id:            'test',
    tenant_id:     null,
    company_name:  'ACME INTERNATIONAL HOLDINGS PTE. LTD.',
    uen:           '202312345K',
    director_name: 'Zhang Wei 陈伟',
    nric_display:  'SXXXXX67A',
    nric_encrypted: null,
    nationality:   'Singaporean',
    dob:           '1990-01-01',
    address:       '123 Long Street Name That Should Wrap, #12-345, Some Building, Singapore 123456',
    declarations:  { bankrupt: false, convicted: false, disqualified: false, struck_off: false },
    consent_date:  new Date().toISOString().split('T')[0],
    pdf_path:      null,
    status:        'draft',
    source:        'ui',
    error_msg:     null,
    created_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }

  try {
    const pdfBytes = await overlayForm45(testData)

    const supabase  = createServiceClient()
    const storagePath = '_test/test-fill.pdf'
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'form45'

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (error) throw new Error(error.message)

    const url = await getSignedUrl(storagePath)
    return NextResponse.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
