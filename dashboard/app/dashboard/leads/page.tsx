'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getLeads, updateLeadStatus } from '@/lib/api'

interface Lead {
  id: string
  user_id: string
  user_phone: string
  user_name: string | null
  enquiry_summary: string | null
  urgency_score: number | null
  status: 'new' | 'hot' | 'contacted' | 'closed'
  created_at: string
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  new:       { label: 'New',       classes: 'bg-blue-100 text-blue-700' },
  hot:       { label: 'Hot',       classes: 'bg-red-100 text-red-700' },
  contacted: { label: 'Contacted', classes: 'bg-yellow-100 text-yellow-700' },
  closed:    { label: 'Closed',    classes: 'bg-gray-100 text-gray-500' },
}

const statusFlow: Record<string, string> = {
  new: 'hot',
  hot: 'contacted',
  contacted: 'closed',
  closed: 'new',
}

function UrgencyDots({ score }: { score: number | null }) {
  if (!score) return <span className="text-gray-300 text-xs">—</span>
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          className={`w-2 h-2 rounded-full ${
            n <= score
              ? score >= 4 ? 'bg-red-500' : score >= 3 ? 'bg-yellow-400' : 'bg-blue-400'
              : 'bg-gray-200'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-gray-500">{score}/5</span>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function LeadsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

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
        const data = await getLeads(tid, session.access_token)
        setLeads(data)
      } catch (err) {
        console.error('leads load error', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function advanceStatus(lead: Lead) {
    if (!tenantId || !token) return
    const next = statusFlow[lead.status]
    setUpdating(lead.id)
    try {
      await updateLeadStatus(tenantId, lead.id, token, next)
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: next as Lead['status'] } : l))
    } catch (err) {
      console.error('status update error', err)
    } finally {
      setUpdating(null)
    }
  }

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)

  const counts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} total · {counts.new || 0} new · {counts.hot || 0} hot</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {['all', 'new', 'hot', 'contacted', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-gray-900 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'all' ? 'All' : statusConfig[s].label}
            {s !== 'all' && counts[s] ? (
              <span className="ml-1.5 text-xs opacity-70">{counts[s]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-gray-400">
            {filter === 'all' ? 'No leads detected yet. Lead detection runs automatically on every inbound message.' : `No ${filter} leads.`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Enquiry</th>
                <th className="px-5 py-3">Urgency</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium">{lead.user_name || lead.user_phone}</p>
                    {lead.user_name && (
                      <p className="text-xs text-gray-400">{lead.user_phone}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 max-w-xs">
                    <p className="text-gray-700 truncate">{lead.enquiry_summary || <span className="text-gray-300">—</span>}</p>
                  </td>
                  <td className="px-5 py-3">
                    <UrgencyDots score={lead.urgency_score} />
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => advanceStatus(lead)}
                      disabled={updating === lead.id}
                      title={`Advance to: ${statusFlow[lead.status]}`}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-opacity ${
                        statusConfig[lead.status].classes
                      } ${updating === lead.id ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'}`}
                    >
                      {statusConfig[lead.status].label}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {formatDate(lead.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && leads.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">Click a status badge to advance it: New → Hot → Contacted → Closed → New</p>
      )}
    </div>
  )
}
