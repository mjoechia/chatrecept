'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Form45Data } from '@/lib/types'
import { Download, Copy, CheckCheck, Plus } from 'lucide-react'

export default function OutputPage() {
  const router   = useRouter()
  const { id }   = useParams<{ id: string }>()
  const supabase = createClient()

  const [form, setForm]       = useState<Form45Data | null>(null)
  const [pdfUrl, setPdfUrl]   = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
    poll()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  async function poll() {
    const check = async () => {
      const res  = await fetch(`/api/form45/${id}`)
      const json = await res.json()
      setForm(json as Form45Data)
      if (json.status === 'generated') {
        setPdfUrl(json.download_url ?? null)
        if (pollRef.current) clearInterval(pollRef.current)
      } else if (json.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
    await check()
    pollRef.current = setInterval(check, 2500)
  }

  async function copyLink() {
    if (!pdfUrl) return
    await navigator.clipboard.writeText(pdfUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!form) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">Form 45 — Output</h1>
        <p className="text-xs text-gray-400">{form.company_name} / {form.director_name}</p>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Status card */}
        {form.status === 'generating' && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <span className="animate-spin">⏳</span> Generating PDF… this takes a few seconds.
          </div>
        )}

        {form.status === 'failed' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            <p className="font-medium">PDF generation failed</p>
            {form.error_msg && <p className="text-xs mt-1 opacity-80">{form.error_msg}</p>}
            <button
              onClick={() => router.push(`/form45/${id}/review`)}
              className="mt-2 text-xs underline"
            >
              Go back and retry →
            </button>
          </div>
        )}

        {form.status === 'generated' && pdfUrl && (
          <>
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
              ✓ PDF generated successfully
            </div>

            {/* PDF preview */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <iframe src={pdfUrl} className="w-full h-[600px]" title="Form 45 Preview" />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <a
                href={pdfUrl}
                download={`form45-${form.uen}-${form.director_name}.pdf`}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700"
              >
                <Download className="w-4 h-4" /> Download PDF
              </a>
              <button
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 border rounded-lg py-3 text-sm font-medium hover:bg-gray-50"
              >
                {copied
                  ? <><CheckCheck className="w-4 h-4 text-green-600" /> Copied!</>
                  : <><Copy className="w-4 h-4" /> Copy link</>
                }
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">Download link expires in 1 hour. Revisit this page to get a fresh link.</p>
          </>
        )}

        <button
          onClick={() => router.push('/form45/new')}
          className="w-full flex items-center justify-center gap-2 border rounded-lg py-3 text-sm font-medium hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" /> New Form 45
        </button>
      </main>
    </div>
  )
}
