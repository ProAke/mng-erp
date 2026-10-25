'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { useAuth } from '@/lib/stores/auth'
import { useApp } from '@/lib/stores/app'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, bootstrap } = useAuth()
  const { load, loading } = useApp()

  // boot: เช็ค session จาก server (token อยู่ใน localStorage)
  useEffect(() => {
    bootstrap().then((user) => {
      // static export: router.replace อาจไม่ยิง — ใช้ window.location ให้แน่ใจว่าเปลี่ยนหน้า
      if (!user) window.location.replace('/login/')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // โหลดข้อมูลหลัง login สำเร็จ
  useEffect(() => {
    if (isAuthenticated) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <span className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          กำลังตรวจสอบสถานะ…
        </div>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {loading && (
          <div className="px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300">
            กำลังโหลดข้อมูล…
          </div>
        )}
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
