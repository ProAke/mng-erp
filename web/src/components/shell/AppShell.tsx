'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  ExternalLink,
  Menu,
  RefreshCw,
  Search,
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckSquare,
  FolderKanban,
  Building2,
  Receipt,
  Megaphone,
  Database,
  Bot,
  Clock,
  X,
  Edit3,
} from 'lucide-react'
import { api, type HealthInfo } from '@/lib/api/client'
import { canManage, useAuth } from '@/lib/stores/auth'
import {
  useAiAgents,
  useApp,
  useClients,
  useEvents,
  useInvoices,
  useProjects,
  useSettingsData,
  useTasks,
  useTeam,
} from '@/lib/stores/app'
import { Sidebar } from './Sidebar'
import { daysLeft, fmtDateThai, PRESENCE_META, todayStr } from '@/lib/erp-helpers'

const DOW_FULL_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped, isAuthenticated, bootstrap } = useAuth()
  const { load, refresh, loading } = useApp()
  const tasks = useTasks()
  const projects = useProjects()
  const events = useEvents()
  const clients = useClients()
  const invoices = useInvoices()
  const team = useTeam()
  const aiAgents = useAiAgents()
  const settings = useSettingsData()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [presenceOpen, setPresenceOpen] = useState(false)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [hideAnnounce, setHideAnnounce] = useState(false)
  const [editingAnnounce, setEditingAnnounce] = useState(false)
  const [announceDraft, setAnnounceDraft] = useState('')
  const [hideDock, setHideDock] = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const presenceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!bootstrapped) return
    if (!isAuthenticated) {
      // static export: ใช้ window.location.replace เพื่อให้เปลี่ยนหน้าแน่นอน
      window.location.replace('/login/')
      return
    }
    load()
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [bootstrapped, isAuthenticated, load])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (presenceRef.current && !presenceRef.current.contains(e.target as Node)) setPresenceOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const myMember = useMemo(
    () => team.find((m) => m.email && m.email === user?.email) ?? team.find((m) => m.me),
    [team, user?.email]
  )
  const myPresence = PRESENCE_META[myMember?.state ?? 'online'] ?? PRESENCE_META.online

  async function onChangePresence(nextState: 'online' | 'working' | 'focus' | 'away') {
    setPresenceOpen(false)
    try {
      await api.me.setState(nextState)
      await refresh()
    } catch {
      /* ignore */
    }
  }

  async function onSaveAnnounce() {
    setEditingAnnounce(false)
    try {
      await api.settings.save({ announce: announceDraft.trim() })
      await refresh()
    } catch {
      /* ignore */
    }
  }

  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return []
    const hits: { type: string; title: string; sub: string; href: string }[] = []
    for (const p of projects) {
      if (
        p.name.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q)
      ) {
        hits.push({
          type: 'project',
          title: `[${p.code ?? p.id}] ${p.name}`,
          sub: `โปรเจกต์ · ${p.clientName || p.client}`,
          href: `/projects/detail/?id=${p.id}`,
        })
      }
    }
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) {
        hits.push({ type: 'task', title: `${t.code} — ${t.title}`, sub: 'งาน', href: `/tasks/?q=${encodeURIComponent(t.code)}` })
      }
    }
    for (const ev of events) {
      if (ev.title.toLowerCase().includes(q) || ev.loc.toLowerCase().includes(q)) {
        hits.push({ type: 'event', title: ev.title, sub: `กิจกรรม · ${fmtDateThai(ev.date)}`, href: '/calendar/' })
      }
    }
    for (const c of clients) {
      if (c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q)) {
        hits.push({ type: 'client', title: c.name, sub: `ลูกค้า · ${c.contact || c.phone}`, href: '/clients/' })
      }
    }
    return hits.slice(0, 10)
  }, [searchQ, projects, tasks, events, clients])

  const today = todayStr()
  const todayStats = useMemo(() => {
    const todayEvents = events.filter((e) => e.date?.slice(0, 10) === today).length
    const urgentOpen = tasks.filter(
      (t) => t.status !== 'done' && (t.priority === 'urgent' || t.blocked || (t.due && (daysLeft(t.due) ?? 9) <= 1))
    ).length
    const workingAi = aiAgents.filter((a) => !a.paused && (a.state === 'working' || a.state === 'online')).length
    return { todayEvents, urgentOpen, workingAi }
  }, [events, tasks, aiAgents, today])

  const notifications = useMemo(() => {
    const items: { id: string; tone: 'danger' | 'warn' | 'info'; title: string; sub: string; href: string }[] = []
    for (const t of tasks) {
      if (t.status === 'done') continue
      if (t.blocked) {
        items.push({
          id: `blk-${t.id}`,
          tone: 'danger',
          title: `🚩 งานติดปัญหา (Blocked): ${t.title}`,
          sub: `${t.code}${t.blockReason ? ` · ${t.blockReason}` : ''}`,
          href: `/tasks/?q=${encodeURIComponent(t.code)}`,
        })
      }
      if (!t.due) continue
      const dl = daysLeft(t.due)
      if (dl !== null && dl < 0) {
        items.push({
          id: `od-${t.id}`,
          tone: 'danger',
          title: `งานเลยกำหนด ${-dl} วัน: ${t.title}`,
          sub: `${t.code} · ครบกำหนด ${fmtDateThai(t.due)}`,
          href: `/tasks/?q=${encodeURIComponent(t.code)}`,
        })
      } else if (dl === 0) {
        items.push({
          id: `td-${t.id}`,
          tone: 'warn',
          title: `ครบกำหนดส่งวันนี้: ${t.title}`,
          sub: t.code,
          href: `/tasks/?q=${encodeURIComponent(t.code)}`,
        })
      }
    }
    for (const inv of invoices) {
      if (inv.status === 'overdue') {
        items.push({
          id: `inv-${inv.id}`,
          tone: 'danger',
          title: `ใบแจ้งหนี้เกินกำหนดชำระ: ${inv.no}`,
          sub: inv.title,
          href: '/finance/',
        })
      }
    }
    for (const ev of events) {
      if (ev.date?.slice(0, 10) === today) {
        items.push({
          id: `ev-${ev.id}`,
          tone: 'info',
          title: `นัดหมายวันนี้: ${ev.title}`,
          sub: ev.allday ? 'ทั้งวัน' : `${ev.start ?? ''} - ${ev.end ?? ''}`,
          href: '/calendar/',
        })
      }
    }
    return items.slice(0, 14)
  }, [tasks, invoices, events, today])

  if (!bootstrapped || !isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted text-sm">
          <span className="w-4 h-4 border-2 border-line-2 border-t-violet rounded-full animate-spin" />
          กำลังตรวจสอบสถานะ…
        </div>
      </main>
    )
  }

  const announceText = (settings.announce as string | undefined) ?? ''
  const dowName = DOW_FULL_TH[new Date().getDay()]

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col pb-16">
        {/* Company Announcement Banner (Category 7) */}
        {!hideAnnounce && (announceText || editingAnnounce) && (
          <div className="bg-violet-soft border-b border-violet/20 px-4 lg:px-8 py-2 flex items-center justify-between gap-3 text-xs no-print">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Megaphone className="w-4 h-4 text-violet shrink-0" />
              {editingAnnounce ? (
                <div className="flex items-center gap-2 flex-1 max-w-2xl">
                  <input
                    value={announceDraft}
                    onChange={(e) => setAnnounceDraft(e.target.value)}
                    placeholder="พิมพ์ประกาศเป้าหมายประจำสัปดาห์..."
                    className="flex-1 rounded bg-card border border-violet/40 px-2.5 py-1 text-xs text-ink"
                  />
                  <button
                    type="button"
                    onClick={onSaveAnnounce}
                    className="rounded bg-violet px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAnnounce(false)}
                    className="text-muted hover:text-ink px-1 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <span className="text-ink truncate font-medium">{announceText}</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canManage(user?.role) && !editingAnnounce && (
                <button
                  type="button"
                  onClick={() => {
                    setAnnounceDraft(announceText)
                    setEditingAnnounce(true)
                  }}
                  className="text-violet hover:text-violet-2 p-1 cursor-pointer"
                  title="แก้ไขประกาศ"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setHideAnnounce(true)}
                className="text-muted hover:text-ink p-1 cursor-pointer"
                title="ซ่อนแถบประกาศ"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Top Utility Header */}
        <header className="sticky top-0 z-30 border-b border-line bg-card/90 backdrop-blur px-4 lg:px-8 py-3 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-2 text-ink-2 hover:bg-tint-1"
              aria-label="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div ref={searchRef} className="relative flex-1">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQ}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearchQ(e.target.value)
                  setSearchFocused(true)
                }}
                placeholder="ค้นหางาน, รหัสโปรเจกต์, ลูกค้า, กิจกรรม…"
                className="w-full rounded-lg bg-bg-2 border border-line-2 pl-9 pr-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-violet"
              />
              {searchFocused && searchQ.trim() && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-line bg-card shadow-soft overflow-hidden z-40">
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted">ไม่พบผลลัพธ์สำหรับ “{searchQ}”</div>
                  ) : (
                    searchResults.map((hit, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSearchFocused(false)
                          setSearchQ('')
                          window.location.href = hit.href
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-tint-1 border-b border-line last:border-0"
                      >
                        {hit.type === 'project' && <FolderKanban className="w-4 h-4 text-violet shrink-0" />}
                        {hit.type === 'task' && <CheckSquare className="w-4 h-4 text-blue shrink-0" />}
                        {hit.type === 'event' && <CalendarIcon className="w-4 h-4 text-pink shrink-0" />}
                        {hit.type === 'client' && <Building2 className="w-4 h-4 text-mint shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink truncate">{hit.title}</div>
                          <div className="text-[11px] text-muted truncate">{hit.sub}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Database Live Health Pill (Category 7) */}
            {health && (
              <span
                title={`MariaDB Connected (Auth: ${health.auth ? 'OK' : 'ERR'}, Work: ${health.work ? 'OK' : 'ERR'})`}
                className={`hidden xl:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  health.ok && health.work
                    ? 'border-mint/30 bg-mint-soft text-mint'
                    : 'border-red/30 bg-red-soft text-red'
                }`}
              >
                <Database className="w-3 h-3" />
                MariaDB {health.latencyMs ? `${health.latencyMs}ms` : 'OK'}
              </span>
            )}

            {/* Live Presence Switcher (Category 5) */}
            <div ref={presenceRef} className="relative">
              <button
                type="button"
                onClick={() => setPresenceOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${myPresence.badge}`}
                title="เปลี่ยนสถานะการทำงานสดของคุณ"
              >
                <span>{myPresence.icon}</span>
                <span className="hidden sm:inline">{myPresence.label}</span>
              </button>

              {presenceOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-card shadow-soft overflow-hidden z-40 p-1">
                  {(Object.entries(PRESENCE_META) as [
                    'online' | 'working' | 'focus' | 'away',
                    (typeof PRESENCE_META)['online'],
                  ][]).map(([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onChangePresence(key)}
                      className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-ink hover:bg-tint-1 text-left cursor-pointer"
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                refresh()
                api.health().then(setHealth).catch(() => {})
              }}
              title="รีเฟรชข้อมูลล่าสุด"
              className="rounded-lg border border-line bg-card p-2 text-ink-2 hover:bg-tint-1 hover:text-ink transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet' : ''}`} />
            </button>

            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                title="การแจ้งเตือน"
                className="relative rounded-lg border border-line bg-card p-2 text-ink-2 hover:bg-tint-1 hover:text-ink transition cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red px-1 text-[10px] font-bold text-white flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-line bg-card shadow-soft overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">การแจ้งเตือนสำคัญ</span>
                    <span className="text-xs text-muted">{notifications.length} รายการ</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-line">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-muted">ไม่มีรายการค้างเร่งด่วนในขณะนี้</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false)
                            window.location.href = n.href
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-tint-1 flex items-start gap-3"
                        >
                          {n.tone === 'danger' ? (
                            <AlertTriangle className="w-4 h-4 text-red shrink-0 mt-0.5" />
                          ) : n.tone === 'warn' ? (
                            <Receipt className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                          ) : (
                            <CalendarIcon className="w-4 h-4 text-blue shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-ink">{n.title}</div>
                            <div className="text-[11px] text-muted mt-0.5">{n.sub}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <a
              href="/hub"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-tint-1 hover:text-violet transition"
            >
              MNG Hub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>

        {/* Floating Today Bar — Agency OS Quick Dock (Category 7) */}
        {!hideDock && (
          <div className="fixed bottom-3 left-1/2 lg:left-[calc(50%+8rem)] -translate-x-1/2 z-30 max-w-[95vw] no-print">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line-2 bg-card/95 backdrop-blur-md px-4 py-2.5 shadow-soft text-xs">
              <span className="font-semibold text-ink flex items-center gap-1.5">
                📅 วันนี้ · {dowName} {fmtDateThai(today, true)}
              </span>
              <span className="hidden md:inline text-line-2">|</span>
              <span className="hidden sm:inline text-ink-2">
                นัดหมาย <strong className="text-blue-2">{todayStats.todayEvents}</strong> · งานด่วน{' '}
                <strong className="text-red">{todayStats.urgentOpen}</strong> · AI พร้อมทำงาน{' '}
                <strong className="text-mint">{todayStats.workingAi}</strong> ตัว
              </span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Link
                  href="/hr"
                  className="inline-flex items-center gap-1 rounded-lg bg-mint-soft border border-mint/20 px-2.5 py-1 text-mint hover:opacity-90 font-medium"
                >
                  <Clock className="w-3.5 h-3.5" /> ลงเวลา
                </Link>
                <Link
                  href="/ai"
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-soft border border-violet/20 px-2.5 py-1 text-violet hover:opacity-90 font-medium"
                >
                  <Bot className="w-3.5 h-3.5" /> AI
                </Link>
                <Link
                  href="/calendar"
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-white font-semibold"
                  style={{ background: 'var(--grad-violet)' }}
                >
                  เปิดปฏิทิน
                </Link>
                <button
                  type="button"
                  onClick={() => setHideDock(true)}
                  className="text-muted hover:text-ink p-1 cursor-pointer"
                  title="ซ่อนแถบด้านล่าง"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
