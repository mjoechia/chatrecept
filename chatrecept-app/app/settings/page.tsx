'use client'

import { useEffect, useState } from 'react'
import { apiFetch, type Tenant } from '@/lib/api'

export default function SettingsPage() {
  const [companyName,  setCompanyName]  = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [threshold,    setThreshold]    = useState(0.6)
  const [loading, setLoading] = useState(true)
  const [status,  setStatus]  = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error,   setError]   = useState('')

  useEffect(() => {
    apiFetch<Tenant>('/api/me/tenant')
      .then(t => {
        setCompanyName(t.company_name)
        setSystemPrompt(t.system_prompt)
        setThreshold(t.low_confidence_threshold)
        setLoading(false)
      })
      .catch(() => { window.location.href = '/onboarding' })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('saving')
    try {
      await apiFetch('/api/me/tenant', {
        method: 'PATCH',
        body: JSON.stringify({
          company_name: companyName,
          system_prompt: systemPrompt,
          low_confidence_threshold: threshold,
        }),
      })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      setError(String(err))
      setStatus('idle')
    }
  }

  if (loading) return <div className="p-10 text-center text-[#6B7280] text-sm">Loading…</div>

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-[#1F2937] mb-6">Settings</h1>

      <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">
              Business name <span className="text-[#25D366]">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Bot personality</label>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="Leave blank for the default receptionist persona."
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">
              Escalation confidence threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={threshold}
                onChange={e => setThreshold(parseFloat(e.target.value))}
                className="flex-1 accent-[#25D366]"
              />
              <span className="text-sm font-mono w-10 text-[#374151]">{threshold.toFixed(2)}</span>
            </div>
            <p className="text-xs text-[#9CA3AF] mt-1">
              If the bot&apos;s confidence is below this, the conversation is flagged for your follow-up.
              Lower = escalate more. Recommended: 0.60.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={status === 'saving'}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              status === 'saved'
                ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]'
                : 'bg-[#25D366] hover:bg-[#1faf55] text-white disabled:opacity-50'
            }`}
          >
            {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : 'Save changes'}
          </button>
        </form>
      </div>
    </main>
  )
}
