'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { topUpWallet, createStripeCheckout } from '@/lib/api'

const PACKAGES = [
  { id: 'starter', credits: 30,  price: '$9.90',  priceSub: '~$0.33/conv' },
  { id: 'growth',  credits: 100, price: '$29.00', priceSub: '~$0.29/conv' },
  { id: 'scale',   credits: 300, price: '$79.00', priceSub: '~$0.26/conv' },
]

export default function WalletPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  // Stripe checkout state
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [stripeError, setStripeError] = useState('')

  // Manual top-up state
  const [amount, setAmount] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualMessage, setManualMessage] = useState('')

  const successParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('success')
    : null

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setTenantId((session.user.app_metadata as any)?.tenant_id ?? null)
      setToken(session.access_token)
    }
    init()
  }, [])

  async function handleStripeCheckout(packageId: string) {
    if (!tenantId || !token) return
    setCheckingOut(packageId)
    setStripeError('')
    try {
      const { url } = await createStripeCheckout(tenantId, token, packageId)
      window.location.href = url
    } catch (err) {
      setStripeError('Checkout failed. Is STRIPE_SECRET_KEY configured on the backend?')
      setCheckingOut(null)
    }
  }

  async function handleManualTopUp(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId || !token) return
    setManualLoading(true)
    setManualMessage('')
    try {
      await topUpWallet(tenantId, token, parseInt(amount))
      setManualMessage(`Added ${amount} credits.`)
      setAmount('')
    } catch {
      setManualMessage('Top-up failed.')
    } finally {
      setManualLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Wallet</h1>
      <p className="text-sm text-gray-500 mb-8">Purchase conversation credits to keep your AI receptionist running.</p>

      {successParam && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          Payment successful — your credits have been added to your wallet.
        </div>
      )}

      {/* Stripe credit packages */}
      <section className="mb-8">
        <h2 className="font-semibold text-sm mb-3">Buy Credits</h2>
        <div className="grid grid-cols-3 gap-3">
          {PACKAGES.map(pkg => (
            <div key={pkg.id} className="bg-white border rounded-xl p-5 flex flex-col gap-3">
              <div>
                <p className="text-2xl font-bold">{pkg.credits}</p>
                <p className="text-xs text-gray-400">credits</p>
              </div>
              <div>
                <p className="text-base font-semibold">{pkg.price}</p>
                <p className="text-xs text-gray-400">{pkg.priceSub}</p>
              </div>
              <button
                onClick={() => handleStripeCheckout(pkg.id)}
                disabled={!!checkingOut}
                className="mt-auto bg-blue-600 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {checkingOut === pkg.id ? 'Redirecting…' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
        {stripeError && <p className="text-sm text-red-500 mt-3">{stripeError}</p>}
      </section>

      {/* Manual top-up (admin) */}
      <section>
        <h2 className="font-semibold text-sm mb-3">Manual Top-Up</h2>
        <div className="bg-white border rounded-xl p-6 max-w-sm">
          <form onSubmit={handleManualTopUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Credits to add</label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                placeholder="e.g. 30"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {manualMessage && (
              <p className={`text-sm ${manualMessage.includes('failed') ? 'text-red-500' : 'text-green-600'}`}>
                {manualMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={manualLoading || !amount}
              className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
            >
              {manualLoading ? 'Processing…' : 'Add Credits'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
