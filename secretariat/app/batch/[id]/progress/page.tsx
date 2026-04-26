'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'

interface BatchStatus {
  id: string
  total: number
  completed: number
  failed_count: number
  status: 'pending' | 'running' | 'done' | 'partial_fail'
  label: string | null
}

export default function BatchProgressPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [jobStatus, setJobStatus] = useState<BatchStatus | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      fetchStatus().then(status => {
        if (status && status.status !== 'done' && status.status !== 'partial_fail') {
          startProcessing()
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

      if (data.done) break
      // Small pause to avoid hammering the server
      await new Promise(r => setTimeout(r, 200))
    }

    setRunning(false)
  }

  const pct = jobStatus && jobStatus.total > 0
    ? Math.round(((jobStatus.completed + jobStatus.failed_count) / jobStatus.total) * 100)
    : 0

  const isDone = jobStatus?.status === 'done' || jobStatus?.status === 'partial_fail'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">
          {jobStatus?.label ?? 'Batch Generation'}
        </h1>
        <p className="text-xs text-gray-400">Generating PDFs for each recipient</p>
      </header>

      <main className="max-w-xl mx-auto px-6 py-12 space-y-8">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="bg-white rounded-xl border p-8 space-y-6">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>{running ? 'Generating…' : isDone ? 'Complete' : 'Pending'}</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  isDone && jobStatus.failed_count === 0 ? 'bg-green-500' :
                  isDone ? 'bg-yellow-500' : 'bg-blue-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          {jobStatus && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{jobStatus.total}</p>
                <p className="text-xs text-gray-400 mt-1">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{jobStatus.completed}</p>
                <p className="text-xs text-gray-400 mt-1">Generated</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${jobStatus.failed_count > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                  {jobStatus.failed_count}
                </p>
                <p className="text-xs text-gray-400 mt-1">Failed</p>
              </div>
            </div>
          )}

          {isDone && (
            <div className="space-y-3 pt-2">
              {jobStatus.status === 'done' ? (
                <p className="text-green-700 text-sm font-medium text-center">
                  All {jobStatus.completed} PDFs generated successfully.
                </p>
              ) : (
                <p className="text-yellow-700 text-sm font-medium text-center">
                  {jobStatus.completed} generated · {jobStatus.failed_count} failed.
                </p>
              )}

              {jobStatus.completed > 0 && (
                <a
                  href={`/api/batch/${id}/zip`}
                  className="block w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 text-center"
                >
                  Download ZIP ({jobStatus.completed} PDFs)
                </a>
              )}

              <button
                onClick={() => router.push('/batch/new')}
                className="block w-full border border-gray-200 text-gray-600 rounded-lg py-3 text-sm font-medium hover:bg-gray-50 text-center"
              >
                New Batch
              </button>
            </div>
          )}

          {running && !isDone && (
            <p className="text-center text-xs text-gray-400">
              Do not close this tab — generation is in progress.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
