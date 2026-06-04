import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  try {
    const supabase = await createSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect('/knowledge')
  } catch { /* no session */ }
  redirect('/auth/login')
}
