import type { Metadata } from 'next'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ChatRecept Secretariat',
  description: 'ACRA Form 45 — Consent to Act as Director',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f3f6ff] text-[#12304f] antialiased">
        <div className="bg-white border-b border-[#dde8f5] px-6 py-3 flex items-center gap-3">
          <a href="https://chatrecept.chat/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <img src="/chatrecept.png" alt="ChatRecept" className="h-6 w-6 object-contain" />
            <span className="text-[#006092] font-bold text-sm tracking-wide">ChatRecept</span>
          </a>
          <span className="text-[#dde8f5] font-light text-lg select-none">/</span>
          <span className="text-[#425d7f] font-semibold text-sm">Secretariat</span>
        </div>
        {children}
      </body>
    </html>
  )
}
