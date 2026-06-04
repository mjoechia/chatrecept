'use client'

import { useEffect, useState } from 'react'
import { apiFetch, type KBEntry, type Tenant } from '@/lib/api'

export default function KnowledgePage() {
  const [tenant,  setTenant]  = useState<Tenant | null>(null)
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // new-entry form state
  const [kind,     setKind]     = useState<'faq' | 'doc'>('faq')
  const [question, setQuestion] = useState('')
  const [answer,   setAnswer]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const t = await apiFetch<Tenant>('/api/me/tenant')
      setTenant(t)
      const kb = await apiFetch<KBEntry[]>(`/api/tenants/${t.id}/knowledge`)
      setEntries(kb)
    } catch (err: unknown) {
      const msg = String(err)
      if (msg.includes('404')) {
        window.location.href = '/onboarding'
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant) return
    setFormErr('')
    setSaving(true)
    try {
      await apiFetch(`/api/tenants/${tenant.id}/knowledge`, {
        method: 'POST',
        body: JSON.stringify({ kind, question, answer }),
      })
      setQuestion('')
      setAnswer('')
      await loadAll()
    } catch (err) {
      setFormErr(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!tenant || !confirm('Delete this entry?')) return
    try {
      await apiFetch(`/api/tenants/${tenant.id}/knowledge/${id}`, { method: 'DELETE' })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      alert(String(err))
    }
  }

  if (loading) return <div className="p-10 text-center text-[#6B7280] text-sm">Loading…</div>
  if (error)   return <div className="p-10 text-center text-red-600 text-sm">{error}</div>

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1F2937]">Knowledge Base</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            The bot answers questions using only what you add here.
          </p>
        </div>
        <span className="text-xs bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] px-2 py-1 rounded-full font-medium">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Add entry form */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[#374151] mb-4">Add entry</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-3">
            <div className="w-28 shrink-0">
              <label className="block text-xs font-medium text-[#6B7280] mb-1">Type</label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value as 'faq' | 'doc')}
                className="w-full px-2 py-2 border border-[#E5E7EB] rounded-lg text-sm bg-white outline-none focus:border-[#25D366]"
              >
                <option value="faq">FAQ</option>
                <option value="doc">Doc</option>
                <option value="fact">Fact</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#6B7280] mb-1">
                Question <span className="text-[#9CA3AF]">(optional for Doc/Fact)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Where is your office?"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">
              Answer / Content <span className="text-[#25D366]">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. We are at 123 Orchard Road, #04-56, Singapore 238801."
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 resize-none"
            />
          </div>

          {formErr && <p className="text-xs text-red-600">{formErr}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#25D366] hover:bg-[#1faf55] text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : '+ Add'}
            </button>
          </div>
        </form>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E5E7EB] rounded-xl p-10 text-center text-[#9CA3AF] text-sm">
          No entries yet — add your first FAQ above.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.id} className="bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 flex gap-4">
              <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full mt-0.5 h-fit ${
                e.kind === 'faq'  ? 'bg-[#EFF6FF] text-[#1D4ED8]' :
                e.kind === 'doc'  ? 'bg-[#FFF7ED] text-[#C2410C]' :
                                    'bg-[#F0FDF4] text-[#166534]'
              }`}>
                {e.kind}
              </span>
              <div className="flex-1 min-w-0">
                {e.question && (
                  <p className="text-sm font-medium text-[#1F2937] mb-0.5">{e.question}</p>
                )}
                <p className="text-sm text-[#6B7280] leading-relaxed">{e.answer}</p>
              </div>
              <button
                onClick={() => handleDelete(e.id)}
                className="shrink-0 text-[#9CA3AF] hover:text-red-500 transition-colors text-lg leading-none"
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
