'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Tier = 'pending' | 'none' | 'map_once_daily' | 'trial'

interface ClawsUser {
  id:               string
  auth_user_id:     string
  email:            string
  name:             string | null
  whatsapp_number:  string | null
  tier:             Tier
  trial_ends_at:    string | null
  daily_map_count:  number
  daily_map_day:    string | null
  is_admin:         boolean
  is_master:        boolean
  spend_today_sgd:  number
  spend_day:        string | null
  spend_month_sgd:  number
  spend_month:      string | null
  welcome_sent_at:  string | null
  created_at:       string
}

const MONTHLY_CAP_SGD = Number(process.env.NEXT_PUBLIC_MAX_MONTHLY_SPEND_PER_USER_SGD ?? 150)

const TIER_LABEL: Record<Tier, string> = {
  pending:        'Pending',
  none:           'No access',
  map_once_daily: 'Map once daily',
  trial:          'Trial',
}

const TIER_BADGE: Record<Tier, string> = {
  pending:        'bg-amber-50 text-amber-700 border-amber-200',
  none:           'bg-gray-100 text-gray-600 border-gray-200',
  map_once_daily: 'bg-sky-50 text-sky-700 border-sky-200',
  trial:          'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<ClawsUser[] | null>(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/users')
      if (res.status === 401) { router.push('/auth/login?next=/admin'); return }
      if (res.status === 403) { setError('Your account is not an admin.'); return }
      if (!res.ok) { setError((await res.json()).error ?? 'Failed to load users'); return }
      if (cancelled) return
      setUsers(await res.json())
    }
    load()
    return () => { cancelled = true }
  }, [router])

  async function patchUser(u: ClawsUser, body: { tier?: Tier; trial_days?: number; is_admin?: boolean }) {
    if (!users) return
    if (u.is_master) {
      setError('The master admin account cannot be modified.')
      return
    }
    setError('')
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Update failed')
      return
    }
    const updated = await res.json() as ClawsUser
    setUsers(users.map(x => x.id === u.id ? { ...x, ...updated } : x))
  }

  async function sendWelcome(u: ClawsUser, tier: 'map_once_daily' | 'trial', trialDays?: number): Promise<{ ok: boolean }> {
    if (!users) return { ok: false }
    setError('')
    const res = await fetch(`/api/admin/users/${u.id}/send-welcome`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tier, trial_days: tier === 'trial' ? (trialDays ?? 14) : undefined }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Send failed')
      return { ok: false }
    }
    const json = await res.json() as { ok: true; user?: ClawsUser; warning?: string }
    if (json.user) {
      setUsers(users.map(x => x.id === u.id ? { ...x, ...json.user! } : x))
    } else {
      // No row returned but email sent — stamp client-side optimistically
      setUsers(users.map(x => x.id === u.id
        ? { ...x, welcome_sent_at: new Date().toISOString(), tier }
        : x))
    }
    if (json.warning) setError(json.warning)
    return { ok: true }
  }

  async function resetDaily(u: ClawsUser): Promise<void> {
    if (!users) return
    setError('')
    const res = await fetch(`/api/admin/users/${u.id}/reset-daily`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Reset failed')
      return
    }
    const updated = await res.json() as ClawsUser
    setUsers(users.map(x => x.id === u.id ? { ...x, ...updated } : x))
  }

  const pending = (users ?? []).filter(u => u.tier === 'pending').length

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-bold text-[#12304f]">JC CLAWs · Admin · Users</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-[#006092] hover:bg-[#004d75] text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            + Add user
          </button>
          <a href="/admin/lookups" className="text-sm text-[#006092] hover:underline">Lookups →</a>
        </div>
      </div>
      <p className="text-sm text-[#425d7f] mb-6">
        Approve new sign-ins, assign tiers, and grant admin powers. Mapping access depends on tier + admin flag.
      </p>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={u => {
            // Prepend so the new row is immediately visible, even if the
            // server returns them sorted pending-first (which they will be).
            setUsers(prev => prev ? [u, ...prev] : [u])
            setShowAdd(false)
          }}
        />
      )}

      {pending > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">{pending} pending</span> {pending === 1 ? 'user is' : 'users are'} waiting for approval.
        </div>
      )}

      <WhatsAppTestPanel />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {users === null ? (
        <p className="text-sm text-[#94afd5]">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[#94afd5]">No users yet — they appear after their first Google sign-in.</p>
      ) : (
        <div className="bg-white rounded-xl border border-[#dde8f5] overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f3f6ff] text-xs font-semibold text-[#94afd5] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Admin</th>
                <th className="px-4 py-3">Welcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde8f5]">
              {users.map(u => (
                <UserRow key={u.id} user={u} onPatch={patchUser} onSendWelcome={sendWelcome} onResetDaily={resetDaily} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function UserRow({ user: u, onPatch, onSendWelcome, onResetDaily }: {
  user:          ClawsUser
  onPatch:       (u: ClawsUser, body: { tier?: Tier; trial_days?: number; is_admin?: boolean }) => Promise<void>
  onSendWelcome: (u: ClawsUser, tier: 'map_once_daily' | 'trial', trialDays?: number) => Promise<{ ok: boolean }>
  onResetDaily:  (u: ClawsUser) => Promise<void>
}) {
  const [trialDays, setTrialDays] = useState(14)
  const today = new Date().toISOString().slice(0, 10)
  const todayMaps = u.daily_map_day === today ? u.daily_map_count : 0

  const trialExpired = u.tier === 'trial'
    && u.trial_ends_at != null
    && new Date(u.trial_ends_at) <= new Date()

  return (
    <tr className={`hover:bg-[#f9fbff] ${u.is_master ? 'bg-[#fff8e1]/40' : ''} ${u.tier === 'pending' ? 'bg-amber-50/30' : ''}`}>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-[#12304f]">{u.name ?? u.email}</p>
          {u.is_master && (
            <span className="text-[9px] font-bold tracking-widest text-[#8a6d00] bg-[#fef3c7] border border-[#fde68a] px-1.5 py-0.5 rounded uppercase">
              Master
            </span>
          )}
        </div>
        {u.name && <p className="text-xs text-[#94afd5]">{u.email}</p>}
        {u.whatsapp_number && (
          <p className="text-xs text-[#94afd5] font-mono mt-0.5">
            <span className="text-[10px] uppercase tracking-wider mr-1">WA</span>
            {u.whatsapp_number}
          </p>
        )}
      </td>

      <td className="px-4 py-3 align-top text-xs text-[#425d7f]">
        {new Date(u.created_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
      </td>

      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1.5">
          <select
            value={u.tier}
            disabled={u.is_master}
            onChange={e => {
              const tier = e.target.value as Tier
              onPatch(u, tier === 'trial' ? { tier, trial_days: trialDays } : { tier })
            }}
            className={`text-xs rounded-md border px-2 py-1.5 ${TIER_BADGE[u.tier]} ${u.is_master ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <option value="pending">{TIER_LABEL.pending}</option>
            <option value="none">{TIER_LABEL.none}</option>
            <option value="map_once_daily">{TIER_LABEL.map_once_daily}</option>
            <option value="trial">{TIER_LABEL.trial}</option>
          </select>
          {u.tier === 'trial' && !u.is_master && (
            <div className="flex items-center gap-1 text-[11px] text-[#425d7f]">
              <input
                type="number"
                min={1}
                max={365}
                value={trialDays}
                onChange={e => setTrialDays(Number(e.target.value))}
                className="w-14 border border-[#dde8f5] rounded px-1.5 py-0.5 text-xs font-mono"
              />
              <span className="text-[#94afd5]">days</span>
              <button
                onClick={() => onPatch(u, { tier: 'trial', trial_days: trialDays })}
                className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-[#006092] hover:underline"
              >
                Set
              </button>
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-3 align-top text-xs text-[#425d7f]">
        {u.tier === 'pending' && <span className="text-amber-700">Awaiting approval</span>}
        {u.tier === 'none'    && <span className="text-gray-500">Denied</span>}
        {u.tier === 'map_once_daily' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={todayMaps >= 1 ? 'text-gray-500' : 'text-sky-700'}>
              {todayMaps}/1 today
            </span>
            {!u.is_master && <ResetDailyButton user={u} usedToday={todayMaps >= 1} onReset={onResetDaily} />}
          </div>
        )}
        {u.tier === 'trial' && u.trial_ends_at && (
          <span className={trialExpired ? 'text-red-600 font-semibold' : 'text-emerald-700'}>
            {trialExpired ? 'Trial expired' : `Until ${new Date(u.trial_ends_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}`}
          </span>
        )}
        {Number(u.spend_today_sgd) > 0 && (
          <div className="text-[10px] text-[#94afd5] mt-0.5">
            SGD {Number(u.spend_today_sgd).toFixed(2)} today
          </div>
        )}
        {Number(u.spend_month_sgd ?? 0) > 0 && (
          <div className="text-[10px] text-[#94afd5] mt-0.5">
            SGD {Number(u.spend_month_sgd).toFixed(2)} / {MONTHLY_CAP_SGD} this month
          </div>
        )}
        {u.tier !== 'pending' && u.tier !== 'none' && u.tier !== 'map_once_daily' && (
          <div className="text-[10px] text-[#94afd5] mt-0.5">
            {todayMaps} fresh lookup{todayMaps === 1 ? '' : 's'} today
          </div>
        )}
      </td>

      <td className="px-4 py-3 align-top text-center">
        <Toggle
          on={u.is_admin}
          disabled={u.is_master}
          onClick={() => onPatch(u, { is_admin: !u.is_admin })}
        />
      </td>

      <td className="px-4 py-3 align-top">
        <SendWelcomeButton user={u} onSend={onSendWelcome} />
      </td>
    </tr>
  )
}

// Inline reset for a map_once_daily user's daily quota. Click-twice
// pattern: first click arms (button switches to "Confirm"), second
// commits and fires the API. Click anywhere else (blur) disarms.
function ResetDailyButton({ user: u, usedToday, onReset }: {
  user:      ClawsUser
  usedToday: boolean
  onReset:   (u: ClawsUser) => Promise<void>
}) {
  const [state, setState] = useState<'idle' | 'confirming' | 'resetting'>('idle')

  async function handleClick() {
    if (state === 'idle') { setState('confirming'); return }
    if (state === 'confirming') {
      setState('resetting')
      await onReset(u)
      setState('idle')
    }
  }

  const label =
    state === 'resetting'  ? '…' :
    state === 'confirming' ? 'Confirm' :
    'Reset'

  // De-emphasise when there's nothing to reset (user hasn't mapped
  // today), but still allow it — admin may want to proactively clear an
  // old daily_map_day that's about to roll.
  const muted = state === 'idle' && !usedToday

  return (
    <button
      onClick={handleClick}
      onBlur={() => state === 'confirming' && setState('idle')}
      disabled={state === 'resetting'}
      title={usedToday ? 'Give this user another lookup today' : 'Already at 0/1 — reset anyway'}
      className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
        state === 'confirming'
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : muted
            ? 'border-[#dde8f5] bg-white text-[#94afd5] hover:text-[#006092] hover:border-[#94afd5]'
            : 'border-[#dde8f5] bg-white text-[#006092] hover:bg-[#f3f6ff]'
      } ${state === 'resetting' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  )
}

function SendWelcomeButton({ user: u, onSend }: {
  user:   ClawsUser
  onSend: (u: ClawsUser, tier: 'map_once_daily' | 'trial', trialDays?: number) => Promise<{ ok: boolean }>
}) {
  const [state, setState] = useState<'idle' | 'choosing' | 'sending'>('idle')
  const sent = u.welcome_sent_at ? new Date(u.welcome_sent_at) : null

  // Master is locked from any modification (mirrors the tier dropdown / admin
  // toggle behavior). Resending wouldn't break anything but it's noise.
  if (u.is_master) {
    return <span className="text-[11px] text-[#94afd5]">—</span>
  }

  async function pick(tier: 'map_once_daily' | 'trial', trialDays?: number) {
    setState('sending')
    await onSend(u, tier, trialDays)
    setState('idle')
  }

  if (state === 'choosing') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-wider text-[#94afd5]">
          Grant tier + send
        </p>
        <div className="flex flex-wrap gap-1 items-center">
          <button
            onClick={() => pick('map_once_daily')}
            title="One fresh lookup per day, no expiry"
            className="text-[11px] font-semibold px-2 py-1 rounded border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 transition-colors"
          >
            Map daily
          </button>
          <button
            onClick={() => pick('trial', 1)}
            title="Full mapping access for 1 day — quick prospect demo"
            className="text-[11px] font-semibold px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
          >
            Trial 1d
          </button>
          <button
            onClick={() => pick('trial', 14)}
            title="Full mapping access for 14 days"
            className="text-[11px] font-semibold px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            Trial 14d
          </button>
          <button
            onClick={() => setState('idle')}
            aria-label="Cancel"
            className="text-[#94afd5] hover:text-[#425d7f] text-base leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  if (state === 'sending') {
    return <span className="text-[11px] text-[#94afd5]">Sending…</span>
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setState('choosing')}
        className="text-[11px] font-semibold px-2.5 py-1 rounded border border-[#dde8f5] bg-white text-[#006092] hover:bg-[#f3f6ff] transition-colors w-fit cursor-pointer"
      >
        {sent ? 'Resend' : 'Send welcome'}
      </button>
      {sent && (
        <span className="text-[10px] text-[#94afd5]">
          Last sent {sent.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </div>
  )
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Locked — master admin' : ''}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-[#006092]' : 'bg-[#dde8f5]'} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-pressed={on}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </button>
  )
}

// Modal for admin-initiated user creation. Captures Name / Email /
// WhatsApp number; POSTs to /api/admin/users which creates both the
// auth.users row (with a random password the admin never sees) and the
// app_claws.users row (tier=pending). The admin then uses the existing
// "Send welcome" button to deliver a set-password link.
function AddUserModal({ onClose, onCreated }: {
  onClose:   () => void
  onCreated: (u: ClawsUser) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [whatsapp,  setWhatsapp]  = useState('+65 ')
  const [status,    setStatus]    = useState<'idle' | 'loading'>('idle')
  const [error,     setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!firstName.trim()) return setError('First name is required')
    if (!email.trim())     return setError('Email is required')

    // Combine into the single `name` column the server already expects.
    // Last name is optional — trim so single-name entries don't ship a
    // trailing space.
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')

    setStatus('loading')
    try {
      const res = await fetch('/api/admin/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, whatsapp_number: whatsapp }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
        setStatus('idle')
        return
      }
      onCreated(json as ClawsUser)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('idle')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-[#dde8f5] shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold text-[#12304f]">Add a new user</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#94afd5] hover:text-[#425d7f] transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-[#94afd5] mb-4 leading-snug">
          Creates the account in <span className="font-mono">pending</span> tier. Click <span className="font-semibold">Send welcome</span> on
          their row afterwards to email them a set-password link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              autoFocus
            />
            <Field
              label="Last name"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
            />
          </div>
          <Field
            label="Email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Field
            label="WhatsApp number"
            type="tel"
            autoComplete="off"
            inputMode="tel"
            placeholder="+65 9123 4567"
            value={whatsapp}
            onChange={e => setWhatsapp(e.target.value)}
            hint="Optional — include country code if you have it"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'loading'}
              className="flex-1 border border-[#dde8f5] text-[#425d7f] hover:bg-[#f3f6ff] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex-1 bg-[#006092] hover:bg-[#004d75] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Light-weight field component for the modal. Mirrors the shape used by
// AuthFormFields but without the required-asterisk styling and with
// support for autoFocus on the first field.
function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-[#425d7f]">
        {label} {props.required && <span className="text-[#006092]">*</span>}
      </label>
      <input
        {...props}
        className="w-full px-3 py-2.5 rounded-lg text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-white border border-[#dde8f5] focus:border-[#006092] focus:ring-2 focus:ring-[#006092]/20"
      />
      {hint && <p className="mt-1 text-[11px] text-[#94afd5]">{hint}</p>}
    </div>
  )
}

// Smoke-test panel for the Meta WhatsApp Cloud API integration. Defaults
// to the built-in `hello_world` template (auto-approved on every WABA),
// so it works the moment env vars are set — no custom template approval
// required. Once we wire OTPs, this panel stays as a useful "is Meta
// still healthy?" probe.
function WhatsAppTestPanel() {
  const [to,       setTo]       = useState('+65 ')
  const [template, setTemplate] = useState('hello_world')
  const [status,   setStatus]   = useState<'idle' | 'sending'>('idle')
  const [result,   setResult]   = useState<{ ok: true; wamid: string } | { ok: false; error: string } | null>(null)

  async function handleSend() {
    setResult(null)
    setStatus('sending')
    try {
      const res = await fetch('/api/admin/whatsapp/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to: to.trim(), template: template.trim() || 'hello_world' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setResult({ ok: false, error: json.error ?? `HTTP ${res.status}` })
      } else {
        setResult({ ok: true, wamid: json.wamid })
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className="mb-4 bg-white border border-[#dde8f5] rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">
            Test WhatsApp send (Meta Cloud API)
          </p>
          <p className="text-[11px] text-[#94afd5] mt-0.5">
            Sends a template to any WhatsApp number. Default <span className="font-mono">hello_world</span> is auto-approved by Meta — useful for verifying the integration before custom templates.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="tel"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="+65 9123 4567"
          className="flex-1 border border-[#dde8f5] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#006092]"
        />
        <input
          type="text"
          value={template}
          onChange={e => setTemplate(e.target.value)}
          placeholder="hello_world"
          className="sm:w-40 border border-[#dde8f5] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#006092]"
        />
        <button
          onClick={handleSend}
          disabled={status === 'sending' || !to.trim()}
          className="bg-[#006092] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#004d75] disabled:opacity-50 transition-colors"
        >
          {status === 'sending' ? 'Sending…' : 'Send test'}
        </button>
      </div>
      {result && (
        <div className={`mt-3 text-xs rounded-lg px-3 py-2 ${result.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {result.ok ? (
            <>Sent. WAMID <span className="font-mono">{result.wamid}</span></>
          ) : (
            <>Failed: {result.error}</>
          )}
        </div>
      )}
    </div>
  )
}
