'use client'

import { useEffect, useState } from 'react'
import { apiFetch, type Tenant } from '@/lib/api'

export default function InstallPage() {
  const [tenant,  setTenant]  = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied,  setCopied]  = useState(false)

  useEffect(() => {
    apiFetch<Tenant>('/api/me/tenant')
      .then(t => { setTenant(t); setLoading(false) })
      .catch(() => { window.location.href = '/onboarding' })
  }, [])

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.chatrecept.chat'

  function snippet() {
    if (!tenant) return ''
    return `<!-- ChatRecept Frontdesk Widget -->
<script>
  (function() {
    var s = document.createElement('script');
    s.src = '${apiUrl}/widget.js';
    s.setAttribute('data-tenant', '${tenant.id}');
    s.defer = true;
    document.head.appendChild(s);
  })();
</script>`
  }

  async function copy() {
    await navigator.clipboard.writeText(snippet())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="p-10 text-center text-[#6B7280] text-sm">Loading…</div>

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-[#1F2937] mb-2">Install Widget</h1>
      <p className="text-sm text-[#6B7280] mb-8">
        Paste this snippet into the <code className="bg-[#F3F4F6] px-1 py-0.5 rounded text-xs">&lt;head&gt;</code> or
        before the closing <code className="bg-[#F3F4F6] px-1 py-0.5 rounded text-xs">&lt;/body&gt;</code> tag
        of your website.
      </p>

      <div className="bg-[#1F2937] rounded-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#374151]">
          <span className="text-xs text-[#6B7280] font-mono">HTML snippet</span>
          <button
            onClick={copy}
            className="text-xs text-[#25D366] hover:text-[#1faf55] transition-colors font-medium"
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="px-4 py-4 text-sm text-[#D1FAE5] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
          {snippet()}
        </pre>
      </div>

      <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#065F46] mb-2">Works on</h3>
        <ul className="text-sm text-[#047857] space-y-1 list-disc list-inside">
          <li>WordPress, Wix, Squarespace — paste in the custom HTML block</li>
          <li>Shopify — paste in the theme.liquid file</li>
          <li>Any static HTML website</li>
        </ul>
      </div>

      <div className="mt-6 bg-white border border-[#E5E7EB] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#374151] mb-1">Your tenant ID</h3>
        <p className="text-xs text-[#9CA3AF] mb-2">
          Use this to call the API directly or test via curl.
        </p>
        <code className="text-xs bg-[#F3F4F6] px-3 py-2 rounded-lg block font-mono text-[#374151] break-all">
          {tenant?.id}
        </code>
        <p className="text-xs text-[#9CA3AF] mt-3">
          Test endpoint:{' '}
          <code className="bg-[#F3F4F6] px-1 rounded">
            POST {apiUrl}/frontdesk/{tenant?.id}/chat
          </code>{' '}
          with <code className="bg-[#F3F4F6] px-1 rounded">{`{"session_id":"test","message":"hello"}`}</code>
        </p>
      </div>
    </main>
  )
}
