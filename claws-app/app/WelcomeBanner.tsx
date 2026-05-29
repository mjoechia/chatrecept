'use client'

import { useEffect, useState } from 'react'

interface Me {
  authenticated: boolean
  name?:         string | null
}

// Renders "Welcome, {Firstname Lastname}" just below the logo header
// after a successful sign-in. Returns null (renders nothing) for
// anonymous visitors so the layout stays clean on the public landing.
// Pulls from /api/me on mount; TopBarAuth in the header does the same
// fetch independently — the double-call is cheap (small payload, dev
// API) and avoids threading state through the layout.
export default function WelcomeBanner() {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(j => { if (!cancelled) setMe(j) })
      .catch(() => { if (!cancelled) setMe({ authenticated: false }) })
    return () => { cancelled = true }
  }, [])

  if (!me?.authenticated || !me.name) return null

  return (
    <div className="bg-white border-b border-[#dde8f5] px-6 py-2">
      <p className="text-sm text-[#425d7f]">
        Welcome, <span className="font-semibold text-[#12304f]">{me.name}</span>
      </p>
    </div>
  )
}
