'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import { Download, Eye, X, FileText } from 'lucide-react'

interface BatchStatus {
  id: string
  total: number
  completed: number
  failed_count: number
  status: 'pending' | 'running' | 'done' | 'partial_fail'
  label: string | null
}

interface Submission {
  id: string
  recipient_data: Record<string, unknown>
  pdf_path: string | null
  status: string
  error_msg: string | null
  url: string | null
}

function recipientLabel(data: Record<string, unknown>): string {
  return (
    (data.director_name as string) ||
    (data.full_name as string) ||
    (data.name as string) ||
    Object.values(data).find(v => typeof v === 'string') as string ||
    'Recipient'
  )
}

export default function BatchProgressPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [jobStatus, setJobStatus]   = useState<BatchStatus | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState('')
  const [preview, setPreview]       = useState<Submission | null>(null)
  const stopRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      fetchStatus().then(status => {
        if (status && status.status !== 'done' && status.status !== 'partial_fail') {
          startProcessing()
        } else if (status) {
          fetchSubmissions()
        }
      })
    })
    return () => { stopRef.current = true }
  }, [id])

  async function fetchStatus(): Promise<BatchStatus | null> {
    const res = await fetch(`/api/batch/${id}/status`)
    if (!res.ok) { setError('Batch not found'); return null }
    const data: BatchStatus = await res.json()
    setJobStatus(data)
    return data
  }

  async function fetchSubmissions() {
    const res = await fetch(`/api/batch/${id}/submissions`)
    if (res.ok) setSubmissions(await res.json())
  }

  async function startProcessing() {
    if (running) return
    setRunning(true)
    stopRef.current = false

    while (!stopRef.current) {
      const res = await fetch(`/api/batch/${id}/process-next`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Processing error')
        break
      }
      const data: { done: boolean; completed: number; total: number; failed_count: number } = await res.json()
      setJobStatus(prev => prev ? {
        ...prev,
        completed: data.completed,
        failed_count: data.failed_count,
        status: data.done ? (data.failed_count > 0 ? 'partial_fail' : 'done') : 'running',
      } : null)

      // Refresh submission list incrementally
      fetchSubmissions()

      if (data.done) break
      await new Promise(r => setTimeout(r, 300))
    }

    setRunning(false)
    fetchSubmissions()
  }

  const pct = jobStatus && jobStatus.total > 0
    ? Math.round(((jobStatus.completed + jobStatus.failed_count) / jobStatus.total) * 100)
    : 0

  const isDone = jobStatus?.status === 'done' || jobStatus?.status === 'partial_fail'
  const generated = submissions.filter(s => s.status === 'generated')

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-[#94afd5] hover:text-[#12304f]">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">
          {jobStatus?.label ?? 'Batch Generation'}
        </h1>
        <p className="text-xs text-[#94afd5]">Generating PDFs for each recipient</p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* Progress card */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <div>
            <div className="flex justify-between text-sm text-[#425d7f] mb-2">
              <span>{running ? 'Generating…' : isDone ? 'Complete' : 'Pending'}</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full bg-[#eaf1ff] rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  isDone && jobStatus!.failed_count === 0 ? 'bg-green-500' :
                  isDone ? 'bg-yellow-500' : 'bg-[#eaf1ff]0'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {jobStatus && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-[#12304f]">{jobStatus.total}</p>
                <p className="text-xs text-[#94afd5] mt-1">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{jobStatus.completed}</p>
                <p className="text-xs text-[#94afd5] mt-1">Generated</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${jobStatus.failed_count > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                  {jobStatus.failed_count}
                </p>
                <p className="text-xs text-[#94afd5] mt-1">Failed</p>
              </div>
            </div>
          )}

          {isDone && (
            <div className="space-y-3 pt-1">
              {jobStatus!.status === 'done' ? (
                <p className="text-green-700 text-sm font-medium text-center">
                  All {jobStatus!.completed} PDFs generated successfully.
                </p>
              ) : (
                <p className="text-yellow-700 text-sm font-medium text-center">
                  {jobStatus!.completed} generated · {jobStatus!.failed_count} failed.
                </p>
              )}

              {jobStatus!.completed > 0 && (
                <a
                  href={`/api/batch/${id}/zip`}
                  className="flex items-center justify-center gap-2 w-full bg-[#006092] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#004d75]"
                >
                  <Download className="w-4 h-4" />
                  Download all as ZIP ({jobStatus!.completed} PDFs)
                </a>
              )}

              <button
                onClick={() => router.push('/batch/new')}
                className="w-full border border-[#dde8f5] text-[#425d7f] rounded-lg py-2.5 text-sm font-medium hover:bg-[#f3f6ff]"
              >
                New Batch
              </button>
            </div>
          )}

          {running && !isDone && (
            <p className="text-center text-xs text-[#94afd5]">
              Do not close this tab — generation is in progress.
            </p>
          )}
        </div>

        {/* Per-submission list */}
        {submissions.length > 0 && (
          <section className="bg-white rounded-xl border overflow-hidden">
            <div className="px-5 py-3 border-b bg-[#f3f6ff]">
              <h2 className="text-sm font-semibold text-[#425d7f]">
                Generated Forms ({generated.length} / {submissions.length})
              </h2>
            </div>
            <ul className="divide-y">
              {submissions.map(sub => (
                <li key={sub.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className={`w-4 h-4 shrink-0 ${sub.status === 'generated' ? 'text-green-500' : sub.status === 'failed' ? 'text-red-400' : 'text-gray-300'}`} />
                  <span className="flex-1 text-sm text-[#12304f] truncate">
                    {recipientLabel(sub.recipient_data)}
                  </span>
                  {sub.status === 'failed' && (
                    <span className="text-xs text-red-500 truncate max-w-[180px]" title={sub.error_msg ?? ''}>
                      {sub.error_msg ?? 'Failed'}
                    </span>
                  )}
                  {sub.status !== 'failed' && sub.status !== 'generated' && (
                    <span className="text-xs text-[#94afd5]">{sub.status}</span>
                  )}
                  {sub.url && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setPreview(sub)}
                        title="Preview PDF"
                        className="flex items-center gap-1 text-xs text-[#006092] hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </button>
                      <a
                        href={sub.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Download PDF"
                        className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* PDF Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ height: '85vh' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-[#12304f] truncate">
                {recipientLabel(preview.recipient_data)}
              </h3>
              <div className="flex items-center gap-3">
                <a
                  href={preview.url!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#006092] hover:underline"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button onClick={() => setPreview(null)} className="text-[#94afd5] hover:text-[#425d7f]">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={preview.url!}
              className="flex-1 w-full rounded-b-2xl"
              title={recipientLabel(preview.recipient_data)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
