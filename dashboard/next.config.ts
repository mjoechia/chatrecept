import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Backend API URL (Go server on Railway/Render)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  },
}

export default nextConfig
