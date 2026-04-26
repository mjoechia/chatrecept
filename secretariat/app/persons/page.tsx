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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold">Persons</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:underline">← Dashboard</button>
          <button
            onClick={() => router.push('/persons/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add Person
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : persons.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No persons yet. Add one to start filling forms.</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">NRIC</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nationality</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">DOB</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {persons.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.nric_masked ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.nationality ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.dob ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => router.push(`/persons/${p.id}`)}
                        className="text-blue-600 hover:underline text-xs flex items-center gap-1 ml-auto"
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
