'use client'

import { useEffect, useState } from 'react'

interface Me {
  authenticated: boolean
  email?:        string
  name?:         string | null
  is_admin?:     boolean
}

export default function TopBarAuth() {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(j => { if (!cancelled) setMe(j) })
      .catch(() => { if (!cancelled) setMe({ authenticated: false }) })
    return () => { cancelled = true }
  }, [])

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/'
  }

  if (me === null) {
    return <span className="text-xs text-[#94afd5]">…</span>
  }

  if (!me.authenticated) {
    return (
      <a href="/auth/login" className="text-sm text-[#006092] hover:text-[#004d75] font-medium transition-colors">
        Sign in
      </a>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {me.is_admin && (
        <a href="/admin" className="text-xs text-[#94afd5] hover:text-[#425d7f] transition-colors">
          Admin
        </a>
      )}
      <span className="text-xs text-[#425d7f] truncate max-w-[160px] hidden sm:inline">{me.email}</span>
      <button
        onClick={handleSignOut}
        className="text-xs text-[#94afd5] hover:text-[#425d7f] transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}
