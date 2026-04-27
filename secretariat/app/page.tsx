'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { redirectToLogin } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import type { FormTemplate } from '@/lib/types'
import Image from 'next/image'
import { Upload, Settings, Layers, Building2, Users, LogOut } from 'lucide-react'

interface MyBatch {
  id: string
  label: string | null
  total: number
  processed: number
  status: string
  created_at: string
  form_templates: { name: string } | null
}

interface Contact {
  id: string
  full_name: string
  nric_masked: string | null
  nationality: string | null
  company_persons: { role: string; companies: { id: string; name: string } | null }[]
}

export default function DashboardPage() {
  const router = useRouter()

  const [templates, setTemplates] = useState<Pick<FormTemplate, 'id' | 'name' | 'status'>[]>([])
  const [batches, setBatches]     = useState<MyBatch[]>([])
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [userRole, setUserRole]   = useState<'admin' | 'user' | null>(null)
  useEffect(() => {
    // Check session then resolve role
    fetch('/api/user/me').then(async res => {
      if (res.status === 401) { redirectToLogin(); return }
      if (res.status === 403) { router.push('/auth/pending'); return }
      if (res.ok) {
        const profile = await res.json()
        if (profile.pending_approval) { router.push('/auth/pending'); return }
        setUserRole(profile.role)
        if (profile.role === 'admin') { router.push('/admin'); return }
      }
      // If 500 (e.g. migration not yet run), fall through and show dashboard
    })
    loadTemplates()
    loadBatches()
    loadContacts()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    redirectToLogin()
  }

  async function loadContacts() {
    const res = await fetch('/api/persons')
    if (res.ok) {
      const data: Contact[] = await res.json()
      setContacts(data)
    }
  }

  async function loadTemplates() {
    const res = await fetch('/api/admin/templates')
    if (res.ok) {
      const data: FormTemplate[] = await res.json()
      setTemplates(data.filter(t => t.status === 'active').slice(0, 6))
    }
  }

  async function loadBatches() {
    const res = await fetch('/api/user/batches')
    if (res.ok) {
      const data: MyBatch[] = await res.json()
      setBatches(data)
    }
  }

  const batchStatusBadge = (s: string) => {
    const styles: Record<string, string> = {
      pending:      'bg-gray-100 text-gray-500',
      running:      'bg-yellow-100 text-yellow-700',
      done:         'bg-green-100 text-green-700',
      partial_fail: 'bg-orange-100 text-orange-700',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] ?? 'bg-gray-100'}`}>
        {s}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/chatrecept.png" alt="ChatRecept" width={32} height={32} className="rounded-lg" />
          <h1 className="text-lg font-semibold">Secretariat</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/persons')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            <Users className="w-4 h-4" /> Persons
          </button>
          <button
            onClick={() => router.push('/companies')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            <Building2 className="w-4 h-4" /> Companies
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            >
              <Settings className="w-4 h-4" /> Admin
            </button>
          )}
          <button
            onClick={() => router.push('/batch/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Layers className="w-4 h-4" /> New Import
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg text-gray-500 hover:bg-gray-50"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* Contacts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Contacts</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/companies')} className="text-xs text-blue-600 hover:underline">
                Companies →
              </button>
              <button onClick={() => router.push('/persons')} className="text-xs text-blue-600 hover:underline">
                All Persons →
              </button>
            </div>
          </div>
          {contacts.length === 0 ? (
            <div className="bg-white border rounded-xl p-6 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No contacts yet.</p>
              <button
                onClick={() => router.push('/persons')}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Add your first person →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">NRIC</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Nationality</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map(c => {
                    const link = c.company_persons?.[0]
                    const company = link?.companies ?? null
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{c.full_name}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {company ? (
                            <button
                              onClick={() => router.push(`/companies/${company.id}`)}
                              className="text-blue-600 hover:underline"
                            >
                              {company.name}
                            </button>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{c.nric_masked ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{c.nationality ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {company ? (
                            <button
                              onClick={() => router.push(`/companies/${company.id}`)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Open Company
                            </button>
                          ) : (
                            <button
                              onClick={() => router.push('/persons')}
                              className="text-xs text-gray-400 hover:underline"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* My Groups (batch imports) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">My Groups</h2>
            <button
              onClick={() => router.push('/batch/new')}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <Upload className="w-3.5 h-3.5" /> New Import
            </button>
          </div>
          {batches.length === 0 ? (
            <div
              onClick={() => router.push('/batch/new')}
              className="bg-white border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">No groups yet</p>
              <p className="text-xs text-gray-400 mt-1">Upload a CSV or Excel file to generate forms for multiple people at once</p>
              <span className="mt-4 inline-block text-sm text-blue-600 font-medium">New Import →</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Label</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Template</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Count</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batches.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{b.label ?? `Import ${b.id.slice(0, 8)}`}</td>
                      <td className="px-4 py-3 text-gray-500">{b.form_templates?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{b.total}</td>
                      <td className="px-4 py-3">{batchStatusBadge(b.status)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(b.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {b.status === 'done' || b.status === 'partial_fail' ? (
                          <a href={`/api/batch/${b.id}/zip`} className="text-xs text-green-600 hover:underline">
                            Download ZIP
                          </a>
                        ) : (
                          <button
                            onClick={() => router.push(`/batch/${b.id}/progress`)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View progress
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

        {/* Forms Ready for Filling */}
        {templates.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">Forms Ready for Filling</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(t => (
                <div key={t.id} className="bg-white border rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                    <p className="text-xs text-green-600 mt-0.5">Ready</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => router.push(`/batch/new?template_id=${t.id}`)}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                    >
                      Batch Import
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


      </main>
    </div>
  )
}
