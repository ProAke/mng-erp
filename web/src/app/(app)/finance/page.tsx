'use client'

import { useMemo, useState, FormEvent } from 'react'
import {
  Plus,
  CheckCircle2,
  Printer,
  Trash2,
  Edit3,
  Search,
  Wallet,
  Clock,
  AlertOctagon,
  FileSpreadsheet,
} from 'lucide-react'
import { api, ApiError, type Invoice } from '@/lib/api/client'
import { useApp, useClients, useInvoices, useTrend } from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import { BarChart } from '@/components/ui/Charts'
import {
  addDays,
  downloadTextFile,
  fmtDateThai,
  INVOICE_STATUS_META,
  money,
  MONTHS_SHORT_TH,
  toCsv,
  todayStr,
} from '@/lib/erp-helpers'

interface LineItem {
  d: string
  q: number
  p: number
}

export default function FinancePage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const invoices = useInvoices()
  const clients = useClients()
  const trend = useTrend()
  const allowManage = canManage(user?.role)

  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const [form, setForm] = useState({
    client: '',
    title: '',
    issue: todayStr(),
    due: addDays(todayStr(), 30),
    status: 'pending',
    items: [{ d: 'ค่าบริการพัฒนาซอฟต์แวร์', q: 1, p: 50000 }] as LineItem[],
  })

  const summary = useMemo(() => {
    const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.amount + i.vat, 0)
    const paid = invoices.filter((i) => i.status === 'paid')
    const pending = invoices.filter((i) => i.status === 'pending')
    const overdue = invoices.filter((i) => i.status === 'overdue')
    const draft = invoices.filter((i) => i.status === 'draft')
    return {
      paidAmt: sum(paid),
      paidCnt: paid.length,
      pendingAmt: sum(pending),
      pendingCnt: pending.length,
      overdueAmt: sum(overdue),
      overdueCnt: overdue.length,
      draftAmt: sum(draft),
      draftCnt: draft.length,
    }
  }, [invoices])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (statusFilter && inv.status !== statusFilter) return false
      if (kw) {
        const cname = clients.find((c) => c.id === inv.client)?.name ?? ''
        const hay = `${inv.no} ${inv.title} ${cname}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [invoices, clients, statusFilter, q])

  const subtotal = useMemo(
    () => form.items.reduce((s, it) => s + (Number(it.q) || 0) * (Number(it.p) || 0), 0),
    [form.items]
  )
  const vatAmount = Math.round(subtotal * 0.07)

  function openCreate() {
    setEditing(null)
    setErrMsg(null)
    setForm({
      client: clients[0]?.id ?? '',
      title: '',
      issue: todayStr(),
      due: addDays(todayStr(), 30),
      status: 'pending',
      items: [{ d: 'ค่าบริการพัฒนาและดูแลระบบ', q: 1, p: 50000 }],
    })
    setFormOpen(true)
  }

  function openEdit(inv: Invoice) {
    setEditing(inv)
    setErrMsg(null)
    setForm({
      client: inv.client || '',
      title: inv.title || '',
      issue: inv.issue?.slice(0, 10) || todayStr(),
      due: inv.due?.slice(0, 10) || addDays(todayStr(), 30),
      status: inv.status || 'pending',
      items:
        inv.items?.length > 0
          ? inv.items.map((x: LineItem) => ({ d: x.d ?? '', q: Number(x.q) || 1, p: Number(x.p) || 0 }))
          : [{ d: inv.title || 'ค่าบริการ', q: 1, p: inv.amount }],
    })
    setFormOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrMsg(null)
    try {
      const payload = {
        client: form.client || undefined,
        title: form.title.trim() || form.items[0]?.d || 'ค่าบริการ',
        issue: form.issue,
        due: form.due,
        status: form.status,
        items: form.items,
        amount: subtotal,
        vat: vatAmount,
      }
      if (editing) {
        await api.invoices.update(editing.id, payload)
      } else {
        await api.invoices.create(payload)
      }
      await refresh()
      setFormOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'บันทึกใบแจ้งหนี้ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onPay(inv: Invoice) {
    setSaving(true)
    try {
      await api.invoices.pay(inv.id)
      await refresh()
      setSelected(null)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'บันทึกรับชำระไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(inv: Invoice) {
    if (!window.confirm(`ยืนยันการลบใบแจ้งหนี้ ${inv.no} ?`)) return
    setSaving(true)
    try {
      await api.invoices.remove(inv.id)
      await refresh()
      setSelected(null)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'ลบใบแจ้งหนี้ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const csv = toCsv(
      ['เลขที่', 'ลูกค้า', 'รายการ', 'ก่อน VAT', 'VAT 7%', 'ยอดสุทธิ', 'วันที่ออก', 'กำหนดชำระ', 'สถานะ'],
      filtered.map((i) => [
        i.no,
        clients.find((c) => c.id === i.client)?.name ?? '—',
        i.title,
        i.amount,
        i.vat,
        i.amount + i.vat,
        i.issue ?? '',
        i.due ?? '',
        INVOICE_STATUS_META[i.status]?.label ?? i.status,
      ])
    )
    downloadTextFile(`mng-invoices-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">ใบแจ้งหนี้ & การเงิน</h1>
          <p className="text-sm text-muted mt-0.5">
            ติดตามการวางบิล ภาษีมูลค่าเพิ่ม 7% และสถานะการรับชำระเงินของ MNG Groups
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-card hover:bg-tint-1 px-3.5 py-2 text-xs text-ink cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-mint" /> ส่งออก CSV
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> ออกใบแจ้งหนี้ใหม่
          </button>
        </div>
      </div>

      {/* 4 Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-line bg-card p-5 flex items-start justify-between">
          <div>
            <div className="text-xs text-muted">รับชำระแล้ว (รวม VAT)</div>
            <div className="text-2xl font-bold text-mint mt-1 tabular-nums">{money(summary.paidAmt)}</div>
            <div className="text-xs text-muted mt-1">{summary.paidCnt} ใบ</div>
          </div>
          <div className="p-2.5 rounded-lg bg-mint-soft text-mint">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-5 flex items-start justify-between">
          <div>
            <div className="text-xs text-muted">รอรับชำระ</div>
            <div className="text-2xl font-bold text-violet mt-1 tabular-nums">{money(summary.pendingAmt)}</div>
            <div className="text-xs text-muted mt-1">{summary.pendingCnt} ใบ</div>
          </div>
          <div className="p-2.5 rounded-lg bg-violet-soft text-violet">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-5 flex items-start justify-between">
          <div>
            <div className="text-xs text-muted">เกินกำหนดชำระ</div>
            <div className="text-2xl font-bold text-red mt-1 tabular-nums">{money(summary.overdueAmt)}</div>
            <div className="text-xs text-muted mt-1">{summary.overdueCnt} ใบ</div>
          </div>
          <div className="p-2.5 rounded-lg bg-red-soft text-red">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-5 flex items-start justify-between">
          <div>
            <div className="text-xs text-muted">ฉบับร่าง / เตรียมวางบิล</div>
            <div className="text-2xl font-bold text-ink mt-1 tabular-nums">{money(summary.draftAmt)}</div>
            <div className="text-xs text-muted mt-1">{summary.draftCnt} ใบ</div>
          </div>
          <div className="p-2.5 rounded-lg bg-tint-1 text-ink-2">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-card border border-line rounded-xl p-3.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาเลขที่ INV, ชื่อรายการ, ลูกค้า…"
            className="w-full rounded-lg bg-bg-2 border border-line pl-9 pr-3 py-1.5 text-sm text-ink placeholder-muted focus:outline-none focus:border-violet"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-sm text-ink"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(INVOICE_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Invoice Table */}
      <div className="rounded-xl border border-line bg-card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-bg-2 text-xs text-muted border-b border-line">
            <tr>
              <th className="px-4 py-3">เลขที่</th>
              <th className="px-4 py-3">ลูกค้า</th>
              <th className="px-4 py-3">รายการ</th>
              <th className="px-4 py-3 text-right">ก่อน VAT</th>
              <th className="px-4 py-3 text-right">ยอดสุทธิ (+VAT)</th>
              <th className="px-4 py-3">ครบกำหนด</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((inv) => {
              const client = clients.find((c) => c.id === inv.client)
              const st = INVOICE_STATUS_META[inv.status] ?? INVOICE_STATUS_META.draft
              return (
                <tr
                  key={inv.id}
                  onClick={() => setSelected(inv)}
                  className="hover:bg-tint-1/40 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-violet">{inv.no}</td>
                  <td className="px-4 py-3 text-xs text-ink">{client?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-ink">{inv.title}</td>
                  <td className="px-4 py-3 text-right text-xs text-ink-2 tabular-nums">{money(inv.amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">
                    {money(inv.amount + inv.vat)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{fmtDateThai(inv.due)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border ${st.badge}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {inv.status !== 'paid' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onPay(inv)}
                        className="inline-flex items-center gap-1 rounded-lg bg-mint-soft hover:bg-mint-soft border border-mint/30 px-2.5 py-1 text-xs text-mint cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> รับชำระ
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  ไม่พบใบแจ้งหนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Monthly Revenue Chart */}
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="font-semibold text-ink mb-1">กราฟรายรับรายเดือนที่รับชำระแล้ว (พันบาท)</h2>
        <p className="text-xs text-muted mb-4">คำนวณสดจากใบแจ้งหนี้สถานะชำระแล้วในปี 2569</p>
        <BarChart
          labels={trend?.months ?? MONTHS_SHORT_TH}
          values={trend?.revenue ?? Array(12).fill(0)}
          color="#34d399"
          unit="k"
        />
      </section>

      {/* Invoice Detail Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `ใบแจ้งหนี้ ${selected.no}` : ''}
        subtitle={selected?.title}
        maxWidth="2xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-bg-2 border border-line p-4 text-xs">
              <div>
                <div className="text-muted">ลูกค้า</div>
                <div className="text-sm font-semibold text-ink mt-0.5">
                  {clients.find((c) => c.id === selected.client)?.name ?? 'ไม่ระบุ'}
                </div>
                <div className="text-muted mt-1">
                  {clients.find((c) => c.id === selected.client)?.addr ?? ''}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div>วันที่ออก: <strong className="text-ink">{fmtDateThai(selected.issue)}</strong></div>
                <div>ครบกำหนด: <strong className="text-ink">{fmtDateThai(selected.due)}</strong></div>
                {selected.paid && (
                  <div className="text-mint">ชำระเมื่อ: {fmtDateThai(selected.paid)}</div>
                )}
              </div>
            </div>

            <table className="w-full text-xs border border-line rounded-lg overflow-hidden">
              <thead className="bg-bg-2 text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">รายการ</th>
                  <th className="px-3 py-2 text-right">จำนวน</th>
                  <th className="px-3 py-2 text-right">ราคาต่อหน่วย</th>
                  <th className="px-3 py-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(selected.items || []).map((it: LineItem, idx: number) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-ink">{it.d}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{it.q}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{money(it.p)}</td>
                    <td className="px-3 py-2 text-right text-ink font-medium">
                      {money((Number(it.q) || 0) * (Number(it.p) || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-xs">
                <div className="flex justify-between text-muted">
                  <span>รวมก่อนภาษี</span>
                  <span>{money(selected.amount)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                  <span>{money(selected.vat)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-violet pt-2 border-t border-line">
                  <span>ยอดชำระสุทธิ</span>
                  <span>{money(selected.amount + selected.vat)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-2 text-xs text-ink hover:bg-tint-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> พิมพ์ / PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cur = selected
                    setSelected(null)
                    openEdit(cur)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-2 text-xs text-ink hover:bg-tint-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> แก้ไข
                </button>
                {allowManage && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onDelete(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-xs text-red hover:bg-red-soft cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> ลบ
                  </button>
                )}
              </div>

              {selected.status !== 'paid' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onPay(selected)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-mint hover:opacity-90 px-4 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> บันทึกรับชำระเงินแล้ว
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create / Edit Invoice Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `แก้ไขใบแจ้งหนี้ ${editing.no}` : 'ออกใบแจ้งหนี้ใหม่'}
        maxWidth="2xl"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">ลูกค้า</label>
              <select
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                <option value="">— เลือกลูกค้า —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">สถานะ</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                {Object.entries(INVOICE_STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">หัวข้อใบแจ้งหนี้ *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น งวดงานที่ 2 — พัฒนาระบบหลังบ้านและ API"
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">วันที่ออก</label>
              <input
                type="date"
                value={form.issue}
                onChange={(e) => setForm({ ...form, issue: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">วันครบกำหนดชำระ</label>
              <input
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">รายการค่าบริการ</span>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, items: [...form.items, { d: '', q: 1, p: 0 }] })
                }
                className="text-xs text-violet hover:text-violet cursor-pointer"
              >
                + เพิ่มรายการย่อย
              </button>
            </div>
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  required
                  placeholder="รายละเอียดรายการ"
                  value={it.d}
                  onChange={(e) => {
                    const next = [...form.items]
                    next[idx] = { ...next[idx], d: e.target.value }
                    setForm({ ...form, items: next })
                  }}
                  className="col-span-6 rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-xs text-ink"
                />
                <input
                  type="number"
                  min={1}
                  value={it.q}
                  onChange={(e) => {
                    const next = [...form.items]
                    next[idx] = { ...next[idx], q: Number(e.target.value) }
                    setForm({ ...form, items: next })
                  }}
                  className="col-span-2 rounded-lg bg-bg-2 border border-line px-2 py-1.5 text-xs text-ink text-right"
                />
                <input
                  type="number"
                  min={0}
                  value={it.p}
                  onChange={(e) => {
                    const next = [...form.items]
                    next[idx] = { ...next[idx], p: Number(e.target.value) }
                    setForm({ ...form, items: next })
                  }}
                  className="col-span-3 rounded-lg bg-bg-2 border border-line px-2 py-1.5 text-xs text-ink text-right"
                />
                <button
                  type="button"
                  disabled={form.items.length <= 1}
                  onClick={() =>
                    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
                  }
                  className="col-span-1 text-muted hover:text-red disabled:opacity-30 flex justify-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-bg-2 border border-line p-3.5 text-xs space-y-1">
            <div className="flex justify-between text-muted">
              <span>ยอดรวมก่อนภาษี</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>VAT 7%</span>
              <span>{money(vatAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-violet pt-1 border-t border-line">
              <span>รวมสุทธิทั้งสิ้น</span>
              <span>{money(subtotal + vatAmount)}</span>
            </div>
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
              className="rounded-lg bg-violet hover:bg-violet-2 px-4 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
            >
              {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'ออกใบแจ้งหนี้'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
