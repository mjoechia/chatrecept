'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import { DEFAULT_FIELDS, DEFAULT_CHECKBOXES } from '@/lib/pdf'
import type { CoordMap, FieldCoord, CheckboxCoord } from '@/lib/types'
import {
  Settings, Upload, CheckCircle2, XCircle, RefreshCw, FileText,
  Key, Plus, Trash2, Eye, EyeOff, ArrowRight, AlertCircle, ExternalLink,
} from 'lucide-react'

type StatusData = {
  template:    { exists: boolean; source: string }
  font:        { exists: boolean; source: string }
  coordinates: { source: string }
}

type ApiKeyRecord = {
  id: string; name: string; scope: string; rate_limit_per_minute: number
  created_at: string; last_used: string | null; revoked_at: string | null
}

const inputClass = 'border rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-500 mb-1'

export default function AdminPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [status,   setStatus]   = useState<StatusData | null>(null)
  const [coords,   setCoords]   = useState<CoordMap | null>(null)
  const [apiKeys,  setApiKeys]  = useState<ApiKeyRecord[]>([])
  const [userCounts, setUserCounts] = useState<{ active: number; invited: number; suspended: number } | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [uploading, setUploading] = useState<'template' | 'font' | null>(null)
  const [testUrl,  setTestUrl]  = useState<string | null>(null)
  const [testing,  setTesting]  = useState(false)
  const [newKey,   setNewKey]   = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [showNewKey, setShowNewKey] = useState(false)
  const templateRef = useRef<HTMLInputElement>(null)
  const fontRef     = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    loadAll()
  }, [])

  async function loadAll() {
    const [s, c, k, u] = await Promise.all([
      fetch('/api/admin/status'),
      fetch('/api/admin/coordinates'),
      fetch('/api/admin/api-keys'),
      fetch('/api/admin/users'),
    ])
    if (s.status === 401) { redirectToLogin(); return }
    const [sj, cj, kj, uj] = await Promise.all([s.json(), c.json(), k.json(), u.json()])
    setStatus(sj)
    setCoords({ fields: cj.fields, checkboxes: cj.checkboxes })
    setApiKeys(kj.keys ?? [])
    if (Array.isArray(uj)) {
      setUserCounts({
        active:    uj.filter((p: { status: string }) => p.status === 'active').length,
        invited:   uj.filter((p: { status: string }) => p.status === 'invited').length,
        suspended: uj.filter((p: { status: string }) => p.status === 'suspended').length,
      })
    }
  }

  async function handleUpload(type: 'template' | 'font', ref: React.RefObject<HTMLInputElement | null>) {
    const file = ref.current?.files?.[0]
    if (!file) return
    setUploading(type)
    const fd = new FormData()
    fd.append('type', type)
    fd.append('file', file)
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      const j = await res.json()
      alert(`Upload failed: ${j.error}`)
    } else {
      await loadAll()
      if (ref.current) ref.current.value = ''
    }
    setUploading(null)
  }

  async function saveCoords() {
    if (!coords) return
    setSaving(true)
    const res = await fetch('/api/admin/coordinates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coords),
    })
    if (!res.ok) alert('Failed to save coordinates')
    else await loadAll()
    setSaving(false)
  }

  async function runTestFill() {
    setTesting(true)
    setTestUrl(null)
    const res = await fetch('/api/admin/test-fill', { method: 'POST' })
    const j   = await res.json()
    if (j.error) alert(`Test fill failed: ${j.error}`)
    else setTestUrl(j.url)
    setTesting(false)
  }

  async function createApiKey() {
    if (!newKeyName.trim()) return
    setCreatingKey(true)
    const res = await fetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName.trim() }),
    })
    const j = await res.json()
    if (j.error) { alert(j.error); setCreatingKey(false); return }
    setNewKey(j.key)
    setNewKeyName('')
    setShowNewKey(true)
    await loadAll()
    setCreatingKey(false)
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
    setApiKeys(ks => ks.map(k => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k))
  }

  function updateField(key: string, prop: keyof FieldCoord, val: string) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    setCoords(c => !c ? c : {
      ...c,
      fields: { ...c.fields, [key]: { ...c.fields[key], [prop]: num } },
    })
  }

  function updateCheckbox(key: string, prop: 'x' | 'y', val: string) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    setCoords(c => !c ? c : {
      ...c,
      checkboxes: { ...c.checkboxes, [key]: { ...c.checkboxes[key], [prop]: num } },
    })
  }

  const statusIcon = (ok: boolean) => ok
    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />

  const sourceBadge = (src: string) => {
    const styles: Record<string, string> = {
      filesystem: 'bg-blue-100 text-blue-700',
      storage:    'bg-purple-100 text-purple-700',
      db:         'bg-green-100 text-green-700',
      missing:    'bg-red-100 text-red-600',
      default:    'bg-gray-100 text-gray-600',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[src] ?? 'bg-gray-100'}`}>
        {src}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-600" />
            <h1 className="text-lg font-semibold">Admin Setup</h1>
          </div>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Users ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Users</h2>
            <a href="/admin/users" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
              Manage Users <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Active',    value: userCounts?.active    ?? '—', colour: 'text-green-600' },
              { label: 'Invited',   value: userCounts?.invited   ?? '—', colour: 'text-yellow-600' },
              { label: 'Suspended', value: userCounts?.suspended ?? '—', colour: 'text-red-500' },
            ].map(({ label, value, colour }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-4 text-center">
                <p className={`text-2xl font-bold ${colour}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Status Overview ─────────────────────────────────────────── */}
        {status && (
          <section className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Setup Status</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Template PDF',  icon: statusIcon(status.template.exists),  src: status.template.source },
                { label: 'Unicode Font',  icon: statusIcon(status.font.exists),      src: status.font.source },
                { label: 'Coordinates',   icon: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />, src: status.coordinates.source },
              ].map(({ label, icon, src }) => (
                <div key={label} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  {icon}
                  <div>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    {sourceBadge(src)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Template & Font Upload ──────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="font-semibold text-gray-800">Assets</h2>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Form 45 Template PDF <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">Official ACRA Form 45 PDF. Download from acra.gov.sg.</p>
            <div className="flex items-center gap-2">
              <input ref={templateRef} type="file" accept=".pdf" className="text-sm text-gray-600 file:mr-2 file:text-sm file:border file:rounded file:px-3 file:py-1 file:bg-white file:text-gray-700 hover:file:bg-gray-50" />
              <button
                onClick={() => handleUpload('template', templateRef)}
                disabled={uploading === 'template'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading === 'template' ? 'Uploading…' : 'Upload'}
              </button>
              {status && sourceBadge(status.template.source)}
            </div>
          </div>

          {/* Font */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NotoSans Unicode Font <span className="text-gray-400 text-xs">(optional — for Chinese/Malay names)</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">Download NotoSans-Regular.ttf from Google Fonts. Enables ✓ checkmarks and Unicode director names.</p>
            <div className="flex items-center gap-2">
              <input ref={fontRef} type="file" accept=".ttf,.otf" className="text-sm text-gray-600 file:mr-2 file:text-sm file:border file:rounded file:px-3 file:py-1 file:bg-white file:text-gray-700 hover:file:bg-gray-50" />
              <button
                onClick={() => handleUpload('font', fontRef)}
                disabled={uploading === 'font'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading === 'font' ? 'Uploading…' : 'Upload'}
              </button>
              {status && sourceBadge(status.font.source)}
            </div>
          </div>
        </section>

        {/* ── Coordinate Map ──────────────────────────────────────────── */}
        {coords && (
          <section className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">Coordinate Map</h2>
                <p className="text-xs text-gray-400 mt-0.5">x, y in PDF points (bottom-left origin). Use the visual calibration tool for pixel-perfect alignment.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/admin/calibrate')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  Visual Calibration <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={saveCoords}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Coordinates'}
                </button>
              </div>
            </div>

            {/* Text Fields */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Text Fields</p>
            <div className="border rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">X</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Y</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Max Width</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Line Height</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(coords.fields).map(([key, cfg]) => (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{key}</td>
                      <td className="px-3 py-2"><input type="number" value={cfg.x} onChange={e => updateField(key, 'x', e.target.value)} className={inputClass} /></td>
                      <td className="px-3 py-2"><input type="number" value={cfg.y} onChange={e => updateField(key, 'y', e.target.value)} className={inputClass} /></td>
                      <td className="px-3 py-2"><input type="number" value={cfg.maxWidth} onChange={e => updateField(key, 'maxWidth', e.target.value)} className={inputClass} /></td>
                      <td className="px-3 py-2"><input type="number" value={cfg.lineHeight ?? ''} placeholder="—" onChange={e => updateField(key, 'lineHeight', e.target.value)} className={inputClass} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Checkboxes */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Checkboxes</p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Checkbox</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">X</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Y</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(coords.checkboxes).map(([key, coord]) => (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{key}</td>
                      <td className="px-3 py-2"><input type="number" value={coord.x} onChange={e => updateCheckbox(key, 'x', e.target.value)} className={inputClass} /></td>
                      <td className="px-3 py-2"><input type="number" value={coord.y} onChange={e => updateCheckbox(key, 'y', e.target.value)} className={inputClass} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Test Fill ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-800">Test Fill</h2>
              <p className="text-xs text-gray-400 mt-0.5">Generate a sample PDF with stress-test data to verify coordinate alignment.</p>
            </div>
            <button
              onClick={runTestFill}
              disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {testing ? 'Generating…' : 'Generate Test PDF'}
            </button>
          </div>
          {testUrl && (
            <div className="mt-3 space-y-2">
              <a
                href={testUrl}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Test PDF
              </a>
              <iframe src={testUrl} className="w-full h-96 border rounded-lg mt-2" title="Test fill preview" />
            </div>
          )}
        </section>

        {/* ── API Keys ────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Key className="w-4 h-4 text-gray-500" /> API Keys
          </h2>

          {/* New key alert */}
          {newKey && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">Copy this key now — it won't be shown again</p>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 text-xs bg-white border rounded px-2 py-1 font-mono break-all">
                      {showNewKey ? newKey : '•'.repeat(64)}
                    </code>
                    <button onClick={() => setShowNewKey(v => !v)} className="text-gray-500 hover:text-gray-700">
                      {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(newKey); alert('Copied!') }}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                    >Copy</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create form */}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createApiKey()}
              placeholder="Key name (e.g. production-crm)"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={createApiKey}
              disabled={creatingKey || !newKeyName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              <Plus className="w-4 h-4" />
              {creatingKey ? 'Creating…' : 'Create Key'}
            </button>
          </div>

          {/* Keys table */}
          {apiKeys.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No API keys yet.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Scope</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Created</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Last Used</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {apiKeys.map(k => (
                    <tr key={k.id} className={`hover:bg-gray-50 ${k.revoked_at ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2 font-medium">{k.name}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{k.scope}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{k.created_at.split('T')[0]}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{k.last_used ? k.last_used.split('T')[0] : '—'}</td>
                      <td className="px-3 py-2">
                        {k.revoked_at
                          ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">revoked</span>
                          : <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">active</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!k.revoked_at && (
                          <button onClick={() => revokeKey(k.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
