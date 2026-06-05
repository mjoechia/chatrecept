'use client'

import { useEffect } from 'react'

const IDLE_MS = 5 * 60 * 1000

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export default function IdleSignOut() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let authed = false

    function signOutNow() {
      fetch('/api/auth/signout', { method: 'POST' })
        .finally(() => { window.location.href = '/auth/login' })
    }

    function resetTimer() {
      if (!authed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(signOutNow, IDLE_MS)
    }

    fetch('/api/me')
      .then(r => r.json())
      .then((j: { authenticated?: boolean }) => {
        if (!j?.authenticated) return
        authed = true
        for (const ev of ACTIVITY_EVENTS) {
          document.addEventListener(ev, resetTimer, { passive: true })
        }
        resetTimer()
      })
      .catch(() => {})

    return () => {
      if (timer) clearTimeout(timer)
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, resetTimer)
      }
    }
  }, [])

  return null
}
