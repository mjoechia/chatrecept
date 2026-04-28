'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

function LoginRedirect() {
  const params = useSearchParams()
  const redirect = params.get('redirect')

  useEffect(() => {
    const callbackUrl = redirect
      ? `${location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
      : `${location.origin}/auth/callback`

    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        queryParams: { prompt: 'select_account' },
      },
    })
  }, [])

  return null
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3f6ff]">
      <p className="text-sm text-gray-400">Redirecting to sign in…</p>
      <Suspense>
        <LoginRedirect />
      </Suspense>
    </div>
  )
}
