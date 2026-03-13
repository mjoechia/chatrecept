'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSettings, updateSettings } from '@/lib/api'

interface Settings {
  company_name: string
  whatsapp_phone_number_id: string
  plan_type: string
  status: string
  system_prompt: string | null
}

const DEFAULT_PROMPT = `You are a professional and friendly AI receptionist for {company_name}.

Your role:
- Greet customers warmly and answer questions about the business
- Capture enquiry details: name, what they need, and urgency
- Escalate complex issues to a human team member

Guidelines:
- Keep all responses under 3 sentences
- Never make up information you don't have
- If unsure, say: "I'll pass your message to our team who will follow up shortly"

FAQ:
Q: What are your business hours?
A: [Add your hours here]

Q: Where are you located?
A: [Add your address here]`

export default function SettingsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [companyName, setCompanyName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tid = (session.user.app_metadata as any)?.tenant_id
      if (!tid) return

      setTenantId(tid)
      setToken(session.access_token)

      try {
        const data = await getSettings(tid, session.access_token)
        setSettings(data)
        setCompanyName(data.company_name)
        setSystemPrompt(data.system_prompt ?? '')
      } catch (err) {
        console.error('settings load error', err)
        setError('Failed to load settings.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId || !token) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await updateSettings(tenantId, token, { company_name: companyName, system_prompt: systemPrompt })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading...</div>

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">Configure your business profile and AI assistant behaviour.</p>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Business Profile */}
        <section className="bg-white border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-sm mb-0.5">Business Profile</h2>
            <p className="text-xs text-gray-400">Shown in your dashboard and used as context for the AI.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">WhatsApp Phone Number ID</p>
              <p className="font-mono text-xs bg-gray-50 border rounded px-2 py-1.5 text-gray-600">
                {settings?.whatsapp_phone_number_id || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Plan</p>
              <p className="font-mono text-xs bg-gray-50 border rounded px-2 py-1.5 text-gray-600 capitalize">
                {settings?.plan_type || '—'}
              </p>
            </div>
          </div>
        </section>

        {/* AI System Prompt */}
        <section className="bg-white border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-sm mb-0.5">AI System Prompt</h2>
            <p className="text-xs text-gray-400">
              Defines your AI receptionist's persona, tone, and knowledge. Include FAQ entries directly in the prompt.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Prompt</label>
              <span className="text-xs text-gray-400">{systemPrompt.length} chars</span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={18}
              placeholder={DEFAULT_PROMPT}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank to use the default receptionist prompt. Changes take effect on the next message.
            </p>
          </div>

          {!systemPrompt && (
            <button
              type="button"
              onClick={() => setSystemPrompt(DEFAULT_PROMPT.replace('{company_name}', companyName || 'your business'))}
              className="text-xs text-blue-600 hover:underline"
            >
              Load default template
            </button>
          )}
        </section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-sm text-green-600">Saved.</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </form>
    </div>
  )
}
