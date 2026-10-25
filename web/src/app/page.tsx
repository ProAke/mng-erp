'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/stores/auth'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, bootstrap } = useAuth()

  useEffect(() => {
    bootstrap().then((user) => {
      if (!user) router.replace('/login')
    })
  }, [])

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-bg-2">
        <div className="flex items-center gap-3 text-muted text-sm">
          <span className="w-4 h-4 border-2 border-line-2 border-t-violet rounded-full animate-spin" />
          กำลังตรวจสอบสถานะ…
        </div>
      </main>
    )
  }

  router.replace('/dashboard')
  return null
}