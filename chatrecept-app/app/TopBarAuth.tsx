'use client'

import { useEffect, useState } from 'react'

interface Me { authenticated: boolean; email?: string }

export default function TopBarAuth() {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me').then(r => r.json())
      .then(j => { if (!cancelled) setMe(j) })
      .catch(() => { if (!cancelled) setMe({ authenticated: false }) })
    return () => { cancelled = true }
  }, [])

  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/auth/login'
  }

  if (me === null) return <span className="text-xs text-[#6B7280]">…</span>

  if (!me.authenticated) {
    return (
      <a href="/auth/login" className="text-sm text-[#25D366] hover:text-[#1faf55] font-medium transition-colors">
        Sign in
      </a>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#9CA3AF] hidden sm:block">{me.email}</span>
      <button onClick={signOut} className="text-xs text-[#6B7280] hover:text-white transition-colors">
        Sign out
      </button>
    </div>
  )
}
