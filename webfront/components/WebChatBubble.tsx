'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import {
  getSession,
  sendMessage,
  type MessageResponse,
  type WebMessage,
} from '@/lib/webchat'

type PanelState = 'closed' | 'unauthed' | 'authed'

export default function WebChatBubble() {
  const [panel, setPanel] = useState<PanelState>('closed')
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [messages, setMessages] = useState<WebMessage[]>([])
  const [botState, setBotState] = useState('idle')
  const [credits, setCredits] = useState(3)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, botState])

  // Listen for auth changes (handles magic-link redirect)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setToken(session.access_token)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setToken(session.access_token)
          // If bubble was open as unauthed, transition to chat
          setPanel(prev => (prev === 'unauthed' ? 'authed' : prev))
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  // Load session and kick off welcome message when chat opens
  const loadSession = useCallback(async (tok: string) => {
    try {
      const data: MessageResponse = await getSession(tok)
      setMessages(data.messages)
      setBotState(data.state)
      setCredits(data.credits)
      if (data.messages.length === 0) {
        const resp = await sendMessage('__action__:start', tok)
        setMessages(resp.messages)
        setBotState(resp.state)
        setCredits(resp.credits)
      }
    } catch (e) {
      console.error('webchat load error', e)
    }
  }, [])

  useEffect(() => {
    if (panel === 'authed' && token) loadSession(token)
  }, [panel, token, loadSession])

  // Poll every 2 s while a site is being generated
  useEffect(() => {
    if (botState === 'generating' && token) {
      pollRef.current = setInterval(async () => {
        try {
          const data = await getSession(token)
          setMessages(data.messages)
          setBotState(data.state)
          setCredits(data.credits)
          if (data.state !== 'generating') {
            clearInterval(pollRef.current!)
            pollRef.current = null
          }
        } catch { /* ignore transient poll errors */ }
      }, 2000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [botState, token])

  const dispatch = useCallback(async (text: string) => {
    if (!token || !text.trim() || sending || botState === 'generating') return
    setSending(true)
    try {
      const data = await sendMessage(text, token)
      setMessages(data.messages)
      setBotState(data.state)
      setCredits(data.credits)
      setInput('')
    } catch (e) {
      console.error('webchat send error', e)
    } finally {
      setSending(false)
    }
  }, [token, sending, botState])

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://chatrecept.chat'
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: origin, data: { app: 'app_webchat' } },
    })
    setLinkSent(true)
  }

  const openPanel = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) { setToken(session.access_token); setPanel('authed') }
    else setPanel('unauthed')
  }

  // Find action buttons from the most recent bot message that has them
  const actionButtons = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const b = messages[i].metadata?.buttons
      if (messages[i].role === 'bot' && b?.length) return b
    }
    return null
  })()

  /* ── Closed: floating bubble ─────────────────────────────────────── */
  if (panel === 'closed') {
    return (
      <button
        onClick={openPanel}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Open WebBot"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 14H7v-2h6v2zm3-4H7v-2h9v2zm0-4H7V6h9v2z" />
        </svg>
      </button>
    )
  }

  /* ── Open panel ──────────────────────────────────────────────────── */
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
      style={{ width: 380, maxWidth: 'calc(100vw - 1.5rem)', height: 560, maxHeight: 'calc(100vh - 5rem)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-primary text-white shrink-0">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base">🤖</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">ChatRecept WebBot</div>
          <div className="text-xs text-white/70 leading-tight">
            {panel === 'authed'
              ? `${credits} credit${credits !== 1 ? 's' : ''} remaining`
              : 'Build your free website'}
          </div>
        </div>
        <button
          onClick={() => setPanel('closed')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-white text-lg leading-none"
          aria-label="Close"
        >×</button>
      </div>

      {/* ── Login panel ─────────────────────────────────────────────── */}
      {panel === 'unauthed' && (
        <div className="flex-1 bg-white flex flex-col items-center justify-center p-6 gap-5">
          {!linkSent ? (
            <>
              <div className="text-center space-y-1">
                <div className="text-4xl">✨</div>
                <h3 className="font-bold text-[#12304f] text-lg">Build your website free</h3>
                <p className="text-sm text-[#12304f]/60">
                  Enter your email — we'll send a one-tap login link
                </p>
              </div>
              <form onSubmit={handleMagicLink} className="w-full space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="submit"
                  className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Send magic link →
                </button>
              </form>
            </>
          ) : (
            <div className="text-center space-y-2">
              <div className="text-4xl">📧</div>
              <h3 className="font-bold text-[#12304f] text-lg">Check your email</h3>
              <p className="text-sm text-[#12304f]/60">
                Click the link we sent to <strong>{email}</strong> to start building
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      {panel === 'authed' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] text-sm leading-relaxed rounded-2xl px-4 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-tr-sm'
                    : 'bg-white text-[#12304f] shadow-sm rounded-tl-sm'
                }`}>
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  {m.metadata?.site_url && (
                    <a
                      href={m.metadata.site_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-2 bg-[#e8f5e9] text-[#1b5e20] rounded-xl px-3 py-2 text-xs font-semibold no-underline hover:bg-[#c8e6c9] transition-colors"
                    >
                      🌐 View your site →
                    </a>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator while generating */}
            {botState === 'generating' && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Action button chips */}
          {actionButtons && botState !== 'generating' && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
              {actionButtons.map(btn => (
                <button
                  key={btn.action}
                  onClick={() => dispatch(btn.action)}
                  disabled={sending}
                  className="bg-white border border-primary/25 text-primary rounded-full px-4 py-1.5 text-xs font-medium hover:bg-primary/5 transition-colors disabled:opacity-40"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="shrink-0 px-3 py-2.5 bg-white border-t border-gray-100 flex gap-2 items-center">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatch(input) }
              }}
              placeholder={botState === 'generating' ? 'Building your site...' : 'Type a message...'}
              disabled={botState === 'generating' || sending}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => dispatch(input)}
              disabled={!input.trim() || sending || botState === 'generating'}
              className="w-9 h-9 shrink-0 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
