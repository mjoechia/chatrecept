'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { Person } from '@/lib/types'
import { Users, Plus, Pencil } from 'lucide-react'

export default function PersonsPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [persons,  setPersons]  = useState<Person[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/persons')
    if (res.ok) setPersons(await res.json())
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-[#006092]" />
          <h1 className="text-lg font-semibold">Persons</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/')} className="text-sm text-[#94afd5] hover:underline">← Dashboard</button>
          <button
            onClick={() => router.push('/persons/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#006092] text-white rounded-lg hover:bg-[#004d75]"
          >
            <Plus className="w-4 h-4" /> Add Person
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-16 text-[#94afd5]">Loading…</div>
        ) : persons.length === 0 ? (
          <div className="text-center py-16 text-[#94afd5]">No persons yet. Add one to start filling forms.</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f3f6ff] border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[#425d7f]">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[#425d7f]">NRIC</th>
                  <th className="px-4 py-3 text-left font-medium text-[#425d7f]">Nationality</th>
                  <th className="px-4 py-3 text-left font-medium text-[#425d7f]">DOB</th>
                  <th className="px-4 py-3 text-right font-medium text-[#425d7f]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {persons.map(p => (
                  <tr key={p.id} className="hover:bg-[#f3f6ff]">
                    <td className="px-4 py-3 font-medium">{p.full_name}</td>
                    <td className="px-4 py-3 text-[#94afd5]">{p.nric_masked ?? '—'}</td>
                    <td className="px-4 py-3 text-[#94afd5]">{p.nationality ?? '—'}</td>
                    <td className="px-4 py-3 text-[#94afd5]">{p.dob ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => router.push(`/persons/${p.id}`)}
                        className="text-[#006092] hover:underline text-xs flex items-center gap-1 ml-auto"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
