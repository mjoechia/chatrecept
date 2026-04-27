import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/batch/[id]/status — poll batch job progress
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionSupabase = await createSessionClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('batch_jobs')
    .select('id, total, completed, failed_count, status, label, template_id, created_at')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
