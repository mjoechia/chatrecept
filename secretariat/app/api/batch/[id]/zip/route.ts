import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { downloadByPath } from '@/lib/storage'
import archiver from 'archiver'
import { PassThrough } from 'stream'

// GET /api/batch/[id]/zip — stream a ZIP of all generated PDFs in a batch
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionSupabase = await createSessionClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  // Fetch all generated submissions in this batch
  const { data: submissions, error } = await supabase
    .from('form_submissions')
    .select('id, pdf_path, recipient_data')
    .eq('batch_job_id', id)
    .eq('status', 'generated')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!submissions?.length) return NextResponse.json({ error: 'No generated PDFs in this batch' }, { status: 404 })

  // Stream ZIP via archiver → PassThrough → ReadableStream
  const pass = new PassThrough()
  const archive = archiver('zip', { zlib: { level: 1 } })
  archive.pipe(pass)

  // Add each PDF to the archive (sequential to avoid memory spike)
  ;(async () => {
    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i]
      if (!sub.pdf_path) continue
      try {
        const bytes = await downloadByPath(sub.pdf_path)
        if (!bytes) continue
        // Name file by index + first available string value from recipient_data
        const recipientName = Object.values(sub.recipient_data as Record<string, unknown>)
          .find(v => typeof v === 'string' && v.length > 0) as string | undefined
        const safeName = recipientName
          ? recipientName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 40)
          : `submission-${i + 1}`
        archive.append(Buffer.from(bytes), { name: `${String(i + 1).padStart(3, '0')}-${safeName}.pdf` })
      } catch {
        // Skip failed PDFs, keep streaming
      }
    }
    archive.finalize()
  })()

  // Convert Node PassThrough stream to Web ReadableStream
  const readableStream = new ReadableStream({
    start(controller) {
      pass.on('data', chunk => controller.enqueue(new Uint8Array(chunk)))
      pass.on('end', () => controller.close())
      pass.on('error', err => controller.error(err))
    },
    cancel() {
      archive.abort()
    },
  })

  return new NextResponse(readableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="batch-${id}.zip"`,
      'Transfer-Encoding': 'chunked',
    },
  })
}
