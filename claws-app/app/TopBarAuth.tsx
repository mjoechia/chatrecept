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

  const label = me.name ?? me.email ?? ''

  return (
    <div className="flex items-center gap-3">
      {me.is_admin && (
        <a href="/admin" className="text-xs text-[#94afd5] hover:text-[#425d7f] transition-colors">
          Admin
        </a>
      )}
      {/* Avatar pill — brand-blue initials circle + name. Universal
          SaaS "you are signed in" cue. Replaces the small email-only
          text that customers kept missing. */}
      <div className="flex items-center gap-2 bg-[#f3f6ff] border border-[#dde8f5] rounded-full pl-1 pr-3 py-1">
        <span className="w-7 h-7 rounded-full bg-[#006092] text-white text-xs font-semibold flex items-center justify-center">
          {initials(label)}
        </span>
        <span className="text-xs font-medium text-[#12304f] truncate max-w-[140px] hidden sm:inline">
          {label}
        </span>
      </div>
      <button
        onClick={handleSignOut}
        className="text-xs text-[#94afd5] hover:text-[#425d7f] transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}

// First letter of first word + first letter of last word, uppercased.
// "Anna Tan" → "AT"; "anna@bigcompany.sg" → "A"; "" → "?".
function initials(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
