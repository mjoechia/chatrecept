import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { overlayTemplate, loadFont, loadTemplateByPath } from '@/lib/pdf'
import { getSignedUrl } from '@/lib/storage'
import type { TemplateCoordMap, FieldDef } from '@/lib/types'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  const { id } = await params
  const svc = createServiceClient()

  const { data: template, error } = await svc
    .from('form_templates')
    .select('id, name, pdf_storage_path, coord_map')
    .eq('id', id)
    .single()

  if (error || !template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const coordMap = template.coord_map as TemplateCoordMap
  const fields = coordMap.fields ?? {}

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No fields in this template. Run AI detection in /admin/templates/new first, then save.' }, { status: 422 })
  }

  // Auto-generate test values from source_keys
  const testData: Record<string, unknown> = {}
  for (const [, field] of Object.entries(fields)) {
    const f = field as FieldDef
    const sk = f.mapping.source_key
    if (f.type === 'checkbox') {
      testData[sk] = true
    } else if (f.type === 'radio') {
      testData[sk] = f.options?.[0]?.value ?? 'yes'
    } else if (f.type === 'date') {
      testData[sk] = new Date().toISOString().split('T')[0]
    } else {
      testData[sk] = `Test ${sk.replace(/_/g, ' ')}`
    }
  }

  try {
    const [pdfBytes, fontBytes] = await Promise.all([
      loadTemplateByPath(template.pdf_storage_path as string),
      loadFont(),
    ])

    const filled = await overlayTemplate(coordMap, pdfBytes, testData, fontBytes)

    const storagePath = `_test/test-fill-${id}.pdf`
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'form45'

    const { error: uploadErr } = await svc.storage
      .from(bucket)
      .upload(storagePath, filled, { contentType: 'application/pdf', upsert: true })

    if (uploadErr) throw new Error(uploadErr.message)

    const url = await getSignedUrl(storagePath)
    return NextResponse.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
