'use client'

import { useState, FormEvent } from 'react'
import {
  Bot,
  Play,
  Pause,
  Zap,
  Plus,
  Edit3,
  Power,
  Sparkles,
  CheckCircle2,
  Clock,
  Cpu,
} from 'lucide-react'
import { api, ApiError, type TeamMember } from '@/lib/api/client'
import { useAiAgents, useAiRuns, useApp, useSettingsData, useTasks } from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import { TEAM_COLORS } from '@/lib/erp-helpers'

const AI_MODELS = [
  'Claude Sonnet 4.5',
  'Claude Code',
  'Gemini 2.5 Pro',
  'GPT-4.1',
  'Grok 4 Fast',
  'Flux 1.1 Pro',
]

export default function AiWorkforcePage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const agents = useAiAgents()
  const runs = useAiRuns()
  const tasks = useTasks()
  const settings = useSettingsData()
  const allowManage = canManage(user?.role)

  const openTasks = tasks.filter((t) => t.status !== 'done')
  const aiEnabled = settings.aiEnabled !== false

  const [selectedTaskByAgent, setSelectedTaskByAgent] = useState<Record<string, string>>({})
  const [promptByAgent, setPromptByAgent] = useState<Record<string, string>>({})
  const [runningId, setRunningId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  // Modal for Create / Edit AI Agent
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    role: 'AI Full-stack Engineer',
    model: AI_MODELS[0],
    autonomy: 78,
    skillsText: 'Next.js, SQL, Automation',
    color: TEAM_COLORS[1],
  })

  function flash(tone: 'ok' | 'err', text: string) {
    setBanner({ tone, text })
    setTimeout(() => setBanner(null), 5000)
  }

  async function onRunAgent(ag: TeamMember) {
    setRunningId(ag.id)
    try {
      const taskId = selectedTaskByAgent[ag.id] || ag.currentTaskId || openTasks[0]?.id
      const prompt = promptByAgent[ag.id]?.trim() || undefined
      const res = await api.ai.runAgent(ag.id, { taskId: taskId || undefined, prompt })
      setPromptByAgent((prev) => ({ ...prev, [ag.id]: '' }))
      await refresh()
      flash('ok', `${res.output} (+${res.tokens.toLocaleString()} tokens ใน ${res.durationSec} วินาที)`)
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'สั่งรันเอเจนต์ไม่สำเร็จ')
    } finally {
      setRunningId(null)
    }
  }

  async function onTogglePause(ag: TeamMember) {
    try {
      await api.teams.update(ag.id, {
        paused: !ag.paused,
        state: !ag.paused ? 'away' : 'online',
      })
      await refresh()
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'เปลี่ยนสถานะเอเจนต์ไม่สำเร็จ')
    }
  }

  async function onToggleAll() {
    try {
      await api.ai.toggleAll(!aiEnabled)
      await refresh()
      flash('ok', !aiEnabled ? 'เปิดใช้งาน AI Workforce ทั้งระบบแล้ว' : 'พักการทำงาน AI ทั้งระบบชั่วคราวแล้ว')
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'ไม่สามารถสลับสถานะระบบ AI ได้')
    }
  }

  function openCreate() {
    setEditing(null)
    setForm({
      name: '',
      role: 'AI Project Specialist',
      model: AI_MODELS[0],
      autonomy: 75,
      skillsText: 'Planning, QA, Summary',
      color: TEAM_COLORS[agents.length % TEAM_COLORS.length],
    })
    setModalOpen(true)
  }

  function openEdit(ag: TeamMember) {
    setEditing(ag)
    setForm({
      name: ag.name,
      role: ag.role,
      model: ag.model || AI_MODELS[0],
      autonomy: ag.autonomy ?? 75,
      skillsText: (ag.skills || []).join(', '),
      color: ag.color || TEAM_COLORS[0],
    })
    setModalOpen(true)
  }

  async function onSaveAgent(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim().toUpperCase(),
        nickname: form.name.trim(),
        kind: 'ai' as const,
        role: form.role.trim(),
        model: form.model,
        autonomy: Number(form.autonomy) || 75,
        skills: form.skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        color: form.color,
      }
      if (editing) {
        await api.teams.update(editing.id, payload)
      } else {
        await api.teams.create(payload)
      }
      await refresh()
      setModalOpen(false)
      flash('ok', editing ? `อัปเดตเอเจนต์ ${payload.name} แล้ว` : `สร้างเอเจนต์ ${payload.name} พร้อมทำงานแล้ว`)
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'บันทึกเอเจนต์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const totalTokens = agents.reduce((s, a) => s + (a.tokensToday || 0), 0)
  const totalRuns = agents.reduce((s, a) => s + (a.runs || 0), 0)
  const activeCount = agents.filter((a) => !a.paused).length
  const avgSuccess = agents.length
    ? Math.round(agents.reduce((s, a) => s + (a.successRate ?? 92), 0) / agents.length)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 px-3 py-0.5 text-xs text-purple-300 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Hybrid Human + AI Workforce
          </div>
          <h1 className="text-2xl font-bold text-white">AI Workforce — เอเจนต์อัจฉริยะประจำทีม</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            เอเจนต์ลงมือช่วยแตก Subtasks อัปเดตความคืบหน้า คอมเมนต์งาน และตอบคำถามในแชทพร้อมเก็บ Log และ Token จริง
          </p>
        </div>

        {allowManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleAll}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium cursor-pointer transition ${
                aiEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {aiEnabled ? 'AI ทั้งระบบ: เปิดอยู่' : 'AI ทั้งระบบ: พักชั่วคราว'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> เพิ่มเอเจนต์ AI
            </button>
          </div>
        )}
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
            banner.tone === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">เอเจนต์พร้อมทำงาน</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1 tabular-nums">
            {activeCount} <span className="text-sm font-normal text-slate-500">/ {agents.length} ตัว</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">จำนวนการรันสะสม</div>
          <div className="text-2xl font-bold text-white mt-1 tabular-nums">{totalRuns.toLocaleString()} runs</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Tokens ที่ใช้วันนี้</div>
          <div className="text-2xl font-bold text-amber-300 mt-1 tabular-nums">
            {Math.round(totalTokens / 1000).toLocaleString()}k
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">อัตราความสำเร็จเฉลี่ย</div>
          <div className="text-2xl font-bold text-sky-300 mt-1 tabular-nums">{avgSuccess}%</div>
        </div>
      </div>

      {/* AI Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((ag) => {
          const isRunning = runningId === ag.id
          const assignedCount = tasks.filter((t) => t.assignee === ag.id && t.status !== 'done').length
          const selectedTask = selectedTaskByAgent[ag.id] ?? ag.currentTaskId ?? openTasks[0]?.id ?? ''

          return (
            <div
              key={ag.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition ${
                ag.paused
                  ? 'border-slate-800/80 bg-slate-900/50 opacity-80'
                  : 'border-slate-800 bg-slate-900 hover:border-purple-500/40'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-lg shrink-0"
                      style={{ backgroundColor: ag.color || '#6C5CE7' }}
                    >
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{ag.name}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            ag.paused
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {ag.paused ? 'พักการทำงาน' : 'พร้อมทำงาน'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">{ag.role}</div>
                    </div>
                  </div>

                  {allowManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onTogglePause(ag)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                        title={ag.paused ? 'เปิดการทำงาน' : 'พักการทำงาน'}
                      >
                        {ag.paused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-300" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(ag)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                        title="ตั้งค่าเอเจนต์"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Model & Skills */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[11px] text-purple-200">
                    <Cpu className="w-3 h-3" /> {ag.model || 'Claude Sonnet 4.5'}
                  </span>
                  {(ag.skills || []).map((sk) => (
                    <span key={sk} className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                      {sk}
                    </span>
                  ))}
                </div>

                {/* Metrics */}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 text-xs">
                  <div>
                    <div className="text-slate-500">Autonomy</div>
                    <div className="font-bold text-white mt-0.5">{ag.autonomy ?? 75}%</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Runs / สำเร็จ</div>
                    <div className="font-bold text-emerald-300 mt-0.5">
                      {ag.runs ?? 0} · {ag.successRate ?? 92}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Tokens วันนี้</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      {Math.round((ag.tokensToday || 0) / 1000)}k
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Runner */}
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>เลือกงานให้ {ag.name} ลงมือทำ</span>
                  <span>ถืออยู่ {assignedCount} งาน</span>
                </div>
                <select
                  value={selectedTask}
                  onChange={(e) => setSelectedTaskByAgent({ ...selectedTaskByAgent, [ag.id]: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="">— วิเคราะห์ภาพรวมระบบอัตโนมัติ —</option>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.title}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <input
                    value={promptByAgent[ag.id] ?? ''}
                    onChange={(e) => setPromptByAgent({ ...promptByAgent, [ag.id]: e.target.value })}
                    placeholder="คำสั่งเพิ่มเติม (ไม่บังคับ)..."
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
                  />
                  <button
                    type="button"
                    disabled={ag.paused || isRunning}
                    onClick={() => onRunAgent(ag)}
                    className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 disabled:opacity-40 px-3.5 py-1.5 text-xs font-semibold text-white shrink-0 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {isRunning ? 'กำลังรัน…' : 'สั่งรัน'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI Execution Logs */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">บันทึกการทำงานของ AI (AI Run & Token Logs)</h2>
            <p className="text-xs text-slate-400">ประวัติการลงมือทำงานจริง เวลาที่ใช้ และปริมาณ Tokens รายครั้ง</p>
          </div>
          <span className="text-xs text-slate-400">{runs.length} รายการล่าสุด</span>
        </div>

        <div className="divide-y divide-slate-800/70 max-h-[420px] overflow-y-auto">
          {runs.map((r) => {
            const ag = agents.find((a) => a.id === r.agentId)
            return (
              <div key={r.id} className="px-5 py-3.5 hover:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5"
                    style={{ backgroundColor: ag?.color ?? '#6C5CE7' }}
                  >
                    {ag?.name?.slice(0, 2) ?? 'AI'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-white">{ag?.name ?? r.agentId}</span>
                      <span className="text-purple-300 font-medium">{r.action}</span>
                      {r.detail && <span className="text-slate-400 truncate">· {r.detail}</span>}
                    </div>
                    {r.output && <p className="text-xs text-slate-300 mt-1 leading-relaxed">{r.output}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {r.tokens.toLocaleString()} tok
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {r.durationSec}s
                  </span>
                  <span>{r.at}</span>
                </div>
              </div>
            )
          })}
          {runs.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">ยังไม่มีประวัติการรัน AI</div>
          )}
        </div>
      </section>

      {/* Modal: Create / Edit AI Agent */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `ตั้งค่าเอเจนต์ ${editing.name}` : 'สร้างเอเจนต์ AI ประจำทีม'}
        maxWidth="lg"
      >
        <form onSubmit={onSaveAgent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ชื่อรหัสเอเจนต์ (Code Name) *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น ATLAS, SPARK"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white uppercase"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">โมเดล AI หลัก</label>
              <select
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                {AI_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">บทบาทหน้าที่ (Role) *</label>
            <input
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="เช่น AI DevOps & Security Auditor"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              ระดับความเป็นอิสระ (Autonomy: {form.autonomy}%)
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={form.autonomy}
              onChange={(e) => setForm({ ...form, autonomy: Number(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">ทักษะ (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
            <input
              value={form.skillsText}
              onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1.5">สีประจำตัวเอเจนต์</label>
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

          <div className="flex justify-end gap-2 pt-2">
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
              {saving ? 'กำลังบันทึก…' : 'บันทึกเอเจนต์'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
