'use client'

import { useMemo, useState, FormEvent } from 'react'
import Link from 'next/link'
import { Plus, Mail, Phone, Edit3, Trash2, CheckSquare, Shield, Bot } from 'lucide-react'
import { api, ApiError, type TeamMember } from '@/lib/api/client'
import { useAiAgents, useApp, useHumanTeam, useTasks } from '@/lib/stores/app'
import { canManage, isAdmin, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import { initials, PRESENCE_META, ROLE_META, TEAM_COLORS } from '@/lib/erp-helpers'

export default function TeamPage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const humans = useHumanTeam()
  const aiAgents = useAiAgents()
  const tasks = useTasks()

  const allowManage = canManage(user?.role)
  const allowAdmin = isAdmin(user?.role)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    nickname: '',
    role: 'Full-stack Developer',
    email: '',
    phone: '',
    color: TEAM_COLORS[0],
    state: 'online',
    capacity: 40,
    skillsText: '',
    authRole: '',
  })

  const enriched = useMemo(() => {
    return humans.map((m) => {
      const cap = m.capacity || 40
      const myTasks = tasks.filter((t) => t.assignee === m.id)
      const openTasks = myTasks.filter((t) => t.status !== 'done')
      const doneTasks = myTasks.length - openTasks.length
      const hoursLeft = Math.round(
        openTasks.reduce((s, t) => s + (t.est || 4) * (1 - (t.progress || 0) / 100), 0)
      )
      const loadPct = Math.min(100, Math.round((hoursLeft / cap) * 100))
      return { ...m, cap, openCount: openTasks.length, doneCount: doneTasks, hoursLeft, loadPct }
    })
  }, [humans, tasks])

  function openCreate() {
    setEditing(null)
    setErrMsg(null)
    setForm({
      name: '',
      nickname: '',
      role: 'สมาชิกทีม',
      email: '',
      phone: '',
      color: TEAM_COLORS[humans.length % TEAM_COLORS.length],
      state: 'online',
      capacity: 40,
      skillsText: '',
      authRole: '',
    })
    setModalOpen(true)
  }

  function openEdit(m: TeamMember) {
    setEditing(m)
    setErrMsg(null)
    setForm({
      name: m.name,
      nickname: m.nickname || '',
      role: m.role,
      email: m.email || '',
      phone: m.phone || '',
      color: m.color || TEAM_COLORS[0],
      state: m.state || 'online',
      capacity: m.capacity || 40,
      skillsText: (m.skills || []).join(', '),
      authRole: m.authRole || '',
    })
    setModalOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setErrMsg(null)
    try {
      const payload = {
        name: form.name.trim(),
        nickname: form.nickname.trim(),
        role: form.role.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        color: form.color,
        state: form.state,
        capacity: Number(form.capacity) || 40,
        skills: form.skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }
      if (editing) {
        await api.teams.update(editing.id, payload)
        if (allowAdmin && editing.authUserId && form.authRole && form.authRole !== editing.authRole) {
          await api.users.update(editing.authUserId, { role: form.authRole })
        }
      } else {
        await api.teams.create(payload)
      }
      await refresh()
      setModalOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'บันทึกข้อมูลสมาชิกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onRemove(m: TeamMember) {
    if (!window.confirm(`ยืนยันการลบ "${m.name}" ออกจากรายชื่อทีม? (งานที่ถืออยู่จะถูกปลดเป็นว่าง)`)) return
    setSaving(true)
    try {
      await api.teams.remove(m.id)
      await refresh()
      setModalOpen(false)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'ลบสมาชิกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ทีมงาน & สถานะสด ({humans.length} คน)</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            แสดงชื่อเล่น ทักษะ สถานะการทำงานสด และภาระงานคงเหลือรายสัปดาห์
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/ai"
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3.5 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
          >
            <Bot className="w-4 h-4 text-violet-400" /> AI Workforce ({aiAgents.length})
          </Link>
          {allowManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> เพิ่มสมาชิกทีม
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {enriched.map((m) => {
          const barColor =
            m.loadPct >= 85 ? '#fb7185' : m.loadPct >= 60 ? '#fbbf24' : '#34d399'
          const authBadge = m.authRole ? ROLE_META[m.authRole] : null
          const pMeta = PRESENCE_META[m.state || 'online'] ?? PRESENCE_META.online

          return (
            <div
              key={m.id}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {m.avatar ? (
                        <img
                          src={m.avatar}
                          alt={m.name}
                          className="w-12 h-12 rounded-full object-cover border border-slate-700"
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white"
                          style={{ backgroundColor: m.color || '#6C5CE7' }}
                        >
                          {initials(m.name)}
                        </div>
                      )}
                      <span
                        className="w-3.5 h-3.5 rounded-full border-2 border-slate-900 absolute -bottom-0.5 -right-0.5"
                        style={{ backgroundColor: pMeta.dot }}
                        title={pMeta.label}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">
                        {m.nickname ? `${m.nickname} · ${m.name}` : m.name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{m.role}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${pMeta.badge}`}>
                          {pMeta.label}
                        </span>
                        {authBadge && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${authBadge.badge}`}
                          >
                            <Shield className="w-2.5 h-2.5" /> {authBadge.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {allowManage && (
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                      title="แก้ไขสมาชิก"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Skills Chips */}
                {(m.skills || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(m.skills || []).map((sk) => (
                      <span
                        key={sk}
                        className="rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  {m.email && (
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {m.email}
                    </div>
                  )}
                  {m.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {m.phone}
                    </div>
                  )}
                </div>

                {/* Workload Meter */}
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400">
                      ภาระงานคงเหลือ ({m.hoursLeft}/{m.cap} ชม.)
                    </span>
                    <span className="font-semibold text-white tabular-nums">{m.loadPct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${m.loadPct}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-400">
                  ถืออยู่ <strong className="text-white">{m.openCount}</strong> · เสร็จแล้ว{' '}
                  <strong className="text-emerald-300">{m.doneCount}</strong>
                </span>
                <Link
                  href={`/tasks?assignee=${m.id}`}
                  className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> ดูงาน
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add / Edit Member Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `แก้ไขข้อมูล: ${editing.name}` : 'เพิ่มสมาชิกทีมใหม่'}
        subtitle="หากอีเมลตรงกับบัญชีในระบบ จะเชื่อมต่อสิทธิ์และรูปโปรไฟล์ให้อัตโนมัติ"
        maxWidth="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1">ชื่อ-นามสกุล *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">ชื่อเล่น (Nickname)</label>
              <input
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                placeholder="เช่น เอก, นัท"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ตำแหน่งในทีม</label>
              <input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Senior UX/UI"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">สถานะสด</label>
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                {Object.entries(PRESENCE_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">ความจุ/สัปดาห์ (ชม.)</label>
              <input
                type="number"
                min={8}
                max={80}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">อีเมล (เชื่อมบัญชี Login อัตโนมัติ)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@mng.co.th"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">เบอร์โทรศัพท์</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="08x-xxx-xxxx"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">ทักษะความเชี่ยวชาญ (คั่นด้วย ,)</label>
            <input
              value={form.skillsText}
              onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
              placeholder="Next.js, Figma, SEO, Strategy"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          {allowAdmin && editing?.authUserId && (
            <div>
              <label className="block text-xs text-slate-300 mb-1">สิทธิ์การเข้าถึงระบบ (System Role)</label>
              <select
                value={form.authRole}
                onChange={(e) => setForm({ ...form, authRole: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                {Object.entries(ROLE_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label} ({k})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-300 mb-1.5">สีประจำตัว</label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                    form.color === c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {errMsg && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
              {errMsg}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {editing && allowAdmin ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onRemove(editing)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบออกจากทีม
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                {saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
