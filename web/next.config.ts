import type { NextConfig } from 'next'

const API_TARGET = process.env.API_TARGET || 'https://mng.uarea.in'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async rewrites() {
    // proxy /api/* ไป Express backend (dev ใช้ตัวนี้แทน CORS)
    return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }]
  },
}

export default nextConfig
