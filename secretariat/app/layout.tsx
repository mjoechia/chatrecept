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
        {children}
      </body>
    </html>
  )
}
