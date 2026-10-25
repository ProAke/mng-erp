// components/shell/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth, isAdmin } from '@/lib/stores/auth'

const NAV = [
  { href: '/dashboard', label: 'แดชบอร์ด', icon: '▦' },
  { href: '/calendar', label: 'ปฏิทิน', icon: '▤' },
  { href: '/tasks', label: 'งาน', icon: '☑' },
  { href: '/projects', label: 'โปรเจกต์', icon: '▣' },
  { href: '/finance', label: 'การเงิน', icon: '฿' },
  { href: '/team', label: 'ทีม', icon: '◉' },
  { href: '/clients', label: 'ลูกค้า', icon: '◈' },
  { href: '/reports', label: 'รายงาน', icon: '◫' },
  { href: '/settings', label: 'ตั้งค่า', icon: '⚙' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  async function handleLogout() {
    await logout()
    // hard navigate + cache-bust — กัน browser ย้อนกลับ (back) เข้าหน้าที่เคยเข้าถึง
    // ใช้ location.replace แทน assign เพื่อไม่ทิ้ง history entry ของหน้าที่ต้อง auth
    const bust = Date.now()
    window.location.replace(`/login/?_t=${bust}`)
  }

  return (
    <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col min-h-screen">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 font-bold text-sm">
            M
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">MNG ERP</div>
            <div className="text-[11px] text-slate-500 leading-tight">Work Tracking</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span className="w-5 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-2.5 px-1 mb-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-300 overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0) || '?'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-200 truncate">{user?.name || 'ผู้ใช้'}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {user?.role ? roleLabel(user.role) : ''}
            </div>
          </div>
        </div>
        {user && isAdmin(user.role) && (
          <Link
            href="/settings"
            className="block rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 mb-1"
          >
            จัดการผู้ใช้ (Admin)
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="w-full rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10 text-left transition-colors"
        >
          ออกจากระบบ
        </button>
      </div>
    </aside>
  )
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    super_admin: 'ผู้ดูแลระบบสูงสุด',
    admin: 'ผู้ดูแลระบบ',
    member: 'สมาชิก',
  }
  return map[role] || role
}
