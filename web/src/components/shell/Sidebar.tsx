'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  FolderKanban,
  Bot,
  MessageSquare,
  Clock,
  DoorOpen,
  Receipt,
  Users,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/stores/auth'
import { useAiAgents, useLeaves, useTasks, useTeam } from '@/lib/stores/app'
import { initials, PRESENCE_META, ROLE_META } from '@/lib/erp-helpers'

const NAV_GROUPS = [
  {
    title: 'บริหารงานหลัก',
    items: [
      { href: '/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
      { href: '/calendar', label: 'ปฏิทินงาน', icon: Calendar },
      { href: '/tasks', label: 'งานทั้งหมด', icon: CheckSquare, badgeKey: 'tasks' as const },
      { href: '/projects', label: 'โปรเจกต์', icon: FolderKanban },
    ],
  },
  {
    title: 'Agency OS & AI',
    items: [
      { href: '/ai', label: 'AI Workforce', icon: Bot, badgeKey: 'ai' as const },
      { href: '/chat', label: 'แชททีม & ห้องงาน', icon: MessageSquare },
      { href: '/hr', label: 'ลงเวลา & ลางาน', icon: Clock, badgeKey: 'leaves' as const },
      { href: '/rooms', label: 'จองห้อง & อุปกรณ์', icon: DoorOpen },
    ],
  },
  {
    title: 'ธุรกิจ & ผู้บริหาร',
    items: [
      { href: '/finance', label: 'ใบแจ้งหนี้ & การเงิน', icon: Receipt },
      { href: '/team', label: 'ทีมงาน & ภาระงาน', icon: Users },
      { href: '/clients', label: 'ลูกค้า (CRM)', icon: Building2 },
      { href: '/reports', label: 'รายงานผู้บริหาร', icon: BarChart3 },
      { href: '/settings', label: 'ตั้งค่า & ผู้ใช้', icon: Settings },
    ],
  },
]

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean
  onCloseMobile?: () => void
}) {
  const pathname = usePathname()
  const { user, clear } = useAuth()
  const tasks = useTasks()
  const aiAgents = useAiAgents()
  const leaves = useLeaves()
  const team = useTeam()

  const openTasks = tasks.filter((t) => t.status !== 'done').length
  const activeAi = aiAgents.filter((a) => !a.paused).length
  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length

  const myMember = team.find((m) => m.email && m.email === user?.email) ?? team.find((m) => m.me)
  const presence = PRESENCE_META[myMember?.state ?? 'online'] ?? PRESENCE_META.online

  async function onLogout() {
    try {
      await api.auth.logout()
    } catch {
      /* ignore network failure */
    }
    clear()
    window.location.replace('/login/?_t=' + Date.now())
  }

  const roleMeta = ROLE_META[user?.role ?? ''] ?? { label: user?.role ?? 'ทีมงาน', badge: '' }

  const content = (
    <aside className="w-64 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-800">
        <Link href="/dashboard" onClick={onCloseMobile} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold flex items-center justify-center shadow shadow-amber-500/20">
            M
          </div>
          <div>
            <div className="font-bold text-white leading-tight">MNG Workspace</div>
            <div className="text-[11px] text-slate-400">ERP · ปฏิทิน · AI Workforce</div>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="ปิดเมนู"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || pathname?.startsWith(item.href + '/')
                const badgeVal =
                  item.badgeKey === 'tasks'
                    ? openTasks
                    : item.badgeKey === 'ai'
                    ? activeAi
                    : item.badgeKey === 'leaves'
                    ? pendingLeaves
                    : 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      active
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {badgeVal > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] tabular-nums ${
                          item.badgeKey === 'ai'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : item.badgeKey === 'leaves'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {badgeVal}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <Link
          href="/settings"
          onClick={onCloseMobile}
          className="flex items-center gap-3 px-2.5 py-2 mb-1.5 rounded-lg hover:bg-slate-800/50 transition"
        >
          <div className="relative shrink-0">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover border border-slate-700"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-300 font-semibold flex items-center justify-center text-sm">
                {initials(user?.name)}
              </div>
            )}
            <span
              className="w-2.5 h-2.5 rounded-full border-2 border-slate-900 absolute -bottom-0.5 -right-0.5"
              style={{ backgroundColor: presence.dot }}
              title={presence.label}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">
              {myMember?.nickname ? `${myMember.nickname} (${user?.name.split(' ')[0]})` : user?.name}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {presence.icon} {presence.label} · {roleMeta.label}
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          ออกจากระบบ
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <div className="hidden lg:block h-screen sticky top-0 no-print">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  )
}
