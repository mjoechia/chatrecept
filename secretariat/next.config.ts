import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow pdf-lib to run in Node.js API routes (not Edge)
  serverExternalPackages: ['pdf-lib', '@pdf-lib/fontkit'],
  // Silence workspace root warning (monorepo with multiple lockfiles)
  outputFileTracingRoot: require('path').join(__dirname, '../'),
}

export default nextConfig
