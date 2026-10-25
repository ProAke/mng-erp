import type { Client, Project } from '@/lib/api/client'

export const MONTHS_SHORT_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const MONTHS_FULL_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
export const DOW_SHORT_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
export const WEEKDAYS_TH = DOW_SHORT_TH

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(iso?: string | null): Date | null {
  if (!iso) return null
  const clean = String(iso).slice(0, 10)
  const parts = clean.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

export function fmtDateThai(iso?: string | null, full = false): string {
  const d = parseDate(iso)
  if (!d) return '—'
  const m = full ? MONTHS_FULL_TH[d.getMonth()] : MONTHS_SHORT_TH[d.getMonth()]
  return `${d.getDate()} ${m} ${d.getFullYear() + 543}`
}

export function fmtDateShort(iso?: string | null): string {
  const d = parseDate(iso)
  if (!d) return '—'
  return `${d.getDate()} ${MONTHS_SHORT_TH[d.getMonth()]}`
}

export function daysLeft(iso?: string | null): number | null {
  const target = parseDate(iso)
  const now = parseDate(todayStr())
  if (!target || !now) return null
  return Math.round((target.getTime() - now.getTime()) / 86_400_000)
}

export function relDayLabel(iso?: string | null): { text: string; tone: 'danger' | 'warn' | 'ok' | 'muted' } {
  const n = daysLeft(iso)
  if (n === null) return { text: 'ไม่กำหนด', tone: 'muted' }
  if (n === 0) return { text: 'วันนี้', tone: 'warn' }
  if (n === 1) return { text: 'พรุ่งนี้', tone: 'warn' }
  if (n === -1) return { text: 'เมื่อวาน', tone: 'danger' }
  if (n < 0) return { text: `เลยกำหนด ${-n} วัน`, tone: 'danger' }
  if (n <= 3) return { text: `อีก ${n} วัน`, tone: 'warn' }
  return { text: `อีก ${n} วัน`, tone: 'ok' }
}

export function money(n?: number | null): string {
  const v = Number(n ?? 0)
  return `฿${v.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
}

export function moneyK(n?: number | null): string {
  const v = Number(n ?? 0)
  if (Math.abs(v) >= 1_000_000) return `฿${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `฿${Math.round(v / 1_000).toLocaleString('th-TH')}k`
  return money(v)
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.map((p) => Array.from(p)[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'
}

export function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function resolveClientName(project: Pick<Project, 'client' | 'clientName'>, clients: Client[]): string {
  if (project.clientName) return project.clientName
  const match = clients.find((c) => c.id === project.client)
  return match?.name ?? project.client ?? 'Internal — MNG Groups'
}

export const TASK_STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  todo:   { label: 'รอดำเนินการ', badge: 'bg-slate-800 text-slate-300 border-slate-700', dot: '#94a3b8' },
  doing:  { label: 'กำลังทำ',     badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30', dot: '#38bdf8' },
  review: { label: 'ตรวจแก้',     badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: '#fbbf24' },
  done:   { label: 'เสร็จแล้ว',   badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: '#34d399' },
}

export const TASK_PRIO_META: Record<string, { label: string; badge: string; color: string }> = {
  urgent: { label: 'ด่วนมาก', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30', color: '#fb7185' },
  high:   { label: 'สูง',     badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', color: '#fbbf24' },
  med:    { label: 'ปกติ',    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30', color: '#38bdf8' },
  low:    { label: 'ต่ำ',     badge: 'bg-slate-800 text-slate-400 border-slate-700', color: '#94a3b8' },
}

export const INVOICE_STATUS_META: Record<string, { label: string; badge: string }> = {
  paid:    { label: 'ชำระแล้ว',     badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  pending: { label: 'รอชำระ',       badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  overdue: { label: 'เกินกำหนด',     badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  draft:   { label: 'ฉบับร่าง',      badge: 'bg-slate-800 text-slate-300 border-slate-700' },
}

export const ROLE_META: Record<string, { label: string; badge: string }> = {
  super_admin: { label: 'Super Admin',  badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  admin:       { label: 'ผู้ดูแลระบบ',  badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  manager:     { label: 'ผู้จัดการ',    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  staff:       { label: 'ทีมงาน',      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  viewer:      { label: 'ผู้ชมอย่างเดียว', badge: 'bg-slate-800 text-slate-300 border-slate-700' },
}

export const DEFAULT_EVENT_CATS: Record<string, { label: string; color: string }> = {
  task:     { label: 'งาน/เดดไลน์', color: '#3BA7FF' },
  meeting:  { label: 'ประชุม',       color: '#8E7CF3' },
  deadline: { label: 'ส่งมอบ',       color: '#FF5C7A' },
  finance:  { label: 'การเงิน',      color: '#FFB020' },
  holiday:  { label: 'วันหยุด',      color: '#22C793' },
  personal: { label: 'ส่วนตัว',      color: '#B39EF0' },
}

export const PRESENCE_META: Record<string, { label: string; dot: string; badge: string; icon: string }> = {
  online:  { label: 'ออนไลน์',      dot: '#34d399', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: '🟢' },
  working: { label: 'กำลังทำงาน',    dot: '#38bdf8', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',             icon: '💻' },
  focus:   { label: 'โฟกัสห้ามรบกวน', dot: '#c084fc', badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',   icon: '🎧' },
  away:    { label: 'พัก / ไม่อยู่',  dot: '#94a3b8', badge: 'bg-slate-800 text-slate-400 border-slate-700',             icon: '🌙' },
}

export const LEAVE_TYPE_META: Record<string, { label: string; badge: string }> = {
  annual:   { label: 'ลาพักร้อน', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  sick:     { label: 'ลาป่วย',   badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  personal: { label: 'ลากิจ',    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  wfh:      { label: 'Work From Home', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
}

export const TEAM_COLORS = [
  '#2F6BF0', '#6C5CE7', '#F25C8B', '#14B890', '#F2762E', '#17A2B8', '#FFB020', '#E11D48',
]

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

export async function fileToAvatarDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(String(reader.result))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
