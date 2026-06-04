import type { Metadata } from 'next'
import './globals.css'
import TopBarAuth from './TopBarAuth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ChatRecept — Frontdesk Dashboard',
  description: 'Manage your AI frontdesk bot, knowledge base, and inbox.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F5F7FA] text-[#1F2937] antialiased min-h-screen">
        {/* Top navigation bar */}
        <div className="bg-[#1F2937] border-b border-[#374151] px-6 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-[#25D366] font-bold text-base tracking-wide">ChatRecept</span>
            <span className="text-[#6B7280] text-sm font-normal">Frontdesk</span>
          </a>

          <div className="flex-1" />

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-5 text-sm">
            <a href="/knowledge" className="text-[#9CA3AF] hover:text-white transition-colors">Knowledge</a>
            <a href="/inbox"     className="text-[#9CA3AF] hover:text-white transition-colors">Inbox</a>
            <a href="/install"   className="text-[#9CA3AF] hover:text-white transition-colors">Install</a>
            <a href="/billing"   className="text-[#9CA3AF] hover:text-white transition-colors">Billing</a>
            <a href="/settings"  className="text-[#9CA3AF] hover:text-white transition-colors">Settings</a>
          </nav>

          <div className="ml-4">
            <TopBarAuth />
          </div>
        </div>

        {children}
      </body>
    </html>
  )
}
