'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/stores/auth'

export default function HomePage() {
  const { bootstrapped, isAuthenticated, bootstrap } = useAuth()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!bootstrapped) return
    // static export: ใช้ window.location.replace เพื่อเปลี่ยนหน้าโดยไม่ค้าง spinner
    window.location.replace(isAuthenticated ? '/dashboard/' : '/login/')
  }, [bootstrapped, isAuthenticated])

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted text-sm">
        <span className="w-4 h-4 border-2 border-line-2 border-t-violet rounded-full animate-spin" />
        กำลังตรวจสอบสถานะ…
      </div>
    </main>
  )
}
