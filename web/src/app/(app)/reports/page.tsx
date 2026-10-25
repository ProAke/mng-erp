'use client'

import { useMemo } from 'react'
import { Download, FileJson, Printer } from 'lucide-react'
import {
  useApp,
  useClients,
  useInvoices,
  useProjects,
  useTasks,
  useTeam,
  useTrend,
} from '@/lib/stores/app'
import {
  BarChart,
  DonutChart,
  HorizontalBarChart,
  LineTrendChart,
} from '@/components/ui/Charts'
import {
  downloadTextFile,
  money,
  MONTHS_SHORT_TH,
  resolveClientName,
  TASK_PRIO_META,
  TASK_STATUS_META,
  toCsv,
  todayStr,
} from '@/lib/erp-helpers'

export default function ReportsPage() {
  const appData = useApp((s) => s.data)
  const projects = useProjects()
  const tasks = useTasks()
  const invoices = useInvoices()
  const clients = useClients()
  const team = useTeam()
  const trend = useTrend()

  const statusSegments = useMemo(
    () => [
      { label: 'เสร็จแล้ว', value: tasks.filter((t) => t.status === 'done').length, color: '#34d399' },
      { label: 'กำลังทำ', value: tasks.filter((t) => t.status === 'doing').length, color: '#38bdf8' },
      { label: 'ตรวจแก้', value: tasks.filter((t) => t.status === 'review').length, color: '#fbbf24' },
      { label: 'รอดำเนินการ', value: tasks.filter((t) => t.status === 'todo').length, color: '#64748b' },
    ],
    [tasks]
  )

  const workloadItems = useMemo(() => {
    if (trend?.workload?.length) {
      return trend.workload.map(([label, value, color]) => ({ label, value, color }))
    }
    return projects
      .map((p) => ({
        label: p.short,
        value: Math.round(
          tasks
            .filter((t) => t.project === p.id && t.status !== 'done')
            .reduce((s, t) => s + (t.est || 4) * (1 - t.progress / 100), 0)
        ),
        color: p.color || '#f59e0b',
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [trend, projects, tasks])

  function exportTasksCsv() {
    const csv = toCsv(
      ['รหัส', 'ชื่องาน', 'โปรเจกต์', 'สถานะ', 'ความสำคัญ', 'ผู้รับผิดชอบ', 'กำหนดส่ง', 'ความคืบหน้า(%)'],
      tasks.map((t) => [
        t.code,
        t.title,
        projects.find((p) => p.id === t.project)?.name ?? t.project,
        TASK_STATUS_META[t.status]?.label ?? t.status,
        TASK_PRIO_META[t.priority]?.label ?? t.priority,
        team.find((m) => m.id === t.assignee)?.name ?? 'ยังไม่มอบหมาย',
        t.due ?? '',
        t.progress,
      ])
    )
    downloadTextFile(`mng-tasks-report-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  function exportFullJson() {
    downloadTextFile(
      `mng-erp-backup-${todayStr()}.json`,
      JSON.stringify(appData ?? {}, null, 2),
      'application/json;charset=utf-8'
    )
  }

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0)
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0)
  const paidRevenue = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.amount + i.vat, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">รายงานผู้บริหาร (Executive Analytics)</h1>
          <p className="text-sm text-muted mt-0.5">
            สรุปประสิทธิภาพการส่งมอบงาน ภาระงานรายโปรเจกต์ และผลประกอบการจริงจากฐานข้อมูล
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={exportTasksCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-card hover:bg-tint-1 px-3.5 py-2 text-xs text-ink cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-mint" /> ส่งออกงาน CSV
          </button>
          <button
            type="button"
            onClick={exportFullJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-card hover:bg-tint-1 px-3.5 py-2 text-xs text-ink cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5 text-blue-2" /> Backup JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> พิมพ์รายงาน
          </button>
        </div>
      </div>

      {/* Executive Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="text-xs text-muted">มูลค่างบประมาณโปรเจกต์ทั้งหมด</div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">{money(totalBudget)}</div>
          <div className="text-xs text-muted mt-1">
            เบิกจ่ายจริงแล้ว {money(totalSpent)} ({totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0}%)
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="text-xs text-muted">รายรับจริงสะสม (รวม VAT)</div>
          <div className="text-2xl font-bold text-mint mt-1 tabular-nums">{money(paidRevenue)}</div>
          <div className="text-xs text-muted mt-1">
            จากลูกค้าทั้งหมด {clients.length} องค์กร
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="text-xs text-muted">อัตราการปิดงานสำเร็จ</div>
          <div className="text-2xl font-bold text-violet mt-1 tabular-nums">
            {tasks.length ? Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100) : 0}%
          </div>
          <div className="text-xs text-muted mt-1">
            เสร็จ {tasks.filter((t) => t.status === 'done').length} จาก {tasks.length} งาน
          </div>
        </div>
      </div>

      {/* 4 Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-line bg-card p-5">
          <h2 className="font-semibold text-ink mb-1">งานสร้างใหม่ vs ปิดงานสำเร็จ รายเดือน</h2>
          <p className="text-xs text-muted mb-4">เปรียบเทียบอัตราการรับงานและการส่งมอบตลอดปี 2569</p>
          <LineTrendChart
            labels={trend?.months ?? MONTHS_SHORT_TH}
            series={[
              { name: 'งานสร้างใหม่', color: '#38bdf8', data: trend?.created ?? Array(12).fill(0) },
              { name: 'งานเสร็จสมบูรณ์', color: '#34d399', data: trend?.completed ?? Array(12).fill(0) },
            ]}
          />
        </section>

        <section className="rounded-xl border border-line bg-card p-5">
          <h2 className="font-semibold text-ink mb-1">รายรับรายเดือนเทียบเป้าหมาย (พันบาท)</h2>
          <p className="text-xs text-muted mb-4">อ้างอิงจากใบแจ้งหนี้ที่รับชำระแล้วเทียบเป้าหมาย 300k/เดือน</p>
          <BarChart
            labels={trend?.months ?? MONTHS_SHORT_TH}
            values={trend?.revenue ?? Array(12).fill(0)}
            color="#f59e0b"
            unit="k"
            targetLine={300}
          />
        </section>

        <section className="rounded-xl border border-line bg-card p-5">
          <h2 className="font-semibold text-ink mb-1">ชั่วโมงงานคงเหลือแยกตามโปรเจกต์</h2>
          <p className="text-xs text-muted mb-4">คำนวณจากชั่วโมงประเมินและเปอร์เซ็นต์ความคืบหน้าของงานที่ยังไม่เสร็จ</p>
          <HorizontalBarChart items={workloadItems} unit="ชม." />
        </section>

        <section className="rounded-xl border border-line bg-card p-5">
          <h2 className="font-semibold text-ink mb-1">สัดส่วนสถานะงานในระบบ</h2>
          <p className="text-xs text-muted mb-4">ภาพรวมการกระจายตัวของงานในทุกโปรเจกต์ปัจจุบัน</p>
          <DonutChart
            segments={statusSegments}
            centerLabel={String(tasks.length)}
            centerSub="งานทั้งหมด"
          />
        </section>
      </div>

      {/* Project Profitability / Budget Table */}
      <section className="rounded-xl border border-line bg-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="font-semibold text-ink">ตารางสรุปงบประมาณและความคืบหน้ารายโปรเจกต์</h2>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-bg-2 text-xs text-muted border-b border-line">
            <tr>
              <th className="px-4 py-3">โปรเจกต์</th>
              <th className="px-4 py-3">ลูกค้า</th>
              <th className="px-4 py-3 text-right">งบประมาณ</th>
              <th className="px-4 py-3 text-right">ใช้จริง</th>
              <th className="px-4 py-3 text-right">คงเหลือ</th>
              <th className="px-4 py-3 text-right">งานค้าง/รวม</th>
              <th className="px-4 py-3 text-right">ความคืบหน้า</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {projects.map((p) => {
              const remain = p.budget - p.spent
              return (
                <tr key={p.id} className="hover:bg-tint-1/30">
                  <td className="px-4 py-3 font-medium text-ink">
                    {p.icon} {p.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">{resolveClientName(p, clients)}</td>
                  <td className="px-4 py-3 text-right text-xs text-ink-2 tabular-nums">{money(p.budget)}</td>
                  <td className="px-4 py-3 text-right text-xs text-ink-2 tabular-nums">{money(p.spent)}</td>
                  <td
                    className={`px-4 py-3 text-right text-xs font-medium tabular-nums ${
                      remain < 0 ? 'text-red' : 'text-mint'
                    }`}
                  >
                    {money(remain)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-ink-2">
                    {p.open}/{p.taskCount}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-violet tabular-nums">
                    {p.progress}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
