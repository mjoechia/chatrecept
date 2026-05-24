'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Field, PasswordField } from './AuthFormFields'

export default function EmailSignInForm() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [status,   setStatus]   = useState<'idle' | 'loading'>('idle')
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim()) return setError('Email is required')
    if (!password)     return setError('Password is required')

    setStatus('loading')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setStatus('idle')
      // Friendly message for the most common case: user signed up but never
      // clicked the confirmation link.
      if (/email.*not.*confirmed/i.test(signInError.message)) {
        setError('Please confirm your email first — check your inbox for the confirmation link.')
      } else {
        setError(signInError.message)
      }
      return
    }

    // Session cookie is now set client-side. Hard-navigate so the server
    // auth gate on / (or wherever next points) picks it up.
    const next = new URLSearchParams(window.location.search).get('next') ?? '/'
    window.location.href = next
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        visible={showPw}
        onToggleVisible={() => setShowPw(v => !v)}
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-[#006092] hover:bg-[#004d75] text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
