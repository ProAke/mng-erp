'use client'

import { useApp } from '@/lib/stores/app'

export default function ProjectsPage() {
  const { loading } = useApp()
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-white">โปรเจกต์</h1>
        <p className="text-sm text-slate-500 mt-0.5">กำลังพัฒนา — จัดการโปรเจกต์</p>
      </header>
      <div className="rounded-xl bg-slate-900 border border-slate-800 border-dashed p-10 text-center">
        <p className="text-sm text-slate-500">
          {loading ? 'กำลังโหลดข้อมูล…' : 'หน้านี้ยังอยู่ระหว่างพัฒนา'}
        </p>
      </div>
    </div>
  )
}
