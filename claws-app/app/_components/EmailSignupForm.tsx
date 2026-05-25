'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Field } from './AuthFormFields'

// Accepts +<8-15 digits>, optionally with spaces/dashes mixed in. Strips
// to a canonical +<digits> before submit. Singapore numbers come as
// +65 9123 4567 (11 digits total incl. country code).
const WHATSAPP_PATTERN = /^\+\d{8,15}$/

function normaliseWhatsApp(raw: string): string {
  // Keep leading +, strip every non-digit after it.
  const trimmed = raw.trim()
  if (!trimmed.startsWith('+')) return trimmed.replace(/\D/g, '')
  return '+' + trimmed.slice(1).replace(/\D/g, '')
}

export default function EmailSignupForm() {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [whatsapp, setWhatsapp] = useState('+65 ')
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error,    setError]    = useState('')

  // Match the GoogleSignInButton default: round-trip back to the current
  // URL after the user confirms the email link.
  function callbackUrl() {
    const next = `${window.location.pathname}${window.location.search}`
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim())         return setError('Name is required')
    const waNumber = normaliseWhatsApp(whatsapp)
    if (!WHATSAPP_PATTERN.test(waNumber)) {
      return setError('WhatsApp number must include country code, e.g. +65 9123 4567')
    }

    setStatus('loading')
    const supabase = createClient()

    // No password field shown — a strong random one is generated so the
    // Supabase auth row can be created. Users never see or use this; the
    // admin sends them a one-time set-password link via the welcome flow,
    // and the future WhatsApp OTP flow will skip passwords entirely.
    const randomPassword = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID() + crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password: randomPassword,
      options: {
        // full_name is what the auth/callback reads to seed claws.users.name.
        // whatsapp_number is persisted on the same row by the callback.
        data: {
          name:            name.trim(),
          full_name:       name.trim(),
          whatsapp_number: waNumber,
        },
        emailRedirectTo: callbackUrl(),
      },
    })

    if (signUpError) {
      setStatus('error')
      setError(signUpError.message)
      return
    }

    // Case 1: Supabase returned a session inline → "Confirm email" is OFF in
    // the project, the user is already logged in, no email was sent.
    // Reload so the server-side auth gate on / renders AuthedHome.
    if (data.session) {
      window.location.reload()
      return
    }

    // Case 2: Email already registered. Supabase's anti-enumeration design
    // returns success with an empty identities array instead of erroring.
    // Surface a sensible message instead of telling them to check email.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setStatus('error')
      setError('That email is already registered. Try signing in instead.')
      return
    }

    // Case 3: Legit pending confirmation.
    setStatus('success')
  }

  if (status === 'success') {
    return (
      <div className="text-center space-y-2 bg-[#f3f6ff] rounded-lg p-5">
        <p className="text-sm font-semibold text-[#12304f]">Check your email</p>
        <p className="text-xs text-[#425d7f] leading-snug">
          We sent a confirmation link to{' '}
          <span className="font-semibold text-[#12304f]">{email}</span>. Open it
          in <span className="font-semibold">this same browser</span> to finish
          creating your account.
        </p>
        <p className="text-[11px] text-[#94afd5] leading-snug">
          Didn&apos;t arrive in a minute? Check spam.
        </p>
        <p className="text-[11px] text-[#94afd5] pt-1">
          Wrong email?{' '}
          <button
            onClick={() => setStatus('idle')}
            className="text-[#006092] hover:underline"
          >
            Start over
          </button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field
        label="Name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
      />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <Field
        label="WhatsApp number"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="+65 9123 4567"
        value={whatsapp}
        onChange={e => setWhatsapp(e.target.value)}
        hint="Include country code. We'll send a one-time code here to sign you in."
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-[#006092] hover:bg-[#004d75] text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
