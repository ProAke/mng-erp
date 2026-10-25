'use client'

import { useMemo, useState, FormEvent } from 'react'
import {
  MapPin,
  LogIn,
  LogOut,
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  Building2,
  Home,
  Car,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api/client'
import {
  useApp,
  useCheckins,
  useHumanTeam,
  useLeaves,
  useSettingsData,
} from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import {
  fmtDateThai,
  initials,
  LEAVE_TYPE_META,
  todayStr,
} from '@/lib/erp-helpers'

export default function HrAttendancePage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const humans = useHumanTeam()
  const checkins = useCheckins()
  const leaves = useLeaves()
  const settings = useSettingsData()
  const allowManage = canManage(user?.role)

  const today = todayStr()
  const workStart = (settings.workStart as string) || '09:30'
  const workEnd = (settings.workEnd as string) || '18:30'
  const office = (settings.office as { name?: string; lat?: number; lng?: number; radius?: number }) || {
    name: 'MNG Groups Office',
    lat: 13.7563,
    lng: 100.5018,
    radius: 250,
  }

  const myMember = useMemo(
    () => humans.find((m) => m.email && m.email === user?.email) ?? humans.find((m) => m.me),
    [humans, user?.email]
  )
  const myTodayCheckin = useMemo(
    () => checkins.find((c) => c.teamId === myMember?.id && c.date === today) ?? null,
    [checkins, myMember?.id, today]
  )

  const [mode, setMode] = useState<'office' | 'wfh' | 'onsite'>('office')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  // Leave modal
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'annual',
    startDate: today,
    endDate: today,
    reason: '',
  })

  function flash(tone: 'ok' | 'err', text: string) {
    setBanner({ tone, text })
    setTimeout(() => setBanner(null), 4500)
  }

  function grabGps() {
    if (!navigator.geolocation) {
      flash('err', 'เบราว์เซอร์นี้ไม่รองรับการดึงพิกัด GPS')
      return
    }
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocLoading(false)
        flash('ok', `ดึงพิกัด GPS สำเร็จ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`)
      },
      () => {
        setLocLoading(false)
        flash('err', 'ไม่สามารถเข้าถึงพิกัด GPS ได้ (สามารถกดลงเวลาแบบ WFH หรือไม่ระบุพิกัดได้)')
      },
      { timeout: 8000 }
    )
  }

  async function onClockIn() {
    setBusy(true)
    try {
      const res = await api.hr.clockIn({
        mode,
        lat: coords?.lat,
        lng: coords?.lng,
        note: note.trim() || undefined,
      })
      setNote('')
      await refresh()
      const distInfo = res.distanceM != null ? ` · ห่างออฟฟิศ ${res.distanceM} ม.` : ''
      const lateInfo = res.lateMin > 0 ? ` (สาย ${res.lateMin} นาที)` : ' (ตรงเวลา)'
      flash('ok', `ลงเวลาเข้างาน ${res.clockIn} เรียบร้อย${lateInfo}${distInfo}`)
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'ลงเวลาเข้างานไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function onClockOut() {
    setBusy(true)
    try {
      const res = await api.hr.clockOut()
      await refresh()
      flash('ok', `ลงเวลาเลิกงาน ${res.clockOut} เรียบร้อยแล้ว ขอบคุณสำหรับวันนี้ครับ!`)
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'ลงเวลาเลิกงานไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitLeave(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.hr.createLeave({
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason.trim(),
      })
      await refresh()
      setLeaveOpen(false)
      setLeaveForm({ leaveType: 'annual', startDate: today, endDate: today, reason: '' })
      flash('ok', 'ส่งใบขอลาเรียบร้อยแล้ว รอผู้ดูแลอนุมัติ')
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'ส่งใบลาไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function onDecideLeave(id: string, status: 'approved' | 'rejected') {
    try {
      await api.hr.updateLeaveStatus(id, status)
      await refresh()
      flash('ok', status === 'approved' ? 'อนุมัติใบลาและซิงก์ขึ้นปฏิทินทีมแล้ว' : 'ปฏิเสธคำขอลาแล้ว')
    } catch (err) {
      flash('err', err instanceof ApiError ? err.message : 'อัปเดตสถานะใบลาไม่สำเร็จ')
    }
  }

  async function onCancelLeave(id: string) {
    if (!window.confirm('ยกเลิกรายการใบลานี้?')) return
    try {
      await api.hr.deleteLeave(id)
      await refresh()
    } catch {
      /* ignore */
    }
  }

  const todayCheckins = checkins.filter((c) => c.date === today)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">ลงเวลาเข้า-ออกงาน & ระบบใบลา (HR Attendance)</h1>
          <p className="text-sm text-muted mt-0.5">
            เวลางานมาตรฐาน {workStart} – {workEnd} น. · ออฟฟิศ: {office.name || 'MNG HQ'} (รัศมี {office.radius ?? 250} ม.)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" /> ยื่นใบลา / ขอ WFH
        </button>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs ${
            banner.tone === 'ok'
              ? 'bg-mint-soft border-mint/30 text-mint'
              : 'bg-red-soft border-red/30 text-red'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Top Grid: My Clock-in Card + Today's Team Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 rounded-2xl border border-line bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ink">บันทึกเวลาทำงานวันนี้</h2>
              <p className="text-xs text-muted">{fmtDateThai(today, true)}</p>
            </div>
            {myTodayCheckin && (
              <span className="rounded-full bg-mint-soft border border-mint/30 px-3 py-1 text-xs font-semibold text-mint">
                เข้างาน {myTodayCheckin.clockIn}
                {myTodayCheckin.clockOut ? ` · ออก ${myTodayCheckin.clockOut}` : ''}
              </span>
            )}
          </div>

          {/* Mode Selector */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(
              [
                ['office', 'เข้าออฟฟิศ', Building2],
                ['wfh', 'WFH ที่บ้าน', Home],
                ['onsite', 'นอกสถานที่', Car],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition cursor-pointer ${
                  mode === key
                    ? 'border-violet bg-violet-soft text-violet font-semibold'
                    : 'border-line bg-bg-2 text-muted hover:text-ink'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={grabGps}
              disabled={locLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-bg-2 hover:bg-tint-1 px-3 py-2 text-xs text-ink cursor-pointer shrink-0"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-2" />
              {locLoading ? 'กำลังหาพิกัด…' : coords ? 'อัปเดตพิกัดแล้ว' : 'แนบพิกัด GPS'}
            </button>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุ (เช่น ไปหาลูกค้า SGI ช่วงเช้า)..."
              className="flex-1 rounded-lg bg-bg-2 border border-line px-3 py-2 text-xs text-ink placeholder-muted"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClockIn}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-mint hover:opacity-90 disabled:opacity-50 py-3 text-xs font-bold text-white shadow-sm cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {myTodayCheckin ? 'อัปเดตเวลาเข้างาน' : 'ลงเวลาเข้างาน (Check-in)'}
            </button>

            <button
              type="button"
              disabled={busy || !myTodayCheckin}
              onClick={onClockOut}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red/30 bg-red-soft hover:bg-red-soft disabled:opacity-40 py-3 text-xs font-semibold text-red cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> ลงเวลาเลิกงาน (Check-out)
            </button>
          </div>
        </section>

        {/* Today's Team Check-in Board */}
        <section className="lg:col-span-7 rounded-2xl border border-line bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-ink">สถานะการเข้างานของทีมวันนี้</h2>
              <p className="text-xs text-muted">
                ลงเวลาแล้ว {todayCheckins.length} จาก {humans.length} คน
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {humans.map((m) => {
              const rec = todayCheckins.find((c) => c.teamId === m.id)
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-2 p-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: m.color || '#6C5CE7' }}
                    >
                      {initials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ink truncate">
                        {m.nickname ? `${m.nickname} (${m.name})` : m.name}
                      </div>
                      <div className="text-[11px] text-muted truncate">
                        {rec
                          ? `${rec.mode === 'wfh' ? '🏠 WFH' : rec.mode === 'onsite' ? '🚗 นอกสถานที่' : '🏢 ออฟฟิศ'}${
                              rec.distanceM != null ? ` · ${rec.distanceM}m` : ''
                            }`
                          : 'ยังไม่ลงเวลาวันนี้'}
                      </div>
                    </div>
                  </div>

                  {rec ? (
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-mint tabular-nums">
                        {rec.clockIn} {rec.clockOut ? `→ ${rec.clockOut}` : ''}
                      </div>
                      {(rec.lateMin ?? 0) > 0 && (
                        <div className="text-[10px] text-violet">สาย {rec.lateMin} น.</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted">—</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Leave Requests Table */}
      <section className="rounded-2xl border border-line bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-ink">รายการใบลาและขอปฏิบัติงาน WFH ({leaves.length})</h2>
            <p className="text-xs text-muted">
              เมื่อผู้จัดการกดอนุมัติ ระบบจะปักวันลาลงในปฏิทินรวมของทีมให้อัตโนมัติ
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2 text-xs text-muted border-b border-line">
              <tr>
                <th className="px-4 py-3">พนักงาน</th>
                <th className="px-4 py-3">ประเภท</th>
                <th className="px-4 py-3">ช่วงวันที่</th>
                <th className="px-4 py-3 text-right">จำนวนวัน</th>
                <th className="px-4 py-3">เหตุผล</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leaves.map((lv) => {
                const m = humans.find((h) => h.id === lv.teamId)
                const meta = LEAVE_TYPE_META[lv.leaveType] ?? LEAVE_TYPE_META.annual
                return (
                  <tr key={lv.id} className="hover:bg-tint-1/30">
                    <td className="px-4 py-3 font-medium text-ink">
                      {m?.nickname ? `${m.nickname} (${m.name})` : m?.name ?? lv.teamId}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {fmtDateThai(lv.startDate)} – {fmtDateThai(lv.endDate)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-ink tabular-nums">
                      {lv.days} วัน
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2 max-w-xs truncate">{lv.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full ${
                          lv.status === 'approved'
                            ? 'bg-mint-soft text-mint'
                            : lv.status === 'rejected'
                            ? 'bg-red-soft text-red'
                            : 'bg-violet-soft text-violet'
                        }`}
                      >
                        {lv.status === 'approved'
                          ? 'อนุมัติแล้ว'
                          : lv.status === 'rejected'
                          ? 'ไม่อนุมัติ'
                          : 'รออนุมัติ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {allowManage && lv.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onDecideLeave(lv.id, 'approved')}
                              className="inline-flex items-center gap-1 rounded-lg bg-mint-soft border border-mint/30 px-2.5 py-1 text-xs text-mint hover:bg-mint-soft cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> อนุมัติ
                            </button>
                            <button
                              type="button"
                              onClick={() => onDecideLeave(lv.id, 'rejected')}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-soft border border-red/30 px-2.5 py-1 text-xs text-red hover:bg-red-soft cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" /> ปฏิเสธ
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onCancelLeave(lv.id)}
                          className="p-1 text-muted hover:text-red cursor-pointer"
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {leaves.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    ยังไม่มีรายการใบลาในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Submit Leave */}
      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="ยื่นใบลา / ขอปฏิบัติงาน WFH" maxWidth="md">
        <form onSubmit={onSubmitLeave} className="space-y-4">
          <div>
            <label className="block text-xs text-ink-2 mb-1">ประเภทการลา</label>
            <select
              value={leaveForm.leaveType}
              onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            >
              {Object.entries(LEAVE_TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">ตั้งแต่วันที่ *</label>
              <input
                type="date"
                required
                value={leaveForm.startDate}
                onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">ถึงวันที่ *</label>
              <input
                type="date"
                required
                min={leaveForm.startDate}
                value={leaveForm.endDate}
                onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">เหตุผล / รายละเอียดการส่งต่องาน</label>
            <textarea
              rows={3}
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              placeholder="ระบุเหตุผลหรือผู้ที่ฝากดูงานแทน..."
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLeaveOpen(false)}
              className="rounded-lg border border-line-2 px-4 py-2 text-xs text-ink-2 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-violet hover:bg-violet-2 px-4 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
            >
              ส่งคำขออนุมัติ
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
