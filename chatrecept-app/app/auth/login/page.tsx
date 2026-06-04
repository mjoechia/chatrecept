'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [status,   setStatus]   = useState<'idle' | 'loading'>('idle')
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return setError('Email and password required')
    setStatus('loading')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setStatus('idle')
      setError(err.message)
      return
    }
    window.location.href = '/'
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="text-[#25D366] font-bold text-2xl">ChatRecept</span>
          </div>
          <h1 className="text-xl font-semibold text-[#1F2937]">Sign in to your dashboard</h1>
          <p className="text-sm text-[#6B7280] mt-1">Manage your AI frontdesk bot</p>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 transition-all"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-[#25D366] hover:bg-[#1faf55] text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
