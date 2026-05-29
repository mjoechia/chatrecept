import type { Metadata } from 'next'
import './globals.css'
import TopBarAuth from './TopBarAuth'
import WelcomeBanner from './WelcomeBanner'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JC CLAWs — AI Territory Intelligence',
  description: 'Map the reachable businesses in any Singapore postal code in 30 seconds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;900&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="bg-[#f3f6ff] text-[#12304f] antialiased min-h-screen">
        <div className="bg-white border-b border-[#dde8f5] px-6 py-3 flex items-center gap-3">
          <a href="https://chatrecept.chat/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <span className="text-[#006092] font-bold text-sm tracking-wide">ChatRecept</span>
          </a>
          <span className="text-[#dde8f5] font-light text-lg select-none">/</span>
          <a href="/" className="text-[#425d7f] font-semibold text-sm hover:text-[#12304f] transition-colors">JC CLAWs</a>
          <span className="text-[#dde8f5] font-light text-lg select-none mx-1">·</span>
          <a href="/about" className="text-[#94afd5] text-sm hover:text-[#425d7f] transition-colors">About</a>
          <div className="ml-auto">
            <TopBarAuth />
          </div>
        </div>
        <WelcomeBanner />
        {children}
      </body>
    </html>
  )
}
