'use client'

import { Suspense, useMemo, useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Kanban,
  List,
  Plus,
  Search,
  CheckSquare,
  MessageSquare,
  Trash2,
  Edit3,
  Send,
  Ban,
  Bot,
  Sparkles,
} from 'lucide-react'
import { api, ApiError, type Task } from '@/lib/api/client'
import { useAiAgents, useApp, useHumanTeam, useProjects, useTasks, useTeam } from '@/lib/stores/app'
import { useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import {
  addDays,
  fmtDateThai,
  initials,
  relDayLabel,
  TASK_PRIO_META,
  TASK_STATUS_META,
  todayStr,
} from '@/lib/erp-helpers'

const COLUMNS = ['todo', 'doing', 'review', 'done'] as const

function TasksInner({
  initialProject,
  initialAssignee,
  initialQ,
}: {
  initialProject: string
  initialAssignee: string
  initialQ: string
}) {
  const { refresh } = useApp()
  const { user } = useAuth()
  const tasks = useTasks()
  const projects = useProjects()
  const team = useTeam()
  const humans = useHumanTeam()
  const aiAgents = useAiAgents()

  const [mode, setMode] = useState<'board' | 'table'>('board')
  const [q, setQ] = useState(initialQ)
  const [projectFilter, setProjectFilter] = useState(initialProject)
  const [assigneeFilter, setAssigneeFilter] = useState(initialAssignee)
  const [prioFilter, setPrioFilter] = useState('')
  const [onlyBlocked, setOnlyBlocked] = useState(false)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [busyDetail, setBusyDetail] = useState(false)

  // Create / Edit modal
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    project: '',
    status: 'todo',
    priority: 'med',
    assignee: '',
    start: todayStr(),
    due: addDays(todayStr(), 7),
    est: 8,
    spent: 0,
    progress: 0,
    blocked: false,
    blockReason: '',
    aiGenerated: false,
    tagsText: '',
    desc: '',
  })

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId]
  )

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (projectFilter && t.project !== projectFilter) return false
      if (assigneeFilter && t.assignee !== assigneeFilter) return false
      if (prioFilter && t.priority !== prioFilter) return false
      if (onlyBlocked && !t.blocked) return false
      if (kw) {
        const hay = `${t.code} ${t.title} ${t.desc} ${(t.tags || []).join(' ')}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [tasks, projectFilter, assigneeFilter, prioFilter, onlyBlocked, q])

  function openCreate(defaultStatus = 'todo') {
    setEditing(null)
    setErrMsg(null)
    setForm({
      title: '',
      project: projectFilter || projects[0]?.id || 'p1',
      status: defaultStatus,
      priority: 'med',
      assignee: assigneeFilter || '',
      start: todayStr(),
      due: addDays(todayStr(), 7),
      est: 8,
      spent: 0,
      progress: defaultStatus === 'done' ? 100 : 0,
      blocked: false,
      blockReason: '',
      aiGenerated: false,
      tagsText: '',
      desc: '',
    })
    setFormOpen(true)
  }

  function openEdit(t: Task) {
    setEditing(t)
    setErrMsg(null)
    setForm({
      title: t.title,
      project: t.project,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee ?? '',
      start: t.start?.slice(0, 10) || todayStr(),
      due: t.due?.slice(0, 10) || '',
      est: t.est || 0,
      spent: t.spent || 0,
      progress: t.progress || 0,
      blocked: Boolean(t.blocked),
      blockReason: t.blockReason || '',
      aiGenerated: Boolean(t.aiGenerated),
      tagsText: (t.tags || []).join(', '),
      desc: t.desc || '',
    })
    setFormOpen(true)
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setErrMsg(null)
    try {
      const payload = {
        title: form.title.trim(),
        project: form.project || 'p1',
        status: form.status,
        priority: form.priority,
        assignee: form.assignee || null,
        start: form.start || null,
        due: form.due || null,
        est: Number(form.est) || 0,
        spent: Number(form.spent) || 0,
        progress: form.status === 'done' ? 100 : Math.min(100, Math.max(0, Number(form.progress) || 0)),
        blocked: form.blocked,
        blockReason: form.blocked ? form.blockReason.trim() : '',
        aiGenerated: form.aiGenerated,
        tags: form.tagsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        desc: form.desc.trim(),
      }
      if (editing) {
        await api.tasks.update(editing.id, payload)
      } else {
        await api.tasks.create(payload)
      }
      await refresh()
      setFormOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'บันทึกงานไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function moveStatus(taskId: string, status: string) {
    try {
      await api.tasks.update(taskId, {
        status,
        ...(status === 'done' ? { progress: 100, blocked: false } : {}),
      })
      await refresh()
    } catch {
      /* ignore */
    }
  }

  async function toggleBlockedQuick(t: Task) {
    setBusyDetail(true)
    try {
      await api.tasks.update(t.id, { blocked: !t.blocked })
      await refresh()
    } finally {
      setBusyDetail(false)
    }
  }

  async function runWithAi(t: Task) {
    const assignedAgent = aiAgents.find((a) => a.id === t.assignee && !a.paused)
    const fallbackAgent = assignedAgent ?? aiAgents.find((a) => !a.paused)
    if (!fallbackAgent) {
      alert('ยังไม่มี AI Agent ที่เปิดทำงานอยู่ในขณะนี้ (ตรวจสอบได้ที่เมนู AI Workforce)')
      return
    }
    setBusyDetail(true)
    try {
      await api.ai.runAgent(fallbackAgent.id, { taskId: t.id })
      await refresh()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'สั่ง AI รันงานไม่สำเร็จ')
    } finally {
      setBusyDetail(false)
    }
  }

  async function archiveTask(t: Task) {
    if (!window.confirm(`เก็บงาน "${t.code} — ${t.title}" เข้าแฟ้มถาวร?`)) return
    setBusyDetail(true)
    try {
      await api.tasks.remove(t.id)
      setSelectedId(null)
      await refresh()
    } finally {
      setBusyDetail(false)
    }
  }

  async function toggleSubtask(t: Task, idx: number) {
    const subs = (t.subtasks || []).map((s: { t: string; d?: boolean }, i: number) =>
      i === idx ? { ...s, d: !s.d } : s
    )
    const doneCnt = subs.filter((s: { d?: boolean }) => s.d).length
    const progress = subs.length ? Math.round((doneCnt / subs.length) * 100) : t.progress
    setBusyDetail(true)
    try {
      await api.tasks.update(t.id, { subtasks: subs, progress })
      await refresh()
    } finally {
      setBusyDetail(false)
    }
  }

  async function addSubtaskItem(e: FormEvent) {
    e.preventDefault()
    if (!selectedTask || !newSubtask.trim()) return
    const subs = [...(selectedTask.subtasks || []), { t: newSubtask.trim(), d: false }]
    setNewSubtask('')
    setBusyDetail(true)
    try {
      await api.tasks.update(selectedTask.id, { subtasks: subs })
      await refresh()
    } finally {
      setBusyDetail(false)
    }
  }

  async function addCommentItem(e: FormEvent) {
    e.preventDefault()
    if (!selectedTask || !newComment.trim()) return
    const me = team.find((m) => m.email && m.email === user?.email) ?? team.find((m) => m.me)
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const comments = [
      ...(selectedTask.comments || []),
      { u: me?.id ?? 'u1', at: now, text: newComment.trim() },
    ]
    setNewComment('')
    setBusyDetail(true)
    try {
      await api.tasks.update(selectedTask.id, { comments })
      await refresh()
    } finally {
      setBusyDetail(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">งานทั้งหมด (Tasks & Kanban)</h1>
          <p className="text-sm text-muted mt-0.5">
            แสดง {filtered.length} จาก {tasks.length} งาน · รองรับมอบหมายให้ทั้งทีมงานและ AI Workforce
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyBlocked((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
              onlyBlocked
                ? 'border-red/30 bg-red-soft text-red font-semibold'
                : 'border-line bg-card text-ink-2 hover:bg-tint-1'
            }`}
          >
            <Ban className="w-3.5 h-3.5 text-red" /> ติดบล็อก ({tasks.filter((t) => t.blocked).length})
          </button>

          <div className="inline-flex rounded-lg border border-line bg-card p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode('board')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md cursor-pointer ${
                mode === 'board' ? 'bg-violet text-white shadow-sm font-semibold' : 'text-ink-2'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" /> บอร์ด
            </button>
            <button
              type="button"
              onClick={() => setMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md cursor-pointer ${
                mode === 'table' ? 'bg-violet text-white shadow-sm font-semibold' : 'text-ink-2'
              }`}
            >
              <List className="w-3.5 h-3.5" /> ตาราง
            </button>
          </div>

          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> สร้างงานใหม่
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-card border border-line rounded-xl p-3.5">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหารหัส MNG, ชื่องาน, แท็ก…"
            className="w-full rounded-lg bg-bg-2 border border-line pl-9 pr-3 py-1.5 text-sm text-ink placeholder-muted focus:outline-none focus:border-violet"
          />
        </div>

        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-sm text-ink"
        >
          <option value="">ทุกโปรเจกต์</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `[${p.code}] ` : ''}
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-sm text-ink"
        >
          <option value="">ผู้รับผิดชอบทั้งหมด (คน + AI)</option>
          <optgroup label="ทีมงานมนุษย์">
            {humans.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname ? `${m.nickname} (${m.name})` : m.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="🤖 AI Workforce">
            {aiAgents.map((a) => (
              <option key={a.id} value={a.id}>
                🤖 {a.name} — {a.role}
              </option>
            ))}
          </optgroup>
        </select>

        <select
          value={prioFilter}
          onChange={(e) => setPrioFilter(e.target.value)}
          className="rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-sm text-ink"
        >
          <option value="">ทุกระดับความสำคัญ</option>
          {Object.entries(TASK_PRIO_META).map(([k, v]) => (
            <option key={k} value={k}>
              ความสำคัญ: {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Board View */}
      {mode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUMNS.map((colKey) => {
            const meta = TASK_STATUS_META[colKey]
            const colTasks = filtered.filter((t) => t.status === colKey)
            return (
              <div
                key={colKey}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragTaskId) {
                    moveStatus(dragTaskId, colKey)
                    setDragTaskId(null)
                  }
                }}
                className="rounded-xl border border-line bg-card shadow-card p-3 min-h-[420px] flex flex-col"
              >
                <div className="flex items-center justify-between px-1 pb-3 border-b border-line mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.dot }} />
                    <span className="text-sm font-semibold text-ink">{meta.label}</span>
                    <span className="rounded-full bg-tint-1 px-2 py-0.5 text-xs text-muted">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreate(colKey)}
                    className="text-muted hover:text-violet p-1 cursor-pointer"
                    title="เพิ่มงานในคอลัมน์นี้"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colTasks.map((t) => {
                    const prio = TASK_PRIO_META[t.priority] ?? TASK_PRIO_META.med
                    const proj = projects.find((p) => p.id === t.project)
                    const assignee = team.find((m) => m.id === t.assignee)
                    const rel = relDayLabel(t.due)
                    const subDone = (t.subtasks || []).filter((s: { d?: boolean }) => s.d).length

                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDragTaskId(t.id)}
                        onClick={() => setSelectedId(t.id)}
                        className={`rounded-xl border p-3.5 cursor-pointer transition shadow-xs ${
                          t.blocked
                            ? 'border-red/30 bg-red-soft/50 hover:border-red'
                            : 'border-line bg-bg-2 hover:border-violet/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-mono text-muted">{t.code}</span>
                            {t.blocked && (
                              <span className="rounded bg-red-soft px-1.5 py-0.5 text-[10px] font-semibold text-red">
                                ⛔ บล็อก
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

                        <div className="text-sm font-medium text-ink leading-snug">{t.title}</div>

                        {proj && (
                          <div className="text-[11px] text-muted truncate mt-1">
                            {proj.icon} {proj.code ? `[${proj.code}] ` : ''}
                            {proj.short}
                          </div>
                        )}

                        {t.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {t.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-tint-2 px-1.5 py-0.5 text-[10px] text-ink-2"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 h-1 w-full rounded-full bg-tint-1 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet"
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
                          <div className="flex items-center gap-2">
                            {assignee ? (
                              <span
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{ backgroundColor: assignee.color }}
                                title={assignee.name}
                              >
                                {assignee.kind === 'ai' ? '🤖' : initials(assignee.name)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted">ว่าง</span>
                            )}
                            {t.subtasks?.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <CheckSquare className="w-3 h-3" /> {subDone}/{t.subtasks.length}
                              </span>
                            )}
                            {t.comments?.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> {t.comments.length}
                              </span>
                            )}
                          </div>

                          <span
                            className={
                              t.status === 'done'
                                ? 'text-mint'
                                : rel.tone === 'danger'
                                ? 'text-red font-medium'
                                : rel.tone === 'warn'
                                ? 'text-violet'
                                : 'text-muted'
                            }
                          >
                            {t.status === 'done' ? 'เสร็จแล้ว' : rel.text}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-xl border border-line bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2 text-xs text-muted border-b border-line">
              <tr>
                <th className="px-4 py-3">รหัส</th>
                <th className="px-4 py-3">ชื่องาน</th>
                <th className="px-4 py-3">โปรเจกต์</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">ผู้รับผิดชอบ</th>
                <th className="px-4 py-3">เวลาใช้จริง/ประเมิน</th>
                <th className="px-4 py-3">กำหนดส่ง</th>
                <th className="px-4 py-3 text-right">ความคืบหน้า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((t) => {
                const st = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.todo
                const proj = projects.find((p) => p.id === t.project)
                const assignee = team.find((m) => m.id === t.assignee)
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="hover:bg-tint-1/40 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted">{t.code}</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {t.blocked && <span className="text-red mr-1.5">⛔</span>}
                      {t.aiGenerated && <span className="text-violet mr-1">✨</span>}
                      {t.title}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">{proj?.short ?? t.project}</td>
                    <td className="px-4 py-3">
                      <select
                        value={t.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => moveStatus(t.id, e.target.value)}
                        className={`rounded-full px-2.5 py-0.5 text-xs border bg-bg-2 ${st.badge}`}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c} value={c}>
                            {TASK_STATUS_META[c].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {assignee ? (
                        <span>
                          {assignee.kind === 'ai' ? '🤖 ' : ''}
                          {assignee.nickname || assignee.name}
                        </span>
                      ) : (
                        <span className="text-muted">ยังไม่มอบหมาย</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2 tabular-nums">
                      {t.spent ?? 0} / {t.est || 0} ชม.
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">{fmtDateThai(t.due)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-violet tabular-nums">
                      {t.progress}%
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    ไม่พบรายการงานที่ตรงกับตัวกรอง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Detail Modal (Subtasks + Comments + AI Run + Blocked) */}
      <Modal
        open={!!selectedTask}
        onClose={() => setSelectedId(null)}
        title={selectedTask ? `${selectedTask.code} — ${selectedTask.title}` : ''}
        subtitle={
          selectedTask
            ? `โปรเจกต์: ${projects.find((p) => p.id === selectedTask.project)?.name ?? selectedTask.project}`
            : undefined
        }
        maxWidth="2xl"
      >
        {selectedTask && (
          <div className="space-y-5">
            {/* Quick status + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line">
              <div className="flex flex-wrap items-center gap-1.5">
                {COLUMNS.map((stKey) => {
                  const active = selectedTask.status === stKey
                  return (
                    <button
                      key={stKey}
                      type="button"
                      onClick={() => moveStatus(selectedTask.id, stKey)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition cursor-pointer ${
                        active
                          ? TASK_STATUS_META[stKey].badge
                          : 'border-line bg-bg-2 text-muted hover:text-ink'
                      }`}
                    >
                      {TASK_STATUS_META[stKey].label}
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyDetail}
                  onClick={() => runWithAi(selectedTask)}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet/30 bg-violet-soft px-3 py-1.5 text-xs font-medium text-violet hover:bg-violet-soft cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> ให้ AI ช่วยรันงาน
                </button>
                <button
                  type="button"
                  disabled={busyDetail}
                  onClick={() => toggleBlockedQuick(selectedTask)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
                    selectedTask.blocked
                      ? 'border-red bg-red-soft text-red'
                      : 'border-line-2 text-ink-2 hover:bg-tint-1'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" /> {selectedTask.blocked ? 'ปลดบล็อก' : 'แจ้งติดบล็อก'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = selectedTask
                    setSelectedId(null)
                    openEdit(t)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-line-2 px-3 py-1.5 text-xs text-ink hover:bg-tint-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> แก้ไข
                </button>
                <button
                  type="button"
                  disabled={busyDetail}
                  onClick={() => archiveTask(selectedTask)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red/30 bg-red-soft px-3 py-1.5 text-xs text-red hover:bg-red-soft cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> เก็บเข้าแฟ้ม
                </button>
              </div>
            </div>

            {selectedTask.blocked && (
              <div className="rounded-xl bg-red-soft border border-red/30 px-4 py-2.5 text-xs text-red">
                ⛔ <strong>งานนี้ติดบล็อก:</strong>{' '}
                {selectedTask.blockReason || 'รอข้อมูลเพิ่มเติมหรือรอการอนุมัติจากทีมที่เกี่ยวข้อง'}
              </div>
            )}

            {/* Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-bg-2 border border-line p-3">
                <div className="text-muted">ผู้รับผิดชอบ</div>
                <div className="text-ink font-medium mt-1">
                  {(() => {
                    const m = team.find((x) => x.id === selectedTask.assignee)
                    if (!m) return 'ยังไม่มอบหมาย'
                    return `${m.kind === 'ai' ? '🤖 ' : ''}${m.name}`
                  })()}
                </div>
              </div>
              <div className="rounded-lg bg-bg-2 border border-line p-3">
                <div className="text-muted">กำหนดส่ง</div>
                <div className="text-ink font-medium mt-1">{fmtDateThai(selectedTask.due)}</div>
              </div>
              <div className="rounded-lg bg-bg-2 border border-line p-3">
                <div className="text-muted">เวลาใช้จริง / ประเมิน</div>
                <div className="text-ink font-medium mt-1">
                  {selectedTask.spent ?? 0} / {selectedTask.est || 0} ชม.
                </div>
              </div>
              <div className="rounded-lg bg-bg-2 border border-line p-3">
                <div className="text-muted">ความคืบหน้า</div>
                <div className="text-violet font-bold mt-1">{selectedTask.progress}%</div>
              </div>
            </div>

            {selectedTask.desc && (
              <div className="rounded-xl bg-bg-2 border border-line p-4 text-sm text-ink-2 whitespace-pre-wrap">
                {selectedTask.desc}
              </div>
            )}

            {/* Subtasks Checklist */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-ink-2">
                รายการย่อย (Subtasks) · {(selectedTask.subtasks || []).filter((s: { d?: boolean }) => s.d).length}/
                {(selectedTask.subtasks || []).length}
              </div>
              <div className="space-y-1.5">
                {(selectedTask.subtasks || []).map((st: { t: string; d?: boolean }, idx: number) => (
                  <label
                    key={idx}
                    className="flex items-center gap-2.5 rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm cursor-pointer hover:border-line-2"
                  >
                    <input
                      type="checkbox"
                      checked={!!st.d}
                      disabled={busyDetail}
                      onChange={() => toggleSubtask(selectedTask, idx)}
                      className="accent-violet"
                    />
                    <span className={st.d ? 'line-through text-muted' : 'text-ink'}>{st.t}</span>
                  </label>
                ))}
              </div>
              <form onSubmit={addSubtaskItem} className="flex gap-2">
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="เพิ่มรายการย่อยใหม่…"
                  className="flex-1 rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-xs text-ink"
                />
                <button
                  type="submit"
                  disabled={busyDetail}
                  className="rounded-lg bg-tint-1 hover:bg-tint-3 px-3 py-1.5 text-xs text-ink cursor-pointer"
                >
                  + เพิ่ม
                </button>
              </form>
            </div>

            {/* Comments */}
            <div className="space-y-2.5 pt-2 border-t border-line">
              <div className="text-xs font-semibold text-ink-2">
                ความคิดเห็น ({(selectedTask.comments || []).length})
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {(selectedTask.comments || []).map(
                  (c: { u: string; at: string; text: string }, idx: number) => {
                    const author = team.find((m) => m.id === c.u)
                    return (
                      <div key={idx} className="rounded-lg bg-bg-2 border border-line p-3 text-xs">
                        <div className="flex items-center justify-between text-muted mb-1">
                          <span className="font-semibold text-ink">
                            {author?.kind === 'ai' ? '🤖 ' : ''}
                            {author?.name ?? c.u}
                          </span>
                          <span>{c.at}</span>
                        </div>
                        <div className="text-ink-2">{c.text}</div>
                      </div>
                    )
                  }
                )}
              </div>
              <form onSubmit={addCommentItem} className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="พิมพ์ความคิดเห็นหรืออัปเดตงาน…"
                  className="flex-1 rounded-lg bg-bg-2 border border-line px-3 py-2 text-xs text-ink"
                />
                <button
                  type="submit"
                  disabled={busyDetail}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> ส่ง
                </button>
              </form>
            </div>
          </div>
        )}
      </Modal>

      {/* Create / Edit Task Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `แก้ไขงาน ${editing.code}` : 'สร้างงานใหม่'}
        maxWidth="xl"
      >
        <form onSubmit={onSubmitForm} className="space-y-4">
          <div>
            <label className="block text-xs text-ink-2 mb-1">ชื่องาน *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="ระบุชื่องานที่ต้องการติดตาม"
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:border-violet"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">โปรเจกต์</label>
              <select
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `[${p.code}] ` : ''}
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">ผู้รับผิดชอบ (คน หรือ AI Agent)</label>
              <select
                value={form.assignee}
                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                <option value="">— ยังไม่มอบหมาย —</option>
                <optgroup label="ทีมงานมนุษย์">
                  {humans.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nickname ? `${m.nickname} (${m.name})` : m.name} — {m.role}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🤖 AI Workforce">
                  {aiAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      🤖 {a.name} ({a.role})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">สถานะ</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                {COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {TASK_STATUS_META[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">ความสำคัญ</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                {Object.entries(TASK_PRIO_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">ประเมิน (ชม.)</label>
              <input
                type="number"
                min={0}
                value={form.est}
                onChange={(e) => setForm({ ...form, est: Number(e.target.value) })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">ใช้จริง (ชม.)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={form.spent}
                onChange={(e) => setForm({ ...form, spent: Number(e.target.value) })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">คืบหน้า (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">วันเริ่มงาน</label>
              <input
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">กำหนดส่ง (Due Date)</label>
              <input
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          {/* Blocked & AI Flag */}
          <div className="rounded-xl border border-line bg-bg-2 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-5 text-xs">
              <label className="inline-flex items-center gap-2 text-red cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.blocked}
                  onChange={(e) => setForm({ ...form, blocked: e.target.checked })}
                  className="accent-red"
                />
                ⛔ ติดบล็อก (Blocked)
              </label>

              <label className="inline-flex items-center gap-2 text-violet cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.aiGenerated}
                  onChange={(e) => setForm({ ...form, aiGenerated: e.target.checked })}
                  className="accent-violet"
                />
                <Bot className="w-3.5 h-3.5" /> งานที่สร้าง/ร่างโดย AI
              </label>
            </div>

            {form.blocked && (
              <input
                value={form.blockReason}
                onChange={(e) => setForm({ ...form, blockReason: e.target.value })}
                placeholder="ระบุสาเหตุที่ติดบล็อก (เช่น รอ API Key จากฝั่งลูกค้า)..."
                className="w-full rounded-lg bg-bg-2 border border-red/30 px-3 py-1.5 text-xs text-ink"
              />
            )}
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">แท็ก (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
            <input
              value={form.tagsText}
              onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
              placeholder="UI, API, Urgent"
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">รายละเอียดงาน</label>
            <textarea
              rows={3}
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>

          {errMsg && (
            <div className="rounded-lg bg-red-soft border border-red/30 px-3 py-2 text-xs text-red">
              {errMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-line-2 px-4 py-2 text-xs text-ink-2 hover:bg-tint-1 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-violet hover:bg-violet-2 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
            >
              {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'สร้างงาน'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function TasksRouteSync() {
  const searchParams = useSearchParams()
  return (
    <TasksInner
      key={searchParams.toString()}
      initialProject={searchParams.get('project') ?? ''}
      initialAssignee={searchParams.get('assignee') ?? ''}
      initialQ={searchParams.get('q') ?? ''}
    />
  )
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="text-muted text-sm">กำลังโหลดบอร์ดงาน…</div>}>
      <TasksRouteSync />
    </Suspense>
  )
}
