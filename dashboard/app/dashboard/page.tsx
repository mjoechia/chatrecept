'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDashboard } from '@/lib/api'

interface DashboardData {
  wallet_balance: number
  conversations_30d: number
  messages_30d: number
  open_leads: number
  cost_30d: number
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tenantId = (session.user.app_metadata as any)?.tenant_id
      if (!tenantId) return

      try {
        const result = await getDashboard(tenantId, session.access_token)
        setData(result)
      } catch (err) {
        console.error('dashboard load error', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div className="p-8 text-gray-400">Loading...</div>
  }

  if (!data) {
    return <div className="p-8 text-red-500">Failed to load dashboard data.</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Wallet Credits" value={data.wallet_balance.toString()} />
        <StatCard label="Conversations (30d)" value={data.conversations_30d.toString()} />
        <StatCard label="Messages (30d)" value={data.messages_30d.toString()} />
        <StatCard label="Open Leads" value={data.open_leads.toString()} />
      </div>

      <div className="mt-4">
        <StatCard label="AI Cost (30d)" value={`$${data.cost_30d.toFixed(4)}`} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
