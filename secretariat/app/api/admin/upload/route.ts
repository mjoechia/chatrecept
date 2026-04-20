import { NextRequest, NextResponse } from 'next/server'
import { uploadAsset } from '@/lib/storage'
import { requireAdminSession } from '@/lib/admin'

// POST /api/admin/upload
// FormData: file (File), type ('template' | 'font')
export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }

  const type = formData.get('type') as string
  const file = formData.get('file') as File | null

  if (!file || !type) {
    return NextResponse.json({ error: 'Missing file or type' }, { status: 400 })
  }

  if (type === 'template') {
    if (!file.name.endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Template must be a PDF file' }, { status: 400 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await uploadAsset('template.pdf', bytes, 'application/pdf')
    return NextResponse.json({ ok: true, type: 'template', size: bytes.length })
  }

  if (type === 'font') {
    if (!file.name.endsWith('.ttf') && !file.name.endsWith('.otf')) {
      return NextResponse.json({ error: 'Font must be a .ttf or .otf file' }, { status: 400 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await uploadAsset('NotoSans.ttf', bytes, 'font/ttf')
    return NextResponse.json({ ok: true, type: 'font', size: bytes.length })
  }

  return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
}
