'use client'

import { useEffect } from 'react'

// 3 minutes of inactivity → silent sign-out. Lives in the root layout
// so it ticks on every page once mounted. Renders nothing.
//
// Activity events deliberately exclude `mousemove` — that fires hundreds
// of times a minute and would resetTimer hot. mousedown / keydown /
// scroll / touchstart / click are enough to capture deliberate use.
const IDLE_MS = 3 * 60 * 1000

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export default function IdleSignOut() {
  useEffect(() => {
    let timer:   ReturnType<typeof setTimeout> | null = null
    let authed = false

    function signOutNow() {
      // Fire-and-forget the signout, then hard-navigate to /. The server
      // gate on / renders AnonymousLanding; user sees "you've been
      // signed out" implicitly because the avatar pill disappears.
      fetch('/api/auth/signout', { method: 'POST' })
        .finally(() => { window.location.href = '/' })
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
      .catch(() => { /* anonymous or /api/me hiccup — no timer needed */ })

    return () => {
      if (timer) clearTimeout(timer)
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, resetTimer)
      }
    }
  }, [])

  return null
}
