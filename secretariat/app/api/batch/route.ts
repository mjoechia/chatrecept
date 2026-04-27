import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { createHash } from 'crypto'
import type { ColumnMapping } from '@/lib/types'

// POST /api/batch — create a batch job and all its form_submissions atomically
// Body: { template_id, label?, column_map, rows, source_type }
// rows is the full array of data rows from /api/batch/parse (caller passes all rows, not just preview)
export async function POST(req: NextRequest) {
  const sessionSupabase = await createSessionClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    template_id: string
    label?: string
    column_map: ColumnMapping
    rows: Record<string, string>[]
    source_type: 'csv' | 'xlsx' | 'google_contacts'
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.template_id) return NextResponse.json({ error: 'template_id required' }, { status: 400 })
  if (!body.column_map)  return NextResponse.json({ error: 'column_map required' }, { status: 400 })
  if (!body.rows?.length) return NextResponse.json({ error: 'rows must be non-empty' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify template exists and is active
  const { data: tmpl } = await supabase
    .from('form_templates')
    .select('id, status')
    .eq('id', body.template_id)
    .single()

  if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (tmpl.status !== 'active') return NextResponse.json({ error: 'Template is not active' }, { status: 400 })

  // Create batch job
  const { data: batchJob, error: batchError } = await supabase
    .from('batch_jobs')
    .insert({
      template_id: body.template_id,
      label: body.label ?? null,
      column_map: body.column_map,
      total: body.rows.length,
      source_type: body.source_type ?? 'csv',
      status: 'pending',
      user_id: user.id,
    })
    .select('id')
    .single()

  if (batchError || !batchJob) {
    return NextResponse.json({ error: batchError?.message ?? 'Batch job creation failed' }, { status: 500 })
  }

  // Build recipient_data for each row (apply column_map: source_key → source column value)
  const submissions = body.rows.map(row => {
    const recipientData: Record<string, unknown> = {}
    for (const [sourceKey, csvColumn] of Object.entries(body.column_map)) {
      recipientData[sourceKey] = row[csvColumn] ?? null
    }
    const contentHash = createHash('sha256')
      .update(`${body.template_id}:${batchJob.id}:${JSON.stringify(recipientData)}`)
      .digest('hex')
    return {
      template_id: body.template_id,
      batch_job_id: batchJob.id,
      recipient_data: recipientData,
      content_hash: contentHash,
      status: 'pending',
      source: 'batch',
    }
  })

  // Insert all submissions (duplicates skipped by UNIQUE constraint on content_hash)
  const { error: subError } = await supabase
    .from('form_submissions')
    .insert(submissions)

  if (subError && !subError.message.includes('unique')) {
    return NextResponse.json({ error: subError.message }, { status: 500 })
  }

  return NextResponse.json({ id: batchJob.id, total: body.rows.length }, { status: 201 })
}
