'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { Person } from '@/lib/types'
import { Building2, UserPlus, Trash2, FileText, Layers } from 'lucide-react'

interface LinkedPerson extends Pick<Person, 'id' | 'full_name' | 'nric_masked' | 'nationality' | 'dob' | 'address'> {
  link_id: string
  role: string
}

interface CompanyDetail {
  id: string
  name: string
  uen: string
  persons: LinkedPerson[]
}

export default function CompanyDetailPage() {
  const router  = useRouter()
  const params  = useParams<{ id: string }>()
  const supabase = createClient()

  const [company,  setCompany]  = useState<CompanyDetail | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [persons,  setPersons]  = useState<Pick<Person, 'id' | 'full_name'>[]>([])  // all user persons for linking
  const [addOpen,  setAddOpen]  = useState(false)
  const [selPerson, setSelPerson] = useState('')
  const [newName,   setNewName]   = useState('')
  const [newNric,   setNewNric]   = useState('')
  const [newNat,    setNewNat]    = useState('')
  const [newDob,    setNewDob]    = useState('')
  const [newAddr,   setNewAddr]   = useState('')
  const [addMode,   setAddMode]   = useState<'existing' | 'new'>('existing')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [editing,   setEditing]   = useState(false)
  const [eName,     setEName]     = useState('')
  const [eUen,      setEUen]      = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    loadCompany()
    loadPersons()
  }, [params.id])

  async function loadCompany() {
    setLoading(true)
    const res = await fetch(`/api/companies/${params.id}`)
    if (!res.ok) { router.push('/companies'); return }
    const data: CompanyDetail = await res.json()
    setCompany(data)
    setEName(data.name)
    setEUen(data.uen)
    setLoading(false)
  }

  async function loadPersons() {
    const res = await fetch('/api/persons')
    if (res.ok) setPersons(await res.json())
  }

  async function handleSaveCompany() {
    setSaving(true)
    await fetch(`/api/companies/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: eName, uen: eUen }),
    })
    setSaving(false)
    setEditing(false)
    loadCompany()
  }

  async function handleUnlink(linkId: string) {
    if (!confirm('Remove this person from the company?')) return
    await fetch(`/api/companies/${params.id}/persons/${linkId}`, { method: 'DELETE' })
    loadCompany()
  }

  async function handleAddDirector(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    let personId = selPerson
    if (addMode === 'new') {
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: newName, nric_masked: newNric, nationality: newNat, dob: newDob || undefined, address: newAddr }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); setSaving(false); return }
      if (json.duplicate_warning) setError('Note: A person with this name and DOB already exists — linked anyway.')
      personId = json.id
    }

    const res = await fetch(`/api/companies/${params.id}/persons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: personId, role: 'director' }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setSaving(false); return }
    setSaving(false)
    setAddOpen(false)
    resetAddForm()
    loadCompany()
    loadPersons()
  }

  async function handleBatchAll() {
    const directors = company?.persons.filter(p => p.role === 'director') ?? []
    if (directors.length === 0) return alert('No directors to generate forms for.')

    // Hardcoded Form 45 template UUID from migration 016 seed
    const FORM45_TEMPLATE_ID = 'e7f1a2b3-0000-4000-8000-000000000045'
    const rows = directors.map(p => ({
      company_name:  company!.name,
      uen:           company!.uen,
      director_name: p.full_name,
      nric_display:  p.nric_masked ?? '',
      nationality:   p.nationality ?? '',
      dob:           p.dob ?? '',
      address:       p.address ?? '',
      consent_date:  new Date().toISOString().slice(0, 10),
    }))
    const columnMap: Record<string, string> = {
      company_name:  'company_name',
      uen:           'uen',
      director_name: 'director_name',
      nric_display:  'nric_display',
      nationality:   'nationality',
      dob:           'dob',
      address:       'address',
      consent_date:  'consent_date',
    }
    const res = await fetch('/api/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: FORM45_TEMPLATE_ID,
        label: `Form 45 — ${company!.name} — all directors`,
        column_map: columnMap,
        rows,
      }),
    })
    if (!res.ok) return alert('Failed to create batch job')
    const { id } = await res.json()
    router.push(`/batch/${id}/progress`)
  }

  function resetAddForm() {
    setSelPerson('')
    setNewName('')
    setNewNric('')
    setNewNat('')
    setNewDob('')
    setNewAddr('')
    setAddMode('existing')
    setError(null)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  if (!company) return null

  const directors = company.persons.filter(p => p.role === 'director')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-600" />
          {editing ? (
            <div className="flex items-center gap-2">
              <input value={eName} onChange={e => setEName(e.target.value)} className="border rounded px-2 py-1 text-sm font-semibold w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={eUen} onChange={e => setEUen(e.target.value)} className="border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="UEN" />
              <button onClick={handleSaveCompany} disabled={saving} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setEditing(false); setEName(company.name); setEUen(company.uen) }} className="text-xs text-gray-500 hover:underline">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{company.name}</h1>
              <span className="text-sm text-gray-400">{company.uen}</span>
              <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline ml-1">Edit</button>
            </div>
          )}
        </div>
        <button onClick={() => router.push('/companies')} className="text-sm text-gray-500 hover:underline">← Companies</button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Directors section */}
        <section className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Directors</h2>
            <div className="flex gap-2">
              {directors.length > 0 && (
                <button
                  onClick={handleBatchAll}
                  className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100"
                >
                  <Layers className="w-3.5 h-3.5" /> Generate Form 45 for all
                </button>
              )}
              <button
                onClick={() => { setAddOpen(true); setError(null) }}
                className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Director
              </button>
            </div>
          </div>

          {directors.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No directors yet. Add one to start generating forms.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">NRIC</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nationality</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {directors.map(p => (
                  <tr key={p.link_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.nric_masked ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.nationality ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => router.push(`/form45/new?company_id=${company.id}&person_id=${p.id}`)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <FileText className="w-3 h-3" /> Form 45
                        </button>
                        <button onClick={() => handleUnlink(p.link_id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Add director panel */}
        {addOpen && (
          <form onSubmit={handleAddDirector} className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-medium text-gray-800">Add Director</h3>
            {error && <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setAddMode('existing')} className={`text-sm px-3 py-1.5 rounded-lg border ${addMode === 'existing' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>
                Existing person
              </button>
              <button type="button" onClick={() => setAddMode('new')} className={`text-sm px-3 py-1.5 rounded-lg border ${addMode === 'new' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>
                New person
              </button>
            </div>

            {addMode === 'existing' ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Select person</label>
                <select
                  required value={selPerson} onChange={e => setSelPerson(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— choose —</option>
                  {persons.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
                {persons.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No persons in your contacts yet. Switch to "New person" to create one.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
                    <input required value={newName} onChange={e => setNewName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Tan Wei Ming" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">NRIC (masked)</label>
                    <input value={newNric} onChange={e => setNewNric(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="SXXXXX67A" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nationality</label>
                    <input value={newNat} onChange={e => setNewNat(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Singaporean" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                    <input type="date" value={newDob} onChange={e => setNewDob(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Address</label>
                  <input value={newAddr} onChange={e => setNewAddr(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="123 Orchard Rd, #01-01, Singapore 238895" />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setAddOpen(false); resetAddForm() }} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Adding…' : 'Add Director'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
