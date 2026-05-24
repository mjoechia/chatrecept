'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PasswordField } from '@/app/_components/AuthFormFields'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [status,   setStatus]   = useState<'idle' | 'loading'>('idle')
  const [error,    setError]    = useState('')

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
      // Most likely cause: the recovery link expired or was opened in a
      // different browser, so there's no session to attach the new password
      // to. Steer the user back to /auth/login.
      setError(`${updateError.message} — your invite link may have expired. Ask the admin to resend.`)
      return
    }
    // Done. Hard-navigate so the server-side gate on / picks up the now
    // password-confirmed session.
    window.location.href = '/'
  }

  return (
    <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#12304f] mb-2">Set your password</h1>
        <p className="text-sm text-[#425d7f]">
          Pick a password to finish setting up your JC CLAWs account.
        </p>
      </div>

      <div className="bg-white border border-[#dde8f5] rounded-xl p-6 shadow-sm">
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
            disabled={status === 'loading'}
            className="w-full bg-[#006092] hover:bg-[#004d75] text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Saving…' : 'Save password & continue →'}
          </button>
        </form>
      </div>
    </main>
  )
}
