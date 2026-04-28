import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { uploadTemplatePdf } from '@/lib/storage'
import type { TemplateCoordMap } from '@/lib/types'

// GET /api/admin/templates — list all templates
export async function GET() {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, name, description, status, user_visible, version, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/templates — create a new template (multipart: name, description, pdf file)
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  let name: string
  let description: string | null = null
  let pdfBytes: Uint8Array | null = null

  try {
    const formData = await req.formData()
    name = String(formData.get('name') ?? '').trim()
    description = String(formData.get('description') ?? '').trim() || null
    const file = formData.get('pdf') as File | null
    if (file) {
      pdfBytes = new Uint8Array(await file.arrayBuffer())
    }
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!pdfBytes) return NextResponse.json({ error: 'pdf file is required' }, { status: 400 })

  if (!process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration: SUPABASE_SERVICE_KEY is not set' }, { status: 500 })
  }

  const supabase = createServiceClient()

  // Insert template first to get the ID
  const emptyCoordMap: TemplateCoordMap = {
    version: 1,
    coordinate_system: { origin: 'bottom_left', unit: 'points' },
    pdf_meta: { page_count: 1, page_sizes: { '0': { width: 595, height: 842 } } },
    fields: {},
  }

  const { data: tmpl, error: insertError } = await supabase
    .from('form_templates')
    .insert({ name, description, pdf_storage_path: 'pending', coord_map: emptyCoordMap })
    .select('id')
    .single()

  if (insertError || !tmpl) {
    return NextResponse.json({
      error: insertError?.message ?? 'Insert failed',
      code: insertError?.code,
      hint: insertError?.code === 'PGRST106'
        ? 'app_secretariat schema not exposed in Supabase → Settings → API → Exposed schemas. Then run: NOTIFY pgrst, \'reload config\';'
        : undefined,
    }, { status: 500 })
  }

  // Upload PDF and update path
  const storagePath = await uploadTemplatePdf(tmpl.id, pdfBytes)
  await supabase
    .from('form_templates')
    .update({ pdf_storage_path: storagePath })
    .eq('id', tmpl.id)

  return NextResponse.json({ id: tmpl.id }, { status: 201 })
}
