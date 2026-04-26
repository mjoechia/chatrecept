'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { Company } from '@/lib/types'
import { Building2, Plus, ChevronRight } from 'lucide-react'

export default function CompaniesPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [name,      setName]      = useState('')
  const [uen,       setUen]       = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/companies')
    if (res.ok) setCompanies(await res.json())
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), uen: uen.trim() }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setSaving(false); return }
    setAdding(false)
    setName('')
    setUen('')
    setSaving(false)
    load()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold">My Companies</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:underline">← Dashboard</button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add Company
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Add company form */}
        {adding && (
          <form onSubmit={handleAdd} className="bg-white border rounded-xl p-5 mb-6 space-y-3">
            <h2 className="font-medium text-gray-800">New Company</h2>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company Name</label>
                <input
                  required value={name} onChange={e => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Pte. Ltd."
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">UEN</label>
                <input
                  required value={uen} onChange={e => setUen(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="201912345A"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setAdding(false); setError(null) }} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No companies yet. Add your first one to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => router.push(`/companies/${c.id}`)}
                className="w-full bg-white border rounded-xl px-5 py-4 flex items-center justify-between hover:border-blue-300 hover:shadow-sm transition-all text-left"
              >
                <div>
                  <p className="font-medium text-gray-800">{c.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">UEN: {c.uen}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
