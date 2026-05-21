'use client'

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import SignupForm from '@/components/SignupForm'

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f3f6ff] px-6 py-12">
      <div className="w-full max-w-md bg-white border border-[#dde8f5] rounded-2xl p-8 shadow-sm">
        <Suspense>
          <SignupForm />
        </Suspense>
      </div>
    </main>
  )
}
