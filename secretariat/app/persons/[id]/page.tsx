'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Users } from 'lucide-react'

interface PersonData {
  id: string
  full_name: string
  nric_masked: string | null
  nationality: string | null
  dob: string | null
  address: string | null
}

export default function EditPersonPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()

  const [data,        setData]        = useState<PersonData | null>(null)
  const [fullName,    setFullName]    = useState('')
  const [nricMasked,  setNricMasked]  = useState('')
  const [nationality, setNationality] = useState('')
  const [dob,         setDob]         = useState('')
  const [address,     setAddress]     = useState('')
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/persons/${params.id}`).then(r => r.json()).then((d: PersonData) => {
      setData(d)
      setFullName(d.full_name)
      setNricMasked(d.nric_masked ?? '')
      setNationality(d.nationality ?? '')
      setDob(d.dob ?? '')
      setAddress(d.address ?? '')
    })
  }, [params.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/persons/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:   fullName.trim(),
        nric_masked: nricMasked.trim() || null,
        nationality: nationality.trim() || null,
        dob:         dob || null,
        address:     address.trim() || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error); return }
    router.push('/persons')
  }

  async function handleDelete() {
    if (!confirm('Delete this person? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/persons/${params.id}`, { method: 'DELETE' })
    router.push('/persons')
  }

  if (!data) return <div className="min-h-screen flex items-center justify-center text-[#94afd5]">Loading…</div>

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-[#006092]" />
          <h1 className="text-lg font-semibold">Edit Person</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-sm text-[#94afd5] hover:text-[#12304f]">← Dashboard</button>
          <span className="text-gray-300">/</span>
          <button onClick={() => router.push('/persons')} className="text-sm text-[#94afd5] hover:text-[#12304f]">Persons</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-xs text-[#94afd5] mb-1">Full Name *</label>
            <input
              required value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94afd5] mb-1">NRIC (masked)</label>
              <input
                value={nricMasked} onChange={e => setNricMasked(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                placeholder="SXXXXX67A"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94afd5] mb-1">Nationality</label>
              <input
                value={nationality} onChange={e => setNationality(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94afd5] mb-1">Date of Birth</label>
            <input
              type="date" value={dob} onChange={e => setDob(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94afd5] mb-1">Address</label>
            <textarea
              value={address} onChange={e => setAddress(e.target.value)} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092] resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button" onClick={handleDelete} disabled={deleting}
              className="text-sm text-red-500 hover:underline disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete person'}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => router.push('/persons')} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-[#f3f6ff]">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm bg-[#006092] text-white rounded-lg hover:bg-[#004d75] disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
