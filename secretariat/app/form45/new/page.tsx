'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { maskNric, validateNric } from '@/lib/nric'
import { redirectToLogin } from '@/lib/auth'
import { mapToForm45 } from '@/lib/form-mappers'
import type { Company, Person } from '@/lib/types'
import { Info } from 'lucide-react'

const DECLARATIONS = [
  { key: 'bankrupt',     label: 'An undischarged bankrupt' },
  { key: 'disqualified', label: 'Disqualified from acting as director under any written law' },
  { key: 'convicted',    label: 'Convicted of an offence involving fraud or dishonesty' },
  { key: 'barred',       label: 'Subject to a disqualification order by any court' },
]

export default function NewFormPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const companyId = searchParams.get('company_id')
  const personId  = searchParams.get('person_id')
  const isPreFill = !!(companyId && personId)

  const [saving,       setSaving]       = useState(false)
  const [prefillReady, setPrefillReady] = useState(!isPreFill)
  const [nricRaw,      setNricRaw]      = useState('')
  const [nricError,    setNricError]    = useState('')
  // When pre-filling, we have the masked NRIC from the person record
  const [maskedNricFromStore, setMaskedNricFromStore] = useState<string | null>(null)

  const [form, setForm] = useState({
    company_name:  searchParams.get('company')     ?? '',
    uen:           searchParams.get('uen')          ?? '',
    director_name: searchParams.get('director')    ?? '',
    nationality:   searchParams.get('nationality') ?? 'Singaporean',
    dob:           '',
    address:       '',
    consent_date:  new Date().toISOString().split('T')[0],
    declarations: {
      bankrupt: false,
      disqualified: false,
      convicted: false,
      barred: false,
    } as Record<string, boolean>,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    if (isPreFill) prefillFromStore()
  }, [])

  async function prefillFromStore() {
    const [compRes, perRes] = await Promise.all([
      fetch(`/api/companies/${companyId}`),
      fetch(`/api/persons/${personId}`),
    ])
    if (!compRes.ok || !perRes.ok) { setPrefillReady(true); return }

    const company: Company = await compRes.json()
    const person: Person   = await perRes.json()

    const prefilled = mapToForm45(company, person)
    setForm(f => ({
      ...f,
      company_name:  prefilled.company_name  ?? f.company_name,
      uen:           prefilled.uen           ?? f.uen,
      director_name: prefilled.director_name ?? f.director_name,
      nationality:   prefilled.nationality   ?? f.nationality,
      dob:           prefilled.dob           ?? f.dob,
      address:       prefilled.address       ?? f.address,
    }))
    if (person.nric_masked) setMaskedNricFromStore(person.nric_masked)
    setPrefillReady(true)
  }

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function setDecl(key: string, checked: boolean) {
    setForm(f => ({ ...f, declarations: { ...f.declarations, [key]: checked } }))
  }

  function handleNricBlur() {
    if (!nricRaw) return
    if (!validateNric(nricRaw)) {
      setNricError('Invalid NRIC/FIN format or checksum')
    } else {
      setNricError('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (nricRaw && !validateNric(nricRaw)) {
      setNricError('Fix the NRIC before submitting')
      return
    }

    setSaving(true)
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) { redirectToLogin(); return }

    // If user entered a raw NRIC, mask it. Otherwise use the pre-filled masked value.
    const nric_display = nricRaw ? maskNric(nricRaw) : (maskedNricFromStore ?? null)

    const res = await fetch('/api/form45/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        nric_display,
        // Pass source IDs so save route can build audit snapshot
        company_id: companyId ?? undefined,
        person_id:  personId  ?? undefined,
      }),
    })
    const json = await res.json()

    if (!res.ok || !json.id) {
      alert(`Error saving form: ${json.error ?? 'Unknown error'}`)
      setSaving(false)
      return
    }

    router.push(`/form45/${json.id}/review`)
  }

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  if (!prefillReady) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading stored data…</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">New Form 45</h1>
        <p className="text-xs text-gray-400">Consent to Act as Director — ACRA</p>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {isPreFill && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-sm text-blue-800">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            Pre-filled from stored company and director data — all fields are editable.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Company section */}
          <section className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Company Details</h2>
            <div>
              <label className={labelClass}>Company Name *</label>
              <input required value={form.company_name} onChange={e => set('company_name', e.target.value)} className={inputClass} placeholder="Acme Pte Ltd" />
            </div>
            <div>
              <label className={labelClass}>UEN / Registration No. *</label>
              <input required value={form.uen} onChange={e => set('uen', e.target.value)} className={inputClass} placeholder="202300001A" />
            </div>
          </section>

          {/* Director section */}
          <section className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Director Details</h2>
            <div>
              <label className={labelClass}>Full Name (as in NRIC/Passport) *</label>
              <input required value={form.director_name} onChange={e => set('director_name', e.target.value)} className={inputClass} placeholder="John Tan Wei Ming" />
            </div>
            <div>
              <label className={labelClass}>NRIC / FIN / Passport No.</label>
              {maskedNricFromStore && !nricRaw ? (
                <div className="flex items-center gap-2">
                  <input
                    value={maskedNricFromStore}
                    readOnly
                    className={`${inputClass} bg-gray-50 text-gray-500`}
                  />
                  <button
                    type="button"
                    onClick={() => setMaskedNricFromStore(null)}
                    className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Enter new
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={nricRaw}
                    onChange={e => { setNricRaw(e.target.value.toUpperCase()); setNricError('') }}
                    onBlur={handleNricBlur}
                    className={`${inputClass} ${nricError ? 'border-red-400' : ''}`}
                    placeholder="S1234567A — masked after you leave this field"
                  />
                  {nricError && <p className="text-red-500 text-xs mt-1">{nricError}</p>}
                  {!nricError && nricRaw && validateNric(nricRaw) && (
                    <p className="text-gray-400 text-xs mt-1">Will be stored as: {maskNric(nricRaw)}</p>
                  )}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nationality</label>
                <input value={form.nationality} onChange={e => set('nationality', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Date of Birth</label>
                <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Residential Address</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} className={inputClass} placeholder="10 Anson Road, #10-01, Singapore 079903" />
            </div>
          </section>

          {/* Declarations */}
          <section className="bg-white rounded-xl border p-6 space-y-3">
            <h2 className="font-semibold text-gray-800">Declarations</h2>
            <p className="text-sm text-gray-500">Check boxes where the director IS disqualified (leave unchecked to confirm they are NOT disqualified).</p>
            {DECLARATIONS.map(d => (
              <label key={d.key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.declarations[d.key]}
                  onChange={e => setDecl(d.key, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">{d.label}</span>
              </label>
            ))}
          </section>

          {/* Consent date */}
          <section className="bg-white rounded-xl border p-6">
            <label className={labelClass}>Consent Date *</label>
            <input required type="date" value={form.consent_date} onChange={e => set('consent_date', e.target.value)} className={`${inputClass} max-w-xs`} />
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & Review →'}
          </button>
        </form>
      </main>
    </div>
  )
}
