'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Fallback path for welcome-email recipients whose Outlook / Defender /
// Mimecast / etc. pre-clicked the magic link and consumed the one-shot
// token before they got there. The link from the welcome email points
// at /auth/callback; this page is the alternative — type the 6-digit
// code from the email body and we call supabase.auth.verifyOtp with
// {email, token, type: 'recovery'} which establishes a session without
// touching the (already-dead) link token.
export default function VerifyOtpPage() {
  return (
    // Suspense boundary required because useSearchParams suspends.
    <Suspense fallback={<main className="min-h-[70vh] max-w-md mx-auto px-6 py-16 text-center text-sm text-[#94afd5]">Loading…</main>}>
      <VerifyOtpInner />
    </Suspense>
  )
}

function VerifyOtpInner() {
  const params      = useSearchParams()
  const initialEmail = params.get('email') ?? ''

  const [email,  setEmail]  = useState(initialEmail)
  const [code,   setCode]   = useState('')
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [error,  setError]  = useState('')

  // Keep email in sync if user navigates between query strings (rare,
  // but harmless and avoids stale state on a back/forward).
  useEffect(() => { setEmail(initialEmail) }, [initialEmail])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim())            return setError('Email is required')
    if (!/^\d{6}$/.test(code))    return setError('Enter the 6-digit code from the email')

    setStatus('loading')
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type:  'recovery',
    })

    if (verifyError) {
      setStatus('idle')
      // Most common: invalid or expired code. Surface a friendly nudge
      // toward asking for a new email instead of Supabase's message.
      const lower = verifyError.message.toLowerCase()
      if (lower.includes('invalid') || lower.includes('expired')) {
        setError('That code is invalid or has expired. Ask your admin to send a fresh welcome email.')
      } else {
        setError(verifyError.message)
      }
      return
    }

    // Session is now established. Send them to set-password to pick a
    // real password; same flow as the link-click path.
    window.location.href = '/auth/set-password'
  }

  return (
    <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#12304f] mb-2">Verify your code</h1>
        <p className="text-sm text-[#425d7f] leading-relaxed">
          Enter the 6-digit code from your welcome email below. Use this if the
          {' '}<span className="font-semibold">Set my password</span> button in the email
          didn&apos;t work for you.
        </p>
      </div>

      <div className="bg-white border border-[#dde8f5] rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-[#425d7f]">
              Email <span className="text-[#006092]">*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg text-[#12304f] text-sm outline-none transition-all bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-[#425d7f]">
              6-digit code <span className="text-[#006092]">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-[#12304f] text-2xl font-mono tracking-[0.5em] text-center outline-none transition-all bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-[#006092] hover:bg-[#004d75] text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Verifying…' : 'Verify and continue →'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-[#94afd5] leading-relaxed">
        Code expires 24 hours after the welcome email was sent. If your code
        was rejected, ask your admin to resend the welcome email — a fresh
        code arrives in the new message.
      </p>
    </main>
  )
}
