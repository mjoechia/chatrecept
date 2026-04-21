'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const code     = params.get('code')
    const redirect = params.get('redirect')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data }) => {
        const session = data?.session
        if (redirect && session) {
          // Forward tokens to the target service via URL hash (not logged server-side)
          const url = `${redirect}/auth/set-session#access_token=${session.access_token}&refresh_token=${session.refresh_token}`
          window.location.href = url
        } else {
          router.replace('/')
        }
      })
    } else {
      router.replace('/')
    }
  }, [])

  return null
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-400">Signing you in…</p>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
