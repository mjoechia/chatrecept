'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getConversations, getConversationMessages } from '@/lib/api'

interface Conversation {
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

interface Message {
  id: string
  sender: 'customer' | 'bot' | 'system'
  content: string
  token_input: number
  token_output: number
  model_used: string | null
  estimated_cost: number
  created_at: string
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

const categoryColors: Record<string, string> = {
  service: 'bg-blue-100 text-blue-700',
  marketing: 'bg-purple-100 text-purple-700',
  utility: 'bg-gray-100 text-gray-600',
  authentication: 'bg-orange-100 text-orange-700',
}

export default function ConversationsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)

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
        const data = await getConversations(tid, session.access_token)
        setConversations(data)
      } catch (err) {
        console.error('conversations load error', err)
      } finally {
        setLoadingList(false)
      }
    }
    init()
  }, [])

  async function selectConversation(conv: Conversation) {
    if (!tenantId || !token) return
    setSelected(conv)
    setMessages([])
    setLoadingThread(true)
    try {
      const data = await getConversationMessages(tenantId, conv.id, token)
      setMessages(data)
    } catch (err) {
      console.error('messages load error', err)
    } finally {
      setLoadingThread(false)
    }
  }

  const isExpired = (expiry: string) => new Date(expiry) < new Date()

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left panel: conversation list */}
      <div className="w-80 flex-shrink-0 border-r bg-white flex flex-col">
        <div className="px-4 py-3 border-b">
          <h1 className="text-base font-semibold">Conversations</h1>
          {!loadingList && (
            <p className="text-xs text-gray-400 mt-0.5">{conversations.length} total</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-sm text-gray-400">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No conversations yet.</div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                  selected?.id === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {conv.user_name || conv.user_phone}
                    </p>
                    {conv.user_name && (
                      <p className="text-xs text-gray-400 truncate">{conv.user_phone}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400">{relativeTime(conv.last_message_at)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${categoryColors[conv.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {conv.category}
                    </span>
                  </div>
                </div>
                {conv.last_message && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{conv.last_message}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">{conv.message_count} msgs</span>
                  {isExpired(conv.window_expiry) ? (
                    <span className="text-xs text-gray-300">· closed</span>
                  ) : (
                    <span className="text-xs text-green-500">· active</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: message thread */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation to view messages
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">
                  {selected.user_name || selected.user_phone}
                </p>
                <p className="text-xs text-gray-400">
                  {selected.user_name ? selected.user_phone + ' · ' : ''}
                  {formatDate(selected.window_start)} → {formatDate(selected.window_expiry)}
                  {isExpired(selected.window_expiry) ? ' · closed' : ' · active'}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-medium ${categoryColors[selected.category] ?? 'bg-gray-100 text-gray-600'}`}>
                {selected.category}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {loadingThread ? (
                <div className="text-sm text-gray-400">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-400">No messages in this conversation.</div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                        msg.sender === 'customer'
                          ? 'bg-white border text-gray-800 rounded-tl-sm'
                          : msg.sender === 'bot'
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <div className={`flex items-center gap-2 mt-1 ${msg.sender === 'bot' ? 'text-blue-200' : 'text-gray-400'}`}>
                        <span className="text-xs">{formatTime(msg.created_at)}</span>
                        {msg.sender === 'bot' && msg.token_output > 0 && (
                          <span className="text-xs">
                            {msg.token_input}↑ {msg.token_output}↓ · ${msg.estimated_cost.toFixed(5)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
