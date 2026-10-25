'use client'

import { useMemo, useState, FormEvent } from 'react'
import {
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  User,
  Edit3,
  Trash2,
} from 'lucide-react'
import { api, ApiError, type Client } from '@/lib/api/client'
import { useApp, useClients, useInvoices, useProjects } from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import { fmtDateThai, initials, money, TEAM_COLORS, todayStr } from '@/lib/erp-helpers'

export default function ClientsPage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const clients = useClients()
  const projects = useProjects()
  const invoices = useInvoices()
  const allowManage = canManage(user?.role)

  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    short: '',
    contact: '',
    phone: '',
    email: '',
    addr: '',
    since: todayStr(),
    color: TEAM_COLORS[0],
  })

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return clients.filter((c) => {
      if (!kw) return true
      return `${c.name} ${c.short} ${c.contact} ${c.email} ${c.phone}`.toLowerCase().includes(kw)
    })
  }, [clients, q])

  function openCreate() {
    setEditing(null)
    setErrMsg(null)
    setForm({
      name: '',
      short: '',
      contact: '',
      phone: '',
      email: '',
      addr: '',
      since: todayStr(),
      color: TEAM_COLORS[clients.length % TEAM_COLORS.length],
    })
    setModalOpen(true)
  }

  function openEdit(c: Client) {
    setEditing(c)
    setErrMsg(null)
    setForm({
      name: c.name,
      short: c.short || '',
      contact: c.contact || '',
      phone: c.phone || '',
      email: c.email || '',
      addr: c.addr || '',
      since: c.since?.slice(0, 10) || todayStr(),
      color: c.color || TEAM_COLORS[0],
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
        short: form.short.trim() || form.name.trim().slice(0, 14),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        addr: form.addr.trim(),
        since: form.since,
        color: form.color,
      }
      if (editing) {
        await api.clients.update(editing.id, payload)
      } else {
        await api.clients.create(payload)
      }
      await refresh()
      setModalOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'บันทึกข้อมูลลูกค้าไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(c: Client) {
    if (!window.confirm(`ยืนยันการลบข้อมูลลูกค้า "${c.name}" ?`)) return
    setSaving(true)
    try {
      await api.clients.remove(c.id)
      await refresh()
      setModalOpen(false)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'ลบลูกค้าไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ลูกค้า (CRM) · {clients.length} ราย</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            บริหารข้อมูลติดต่อลูกค้า ประวัติโครงการ และมูลค่ารายรับสะสมรายองค์กร
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> เพิ่มลูกค้าใหม่
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อบริษัท, ผู้ติดต่อ, เบอร์โทร, อีเมล…"
          className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const projCount = projects.filter(
            (p) => p.client === c.id || p.clientName === c.name
          ).length
          const paidRevenue = invoices
            .filter((i) => i.client === c.id && i.status === 'paid')
            .reduce((s, i) => s + i.amount + i.vat, 0)
          const pendingRevenue = invoices
            .filter((i) => i.client === c.id && i.status !== 'paid' && i.status !== 'draft')
            .reduce((s, i) => s + i.amount + i.vat, 0)

          return (
            <div
              key={c.id}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shrink-0"
                      style={{ backgroundColor: c.color || '#3BA7FF' }}
                    >
                      {initials(c.short || c.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">{c.name}</h3>
                      <div className="text-xs text-slate-500">ลูกค้าตั้งแต่ {fmtDateThai(c.since)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                    title="แก้ไขลูกค้า"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-300">
                  {c.contact && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {c.contact}
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {c.phone}
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {c.email}
                    </div>
                  )}
                  {c.addr && (
                    <div className="flex items-start gap-2 text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{c.addr}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <div className="text-slate-500">โปรเจกต์</div>
                  <div className="font-bold text-white mt-0.5">{projCount}</div>
                </div>
                <div>
                  <div className="text-slate-500">ชำระแล้ว</div>
                  <div className="font-semibold text-emerald-300 mt-0.5 tabular-nums">{money(paidRevenue)}</div>
                </div>
                <div>
                  <div className="text-slate-500">รอรับชำระ</div>
                  <div className="font-semibold text-amber-300 mt-0.5 tabular-nums">{money(pendingRevenue)}</div>
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-slate-500">ไม่พบข้อมูลลูกค้า</div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `แก้ไขลูกค้า: ${editing.name}` : 'เพิ่มลูกค้าใหม่'}
        maxWidth="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1">ชื่อบริษัท / องค์กร *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="บริษัท ตัวอย่าง จำกัด"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">ชื่อย่อ</label>
              <input
                value={form.short}
                onChange={(e) => setForm({ ...form, short: e.target.value })}
                placeholder="EXM"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ชื่อผู้ติดต่อ</label>
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="คุณสมชาย ใจดี"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">เบอร์โทรศัพท์</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="02-xxx-xxxx"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">อีเมล</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@company.co.th"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">วันที่เริ่มเป็นลูกค้า</label>
              <input
                type="date"
                value={form.since}
                onChange={(e) => setForm({ ...form, since: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">ที่อยู่สำหรับออกใบกำกับภาษี</label>
            <textarea
              rows={2}
              value={form.addr}
              onChange={(e) => setForm({ ...form, addr: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1.5">สีป้ายองค์กร</label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setForm({ ...form, color: col })}
                  className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                    form.color === col ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: col }}
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
            {editing && allowManage ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onDelete(editing)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบลูกค้า
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
