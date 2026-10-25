'use client'

import { useApp, useProjects, useTasks, useInvoices } from '@/lib/stores/app'
import { useAuth } from '@/lib/stores/auth'

export default function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error } = useApp()
  const projects = useProjects()
  const tasks = useTasks()
  const invoices = useInvoices()

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
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-300 text-sm">
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
        <h1 className="text-xl font-semibold text-white">
          สวัสดี{user?.name ? ` คุณ${user.name}` : ''}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">ภาพรวมงานทั้งหมดในระบบ</p>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="โปรเจกต์ทั้งหมด" value={projects.length} tone="amber" />
        <StatCard label="งานกำลังทำ" value={activeTasks.length} tone="blue" />
        <StatCard label="งานเสร็จแล้ว" value={doneTasks.length} tone="green" />
        <StatCard label="บิลค้างชำระ" value={unpaid.length} tone="red" />
      </section>

      {/* projects */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">โปรเจกต์ที่กำลังทำ</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-600">ยังไม่มีโปรเจกต์</p>
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
                      <span className="text-sm text-slate-200 truncate">{p.short || p.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{progress}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* tasks due */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">งานครบกำหนดใกล้ ๆ</h2>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-slate-600">ไม่มีงานที่ต้องทำ</p>
        ) : (
          <ul className="space-y-2">
            {activeTasks.slice(0, 8).map((t: any) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2"
              >
                <span className="text-sm text-slate-300 truncate">{t.title}</span>
                <span className="text-xs text-slate-500 shrink-0">
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
    amber: 'from-amber-500/15 to-transparent border-amber-500/20 text-amber-300',
    blue: 'from-sky-500/15 to-transparent border-sky-500/20 text-sky-300',
    green: 'from-emerald-500/15 to-transparent border-emerald-500/20 text-emerald-300',
    red: 'from-red-500/15 to-transparent border-red-500/20 text-red-300',
  }
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tones[tone]} border p-4`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
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

function formatDue(due: string) {
  const d = new Date(due)
  if (Number.isNaN(d.getTime())) return due
  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
  if (diff < 0) return `เลยกำหนด ${Math.abs(diff)} วัน`
  if (diff === 0) return 'วันนี้'
  return `อีก ${diff} วัน`
}
