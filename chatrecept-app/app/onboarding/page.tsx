'use client'

import { useState } from 'react'
import { apiFetch, type Tenant } from '@/lib/api'

export default function OnboardingPage() {
  const [companyName,  setCompanyName]  = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [language,     setLanguage]     = useState('en')
  const [status,       setStatus]       = useState<'idle' | 'saving'>('idle')
  const [error,        setError]        = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('saving')
    try {
      await apiFetch<Tenant>('/api/me/tenant', {
        method: 'POST',
        body: JSON.stringify({ company_name: companyName, system_prompt: systemPrompt, language }),
      })
      window.location.href = '/knowledge'
    } catch (err) {
      setError(String(err))
      setStatus('idle')
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#1F2937]">Set up your frontdesk bot</h1>
        <p className="text-sm text-[#6B7280] mt-2">
          Takes 2 minutes. You can change everything later.
        </p>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">
              Business name <span className="text-[#25D366]">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Acme Accounting Pte Ltd"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">
              Bot personality <span className="text-[#9CA3AF] font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. You are a friendly receptionist for Acme. Always greet visitors warmly and keep answers brief."
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 resize-none"
            />
            <p className="text-xs text-[#9CA3AF] mt-1">
              Leave blank for the default professional receptionist persona.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] bg-white"
            >
              <option value="en">English</option>
              <option value="zh">Chinese (中文)</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={status === 'saving'}
            className="w-full bg-[#25D366] hover:bg-[#1faf55] text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {status === 'saving' ? 'Creating…' : 'Create my frontdesk →'}
          </button>
        </form>
      </div>
    </main>
  )
}
