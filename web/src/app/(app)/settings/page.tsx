'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/stores/app'
import { useAuth } from '@/lib/stores/auth'
import { api } from '@/lib/api/client'

export default function SettingsPage() {
  const { loading } = useApp()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'users' | 'system'>('profile')

  const tabs = [
    { id: 'profile' as const, label: 'โปรไฟล์' },
    { id: 'users' as const, label: 'จัดการผู้ใช้' },
    { id: 'system' as const, label: 'ระบบ' },
  ]

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-slate-800 shrink-0">
        <h1 className="text-xl font-semibold text-white">ตั้งค่า</h1>
        <p className="text-sm text-slate-500 mt-0.5">จัดการโปรไฟล์ ผู้ใช้ และระบบ</p>
      </header>

      <div className="px-6 pt-3 border-b border-slate-800 shrink-0">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                activeTab === t.id
                  ? 'bg-slate-900 text-amber-400 border border-slate-800 border-b-0'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === 'profile' && <ProfileTab user={user} />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'system' && <SystemTab />}
      </div>
    </div>
  )
}

function ProfileTab({ user }: { user: any }) {
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.users.updateAvatar(avatarUrl)
      setMessage('บันทึกรูปโปรไฟล์สำเร็จ ✅')
    } catch (e: any) {
      setMessage(`เกิดข้อผิดพลาด: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-300">รูปโปรไฟล์</h2>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-xl font-medium text-slate-300 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0) || '?'
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://... หรือ data:image/...;base64,..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-slate-500">
              ใส่ URL รูป (https://...) หรือ base64 data URL (data:image/...;base64,...) — ขนาดไม่เกิน ~2MB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-4 py-2 text-sm font-medium text-slate-950 transition-colors"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกรูปโปรไฟล์'}
          </button>
          {message && (
            <span className={`text-sm ${message.includes('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
              {message}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-300">ข้อมูลส่วนตัว</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">ชื่อ:</span>
            <span className="text-slate-200 ml-2">{user?.name || '—'}</span>
          </div>
          <div>
            <span className="text-slate-500">อีเมล:</span>
            <span className="text-slate-200 ml-2">{user?.email || '—'}</span>
          </div>
          <div>
            <span className="text-slate-500">สิทธิ์:</span>
            <span className="text-slate-200 ml-2">{user?.role || '—'}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await api.users.list()
      setUsers(data as any[])
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300">จัดการผู้ใช้</h2>
        <button
          onClick={loadUsers}
          className="text-xs text-amber-400 hover:text-amber-300"
        >
          รีเฟรช
        </button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs">
                <th className="text-left px-4 py-3">ชื่อ</th>
                <th className="text-left px-4 py-3">อีเมล</th>
                <th className="text-left px-4 py-3">สิทธิ์</th>
                <th className="text-left px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-200">{u.name}</td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SystemTab() {
  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-3">ข้อมูลระบบ</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">เวอร์ชัน</span>
            <span className="text-slate-200">MNG ERP v2</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Frontend</span>
            <span className="text-slate-200">Next.js 16 + React + TypeScript</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Backend</span>
            <span className="text-slate-200">Express 5 + MariaDB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Database</span>
            <span className="text-slate-200">pacific_mng + pacific_mngworks</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center gap-3 text-slate-500 text-sm">
      <span className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      กำลังโหลดข้อมูล…
    </div>
  )
}
