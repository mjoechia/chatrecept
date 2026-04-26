'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function PendingApprovalPage() {
  const [email, setEmail] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#111827' }}>
      <div className="max-w-md w-full mx-4 text-center">

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#FBBF24" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        <h1 className="text-xl font-bold text-white mb-3">Waiting for Admin Approval</h1>
        <p className="text-sm mb-2" style={{ color: '#9CA3AF' }}>
          Your account has been registered{email ? ` as ${email}` : ''} and is pending approval.
        </p>
        <p className="text-sm mb-8" style={{ color: '#6B7280' }}>
          An administrator will review your request and grant access. You will be able to log in once approved.
        </p>

        <div className="rounded-xl p-4 mb-8 text-left"
          style={{ background: '#1F2937', border: '1px solid rgba(75,85,99,0.3)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#6B7280' }}>WHAT HAPPENS NEXT</p>
          <ul className="space-y-2 text-sm" style={{ color: '#9CA3AF' }}>
            <li className="flex gap-2"><span style={{ color: '#229ED9' }}>1.</span> Admin reviews your registration</li>
            <li className="flex gap-2"><span style={{ color: '#229ED9' }}>2.</span> You receive access once approved</li>
            <li className="flex gap-2"><span style={{ color: '#229ED9' }}>3.</span> Log in again to access the dashboard</li>
          </ul>
        </div>

        <button
          onClick={handleSignOut}
          className="text-sm transition-colors hover:text-white"
          style={{ color: '#6B7280' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
