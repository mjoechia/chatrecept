'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogle() {
    setLoading(true); setError('')
    const supabase = createClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    // Preserve any ?next=... param so we land back where the user was
    const next = new URLSearchParams(window.location.search).get('next') ?? '/'
    const callback = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-[#12304f] mb-2">Sign in to JC CLAWs</h1>
      <p className="text-sm text-[#425d7f] mb-8">
        We use Google to verify it&apos;s you. Your daily mapping budget is tracked per account.
      </p>

      <button
        onClick={handleGoogle}
        disabled={loading}
        className="w-full bg-white border border-[#dde8f5] hover:bg-[#f3f6ff] text-[#12304f] px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-3 shadow-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.92c-.26 1.38-1.03 2.55-2.2 3.33v2.77h3.56c2.08-1.92 3.22-4.74 3.22-8.13z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
          <path fill="#FBBC05" d="M5.85 14.09a6.55 6.55 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.67-2.84z"/>
          <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 1.42 14.97.5 12 .5A11 11 0 0 0 2.18 7.07l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38v-.63z"/>
        </svg>
        {loading ? 'Redirecting to Google…' : 'Sign in with Google'}
      </button>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <p className="mt-8 text-xs text-[#94afd5]">
        By signing in you agree that your email and name will be stored to track your mapping usage.
        Admins can disable mapping for any user.
      </p>
    </main>
  )
}
