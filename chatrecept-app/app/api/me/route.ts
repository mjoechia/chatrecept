import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ authenticated: false })
    return NextResponse.json({ authenticated: true, email: user.email })
  } catch {
    return NextResponse.json({ authenticated: false })
  }
}
