'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PasswordField } from '@/app/_components/AuthFormFields'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [status,   setStatus]   = useState<'idle' | 'loading'>('idle')
  const [error,    setError]    = useState('')
  // null while we check; '' if no session (invalid/expired link); string when authed
  const [accountEmail, setAccountEmail] = useState<string | null>(null)

  // Resolve the email tied to the session that the recovery link just
  // established, so the user can see WHICH account they're setting the
  // password for. Empty string means no session — invalid/expired link.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      setAccountEmail(data.user?.email ?? '')
    })()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8)  return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')

    setStatus('loading')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setStatus('idle')
      setError(`${updateError.message} — your invite link may have expired. Ask the admin to resend.`)
      return
    }
    // Done. Hard-navigate so the server-side gate on / picks up the now
    // password-confirmed session.
    window.location.href = '/'
  }

  // No session at all — link was invalid or already used. Tell the user
  // plainly so they know to ask for a fresh one.
  if (accountEmail === '') {
    return (
      <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16">
        <div className="bg-white border border-[#dde8f5] rounded-xl p-6 shadow-sm text-center space-y-3">
          <h1 className="text-xl font-bold text-[#12304f]">Link expired or already used</h1>
          <p className="text-sm text-[#425d7f] leading-relaxed">
            This set-password link is no longer valid. Ask your admin to resend the welcome email,
            then open the new link in the same browser.
          </p>
          <a href="/auth/login" className="inline-block text-sm text-[#006092] hover:underline font-semibold mt-2">
            Or sign in →
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#12304f] mb-2">Set your password</h1>
        <p className="text-sm text-[#425d7f]">
          Pick a password to finish setting up your JC CLAWs account.
        </p>
      </div>

      <div className="bg-white border border-[#dde8f5] rounded-xl p-6 shadow-sm space-y-4">
        {/* Account label — shows the user which login they're setting the password for */}
        <div className="bg-[#f3f6ff] rounded-lg px-3 py-2.5 border border-[#dde8f5]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94afd5] mb-0.5">
            Setting password for
          </p>
          {accountEmail === null ? (
            <p className="text-sm text-[#94afd5]">Checking your invite…</p>
          ) : (
            <p className="text-sm font-semibold text-[#12304f] truncate">{accountEmail}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <PasswordField
            label="Password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            visible={showPw}
            onToggleVisible={() => setShowPw(v => !v)}
            hint="At least 8 characters"
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
            disabled={status === 'loading' || accountEmail === null}
            className="w-full bg-[#006092] hover:bg-[#004d75] text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Saving…' : 'Save password & continue →'}
          </button>
        </form>
      </div>
    </main>
  )
}
