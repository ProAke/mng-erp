'use client'

import { useMemo, useState, FormEvent } from 'react'
import Link from 'next/link'
import {
  Plus,
  FileEdit,
  Archive,
  Search,
  ExternalLink,
  CheckSquare,
  Clock,
} from 'lucide-react'
import { api, ApiError, type Project } from '@/lib/api/client'
import { useApp, useClients, useProjects, useTasks, useTeam } from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import {
  daysLeft,
  fmtDateThai,
  initials,
  money,
  moneyK,
  resolveClientName,
  stripHtml,
  todayStr,
} from '@/lib/erp-helpers'

const PROJ_STATUS: Record<string, { label: string; badge: string }> = {
  doing:  { label: 'กำลังดำเนินการ', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  review: { label: 'ตรวจรับงาน',     badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  done:   { label: 'ส่งมอบแล้ว',     badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  todo:   { label: 'วางแผน',         badge: 'bg-slate-800 text-slate-300 border-slate-700' },
}

export default function ProjectsPage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const projects = useProjects()
  const tasks = useTasks()
  const clients = useClients()
  const team = useTeam()
  const allowManage = canManage(user?.role)

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Project | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const [form, setForm] = useState({
    code: '',
    name: '',
    client: '',
    budget: 250000,
    start: todayStr(),
    end: '2026-12-31',
    icon: '🚀',
    desc: '',
  })

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false
      if (kw) {
        const clientLabel = resolveClientName(p, clients)
        const hay = `${p.code || ''} ${p.name} ${clientLabel} ${stripHtml(p.desc)}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [projects, clients, statusFilter, q])

  async function onCreateQuick(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setErrMsg(null)
    try {
      await api.projects.create({
        code: form.code.trim().toUpperCase() || undefined,
        name: form.name.trim(),
        client: form.client || undefined,
        budget: Number(form.budget) || 0,
        start: form.start,
        end: form.end,
        icon: form.icon || '📁',
        desc: form.desc.trim(),
      })
      await refresh()
      setCreateOpen(false)
      setForm({
        code: '',
        name: '',
        client: '',
        budget: 250000,
        start: todayStr(),
        end: '2026-12-31',
        icon: '🚀',
        desc: '',
      })
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'สร้างโปรเจกต์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onArchive(p: Project) {
    if (!window.confirm(`เก็บโปรเจกต์ "${p.name}" เข้าคลังถาวร? (กู้คืนได้ในหน้าตั้งค่า)`)) return
    setSaving(true)
    try {
      await api.projects.archive(p.id)
      setSelected(null)
      await refresh()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'เก็บโปรเจกต์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0)
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">โปรเจกต์ทั้งหมด ({projects.length})</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            งบประมาณรวม {money(totalBudget)} · ใช้จริงแล้ว {money(totalSpent)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> สร้างด่วน
          </button>
          <Link
            href="/projects/detail"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition"
          >
            <FileEdit className="w-4 h-4" /> สร้างโปรเจกต์ (Rich Text)
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหารหัสย่อ (เช่น ERP, WEB), ชื่อโปรเจกต์, ลูกค้า…"
            className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">ทุกสถานะโปรเจกต์</option>
          {Object.entries(PROJ_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const clientLabel = resolveClientName(p, clients)
          const st = PROJ_STATUS[p.status] ?? PROJ_STATUS.doing
          const spentPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0
          const overBudget = p.budget > 0 && p.spent > p.budget
          const dl = daysLeft(p.end)

          return (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              className="rounded-xl border border-slate-800 bg-slate-900 hover:border-amber-500/40 p-5 flex flex-col justify-between transition cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: `${p.color || '#f59e0b'}22` }}
                    >
                      {p.icon || '📁'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {p.code && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-300 shrink-0">
                            {p.code}
                          </span>
                        )}
                        <h3 className="font-semibold text-white truncate">{p.name}</h3>
                      </div>
                      <div className="text-xs text-slate-400 truncate">{clientLabel}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${st.badge}`}>
                    {st.label}
                  </span>
                </div>

                {p.desc && (
                  <p className="text-xs text-slate-400 line-clamp-2 mt-3">{stripHtml(p.desc)}</p>
                )}

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">ความคืบหน้า</span>
                    <span className="font-semibold text-white tabular-nums">{p.progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.progress}%`, backgroundColor: p.color || '#f59e0b' }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">งบใช้จริง / งบตั้งไว้</span>
                  <span className={overBudget ? 'text-rose-400 font-semibold' : 'text-slate-200'}>
                    {moneyK(p.spent)} / {moneyK(p.budget)} ({spentPct}%)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex -space-x-1.5">
                    {(p.members || []).slice(0, 6).map((mid) => {
                      const m = team.find((x) => x.id === mid)
                      return (
                        <span
                          key={mid}
                          className="w-6 h-6 rounded-full border border-slate-900 flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: m?.color ?? '#475569' }}
                          title={m?.name ?? mid}
                        >
                          {m?.kind === 'ai' ? '🤖' : initials(m?.name)}
                        </span>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {dl !== null && p.status !== 'done' && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] ${
                          dl < 0 ? 'text-rose-400 font-medium' : dl <= 7 ? 'text-amber-300' : 'text-slate-500'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {dl < 0 ? `เลย ${Math.abs(dl)}ว.` : `อีก ${dl}ว.`}
                      </span>
                    )}
                    <span>
                      งาน <strong className="text-white">{p.open}</strong>/{p.taskCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-slate-500">
            ไม่พบโปรเจกต์ที่ตรงกับเงื่อนไขการค้นหา
          </div>
        )}
      </div>

      {/* Project Overview Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.icon} ${selected.code ? `[${selected.code}] ` : ''}${selected.name}` : ''}
        subtitle={selected ? resolveClientName(selected, clients) : undefined}
        maxWidth="2xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                <div className="text-slate-500">ความคืบหน้า</div>
                <div className="text-lg font-bold text-amber-300 mt-0.5">{selected.progress}%</div>
              </div>
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                <div className="text-slate-500">งบประมาณ</div>
                <div className="text-sm font-semibold text-white mt-1">{money(selected.budget)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                <div className="text-slate-500">ใช้จริงแล้ว</div>
                <div className="text-sm font-semibold text-white mt-1">{money(selected.spent)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                <div className="text-slate-500">ส่งมอบ</div>
                <div className="text-sm font-semibold text-white mt-1">{fmtDateThai(selected.end)}</div>
              </div>
            </div>

            {selected.desc && (
              <div
                className="prose-erp rounded-xl bg-slate-950/60 border border-slate-800 p-4 text-sm text-slate-300"
                dangerouslySetInnerHTML={{ __html: selected.desc }}
              />
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  งานในโปรเจกต์นี้ ({tasks.filter((t) => t.project === selected.id).length})
                </span>
                <Link
                  href={`/tasks?project=${selected.id}`}
                  className="text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                >
                  เปิดในบอร์ดงาน <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {tasks
                  .filter((t) => t.project === selected.id)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-lg bg-slate-950/50 border border-slate-800 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-200 truncate">
                        <span className="font-mono text-slate-500 mr-2">{t.code}</span>
                        {t.blocked && <span className="text-rose-400 mr-1">⛔</span>}
                        {t.title}
                      </span>
                      <span className="text-slate-400 shrink-0 ml-2">{t.progress}%</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
              {allowManage ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onArchive(selected)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" /> เก็บเข้าคลัง
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <Link
                  href={`/tasks?project=${selected.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> ดูงานทั้งหมด
                </Link>
                <Link
                  href={`/projects/detail?id=${selected.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950"
                >
                  <FileEdit className="w-3.5 h-3.5" /> แก้ไขโปรเจกต์ / Rich Text
                </Link>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Quick Create Project Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="สร้างโปรเจกต์ใหม่" maxWidth="lg">
        <form onSubmit={onCreateQuick} className="space-y-4">
          <div className="grid grid-cols-6 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ไอคอน</label>
              <input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-center text-base text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">รหัสย่อ</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="CRM"
                maxLength={10}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-2 text-sm font-mono uppercase text-white"
              />
            </div>
            <div className="col-span-4">
              <label className="block text-xs text-slate-300 mb-1">ชื่อโปรเจกต์ *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น ระบบ CRM สำหรับองค์กร"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ลูกค้า</label>
              <select
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="">Internal — MNG Groups</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">งบประมาณ (บาท)</label>
              <input
                type="number"
                min={0}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">วันเริ่ม</label>
              <input
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">วันส่งมอบ</label>
              <input
                type="date"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">รายละเอียดเบื้องต้น</label>
            <textarea
              rows={3}
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          {errMsg && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
              {errMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              {saving ? 'กำลังสร้าง…' : 'สร้างโปรเจกต์'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
