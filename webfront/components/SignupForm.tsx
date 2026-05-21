'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

interface Props {
  onSignedIn?: () => void
  // When true, hides the "Already have an account? Sign in" footer link
  // (e.g. when shown inside a modal that has its own dismiss UX)
  hideLoginLink?: boolean
}

export default function SignupForm({ onSignedIn, hideLoginLink }: Props) {
  const params   = useSearchParams()
  const redirect = params.get('redirect')

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error,    setError]    = useState('')

  function callbackUrl() {
    return redirect
      ? `${location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
      : `${location.origin}/auth/callback`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim())        return setError('Name is required')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')

    setStatus('loading')
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim(), full_name: name.trim() },
        emailRedirectTo: callbackUrl(),
      },
    })

    if (signUpError) {
      setStatus('error')
      setError(signUpError.message)
      return
    }
    setStatus('success')
    // If email confirmation is OFF in the project, Supabase returns a session
    // immediately — let the host know so it can dismiss the modal etc.
    if (data.session) onSignedIn?.()
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl(),
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  if (status === 'success') {
    return (
      <div className="text-center space-y-3">
        <h2 className="text-xl font-semibold text-[#12304f]">Check your email</h2>
        <p className="text-sm text-[#425d7f]">
          We sent a confirmation link to <span className="font-semibold text-[#12304f]">{email}</span>.
          Click it to finish creating your account.
        </p>
        <p className="text-xs text-[#94afd5] pt-2">
          Wrong email? <button onClick={() => setStatus('idle')} className="text-[#006092] hover:underline">Start over</button>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#12304f] mb-1">Create your account</h2>
        <p className="text-sm text-[#425d7f]">Sign up to access ChatRecept services.</p>
      </div>

      <button
        onClick={handleGoogle}
        type="button"
        className="w-full bg-white border border-[#dde8f5] hover:bg-[#f3f6ff] text-[#12304f] px-5 py-3 rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-3 shadow-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.92c-.26 1.38-1.03 2.55-2.2 3.33v2.77h3.56c2.08-1.92 3.22-4.74 3.22-8.13z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
          <path fill="#FBBC05" d="M5.85 14.09a6.55 6.55 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.67-2.84z"/>
          <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 1.42 14.97.5 12 .5A11 11 0 0 0 2.18 7.07l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38v-.63z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#dde8f5]" />
        <span className="text-xs uppercase tracking-wider text-[#94afd5]">or</span>
        <div className="flex-1 h-px bg-[#dde8f5]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          hint="At least 8 characters"
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
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

      {!hideLoginLink && (
        <p className="text-center text-xs text-[#94afd5]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#006092] hover:underline font-semibold">
            Sign in
          </Link>
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[#425d7f]">
        {label} <span className="text-[#006092]">*</span>
      </label>
      <input
        {...props}
        className="w-full px-4 py-3 rounded-xl text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-[#eaf1ff] border border-[#94afd5] focus:border-[#006092]"
      />
      {hint && <p className="mt-1 text-[11px] text-[#94afd5]">{hint}</p>}
    </div>
  )
}
