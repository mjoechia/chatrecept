'use client'

import { useEffect, useState } from 'react'
import { apiFetch, type Tenant } from '@/lib/api'

type ConvItem = {
  id: string
  window_start: string
  window_expiry: string
  category: string
  created_at: string
  user_id: string
  user_phone: string
  user_name: string | null
  last_message: string | null
  message_count: number
  last_message_at: string | null
}

type MsgItem = {
  id: string
  sender: string
  content: string
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function visitorLabel(phone: string, name: string | null) {
  if (phone.startsWith('web:')) return name || 'Web visitor'
  return name || phone
}

export default function InboxPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [convs,  setConvs]  = useState<ConvItem[]>([])
  const [selected, setSelected] = useState<ConvItem | null>(null)
  const [msgs,   setMsgs]   = useState<MsgItem[]>([])
  const [loading, setLoading] = useState(true)
  const [msgsLoading, setMsgsLoading] = useState(false)

  useEffect(() => {
    apiFetch<Tenant>('/api/me/tenant')
      .then(t => {
        setTenant(t)
        return apiFetch<ConvItem[]>(`/api/tenants/${t.id}/conversations`)
      })
      .then(c => { setConvs(c); setLoading(false) })
      .catch(() => { window.location.href = '/onboarding' })
  }, [])

  async function selectConv(c: ConvItem) {
    setSelected(c)
    setMsgsLoading(true)
    if (!tenant) return
    const m = await apiFetch<MsgItem[]>(`/api/tenants/${tenant.id}/conversations/${c.id}/messages`)
    setMsgs(m)
    setMsgsLoading(false)
  }

  if (loading) return <div className="p-10 text-center text-[#6B7280] text-sm">Loading…</div>

  return (
    <main className="flex h-[calc(100vh-52px)]">
      {/* Conversation list */}
      <aside className="w-72 shrink-0 bg-white border-r border-[#E5E7EB] overflow-y-auto">
        <div className="px-4 py-3 border-b border-[#E5E7EB]">
          <h2 className="text-sm font-semibold text-[#1F2937]">Inbox</h2>
          <p className="text-xs text-[#9CA3AF]">{convs.length} conversations</p>
        </div>
        {convs.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#9CA3AF]">No conversations yet</div>
        ) : (
          convs.map(c => (
            <button
              key={c.id}
              onClick={() => selectConv(c)}
              className={`w-full text-left px-4 py-3 border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors ${
                selected?.id === c.id ? 'bg-[#F0FDF4] border-l-2 border-l-[#25D366]' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium text-[#1F2937] truncate">
                  {visitorLabel(c.user_phone, c.user_name)}
                </span>
                {c.last_message_at && (
                  <span className="text-[10px] text-[#9CA3AF] shrink-0 ml-2">
                    {timeAgo(c.last_message_at)}
                  </span>
                )}
              </div>
              {c.last_message && (
                <p className="text-xs text-[#6B7280] truncate">{c.last_message}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  c.category === 'web' ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#F3F4F6] text-[#6B7280]'
                }`}>
                  {c.category}
                </span>
                <span className="text-[10px] text-[#9CA3AF]">{c.message_count} msgs</span>
              </div>
            </button>
          ))
        )}
      </aside>

      {/* Message thread */}
      <div className="flex-1 flex flex-col bg-[#F9FAFB]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-[#9CA3AF] text-sm">
            Select a conversation to view messages
          </div>
        ) : msgsLoading ? (
          <div className="flex-1 flex items-center justify-center text-[#6B7280] text-sm">Loading…</div>
        ) : (
          <>
            <div className="px-5 py-3 bg-white border-b border-[#E5E7EB]">
              <p className="text-sm font-semibold text-[#1F2937]">
                {visitorLabel(selected.user_phone, selected.user_name)}
              </p>
              <p className="text-xs text-[#9CA3AF]">{selected.user_phone} · {selected.category}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgs.map(m => (
                <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                    m.sender === 'user'
                      ? 'bg-[#1F2937] text-white rounded-br-sm'
                      : 'bg-white border border-[#E5E7EB] text-[#1F2937] rounded-bl-sm'
                  }`}>
                    <p className="leading-relaxed">{m.content}</p>
                    <p className={`text-[10px] mt-1 ${m.sender === 'user' ? 'text-[#9CA3AF]' : 'text-[#D1D5DB]'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
