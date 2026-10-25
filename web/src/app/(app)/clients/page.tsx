'use client'

import { useApp } from '@/lib/stores/app'

export default function ClientsPage() {
  const { loading } = useApp()
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">ลูกค้า</h1>
        <p className="text-sm text-muted mt-0.5">กำลังพัฒนา — ข้อมูลลูกค้า</p>
      </header>
      <div className="rounded-xl bg-card border border-line border-dashed p-10 text-center">
        <p className="text-sm text-muted">
          {loading ? 'กำลังโหลดข้อมูล…' : 'หน้านี้ยังอยู่ระหว่างพัฒนา'}
        </p>
      </div>
    </div>
  )
}
