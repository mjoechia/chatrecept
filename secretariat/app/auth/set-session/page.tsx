'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Receives #access_token=...&refresh_token=... from the webfront after OAuth
// Sets the Supabase session and redirects to the dashboard
export default function SetSessionPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const access_token  = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(() => {
        router.replace('/')
      })
    } else {
      router.replace('/')
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-400">Signing you in…</p>
    </div>
  )
}
