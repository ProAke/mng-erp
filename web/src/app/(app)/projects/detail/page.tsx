'use client'

import { Suspense, useEffect, useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Cloud, HardDrive, Save } from 'lucide-react'
import { api, ApiError, type DriveStatus, type Project } from '@/lib/api/client'
import { useApp, useClients, useProjects, useTeam } from '@/lib/stores/app'
import { todayStr } from '@/lib/erp-helpers'

const RichTextEditor = dynamic(() => import('@/components/editor/RichTextEditor'), {
  ssr: false,
  loading: () => (
    <div className="p-6 text-muted bg-bg-2 border border-line rounded-lg text-sm">
      กำลังโหลดเครื่องมือแก้ไขข้อความ Rich Text…
    </div>
  ),
})

function ProjectDetailForm({
  editId,
  existing,
}: {
  editId: string | null
  existing: Project | null
}) {
  const { refresh } = useApp()
  const clients = useClients()
  const team = useTeam()

  const initialClient = existing
    ? clients.find((c) => c.id === existing.client || c.name === existing.clientName)?.id ??
      existing.clientName ??
      ''
    : ''

  const [code, setCode] = useState(existing?.code ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [client, setClient] = useState(initialClient)
  const [status, setStatus] = useState(existing?.status || 'doing')
  const [budget, setBudget] = useState(existing?.budget ?? 250000)
  const [spent, setSpent] = useState(existing?.spent ?? 0)
  const [start, setStart] = useState(existing?.start?.slice(0, 10) || todayStr())
  const [end, setEnd] = useState(existing?.end?.slice(0, 10) || '2026-12-31')
  const [members, setMembers] = useState<string[]>(existing?.members?.length ? existing.members : ['u1'])
  const [content, setContent] = useState(existing?.desc || '')

  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.drive
      .status()
      .then((st) => {
        if (active) setDriveStatus(st)
      })
      .catch(() => {
        if (active) setDriveStatus({ connected: false })
      })
    return () => {
      active = false
    }
  }, [])

  async function handleImageUpload(file: File): Promise<string> {
    const res = await api.drive.upload(file)
    return res.url
  }

  async function handleConnectDrive() {
    try {
      const { url } = await api.drive.authUrl()
      window.location.href = url
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ไม่สามารถเชื่อมต่อ Google Drive ได้')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        code: code.trim().toUpperCase() || undefined,
        name: name.trim(),
        client: client || undefined,
        status,
        budget: Number(budget) || 0,
        spent: Number(spent) || 0,
        start,
        end,
        members,
        desc: content,
      }
      if (editId) {
        await api.projects.update(editId, payload)
      } else {
        await api.projects.create(payload)
      }
      await refresh()
      window.location.href = '/projects/'
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลโปรเจกต์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-violet mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> กลับไปยังหน้ารวมโปรเจกต์
          </Link>
          <h1 className="text-2xl font-bold text-ink">
            {editId ? 'แก้ไขโปรเจกต์และเอกสารขอบเขตงาน' : 'สร้างโปรเจกต์ใหม่ (Rich Text)'}
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {driveStatus?.connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft border border-mint/30 px-3 py-1 text-mint">
              <Cloud className="w-3.5 h-3.5" /> เชื่อมต่อ Google Drive แล้ว
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-1 border border-line-2 px-3 py-1 text-ink-2">
                <HardDrive className="w-3.5 h-3.5 text-violet" /> อัปโหลดรูปเก็บในเซิร์ฟเวอร์อัตโนมัติ
              </span>
              {driveStatus?.configured && (
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  className="rounded-lg border border-violet/30 px-2.5 py-1 text-violet hover:bg-violet-soft cursor-pointer"
                >
                  เชื่อม Google Drive
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-card border border-line rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">รหัสย่อ (Code)</label>
            <input
              type="text"
              value={code}
              maxLength={10}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ERP"
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2.5 text-sm font-mono uppercase text-ink focus:outline-none focus:border-violet"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-ink-2 mb-1.5">ชื่อโปรเจกต์ *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="กรอกชื่อโปรเจกต์..."
              className="w-full rounded-lg bg-bg-2 border border-line px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-violet"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-ink-2 mb-1.5">สถานะโปรเจกต์</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg bg-bg-2 border border-line px-3.5 py-2.5 text-sm text-ink"
            >
              <option value="todo">วางแผน</option>
              <option value="doing">กำลังดำเนินการ</option>
              <option value="review">ตรวจรับงาน</option>
              <option value="done">ส่งมอบแล้ว</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-ink-2 mb-1.5">ลูกค้า</label>
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
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
            <label className="block text-xs font-medium text-ink-2 mb-1.5">งบประมาณ (บาท)</label>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">ใช้จริงแล้ว (บาท)</label>
            <input
              type="number"
              min={0}
              value={spent}
              onChange={(e) => setSpent(Number(e.target.value))}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">วันเริ่มโปรเจกต์</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">กำหนดส่งมอบ</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-2 mb-2">
            ทีมงานในโปรเจกต์ (รวมทีมมนุษย์ & AI Workforce)
          </label>
          <div className="flex flex-wrap gap-2">
            {team.map((m) => {
              const selected = members.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setMembers(selected ? members.filter((x) => x !== m.id) : [...members, m.id])
                  }
                  className={`rounded-full px-3 py-1 text-xs border transition cursor-pointer ${
                    selected
                      ? 'bg-violet-soft border-violet text-violet'
                      : 'bg-bg-2 border-line text-muted hover:text-ink'
                  }`}
                >
                  {m.kind === 'ai' ? '🤖 ' : ''}
                  {m.nickname ? `${m.nickname} (${m.name})` : m.name}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-2 mb-2">
            รายละเอียดขอบเขตงาน (รองรับ Rich Text, ตาราง, และการแทรกรูปภาพ)
          </label>
          <div className="rounded-lg overflow-hidden border border-line-2">
            <RichTextEditor
              initialData={content}
              onChange={(data) => setContent(data)}
              onImageUpload={handleImageUpload}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-soft border border-red/30 px-4 py-2.5 text-sm text-red">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/projects"
            className="rounded-lg border border-line-2 px-4 py-2.5 text-xs font-medium text-ink-2 hover:bg-tint-1"
          >
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-violet hover:bg-violet-2 disabled:opacity-60 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'กำลังบันทึก...' : editId ? 'บันทึกการแก้ไขโปรเจกต์' : 'สร้างโปรเจกต์'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ProjectDetailRoute() {
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const projects = useProjects()
  const existing = editId ? projects.find((p) => p.id === editId) ?? null : null
  const formKey = editId ? `${editId}-${existing ? 'loaded' : 'pending'}` : '__new__'
  return <ProjectDetailForm key={formKey} editId={editId} existing={existing} />
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<div className="text-muted text-sm">กำลังโหลดข้อมูลโปรเจกต์…</div>}>
      <ProjectDetailRoute />
    </Suspense>
  )
}
