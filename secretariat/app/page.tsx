'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { redirectToLogin } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { Settings, Layers, Building2, Users, LogOut, X } from 'lucide-react'

interface TemplateRow {
  id: string
  name: string
  status: string
  coord_map?: { fields?: Record<string, unknown> }
}

interface Contact {
  id: string
  full_name: string
  nric_masked: string | null
  nationality: string | null
  dob: string | null
  address: string | null
  company_persons: { role: string; companies: { id: string; name: string; uen: string } | null }[]
}

// Maps template field key → human label
const FIELD_LABELS: Record<string, string> = {
  company_name: 'Company Name',
  uen:          'UEN',
  director_name:'Director Name',
  full_name:    'Full Name',
  nric_display: 'NRIC',
  nric_masked:  'NRIC',
  nationality:  'Nationality',
  dob:          'Date of Birth',
  address:      'Address',
}

const COMPANY_KEYS = new Set(['company_name', 'uen'])
const PERSON_KEYS  = new Set(['director_name', 'full_name', 'nric_display', 'nric_masked', 'nationality', 'dob', 'address'])
const AUTO_FIELDS  = new Set(['consent_date', 'date', 'today', 'generated_date'])
const STANDARD_FIELDS = ['company_name', 'uen', 'director_name', 'nric_display', 'nationality', 'dob', 'address']

// template field key → persons table column
const PERSON_COL: Record<string, string> = {
  director_name: 'full_name',
  full_name:     'full_name',
  nric_display:  'nric_masked',
  nric_masked:   'nric_masked',
  nationality:   'nationality',
  dob:           'dob',
  address:       'address',
}
// template field key → companies table column
const COMPANY_COL: Record<string, string> = {
  company_name: 'name',
  uen:          'uen',
}

export default function DashboardPage() {
  const router = useRouter()

  const [templates,    setTemplates]    = useState<TemplateRow[]>([])
  const [contacts,     setContacts]     = useState<Contact[]>([])
  const [userRole,     setUserRole]     = useState<'admin' | 'user' | null>(null)
  const [editContact,  setEditContact]  = useState<Contact | null>(null)
  const [editValues,   setEditValues]   = useState<Record<string, string>>({})
  const [editSaving,   setEditSaving]   = useState(false)
  const [editError,    setEditError]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/user/me').then(async res => {
      if (res.status === 401) { redirectToLogin(); return }
      if (res.status === 403) { router.push('/auth/pending'); return }
      if (res.ok) {
        const profile = await res.json()
        if (profile.pending_approval) { router.push('/auth/pending'); return }
        setUserRole(profile.role)
        if (profile.role === 'admin') { router.push('/admin'); return }
      }
    })
    loadTemplates()
    loadContacts()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    redirectToLogin()
  }

  async function loadContacts() {
    const res = await fetch('/api/persons')
    if (res.ok) setContacts(await res.json())
  }

  async function loadTemplates() {
    const res = await fetch('/api/templates')
    if (res.ok) setTemplates(await res.json())
  }

  // Derive edit-form field list from active templates' coord_maps (fallback: standard set)
  const templateFields: string[] = (() => {
    const seen = new Set<string>()
    for (const tpl of templates) {
      for (const key of Object.keys(tpl.coord_map?.fields ?? {})) {
        if (!AUTO_FIELDS.has(key) && (COMPANY_KEYS.has(key) || PERSON_KEYS.has(key))) seen.add(key)
      }
    }
    return seen.size > 0 ? [...seen] : STANDARD_FIELDS
  })()

  const companyFields = templateFields.filter(k => COMPANY_KEYS.has(k))
  const personFields  = templateFields.filter(k => PERSON_KEYS.has(k))

  function openEdit(contact: Contact) {
    const company = contact.company_persons?.[0]?.companies
    const values: Record<string, string> = {}
    for (const key of templateFields) {
      if (key === 'company_name')                          values[key] = company?.name ?? ''
      else if (key === 'uen')                              values[key] = company?.uen  ?? ''
      else if (key === 'director_name' || key === 'full_name') values[key] = contact.full_name ?? ''
      else if (key === 'nric_display'  || key === 'nric_masked') values[key] = contact.nric_masked ?? ''
      else if (key === 'nationality')                      values[key] = contact.nationality ?? ''
      else if (key === 'dob')                              values[key] = contact.dob ?? ''
      else if (key === 'address')                          values[key] = contact.address ?? ''
      else values[key] = ''
    }
    setEditValues(values)
    setEditContact(contact)
    setEditError(null)
  }

  async function saveEdit() {
    if (!editContact) return
    setEditSaving(true)
    setEditError(null)
    try {
      // Person update
      const personUpdate: Record<string, string | null> = {}
      for (const [key, col] of Object.entries(PERSON_COL)) {
        if (key in editValues) personUpdate[col] = editValues[key] || null
      }
      if (Object.keys(personUpdate).length > 0) {
        const res = await fetch(`/api/persons/${editContact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(personUpdate),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save person')
      }

      // Company update (only if contact is linked to a company)
      const company = editContact.company_persons?.[0]?.companies
      if (company) {
        const companyUpdate: Record<string, string | null> = {}
        for (const [key, col] of Object.entries(COMPANY_COL)) {
          if (key in editValues) companyUpdate[col] = editValues[key] || null
        }
        if (Object.keys(companyUpdate).length > 0) {
          const res = await fetch(`/api/companies/${company.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(companyUpdate),
          })
          if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save company')
        }
      }

      await loadContacts()
      setEditContact(null)
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/chatrecept.png" alt="ChatRecept" width={32} height={32} className="rounded-lg" />
          <h1 className="text-lg font-semibold">Secretariat</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/persons')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-[#f3f6ff]"
          >
            <Users className="w-4 h-4" /> Persons
          </button>
          <button
            onClick={() => router.push('/companies')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-[#f3f6ff]"
          >
            <Building2 className="w-4 h-4" /> Companies
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-[#f3f6ff]"
            >
              <Settings className="w-4 h-4" /> Admin
            </button>
          )}
          <button
            onClick={() => router.push('/batch/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#006092] text-white rounded-lg hover:bg-[#004d75]"
          >
            <Layers className="w-4 h-4" /> New Import
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg text-[#94afd5] hover:bg-[#f3f6ff]"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* Contacts */}
        <section>
          <h2 className="font-semibold text-[#12304f] mb-3">Contacts</h2>
          {contacts.length === 0 ? (
            <div className="bg-white border rounded-xl p-6 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-[#94afd5]">No contacts yet.</p>
              <button
                onClick={() => router.push('/persons')}
                className="mt-3 text-sm text-[#006092] hover:underline"
              >
                Add your first person →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f3f6ff] border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-[#425d7f]">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-[#425d7f]">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-[#425d7f]">NRIC</th>
                    <th className="px-4 py-3 text-left font-medium text-[#425d7f]">Nationality</th>
                    <th className="px-4 py-3 text-right font-medium text-[#425d7f]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map(c => {
                    const company = c.company_persons?.[0]?.companies ?? null
                    return (
                      <tr key={c.id} className="hover:bg-[#f3f6ff]">
                        <td className="px-4 py-3 font-medium">{c.full_name}</td>
                        <td className="px-4 py-3 text-[#94afd5]">{company?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-[#94afd5]">{c.nric_masked ?? '—'}</td>
                        <td className="px-4 py-3 text-[#94afd5]">{c.nationality ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openEdit(c)}
                            className="text-xs text-[#006092] hover:underline"
                          >
                            Edit Company Info
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Forms Ready for Filling */}
        {templates.length > 0 && (
          <section>
            <h2 className="font-semibold text-[#12304f] mb-3">Forms Ready for Filling</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(t => (
                <div key={t.id} className="bg-white border rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-[#12304f]">{t.name}</p>
                    <p className="text-xs text-green-600 mt-0.5">Ready</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/formfill/new?template_id=${t.id}`)}
                      className="flex-1 text-xs bg-[#006092] text-white px-3 py-2 rounded-lg hover:bg-[#004d75] font-medium"
                    >
                      Fill Form
                    </button>
                    <button
                      onClick={() => router.push(`/batch/new?template_id=${t.id}`)}
                      className="flex-1 text-xs border border-[#dde8f5] text-[#425d7f] px-3 py-2 rounded-lg hover:bg-[#f3f6ff] font-medium"
                    >
                      Import Data
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* Edit Contact Modal */}
      {editContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-semibold text-[#12304f]">Edit Company Info</h3>
                <p className="text-xs text-[#94afd5] mt-0.5">{editContact.full_name}</p>
              </div>
              <button onClick={() => setEditContact(null)} className="text-[#94afd5] hover:text-[#425d7f]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {editError}
                </div>
              )}

              {/* Company fields — only shown if contact is linked to a company */}
              {companyFields.length > 0 && editContact.company_persons?.[0]?.companies && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">Company</p>
                  {companyFields.map(key => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-[#425d7f] mb-1">
                        {FIELD_LABELS[key] ?? key}
                      </label>
                      <input
                        type="text"
                        value={editValues[key] ?? ''}
                        onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Person fields */}
              {personFields.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">Director / Person</p>
                  {personFields.map(key => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-[#425d7f] mb-1">
                        {FIELD_LABELS[key] ?? key}
                      </label>
                      {key === 'address' ? (
                        <textarea
                          value={editValues[key] ?? ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                          rows={2}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092] resize-none"
                        />
                      ) : (
                        <input
                          type={key === 'dob' ? 'date' : 'text'}
                          value={editValues[key] ?? ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end px-6 py-4 border-t">
              <button
                onClick={() => setEditContact(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-[#f3f6ff]"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="px-4 py-2 text-sm bg-[#006092] text-white rounded-lg hover:bg-[#004d75] disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
