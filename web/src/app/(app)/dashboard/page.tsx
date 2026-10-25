'use client'

import { useApp, useProjects, useTasks, useInvoices, useActivity } from '@/lib/stores/app'
import { useAuth } from '@/lib/stores/auth'

export default function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error } = useApp()
  const projects = useProjects()
  const tasks = useTasks()
  const invoices = useInvoices()
  const activity = useActivity()

  if (loading && !data) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl bg-red-soft border border-red/20 p-4 text-red text-sm">
          ไม่สามารถโหลดข้อมูลได้: {error}
        </div>
      </div>
    )
  }

  const activeTasks = tasks.filter((t: any) => t.status !== 'done')
  const doneTasks = tasks.filter((t: any) => t.status === 'done')
  const unpaid = invoices.filter((i: any) => i.status !== 'paid')
  const totalRevenue = invoices
    .filter((i: any) => i.status === 'paid')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">
          สวัสดี{user?.name ? ` คุณ${user.name}` : ''}
        </h1>
        <p className="text-sm text-muted mt-0.5">ภาพรวมงานทั้งหมดในระบบ</p>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="โปรเจกต์ทั้งหมด" value={projects.length} tone="amber" />
        <StatCard label="งานกำลังทำ" value={activeTasks.length} tone="blue" />
        <StatCard label="งานเสร็จแล้ว" value={doneTasks.length} tone="green" />
        <StatCard label="บิลค้างชำระ" value={unpaid.length} tone="red" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* projects */}
        <div className="rounded-xl bg-card border border-line p-5">
          <h2 className="text-sm font-medium text-ink-2 mb-4">โปรเจกต์ที่กำลังทำ</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีโปรเจกต์</p>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 6).map((p: any) => {
                const progress = Number(p.progress ?? 0)
                return (
                  <div key={p.id} className="flex items-center gap-4">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.color || '#64748b' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-ink truncate">{p.short || p.name}</span>
                        <span className="text-xs text-muted shrink-0">{progress}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-tint-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* activity */}
        <div className="rounded-xl bg-card border border-line p-5">
          <h2 className="text-sm font-medium text-ink-2 mb-4">กิจกรรมล่าสุด</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีกิจกรรม</p>
          ) : (
            <ul className="space-y-2">
              {activity.slice(0, 8).map((a: any, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-muted shrink-0 mt-0.5 w-24 truncate">{a.at}</span>
                  <span className="text-ink-2" dangerouslySetInnerHTML={{ __html: a.text }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* tasks due */}
      <section className="rounded-xl bg-card border border-line p-5">
        <h2 className="text-sm font-medium text-ink-2 mb-4">งานครบกำหนดใกล้ ๆ</h2>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-muted">ไม่มีงานที่ต้องทำ</p>
        ) : (
          <ul className="space-y-2">
            {activeTasks.slice(0, 8).map((t: any) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-bg-2/60 px-3 py-2"
              >
                <span className="text-sm text-ink-2 truncate">{t.title}</span>
                <span className="text-xs text-muted shrink-0">
                  {t.due ? formatDue(t.due) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'green' | 'red' }) {
  const tones: Record<string, string> = {
    amber: 'from-violet-soft to-transparent border-violet/20 text-violet',
    blue: 'from-blue-soft to-transparent border-blue/20 text-blue',
    green: 'from-mint-soft to-transparent border-mint/20 text-mint',
    red: 'from-red-soft to-transparent border-red/20 text-red',
  }
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tones[tone]} border p-4`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-ink-2 mt-1">{label}</div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center gap-3 text-muted text-sm">
      <span className="w-4 h-4 border-2 border-line-2 border-t-violet rounded-full animate-spin" />
      กำลังโหลดข้อมูล…
    </div>
  )
}

function formatDue(due: string) {
  const d = new Date(due)
  if (Number.isNaN(d.getTime())) return due
  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
  if (diff < 0) return `เลยกำหนด ${Math.abs(diff)} วัน`
  if (diff === 0) return 'วันนี้'
  return `อีก ${diff} วัน`
}
