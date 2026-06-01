'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminTabs from '../AdminTabs'

type Range  = 'today' | '7d' | '30d' | 'all'
type Status = 'new' | 'contacted' | 'meeting_booked' | 'meeting_done' | 'won' | 'lost' | 'dropped'

interface DemoLookup {
  id:                     string
  created_at:             string

  user_id:                string | null
  email:                  string | null
  whatsapp_number:        string | null
  name:                   string | null

  postcode:               string
  cached:                 boolean
  lookup_session_id:      string | null

  district_label:         string | null
  top_sector:             string | null
  total_businesses:       number | null
  enriched_count:         number | null
  high_opportunity_count: number | null
  sample_outreach_hook:   string | null

  cost_sgd:               string | null

  utm_source:             string | null
  prospect_handle:        string | null

  status:                 Status
  contacted_at:           string | null
  meeting_booked:         boolean
  meeting_completed:      boolean
  notes:                  string | null
}

interface ListResponse {
  rows:    DemoLookup[]
  sectors: string[]
}

const STATUS_LABEL: Record<Status, string> = {
  new:            'New',
  contacted:      'Contacted',
  meeting_booked: 'Meeting booked',
  meeting_done:   'Meeting done',
  won:            'Won',
  lost:           'Lost',
  dropped:        'Dropped',
}

const STATUS_BADGE: Record<Status, string> = {
  new:            'bg-amber-50 text-amber-700 border-amber-200',
  contacted:      'bg-sky-50 text-sky-700 border-sky-200',
  meeting_booked: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  meeting_done:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  won:            'bg-emerald-100 text-emerald-800 border-emerald-300',
  lost:           'bg-gray-100 text-gray-600 border-gray-200',
  dropped:        'bg-gray-100 text-gray-500 border-gray-200',
}

export default function AdminLookupsPage() {
  const router = useRouter()
  const [rows,    setRows]    = useState<DemoLookup[] | null>(null)
  const [sectors, setSectors] = useState<string[]>([])
  const [range,   setRange]   = useState<Range>('30d')
  const [status,  setStatus]  = useState<Status | ''>('')
  const [sector,  setSector]  = useState<string>('')
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ range })
    if (status) params.set('status', status)
    if (sector) params.set('sector', sector)
    const res = await fetch(`/api/admin/lookups?${params.toString()}`)
    if (res.status === 401) { router.push('/auth/login?next=/admin/lookups'); return }
    if (res.status === 403) { setError('Your account is not an admin.'); return }
    if (!res.ok) { setError((await res.json()).error ?? 'Failed to load'); return }
    const json = await res.json() as ListResponse
    setRows(json.rows)
    setSectors(json.sectors)
  }, [range, status, sector, router])

  useEffect(() => { load() }, [load])

  async function patchStatus(row: DemoLookup, newStatus: Status) {
    if (!rows) return
    setError('')
    const res = await fetch(`/api/admin/lookups/${row.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Update failed')
      return
    }
    const updated = await res.json() as DemoLookup
    setRows(rows.map(r => r.id === row.id ? { ...r, ...updated } : r))
  }

  const todayCount    = (rows ?? []).filter(r => isToday(r.created_at)).length
  const uncontacted   = (rows ?? []).filter(r => r.status === 'new').length
  const totalSpend    = (rows ?? []).reduce((sum, r) => sum + Number(r.cost_sgd ?? 0), 0)

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-[#12304f] mb-4">JC CLAWs · Admin</h1>

      <AdminTabs active="lookups" />

      <h2 className="text-lg font-semibold text-[#12304f] mb-1">Lookups</h2>
      <p className="text-sm text-[#425d7f] mb-6">
        Every postcode search, with engagement state. The unlock for everything downstream — repeated zones, sector trends, hook→conversion correlation.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="In range"       value={(rows ?? []).length.toString()} />
        <Stat label="Today"          value={todayCount.toString()} />
        <Stat label="Uncontacted"    value={uncontacted.toString()} highlight={uncontacted > 0} />
        <Stat label="SGD spent"      value={totalSpend.toFixed(2)} />
      </div>

      <div className="bg-white rounded-xl border border-[#dde8f5] p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <ChipGroup
            label="Range"
            value={range}
            options={[
              { value: 'today', label: 'Today' },
              { value: '7d',    label: '7 days' },
              { value: '30d',   label: '30 days' },
              { value: 'all',   label: 'All' },
            ]}
            onChange={v => setRange(v as Range)}
          />
          <ChipGroup
            label="Status"
            value={status}
            options={[
              { value: '',          label: 'All' },
              { value: 'new',       label: 'New' },
              { value: 'contacted', label: 'Contacted' },
              { value: 'meeting_booked', label: 'Meeting' },
              { value: 'won',       label: 'Won' },
              { value: 'lost',      label: 'Lost' },
            ]}
            onChange={v => setStatus(v as Status | '')}
          />
          {sectors.length > 0 && (
            <ChipGroup
              label="Sector"
              value={sector}
              options={[
                { value: '', label: 'All' },
                ...sectors.map(s => ({ value: s, label: s })),
              ]}
              onChange={setSector}
            />
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {rows === null ? (
        <p className="text-sm text-[#94afd5]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#94afd5]">No lookups in this range. Try widening the filter.</p>
      ) : (
        <div className="bg-white rounded-xl border border-[#dde8f5] overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f3f6ff] text-xs font-semibold text-[#94afd5] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Postcode</th>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3 text-right">Opps</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde8f5]">
              {rows.map(r => (
                <LookupRow key={r.id} row={r} onStatus={patchStatus} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function LookupRow({ row: r, onStatus }: {
  row:      DemoLookup
  onStatus: (r: DemoLookup, s: Status) => Promise<void>
}) {
  return (
    <tr className={r.status === 'new' ? 'bg-amber-50/30' : 'hover:bg-[#f9fbff]'}>
      <td className="px-4 py-3 align-top text-xs text-[#425d7f] whitespace-nowrap">
        {formatWhen(r.created_at)}
        {r.cached && <span className="block text-[10px] text-[#94afd5] mt-0.5">cached</span>}
      </td>

      <td className="px-4 py-3 align-top">
        {r.name || r.email || r.whatsapp_number ? (
          <>
            {r.name && <p className="font-medium text-[#12304f]">{r.name}</p>}
            {r.email && <p className="text-xs text-[#425d7f] truncate max-w-[220px]">{r.email}</p>}
            {r.whatsapp_number && <p className="text-xs text-[#94afd5] font-mono">{r.whatsapp_number}</p>}
          </>
        ) : (
          <span className="text-xs text-[#94afd5] italic">anonymous</span>
        )}
        {r.prospect_handle && (
          <p className="text-[10px] text-[#94afd5] mt-0.5">via {r.prospect_handle}</p>
        )}
      </td>

      <td className="px-4 py-3 align-top">
        <p className="font-mono text-[#12304f]">{r.postcode}</p>
        {r.district_label && <p className="text-[11px] text-[#94afd5]">{r.district_label}</p>}
      </td>

      <td className="px-4 py-3 align-top text-xs text-[#425d7f]">
        {r.top_sector ?? <span className="text-[#94afd5]">—</span>}
      </td>

      <td className="px-4 py-3 align-top text-right text-sm">
        {r.high_opportunity_count !== null ? (
          <span className="font-semibold text-[#12304f]">{r.high_opportunity_count}</span>
        ) : (
          <span className="text-[#94afd5]">—</span>
        )}
        {r.enriched_count !== null && r.total_businesses !== null && (
          <p className="text-[10px] text-[#94afd5]">{r.enriched_count}/{r.total_businesses}</p>
        )}
      </td>

      <td className="px-4 py-3 align-top">
        <select
          value={r.status}
          onChange={e => onStatus(r, e.target.value as Status)}
          className={`text-xs rounded-md border px-2 py-1.5 ${STATUS_BADGE[r.status]} cursor-pointer`}
        >
          {(Object.entries(STATUS_LABEL) as [Status, string][]).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        {r.contacted_at && (
          <p className="text-[10px] text-[#94afd5] mt-1">
            {new Date(r.contacted_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}
          </p>
        )}
      </td>
    </tr>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-[#dde8f5]'}`}>
      <p className="text-[10px] uppercase tracking-wider text-[#94afd5]">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-800' : 'text-[#12304f]'} leading-tight mt-0.5`}>{value}</p>
    </div>
  )
}

function ChipGroup({ label, value, options, onChange }: {
  label:    string
  value:    string
  options:  Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94afd5] mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              value === o.value
                ? 'bg-[#006092] border-[#006092] text-white'
                : 'bg-white border-[#dde8f5] text-[#425d7f] hover:bg-[#f3f6ff]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function formatWhen(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60)            return 'just now'
  if (diff < 3600)          return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)         return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400)     return d.toLocaleDateString('en-SG', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: '2-digit' })
}
