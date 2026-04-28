'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { Form45Data } from '@/lib/types'

const DECLARATION_LABELS: Record<string, string> = {
  bankrupt:     'Undischarged bankrupt',
  disqualified: 'Disqualified from acting as director',
  convicted:    'Convicted of fraud/dishonesty offence',
  barred:       'Subject to disqualification order',
}

export default function ReviewPage() {
  const router   = useRouter()
  const { id }   = useParams<{ id: string }>()
  const supabase = createClient()

  const [form, setForm]         = useState<Form45Data | null>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    loadForm()
  }, [id])

  async function loadForm() {
    const { data } = await supabase
      .schema('app_secretariat')
      .from('form45')
      .select('*')
      .eq('id', id)
      .single()
    setForm(data as Form45Data)
    setLoading(false)
  }

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    const res = await fetch(`/api/form45/${id}/generate`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Generation failed')
      setGenerating(false)
      return
    }
    router.push(`/form45/${id}/output`)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#94afd5]">Loading…</div>
  if (!form)   return <div className="min-h-screen flex items-center justify-center text-[#94afd5]">Form not found.</div>

  const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex gap-4 py-2.5 border-b last:border-0">
      <span className="w-40 text-sm text-[#94afd5] shrink-0">{label}</span>
      <span className="text-sm font-medium text-[#12304f]">{value || <span className="text-gray-300 italic">—</span>}</span>
    </div>
  )

  const disqualified = Object.entries(form.declarations ?? {}).filter(([, v]) => v === true)

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-[#94afd5] hover:text-[#12304f]">
          ← Back to dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">Review Form 45</h1>
        <p className="text-xs text-[#94afd5]">Check all details before generating the PDF</p>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-[#12304f] mb-4">Company</h2>
          <Row label="Company Name"   value={form.company_name} />
          <Row label="UEN"            value={form.uen} />
        </section>

        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-[#12304f] mb-4">Director</h2>
          <Row label="Name"           value={form.director_name} />
          <Row label="NRIC / FIN"     value={form.nric_display} />
          <Row label="Nationality"    value={form.nationality} />
          <Row label="Date of Birth"  value={form.dob} />
          <Row label="Address"        value={form.address} />
        </section>

        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-[#12304f] mb-4">Declarations</h2>
          {disqualified.length === 0 ? (
            <p className="text-sm text-green-600">✓ Director confirmed not disqualified on any ground</p>
          ) : (
            <ul className="space-y-1">
              {disqualified.map(([k]) => (
                <li key={k} className="text-sm text-red-600">⚠ {DECLARATION_LABELS[k] ?? k}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border p-6">
          <Row label="Consent Date" value={form.consent_date} />
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/form45/new')}
            className="flex-1 border rounded-lg py-3 text-sm font-medium hover:bg-[#f3f6ff]"
          >
            ← Edit
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || form.status === 'generating'}
            className="flex-1 bg-[#006092] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#004d75] disabled:opacity-50"
          >
            {generating ? 'Generating PDF…' : 'Generate PDF →'}
          </button>
        </div>
      </main>
    </div>
  )
}
