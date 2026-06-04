'use client'

import { useEffect, useState } from 'react'
import { apiFetch, type Tenant, type UsageSnapshot, MESSAGE_PACKAGES } from '@/lib/api'

export default function BillingPage() {
  const [tenant,  setTenant]  = useState<Tenant | null>(null)
  const [usage,   setUsage]   = useState<UsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying,  setBuying]  = useState('')

  useEffect(() => {
    apiFetch<Tenant>('/api/me/tenant')
      .then(t => {
        setTenant(t)
        return apiFetch<UsageSnapshot>(`/api/tenants/${t.id}/billing/usage`)
      })
      .then(u => { setUsage(u); setLoading(false) })
      .catch(() => { window.location.href = '/onboarding' })
  }, [])

  async function buyTopup(pkgId: string) {
    if (!tenant) return
    setBuying(pkgId)
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/tenants/${tenant.id}/billing/message-topup`, {
        method: 'POST',
        body: JSON.stringify({ package_id: pkgId }),
      })
      window.location.href = url
    } catch (err) {
      alert(String(err))
      setBuying('')
    }
  }

  if (loading) return <div className="p-10 text-center text-[#6B7280] text-sm">Loading…</div>

  const pct = usage ? Math.min(100, Math.round((usage.MessageCount / usage.EffectiveCap) * 100)) : 0

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-[#1F2937] mb-6">Billing</h1>

      {/* Usage card */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-[#374151]">This month&apos;s usage</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Resets on the 1st of each month (UTC)</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            tenant?.plan_type === 'free'
              ? 'bg-[#F3F4F6] text-[#6B7280]'
              : 'bg-[#ECFDF5] text-[#065F46]'
          }`}>
            {tenant?.plan_type?.toUpperCase()} plan
          </span>
        </div>

        {usage && (
          <>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold text-[#1F2937]">{usage.MessageCount.toLocaleString()}</span>
              <span className="text-sm text-[#9CA3AF] mb-1">/ {usage.EffectiveCap.toLocaleString()} messages</span>
            </div>

            <div className="w-full bg-[#F3F4F6] rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-[#25D366]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-[#9CA3AF]">
              <span>{pct}% used</span>
              {usage.TopupCredits > 0 && (
                <span>+{usage.TopupCredits.toLocaleString()} top-up credits included</span>
              )}
            </div>

            {usage.OverQuota && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
                Quota reached — bot is replying with a soft-pause message. Buy a top-up below to resume instantly.
              </div>
            )}
          </>
        )}
      </div>

      {/* Top-up packages */}
      <div>
        <h2 className="text-sm font-semibold text-[#374151] mb-3">Buy message top-up (SGD)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MESSAGE_PACKAGES.map(pkg => (
            <button
              key={pkg.id}
              onClick={() => buyTopup(pkg.id)}
              disabled={buying === pkg.id}
              className="bg-white border border-[#E5E7EB] rounded-xl p-4 text-left hover:border-[#25D366] hover:shadow-sm transition-all disabled:opacity-50 group"
            >
              <p className="text-lg font-bold text-[#1F2937] group-hover:text-[#25D366] transition-colors">
                SGD {(pkg.price_cents / 100).toFixed(0)}
              </p>
              <p className="text-sm text-[#6B7280] mt-0.5">{pkg.credits.toLocaleString()} messages</p>
              {buying === pkg.id && (
                <p className="text-xs text-[#25D366] mt-1">Opening checkout…</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
