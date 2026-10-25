import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'
const API_TARGET = process.env.API_TARGET || 'http://localhost:8080'

const nextConfig: NextConfig = {
  ...(isDev ? {} : { output: 'export' }),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  ...(isDev
    ? {
        async rewrites() {
          return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }]
        },
      }
    : {}),
}

export default nextConfig
