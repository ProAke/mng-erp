'use client'

import { useMemo, useState, FormEvent } from 'react'
import {
  DoorOpen,
  Camera,
  Video,
  Plus,
  Users,
  Clock,
  Trash2,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { api, ApiError, type Room } from '@/lib/api/client'
import { useApp, useBookings, useHumanTeam, useRooms } from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import { fmtDateThai, TEAM_COLORS, todayStr } from '@/lib/erp-helpers'

const KIND_META: Record<string, { label: string; icon: typeof DoorOpen }> = {
  room: { label: 'ห้องประชุม', icon: DoorOpen },
  studio: { label: 'ห้องสตูดิโอ', icon: Video },
  gear: { label: 'อุปกรณ์ส่วนกลาง', icon: Camera },
}

export default function RoomsBookingPage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const rooms = useRooms()
  const bookings = useBookings()
  const humans = useHumanTeam()
  const allowManage = canManage(user?.role)

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [bookOpen, setBookOpen] = useState(false)
  const [roomModalOpen, setRoomModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const [bookForm, setBookForm] = useState({
    roomId: '',
    title: '',
    date: todayStr(),
    startTime: '10:00',
    endTime: '11:30',
    attendees: [] as string[],
    note: '',
  })

  const [roomForm, setRoomForm] = useState({
    name: '',
    kind: 'room',
    capacity: 8,
    floor: 'ชั้น 3',
    equipmentText: 'จอ 4K, ไมค์ประชุม, Whiteboard',
    color: TEAM_COLORS[0],
  })

  const dayBookings = useMemo(
    () => bookings.filter((b) => b.date === selectedDate),
    [bookings, selectedDate]
  )

  function openBookingModal(rm?: Room) {
    setErrMsg(null)
    setBookForm({
      roomId: rm?.id ?? rooms[0]?.id ?? '',
      title: '',
      date: selectedDate,
      startTime: '10:00',
      endTime: '11:30',
      attendees: [],
      note: '',
    })
    setBookOpen(true)
  }

  async function onSubmitBooking(e: FormEvent) {
    e.preventDefault()
    if (!bookForm.roomId || !bookForm.title.trim()) return
    setSaving(true)
    setErrMsg(null)
    try {
      await api.rooms.book({
        roomId: bookForm.roomId,
        title: bookForm.title.trim(),
        date: bookForm.date,
        startTime: bookForm.startTime,
        endTime: bookForm.endTime,
        attendees: bookForm.attendees,
        note: bookForm.note.trim(),
      })
      await refresh()
      setSelectedDate(bookForm.date)
      setBookOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'จองห้องไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onCancelBooking(id: string, title: string) {
    if (!window.confirm(`ยกเลิกการจอง "${title}" ?`)) return
    try {
      await api.rooms.cancelBooking(id)
      await refresh()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'ยกเลิกไม่สำเร็จ')
    }
  }

  async function onSubmitRoom(e: FormEvent) {
    e.preventDefault()
    if (!roomForm.name.trim()) return
    setSaving(true)
    try {
      await api.rooms.create({
        name: roomForm.name.trim(),
        kind: roomForm.kind,
        capacity: Number(roomForm.capacity) || 6,
        floor: roomForm.floor.trim(),
        color: roomForm.color,
        equipment: roomForm.equipmentText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
      await refresh()
      setRoomModalOpen(false)
      setRoomForm({
        name: '',
        kind: 'room',
        capacity: 8,
        floor: 'ชั้น 3',
        equipmentText: 'จอ 4K, ไมค์ประชุม',
        color: TEAM_COLORS[0],
      })
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'เพิ่มห้องไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">จองห้องประชุม สตูดิโอ & อุปกรณ์ส่วนกลาง</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            ระบบตรวจสอบเวลาชนกันอัตโนมัติ พร้อมซิงก์ตารางจองขึ้นปฏิทินรวมของบริษัททันที
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowManage && (
            <button
              type="button"
              onClick={() => setRoomModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs text-slate-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> เพิ่มห้อง/อุปกรณ์
            </button>
          )}
          <button
            type="button"
            onClick={() => openBookingModal()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
          >
            <CalendarIcon className="w-4 h-4" /> จองห้อง / อุปกรณ์
          </button>
        </div>
      </div>

      {/* Rooms & Studio Gear Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {rooms.map((rm) => {
          const kMeta = KIND_META[rm.kind] ?? KIND_META.room
          const Icon = kMeta.icon
          const rmBookings = dayBookings.filter((b) => b.roomId === rm.id)

          return (
            <div
              key={rm.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: rm.color || '#3BA7FF' }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white leading-snug">{rm.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {kMeta.label} {rm.floor ? `· ${rm.floor}` : ''}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  รองรับ {rm.capacity} ที่นั่ง/ชุด
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(rm.equipment || []).map((eq) => (
                    <span
                      key={eq}
                      className="rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {eq}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  จองวันนี้:{' '}
                  <strong className={rmBookings.length ? 'text-amber-300' : 'text-emerald-300'}>
                    {rmBookings.length ? `${rmBookings.length} ช่วงเวลา` : 'ว่างทั้งวัน'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => openBookingModal(rm)}
                  className="rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 px-3 py-1.5 text-xs font-medium text-white transition cursor-pointer"
                >
                  จองเลย
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bookings Schedule by Date */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">ตารางการจองประจำวันที่ {fmtDateThai(selectedDate, true)}</h2>
            <p className="text-xs text-slate-400">แสดงรายการจองทั้งหมดของวันที่เลือก</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr())}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              วันนี้
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-800/70">
          {dayBookings.map((bk) => {
            const rm = rooms.find((r) => r.id === bk.roomId)
            const booker = humans.find((h) => h.id === bk.teamId)
            return (
              <div
                key={bk.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="w-2 h-10 rounded-full mt-0.5 shrink-0"
                    style={{ backgroundColor: rm?.color ?? '#3BA7FF' }}
                  />
                  <div>
                    <div className="font-semibold text-white text-sm">{bk.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                        <Clock className="w-3.5 h-3.5" /> {bk.startTime} – {bk.endTime}
                      </span>
                      <span>·</span>
                      <span className="text-slate-200">{rm?.name ?? bk.roomId}</span>
                      <span>·</span>
                      <span>ผู้จอง: {booker?.nickname ?? booker?.name ?? bk.teamId}</span>
                    </div>
                    {bk.note && <p className="text-xs text-slate-400 mt-1">{bk.note}</p>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onCancelBooking(bk.id, bk.title)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 self-end sm:self-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ยกเลิกการจอง
                </button>
              </div>
            )
          })}

          {dayBookings.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              ยังไม่มีรายการจองในวันที่ {fmtDateThai(selectedDate)} — ทุกห้องและอุปกรณ์พร้อมใช้งาน
            </div>
          )}
        </div>
      </section>

      {/* Modal: Book Room */}
      <Modal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        title="จองห้องประชุม / สตูดิโอ / อุปกรณ์"
        subtitle="หากเวลาชนกับรายการที่มีอยู่ ระบบจะแจ้งเตือนทันที"
        maxWidth="lg"
      >
        <form onSubmit={onSubmitBooking} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">เลือกห้องหรืออุปกรณ์ *</label>
            <select
              required
              value={bookForm.roomId}
              onChange={(e) => setBookForm({ ...bookForm, roomId: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.floor || 'ส่วนกลาง'} · รองรับ {r.capacity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">หัวข้อการใช้งาน / การประชุม *</label>
            <input
              required
              value={bookForm.title}
              onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
              placeholder="เช่น ประชุม Kickoff โปรเจกต์ลูกค้าใหม่"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">วันที่ *</label>
              <input
                type="date"
                required
                value={bookForm.date}
                onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">เวลาเริ่ม *</label>
              <input
                type="time"
                required
                value={bookForm.startTime}
                onChange={(e) => setBookForm({ ...bookForm, startTime: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">เวลาสิ้นสุด *</label>
              <input
                type="time"
                required
                value={bookForm.endTime}
                onChange={(e) => setBookForm({ ...bookForm, endTime: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1.5">ผู้เข้าร่วม</label>
            <div className="flex flex-wrap gap-1.5">
              {humans.map((h) => {
                const active = bookForm.attendees.includes(h.id)
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() =>
                      setBookForm({
                        ...bookForm,
                        attendees: active
                          ? bookForm.attendees.filter((x) => x !== h.id)
                          : [...bookForm.attendees, h.id],
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs border cursor-pointer ${
                      active
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {h.nickname || h.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">หมายเหตุเพิ่มเติม</label>
            <input
              value={bookForm.note}
              onChange={(e) => setBookForm({ ...bookForm, note: e.target.value })}
              placeholder="เช่น ขอเตรียมสายแปลง HDMI และน้ำดื่มรับรองลูกค้า 4 ท่าน"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          {errMsg && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
              {errMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBookOpen(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              {saving ? 'กำลังตรวจสอบเวลา…' : 'ยืนยันการจอง'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Create Room / Gear */}
      <Modal open={roomModalOpen} onClose={() => setRoomModalOpen(false)} title="เพิ่มห้องประชุม / อุปกรณ์ส่วนกลาง" maxWidth="md">
        <form onSubmit={onSubmitRoom} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">ชื่อห้องหรืออุปกรณ์ *</label>
            <input
              required
              value={roomForm.name}
              onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
              placeholder="เช่น ห้องประชุมเล็ก B"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ประเภท</label>
              <select
                value={roomForm.kind}
                onChange={(e) => setRoomForm({ ...roomForm, kind: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="room">ห้องประชุม</option>
                <option value="studio">สตูดิโอ</option>
                <option value="gear">อุปกรณ์</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">ความจุ</label>
              <input
                type="number"
                min={1}
                value={roomForm.capacity}
                onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">ชั้น/จุดเก็บ</label>
              <input
                value={roomForm.floor}
                onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">อุปกรณ์ภายใน (คั่นด้วย ,)</label>
            <input
              value={roomForm.equipmentText}
              onChange={(e) => setRoomForm({ ...roomForm, equipmentText: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRoomModalOpen(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              บันทึก
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
