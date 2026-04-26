import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { overlayTemplate, loadTemplateByPath, loadFont } from '@/lib/pdf'
import { uploadSubmissionPdf } from '@/lib/storage'
import type { TemplateCoordMap } from '@/lib/types'

// POST /api/batch/[id]/process-next
// Atomically claims one pending submission, generates its PDF, updates status.
// Frontend calls this in a loop until { done: true }.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionSupabase = await createSessionClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: batchJobId } = await params
  const supabase = createServiceClient()

  // Fetch batch job to get template info and current progress
  const { data: job } = await supabase
    .schema('app_secretariat')
    .from('batch_jobs')
    .select('id, template_id, total, completed, failed_count, status')
    .eq('id', batchJobId)
    .single()

  if (!job) return NextResponse.json({ error: 'Batch job not found' }, { status: 404 })

  // Already done
  if (job.status === 'done' || job.completed + job.failed_count >= job.total) {
    await supabase
      .schema('app_secretariat')
      .from('batch_jobs')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', batchJobId)
    return NextResponse.json({ done: true, completed: job.completed, total: job.total, failed_count: job.failed_count })
  }

  // Mark batch as running
  if (job.status === 'pending') {
    await supabase
      .schema('app_secretariat')
      .from('batch_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', batchJobId)
  }

  // Atomically claim one pending submission
  const { data: submissionId } = await supabase.rpc('claim_submission_for_generation', {
    p_batch_job_id: batchJobId,
  })

  if (!submissionId) {
    // No more pending submissions
    const finalStatus = job.failed_count > 0 ? 'partial_fail' : 'done'
    await supabase
      .schema('app_secretariat')
      .from('batch_jobs')
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq('id', batchJobId)
    return NextResponse.json({ done: true, completed: job.completed, total: job.total, failed_count: job.failed_count })
  }

  // Fetch the submission and template
  const [{ data: submission }, { data: template }] = await Promise.all([
    supabase.schema('app_secretariat').from('form_submissions').select('*').eq('id', submissionId).single(),
    supabase.schema('app_secretariat').from('form_templates').select('coord_map, pdf_storage_path').eq('id', job.template_id).single(),
  ])

  if (!submission || !template) {
    await supabase
      .schema('app_secretariat')
      .from('form_submissions')
      .update({ status: 'failed', error_msg: 'Template or submission not found' })
      .eq('id', submissionId)
    await incrementBatchCounts(supabase, batchJobId, false)
    return NextResponse.json({ done: false, completed: job.completed, total: job.total, failed_count: job.failed_count + 1 })
  }

  const coordMap = template.coord_map as TemplateCoordMap

  try {
    const [templateBytes, fontBytes] = await Promise.all([
      loadTemplateByPath(template.pdf_storage_path),
      loadFont(),
    ])

    const pdfBytes = await overlayTemplate(
      coordMap,
      templateBytes,
      submission.recipient_data as Record<string, unknown>,
      fontBytes,
    )

    const pdfPath = await uploadSubmissionPdf(submissionId, pdfBytes)

    await supabase
      .schema('app_secretariat')
      .from('form_submissions')
      .update({
        status: 'generated',
        pdf_path: pdfPath,
        coord_map_snapshot: coordMap,
      })
      .eq('id', submissionId)

    await incrementBatchCounts(supabase, batchJobId, true)
    const newCompleted = job.completed + 1
    const done = newCompleted + job.failed_count >= job.total
    if (done) {
      const finalStatus = job.failed_count > 0 ? 'partial_fail' : 'done'
      await supabase
        .schema('app_secretariat')
        .from('batch_jobs')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', batchJobId)
    }

    return NextResponse.json({ done, completed: newCompleted, total: job.total, failed_count: job.failed_count })
  } catch (err) {
    await supabase
      .schema('app_secretariat')
      .from('form_submissions')
      .update({ status: 'failed', error_msg: String(err) })
      .eq('id', submissionId)

    await incrementBatchCounts(supabase, batchJobId, false)
    const newFailed = job.failed_count + 1
    const done = job.completed + newFailed >= job.total
    if (done) {
      await supabase
        .schema('app_secretariat')
        .from('batch_jobs')
        .update({ status: 'partial_fail', updated_at: new Date().toISOString() })
        .eq('id', batchJobId)
    }

    return NextResponse.json({ done, completed: job.completed, total: job.total, failed_count: newFailed })
  }
}

async function incrementBatchCounts(
  supabase: ReturnType<typeof createServiceClient>,
  batchJobId: string,
  success: boolean,
) {
  // Use raw SQL increment to avoid race conditions
  await supabase.rpc('increment_batch_counts', {
    p_batch_job_id: batchJobId,
    p_success: success,
  })
}
