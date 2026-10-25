'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Calendar as CalendarIcon,
  Plus,
  ArrowUpRight,
  Clock,
  Bot,
  Sparkles,
  Ban,
} from 'lucide-react'
import { useAuth } from '@/lib/stores/auth'
import {
  useActivity,
  useAiAgents,
  useAiRuns,
  useClients,
  useEvents,
  useHumanTeam,
  useInvoices,
  useProjects,
  useTasks,
  useTeam,
  useTrend,
} from '@/lib/stores/app'
import { BarChart, DonutChart, LineTrendChart } from '@/components/ui/Charts'
import {
  addDays,
  daysLeft,
  DEFAULT_EVENT_CATS,
  fmtDateThai,
  initials,
  money,
  moneyK,
  MONTHS_SHORT_TH,
  PRESENCE_META,
  relDayLabel,
  resolveClientName,
  stripHtml,
  TASK_PRIO_META,
  todayStr,
  WEEKDAYS_TH,
} from '@/lib/erp-helpers'

export default function DashboardPage() {
  const { user } = useAuth()
  const projects = useProjects()
  const tasks = useTasks()
  const invoices = useInvoices()
  const events = useEvents()
  const activity = useActivity()
  const team = useTeam()
  const humans = useHumanTeam()
  const aiAgents = useAiAgents()
  const aiRuns = useAiRuns()
  const clients = useClients()
  const trend = useTrend()
  const [trendMode, setTrendMode] = useState<'work' | 'revenue'>('work')

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').length
    const done = tasks.length - open
    const blockedCount = tasks.filter((t) => t.blocked && t.status !== 'done').length
    const overdue = tasks.filter((t) => {
      if (t.status === 'done' || !t.due) return false
      const dl = daysLeft(t.due)
      return dl !== null && dl < 0
    }).length
    const dueSoon = tasks.filter((t) => {
      if (t.status === 'done' || !t.due) return false
      const dl = daysLeft(t.due)
      return dl !== null && dl >= 0 && dl <= 7
    }).length
    const paidTotal = invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + i.amount + i.vat, 0)
    const pendingTotal = invoices
      .filter((i) => i.status === 'pending' || i.status === 'overdue')
      .reduce((s, i) => s + i.amount + i.vat, 0)
    const activeAi = aiAgents.filter((a) => !a.paused).length
    const tokensToday = aiAgents.reduce((s, a) => s + (a.tokensToday ?? 0), 0)
    return {
      open,
      done,
      blockedCount,
      overdue,
      dueSoon,
      paidTotal,
      pendingTotal,
      activeAi,
      tokensToday,
    }
  }, [tasks, invoices, aiAgents])

  // 7-Day Agency Week Strip
  const weekStrip = useMemo(() => {
    const start = todayStr()
    return Array.from({ length: 7 }, (_, idx) => {
      const iso = addDays(start, idx)
      const d = new Date(iso + 'T00:00:00')
      const dayEvents = events.filter((e) => e.date === iso).length
      const dayDue = tasks.filter((t) => t.status !== 'done' && t.due === iso).length
      return {
        iso,
        dow: WEEKDAYS_TH[d.getDay()],
        dayNum: d.getDate(),
        events: dayEvents,
        due: dayDue,
        isToday: idx === 0,
      }
    })
  }, [events, tasks])

  const statusSegments = useMemo(
    () => [
      { label: 'เสร็จแล้ว', value: tasks.filter((t) => t.status === 'done').length, color: '#34d399' },
      { label: 'กำลังทำ', value: tasks.filter((t) => t.status === 'doing').length, color: '#38bdf8' },
      { label: 'ตรวจแก้', value: tasks.filter((t) => t.status === 'review').length, color: '#fbbf24' },
      { label: 'รอดำเนินการ', value: tasks.filter((t) => t.status === 'todo').length, color: '#64748b' },
    ],
    [tasks]
  )

  const urgentTasks = useMemo(() => {
    const rank: Record<string, number> = { urgent: 0, high: 1, med: 2, low: 3 }
    return tasks
      .filter((t) => t.status !== 'done')
      .slice()
      .sort((a, b) => {
        if (Boolean(a.blocked) !== Boolean(b.blocked)) return a.blocked ? -1 : 1
        const ra = rank[a.priority] ?? 9
        const rb = rank[b.priority] ?? 9
        if (ra !== rb) return ra - rb
        return (a.due ?? '9999').localeCompare(b.due ?? '9999')
      })
      .slice(0, 6)
  }, [tasks])

  const upcomingEvents = useMemo(() => {
    const today = todayStr()
    return events
      .filter((e) => e.date >= today)
      .slice()
      .sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')))
      .slice(0, 5)
  }, [events])

  const kpis = [
    {
      label: 'โปรเจกต์กำลังดำเนิน',
      val: projects.length,
      sub: `งานเปิดอยู่รวม ${stats.open} งาน`,
      icon: FolderKanban,
      color: 'text-violet bg-violet-soft',
      href: '/projects',
    },
    {
      label: 'ความสำเร็จของงาน',
      val: tasks.length ? `${Math.round((stats.done / tasks.length) * 100)}%` : '0%',
      sub: `เสร็จแล้ว ${stats.done} จาก ${tasks.length} งาน`,
      icon: CheckCircle2,
      color: 'text-mint bg-mint-soft',
      href: '/tasks',
    },
    {
      label: 'เลยกำหนด / ติดบล็อก',
      val: `${stats.overdue} / ${stats.blockedCount}`,
      sub: `ครบกำหนดใน 7 วันอีก ${stats.dueSoon} งาน`,
      icon: AlertTriangle,
      color: 'text-red bg-red-soft',
      href: '/tasks',
    },
    {
      label: 'AI Workforce ออนไลน์',
      val: `${stats.activeAi}/${aiAgents.length}`,
      sub: `${stats.tokensToday.toLocaleString()} tokens วันนี้ · รายรับ ${moneyK(stats.paidTotal)}`,
      icon: Bot,
      color: 'text-violet bg-violet-soft',
      href: '/ai',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">สวัสดี, {user?.name ?? 'ผู้ใช้งาน'} 👋</h1>
          <p className="text-sm text-muted mt-1">
            ศูนย์ปฏิบัติการ MNG Agency OS — ปฏิทิน · งาน · ทีมงาน & AI Workforce แบบเรียลไทม์
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/ai"
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet/30 bg-violet-soft px-3.5 py-2 text-xs font-medium text-violet hover:bg-violet-soft transition"
          >
            <Bot className="w-4 h-4 text-violet" /> AI Workforce
          </Link>
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-2 text-xs font-medium text-ink hover:bg-tint-1 transition"
          >
            <CalendarIcon className="w-4 h-4 text-violet" /> ปฏิทินงาน
          </Link>
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> สร้างงานใหม่
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <Link
              key={k.label}
              href={k.href}
              className="group bg-card border border-line hover:border-line-2 rounded-xl p-5 flex items-start justify-between transition"
            >
              <div>
                <div className="text-xs text-muted">{k.label}</div>
                <div className="text-2xl font-bold text-ink mt-1.5 tabular-nums">{k.val}</div>
                <div className="text-xs text-muted mt-1">{k.sub}</div>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${k.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* 7-Day Agency Week Strip */}
      <section className="rounded-xl border border-line bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-ink-2">ภาพรวมตารางงาน 7 วันข้างหน้า</div>
          <Link href="/calendar" className="text-xs text-violet hover:text-violet">
            ดูปฏิทินเต็ม →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {weekStrip.map((d) => (
            <Link
              key={d.iso}
              href="/calendar"
              className={`rounded-xl border p-3 transition ${
                d.isToday
                  ? 'border-violet/30 bg-violet-soft'
                  : 'border-line bg-bg-2 hover:border-line-2'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className={d.isToday ? 'text-violet font-bold' : 'text-muted'}>
                  {d.isToday ? 'วันนี้' : d.dow}
                </span>
                <span className="text-sm font-bold text-ink tabular-nums">{d.dayNum}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="rounded bg-blue-soft px-1.5 py-0.5 text-blue-2">
                  นัด {d.events}
                </span>
                <span className="rounded bg-violet-soft px-1.5 py-0.5 text-violet">
                  ส่งงาน {d.due}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Live Team Presence & AI Workforce Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-card border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-ink">สถานะสด & ภาระงานทีม (Team Live Load)</h2>
              <p className="text-xs text-muted">ชั่วโมงงานคงเหลือเทียบความจุรายสัปดาห์ของสมาชิกแต่ละคน</p>
            </div>
            <Link href="/team" className="text-xs text-violet hover:text-violet">
              จัดการทีม →
            </Link>
          </div>

          <div className="space-y-3">
            {humans.slice(0, 6).map((m) => {
              const pMeta = PRESENCE_META[m.state || 'online'] ?? PRESENCE_META.online
              const loadPct = m.capacity
                ? Math.min(100, Math.round(((m.load ?? 0) / m.capacity) * 100))
                : 0
              const barColor =
                loadPct >= 85 ? '#fb7185' : loadPct >= 60 ? '#fbbf24' : '#34d399'
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: m.color || '#6C5CE7' }}
                    >
                      {initials(m.name)}
                    </div>
                    <span
                      className="w-2.5 h-2.5 rounded-full border-2 border-card absolute -bottom-0.5 -right-0.5"
                      style={{ backgroundColor: pMeta.dot }}
                      title={pMeta.label}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-ink truncate">
                        {m.nickname ? `${m.nickname} · ${m.name}` : m.name}
                        <span className="ml-2 text-[11px] text-muted">{pMeta.label}</span>
                      </span>
                      <span className="text-ink-2 tabular-nums shrink-0">
                        {m.load ?? 0}/{m.capacity ?? 40} ชม. ({loadPct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-tint-1 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${loadPct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="lg:col-span-5 bg-card border border-line rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet" />
                <h2 className="font-semibold text-ink">AI Workforce ล่าสุด</h2>
              </div>
              <Link href="/ai" className="text-xs text-violet hover:text-violet">
                สั่งงาน AI →
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {aiAgents.map((ag) => (
                <Link
                  key={ag.id}
                  href="/ai"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    ag.paused
                      ? 'border-line bg-bg-2 text-muted'
                      : 'border-violet/30 bg-violet-soft text-violet'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: ag.paused ? '#64748b' : ag.color }}
                  />
                  <span className="font-semibold">{ag.name}</span>
                  <span className="text-[10px] text-muted">{ag.successRate ?? 98}%</span>
                </Link>
              ))}
            </div>

            <div className="space-y-2">
              {aiRuns.slice(0, 3).map((r) => {
                const ag = aiAgents.find((a) => a.id === r.agentId)
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between text-ink-2">
                      <span className="font-semibold text-violet">
                        🤖 {ag?.name ?? r.agentId} · {r.action}
                      </span>
                      <span className="text-[10px] text-muted">{r.tokens} tok</span>
                    </div>
                    <div className="text-[11px] text-muted line-clamp-1 mt-0.5">{r.detail}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-muted">
            <span>รายรับที่เก็บแล้ว / ค้างรับ</span>
            <Link href="/finance" className="font-semibold text-mint hover:underline inline-flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> {moneyK(stats.paidTotal)} / {moneyK(stats.pendingTotal)}
            </Link>
          </div>
        </section>
      </div>

      {/* Trend + Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-line rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-ink">แนวโน้มผลงานรายเดือน (ปี 2569)</h2>
              <p className="text-xs text-muted">เปรียบเทียบปริมาณงานที่สร้าง-ปิดงาน และรายรับรายเดือน</p>
            </div>
            <div className="inline-flex rounded-lg bg-bg-2 p-1 border border-line text-xs">
              <button
                type="button"
                onClick={() => setTrendMode('work')}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  trendMode === 'work' ? 'bg-violet text-white shadow-sm font-semibold' : 'text-muted hover:text-ink'
                }`}
              >
                ปริมาณงาน
              </button>
              <button
                type="button"
                onClick={() => setTrendMode('revenue')}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  trendMode === 'revenue' ? 'bg-violet text-white shadow-sm font-semibold' : 'text-muted hover:text-ink'
                }`}
              >
                รายรับ (พันบาท)
              </button>
            </div>
          </div>

          {trendMode === 'work' ? (
            <LineTrendChart
              labels={trend?.months ?? MONTHS_SHORT_TH}
              series={[
                { name: 'งานสร้างใหม่', color: '#38bdf8', data: trend?.created ?? Array(12).fill(0) },
                { name: 'งานเสร็จสมบูรณ์', color: '#34d399', data: trend?.completed ?? Array(12).fill(0) },
              ]}
            />
          ) : (
            <BarChart
              labels={trend?.months ?? MONTHS_SHORT_TH}
              values={trend?.revenue ?? Array(12).fill(0)}
              color="#f59e0b"
              unit="k"
            />
          )}
        </section>

        <section className="bg-card border border-line rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-ink">สัดส่วนสถานะงาน</h2>
              <Link href="/reports" className="text-xs text-violet hover:text-violet inline-flex items-center gap-1">
                รายงานเต็ม <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <DonutChart
              segments={statusSegments}
              centerLabel={String(tasks.length)}
              centerSub="งานทั้งหมด"
            />
          </div>
          <div className="mt-5 pt-4 border-t border-line flex items-center justify-between text-xs text-muted">
            <span>งบประมาณโปรเจกต์รวม</span>
            <span className="font-semibold text-ink">
              {money(projects.reduce((s, p) => s + p.budget, 0))}
            </span>
          </div>
        </section>
      </div>

      {/* Featured Projects + Urgent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">โปรเจกต์หลักที่กำลังดำเนินการ</h2>
            <Link href="/projects" className="text-xs text-violet hover:text-violet inline-flex items-center gap-1">
              ดูทั้งหมด ({projects.length}) <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {projects.slice(0, 6).map((p) => {
              const clientLabel = resolveClientName(p, clients)
              const spentPct = p.budget > 0 ? Math.min(100, Math.round((p.spent / p.budget) * 100)) : 0
              const dl = daysLeft(p.end)
              return (
                <Link
                  key={p.id}
                  href={`/projects/detail?id=${p.id}`}
                  className="rounded-xl border border-line bg-bg-2 hover:border-violet/40 p-4 transition block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {p.code && (
                          <span className="rounded bg-tint-1 px-1.5 py-0.5 text-[10px] font-mono text-violet">
                            {p.code}
                          </span>
                        )}
                        <div className="text-sm font-semibold text-ink truncate">
                          <span className="mr-1">{p.icon}</span>
                          {p.name}
                        </div>
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5">{clientLabel}</div>
                    </div>
                    <span className="text-xs font-semibold text-violet shrink-0 tabular-nums">{p.progress}%</span>
                  </div>

                  <div className="mt-3 h-1.5 w-full rounded-full bg-tint-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.progress}%`, backgroundColor: p.color || '#f59e0b' }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                    <span>
                      งานค้าง {p.open}/{p.taskCount}
                      {dl !== null && (
                        <span className={`ml-2 ${dl < 0 ? 'text-red' : 'text-muted'}`}>
                          · {dl < 0 ? `เกิน ${Math.abs(dl)}ว.` : `อีก ${dl}ว.`}
                        </span>
                      )}
                    </span>
                    <span>
                      งบ {moneyK(p.spent)} / {moneyK(p.budget)} ({spentPct}%)
                    </span>
                  </div>
                </Link>
              )
            })}
            {projects.length === 0 && (
              <p className="text-sm text-muted col-span-2 py-6 text-center">ยังไม่มีโปรเจกต์ในระบบ</p>
            )}
          </div>
        </section>

        <section className="bg-card border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">งานด่วน / ติดบล็อก</h2>
            <Link href="/tasks" className="text-xs text-violet hover:text-violet">
              บอร์ดงาน →
            </Link>
          </div>
          <div className="space-y-2.5">
            {urgentTasks.map((t) => {
              const prio = TASK_PRIO_META[t.priority] ?? TASK_PRIO_META.med
              const rel = relDayLabel(t.due)
              const assignee = team.find((m) => m.id === t.assignee)
              return (
                <Link
                  key={t.id}
                  href={`/tasks?q=${encodeURIComponent(t.code)}`}
                  className="block rounded-lg border border-line bg-bg-2 hover:border-line-2 p-3 transition"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-muted">{t.code}</span>
                      {t.blocked && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-red-soft px-1.5 py-0.5 text-[10px] font-semibold text-red">
                          <Ban className="w-2.5 h-2.5" /> ติดบล็อก
                        </span>
                      )}
                      {t.aiGenerated && (
                        <span className="rounded bg-violet-soft px-1.5 py-0.5 text-[10px] text-violet">
                          ✨ AI
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${prio.badge}`}>
                      {prio.label}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-ink line-clamp-1">{t.title}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-muted truncate">
                      {assignee
                        ? `${assignee.kind === 'ai' ? '🤖 ' : ''}${assignee.nickname || assignee.name.split(' ')[0]}`
                        : 'ยังไม่มอบหมาย'}
                    </span>
                    <span
                      className={
                        rel.tone === 'danger'
                          ? 'text-red font-medium'
                          : rel.tone === 'warn'
                          ? 'text-violet'
                          : 'text-muted'
                      }
                    >
                      {rel.text}
                    </span>
                  </div>
                </Link>
              )
            })}
            {urgentTasks.length === 0 && (
              <p className="text-sm text-muted py-6 text-center">ยอดเยี่ยม! ไม่มีงานค้างเร่งด่วน</p>
            )}
          </div>
        </section>
      </div>

      {/* Upcoming Schedule + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">กำหนดการและนัดหมายถัดไป</h2>
            <Link href="/calendar" className="text-xs text-violet hover:text-violet">
              เปิดปฏิทิน →
            </Link>
          </div>
          <div className="space-y-2.5">
            {upcomingEvents.map((ev) => {
              const cat = DEFAULT_EVENT_CATS[ev.cat] ?? { label: ev.cat, color: '#38bdf8' }
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-bg-2 px-3.5 py-2.5"
                >
                  <span className="w-1.5 h-9 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink truncate">{ev.title}</div>
                    <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                      <span>{fmtDateThai(ev.date)}</span>
                      <span>·</span>
                      <span>{ev.allday ? 'ทั้งวัน' : `${ev.start ?? ''} - ${ev.end ?? ''}`}</span>
                      {ev.loc && (
                        <>
                          <span>·</span>
                          <span className="truncate">{ev.loc}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                  >
                    {cat.label}
                  </span>
                </div>
              )
            })}
            {upcomingEvents.length === 0 && (
              <p className="text-sm text-muted py-6 text-center">ยังไม่มีกำหนดการเร็วๆ นี้</p>
            )}
          </div>
        </section>

        <section className="bg-card border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">ความเคลื่อนไหวล่าสุดในระบบ</h2>
            <Clock className="w-4 h-4 text-muted" />
          </div>
          <ul className="space-y-2.5 text-sm max-h-72 overflow-y-auto pr-1">
            {activity
              .slice()
              .reverse()
              .slice(0, 12)
              .map((a, i) => {
                const actor = team.find((m) => m.id === a.u)
                return (
                  <li key={i} className="flex items-start gap-3 py-1.5 border-b border-line last:border-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0 mt-0.5"
                      style={{ backgroundColor: actor?.color ?? '#475569' }}
                    >
                      {actor?.kind === 'ai' ? '🤖' : initials(actor?.name ?? 'M')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-ink">{stripHtml(a.text)}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {actor?.name ? `${actor.nickname || actor.name.split(' ')[0]} · ` : ''}
                        {a.at}
                      </div>
                    </div>
                  </li>
                )
              })}
            {activity.length === 0 && (
              <li className="text-muted text-sm py-6 text-center">ยังไม่มีความเคลื่อนไหว</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
