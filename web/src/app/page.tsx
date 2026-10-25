'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/stores/auth'

export default function HomePage() {
  const router = useRouter()
  const { bootstrapped, isAuthenticated, bootstrap } = useAuth()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!bootstrapped) return
    router.replace(isAuthenticated ? '/dashboard/' : '/login/')
  }, [bootstrapped, isAuthenticated, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">กำลังเข้าสู่ระบบ MNG ERP…</p>
      </div>
    </div>
  )
}
