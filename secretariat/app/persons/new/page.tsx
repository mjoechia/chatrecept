'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'

export default function NewPersonPage() {
  const router = useRouter()

  const [fullName,    setFullName]    = useState('')
  const [nricMasked,  setNricMasked]  = useState('')
  const [nationality, setNationality] = useState('')
  const [dob,         setDob]         = useState('')
  const [address,     setAddress]     = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [dupWarn,     setDupWarn]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setDupWarn(false)

    const res = await fetch('/api/persons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:   fullName.trim(),
        nric_masked: nricMasked.trim() || undefined,
        nationality: nationality.trim() || undefined,
        dob:         dob || undefined,
        address:     address.trim() || undefined,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error); return }
    if (json.duplicate_warning) {
      setDupWarn(true)
    }
    router.push('/persons')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold">Add Person</h1>
        </div>
        <button onClick={() => router.push('/persons')} className="text-sm text-gray-500 hover:underline">← Persons</button>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {dupWarn && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              A person with this name and date of birth already exists. Saved anyway — consider linking the existing person instead.
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
            <input
              required value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Tan Wei Ming"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">NRIC (masked)</label>
              <input
                value={nricMasked} onChange={e => setNricMasked(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="SXXXXX67A"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nationality</label>
              <input
                value={nationality} onChange={e => setNationality(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Singaporean"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
            <input
              type="date" value={dob} onChange={e => setDob(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Address</label>
            <textarea
              value={address} onChange={e => setAddress(e.target.value)} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="123 Orchard Rd, #01-01, Singapore 238895"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => router.push('/persons')} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Person'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
