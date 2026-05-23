'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function EmailSignupForm() {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
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
    if (password.length < 8)  return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')

    setStatus('loading')
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // full_name is what the auth/callback reads to seed claws.users.name
        data: { name: name.trim(), full_name: name.trim() },
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
      <PasswordField
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        hint="At least 8 characters"
        visible={showPw}
        onToggleVisible={() => setShowPw(v => !v)}
        required
      />
      <PasswordField
        label="Confirm password"
        autoComplete="new-password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
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
        {status === 'loading' ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-[#425d7f]">
        {label} <span className="text-[#006092]">*</span>
      </label>
      <input
        {...props}
        className="w-full px-3 py-2.5 rounded-lg text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
      />
      {hint && <p className="mt-1 text-[11px] text-[#94afd5]">{hint}</p>}
    </div>
  )
}

interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label:            string
  hint?:            string
  visible:          boolean
  onToggleVisible:  () => void
}

function PasswordField({
  label,
  hint,
  visible,
  onToggleVisible,
  ...props
}: PasswordFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-[#425d7f]">
        {label} <span className="text-[#006092]">*</span>
      </label>
      <div className="relative">
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          className="w-full pl-3 pr-11 py-2.5 rounded-lg text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-[#94afd5] hover:text-[#425d7f] transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {visible ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[#94afd5]">{hint}</p>}
    </div>
  )
}
