'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getAnalytics } from '@/lib/api'

interface DailyRow {
  day: string
  messages: number
  conversations: number
  tokens_in: number
  tokens_out: number
  cost: number
}

interface Totals {
  messages_30d: number
  conversations_30d: number
  tokens_in_30d: number
  tokens_out_30d: number
  cost_30d: number
}

interface Analytics {
  daily: DailyRow[]
  totals: Totals
}

function BarChart({ data, valueKey, color, label }: {
  data: DailyRow[]
  valueKey: keyof DailyRow
  color: string
  label: string
}) {
  const values = data.map(d => Number(d[valueKey]))
  const max = Math.max(...values, 1)

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-0.5 h-24">
        {data.map((d, i) => {
          const pct = Math.round((Number(d[valueKey]) / max) * 100)
          return (
            <div
              key={d.day}
              className="flex-1 group relative"
              style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
            >
              <div
                className={`w-full rounded-t-sm ${color} transition-opacity group-hover:opacity-80`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                {d.day.slice(5)}: {Number(d[valueKey]).toLocaleString()}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-300">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tid = (session.user.app_metadata as any)?.tenant_id
      if (!tid) return

      try {
        const result = await getAnalytics(tid, session.access_token)
        setData(result)
      } catch (err) {
        console.error('analytics load error', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading...</div>
  if (error || !data) return <div className="p-8 text-sm text-red-500">Failed to load analytics.</div>

  const { daily, totals } = data
  const avgCostPerConv = totals.conversations_30d > 0
    ? (totals.cost_30d / totals.conversations_30d).toFixed(4)
    : '0.0000'

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-1">Analytics</h1>
      <p className="text-sm text-gray-500 mb-6">Last 30 days</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
        <StatCard label="Conversations" value={totals.conversations_30d.toLocaleString()} />
        <StatCard label="Messages" value={totals.messages_30d.toLocaleString()} />
        <StatCard label="AI Cost" value={`$${totals.cost_30d.toFixed(4)}`} sub={`~$${avgCostPerConv}/conv`} />
        <StatCard
          label="Tokens Used"
          value={(totals.tokens_in_30d + totals.tokens_out_30d).toLocaleString()}
          sub={`${totals.tokens_in_30d.toLocaleString()} in · ${totals.tokens_out_30d.toLocaleString()} out`}
        />
      </div>

      {daily.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-sm text-gray-400 text-center">
          No data yet. Charts will appear once messages are flowing.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="bg-white border rounded-xl p-6">
            <BarChart data={daily} valueKey="conversations" color="bg-blue-500" label="Conversations per day" />
          </div>
          <div className="bg-white border rounded-xl p-6">
            <BarChart data={daily} valueKey="messages" color="bg-indigo-400" label="Messages per day" />
          </div>
          <div className="bg-white border rounded-xl p-6">
            <BarChart data={daily} valueKey="cost" color="bg-emerald-400" label="AI cost per day (USD)" />
          </div>
          <div className="bg-white border rounded-xl p-6">
            <BarChart data={daily} valueKey="tokens_out" color="bg-amber-400" label="Output tokens per day" />
          </div>
        </div>
      )}
    </div>
  )
}
