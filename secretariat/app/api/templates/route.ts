import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'

// GET /api/templates — returns active + user_visible templates for any authenticated user
export async function GET() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('form_templates')
    .select('id, name, description, status, user_visible, version, created_at, coord_map')
    .eq('status', 'active')
    .eq('user_visible', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
