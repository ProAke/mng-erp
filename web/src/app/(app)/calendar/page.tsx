'use client'

import { useMemo, useState, FormEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Maximize2,
  Minimize2,
  MapPin,
  Clock,
  Trash2,
  Edit3,
  CheckSquare,
} from 'lucide-react'
import { api, ApiError, type EventItem, type Task } from '@/lib/api/client'
import { useApp, useEventCats, useEvents, useProjects, useTasks, useTeam } from '@/lib/stores/app'
import { Modal } from '@/components/ui/Modal'
import {
  DEFAULT_EVENT_CATS,
  DOW_SHORT_TH,
  fmtDateThai,
  MONTHS_FULL_TH,
  parseDate,
  todayStr,
  toDateStr,
} from '@/lib/erp-helpers'

type ViewMode = 'month' | 'week' | 'day' | 'agenda'

interface CalendarEntry {
  kind: 'event' | 'task'
  id: string
  title: string
  date: string
  start: string | null
  end: string | null
  allday: boolean
  cat: string
  color: string
  rawEvent?: EventItem
  rawTask?: Task
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 07:00 .. 20:00

export default function CalendarPage() {
  const { refresh } = useApp()
  const events = useEvents()
  const tasks = useTasks()
  const projects = useProjects()
  const team = useTeam()
  const serverCats = useEventCats()

  const cats = useMemo(() => {
    const merged: Record<string, { label: string; color: string }> = { ...DEFAULT_EVENT_CATS }
    for (const [k, v] of Object.entries(serverCats)) {
      merged[k] = { label: v.label, color: v.color }
    }
    return merged
  }, [serverCats])

  const [cursor, setCursor] = useState<string>(() => todayStr())
  const [view, setView] = useState<ViewMode>('month')
  const [fullscreen, setFullscreen] = useState(false)
  const [showTaskDeadlines, setShowTaskDeadlines] = useState(true)
  const [hiddenCats, setHiddenCats] = useState<Record<string, boolean>>({})
  const [dragging, setDragging] = useState<{ kind: 'event' | 'task'; id: string } | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  // Modal state for creating / editing event
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [form, setForm] = useState({
    title: '',
    cat: 'meeting',
    date: todayStr(),
    start: '10:00',
    end: '11:00',
    allday: false,
    loc: '',
    desc: '',
    project: '',
    members: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const cursorDate = useMemo(() => parseDate(cursor) ?? new Date(), [cursor])

  const entries = useMemo<CalendarEntry[]>(() => {
    const out: CalendarEntry[] = []
    for (const ev of events) {
      if (hiddenCats[ev.cat]) continue
      const c = cats[ev.cat] ?? { label: ev.cat, color: '#38bdf8' }
      out.push({
        kind: 'event',
        id: ev.id,
        title: ev.title,
        date: ev.date.slice(0, 10),
        start: ev.start ? ev.start.slice(0, 5) : null,
        end: ev.end ? ev.end.slice(0, 5) : null,
        allday: ev.allday,
        cat: ev.cat,
        color: c.color,
        rawEvent: ev,
      })
    }
    if (showTaskDeadlines && !hiddenCats.task) {
      for (const t of tasks) {
        if (!t.due || t.status === 'done') continue
        out.push({
          kind: 'task',
          id: t.id,
          title: `📌 ${t.code}: ${t.title}`,
          date: t.due.slice(0, 10),
          start: null,
          end: null,
          allday: true,
          cat: 'task',
          color: cats.task?.color ?? '#3BA7FF',
          rawTask: t,
        })
      }
    }
    return out.sort((a, b) => (a.date + (a.start ?? '00:00')).localeCompare(b.date + (b.start ?? '00:00')))
  }, [events, tasks, hiddenCats, showTaskDeadlines, cats])

  const byDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {}
    for (const item of entries) {
      ;(map[item.date] ??= []).push(item)
    }
    return map
  }, [entries])

  // Month grid (42 cells)
  const monthDays = useMemo(() => {
    const y = cursorDate.getFullYear()
    const m = cursorDate.getMonth()
    const first = new Date(y, m, 1)
    const startOffset = first.getDay()
    const start = new Date(y, m, 1 - startOffset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return { iso: toDateStr(d), day: d.getDate(), inMonth: d.getMonth() === m }
    })
  }, [cursorDate])

  // Week grid (7 days starting Sunday)
  const weekDays = useMemo(() => {
    const start = new Date(cursorDate)
    start.setDate(cursorDate.getDate() - cursorDate.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return { iso: toDateStr(d), day: d.getDate(), dow: DOW_SHORT_TH[d.getDay()] }
    })
  }, [cursorDate])

  function stepCursor(dir: -1 | 1) {
    const d = new Date(cursorDate)
    if (view === 'month' || view === 'agenda') d.setMonth(d.getMonth() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setCursor(toDateStr(d))
  }

  function openNewModal(dateIso?: string, hour?: number) {
    const d = dateIso ?? cursor
    const sh = hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : '10:00'
    const eh = hour !== undefined ? `${String(Math.min(23, hour + 1)).padStart(2, '0')}:00` : '11:00'
    setEditing(null)
    setErrMsg(null)
    setForm({
      title: '',
      cat: 'meeting',
      date: d,
      start: sh,
      end: eh,
      allday: false,
      loc: '',
      desc: '',
      project: '',
      members: [],
    })
    setModalOpen(true)
  }

  function openEditModal(ev: EventItem) {
    setEditing(ev)
    setErrMsg(null)
    setForm({
      title: ev.title,
      cat: ev.cat || 'meeting',
      date: ev.date.slice(0, 10),
      start: ev.start ? ev.start.slice(0, 5) : '10:00',
      end: ev.end ? ev.end.slice(0, 5) : '11:00',
      allday: ev.allday,
      loc: ev.loc || '',
      desc: ev.desc || '',
      project: ev.project || '',
      members: ev.members || [],
    })
    setModalOpen(true)
  }

  async function onSaveEvent(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setErrMsg(null)
    try {
      const payload = {
        title: form.title.trim(),
        cat: form.cat,
        date: form.date,
        start: form.allday ? null : form.start,
        end: form.allday ? null : form.end,
        allday: form.allday,
        loc: form.loc.trim(),
        desc: form.desc.trim(),
        project: form.project || undefined,
        members: form.members,
      }
      if (editing) {
        await api.events.update(editing.id, payload)
      } else {
        await api.events.create(payload)
      }
      await refresh()
      setModalOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'บันทึกกิจกรรมไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteEvent() {
    if (!editing) return
    if (!window.confirm(`ยืนยันการลบกิจกรรม "${editing.title}" ?`)) return
    setSaving(true)
    try {
      await api.events.remove(editing.id)
      await refresh()
      setModalOpen(false)
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'ลบกิจกรรมไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function onDropDate(targetIso: string) {
    if (!dragging) return
    const item = dragging
    setDragging(null)
    try {
      if (item.kind === 'event') {
        await api.events.update(item.id, { date: targetIso })
        setBanner(`เลื่อนกิจกรรมไปยังวันที่ ${fmtDateThai(targetIso)} แล้ว`)
      } else {
        await api.tasks.update(item.id, { due: targetIso })
        setBanner(`เลื่อนเดดไลน์งานไปยังวันที่ ${fmtDateThai(targetIso)} แล้ว`)
      }
      await refresh()
      setTimeout(() => setBanner(null), 3000)
    } catch {
      setBanner('ไม่สามารถย้ายวันที่ได้')
    }
  }

  const today = todayStr()
  const titleLabel =
    view === 'day'
      ? fmtDateThai(cursor, true)
      : `${MONTHS_FULL_TH[cursorDate.getMonth()]} ${cursorDate.getFullYear() + 543}`

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-bg-2 p-4 sm:p-6 overflow-y-auto'
          : 'space-y-5'
      }
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepCursor(-1)}
            className="rounded-lg border border-line bg-card p-2 text-ink-2 hover:bg-tint-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(todayStr())}
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-tint-1 cursor-pointer"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => stepCursor(1)}
            className="rounded-lg border border-line bg-card p-2 text-ink-2 hover:bg-tint-1 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-ink ml-2">{titleLabel}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-card p-1 text-xs">
            {(
              [
                ['month', 'เดือน'],
                ['week', 'สัปดาห์'],
                ['day', 'วัน'],
                ['agenda', 'กำหนดการ'],
              ] as [ViewMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  view === k ? 'bg-violet text-white shadow-sm font-semibold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-lg border border-line bg-card p-2 text-ink-2 hover:bg-tint-1 cursor-pointer"
            title={fullscreen ? 'ออกจากโหมดเต็มจอ' : 'ขยายเต็มจอ'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => openNewModal()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet hover:bg-violet-2 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> เพิ่มกิจกรรม
          </button>
        </div>
      </div>

      {banner && (
        <div className="rounded-lg bg-mint-soft border border-mint/30 px-4 py-2 text-xs text-mint">
          {banner}
        </div>
      )}

      {/* Main Layout: Sidebar Filters + Calendar Surface */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Left Rail */}
        <div className="space-y-4">
          {/* Mini Month Picker */}
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="text-xs font-semibold text-ink-2 mb-2">
              {MONTHS_FULL_TH[cursorDate.getMonth()]} {cursorDate.getFullYear() + 543}
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] text-muted mb-1">
              {DOW_SHORT_TH.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
              {monthDays.map((cell) => {
                const isSelected = cell.iso === cursor
                const isToday = cell.iso === today
                const hasItems = (byDate[cell.iso]?.length ?? 0) > 0
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setCursor(cell.iso)}
                    className={`py-1.5 rounded-md relative transition cursor-pointer ${
                      isSelected
                        ? 'bg-violet text-white shadow-sm font-bold'
                        : isToday
                        ? 'border border-violet/30 text-violet'
                        : cell.inMonth
                        ? 'text-ink hover:bg-tint-1'
                        : 'text-muted'
                    }`}
                  >
                    {cell.day}
                    {hasItems && !isSelected && (
                      <span className="w-1 h-1 rounded-full bg-violet absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category Filters */}
          <div className="rounded-xl border border-line bg-card p-4 space-y-2.5">
            <div className="text-xs font-semibold text-ink-2">ตัวกรองหมวดหมู่</div>
            {Object.entries(cats).map(([key, c]) => {
              const checked = !hiddenCats[key]
              return (
                <label key={key} className="flex items-center justify-between gap-2 text-xs text-ink-2 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setHiddenCats((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="rounded border-line-2 bg-bg-2 accent-violet"
                    />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.label}
                  </span>
                </label>
              )
            })}
            <div className="pt-2 border-t border-line">
              <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTaskDeadlines}
                  onChange={(e) => setShowTaskDeadlines(e.target.checked)}
                  className="rounded border-line-2 bg-bg-2 accent-violet"
                />
                <CheckSquare className="w-3.5 h-3.5 text-blue-2" />
                แสดงเดดไลน์งานที่ยังไม่เสร็จ
              </label>
            </div>
          </div>

          {/* Upcoming Mini List */}
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="text-xs font-semibold text-ink-2 mb-3">รายการถัดไป</div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {entries
                .filter((e) => e.date >= today)
                .slice(0, 8)
                .map((e) => (
                  <button
                    key={`${e.kind}-${e.id}`}
                    type="button"
                    onClick={() => {
                      if (e.rawEvent) openEditModal(e.rawEvent)
                      else setCursor(e.date)
                    }}
                    className="w-full text-left rounded-lg bg-bg-2 hover:bg-tint-1/70 px-3 py-2 border border-line transition cursor-pointer"
                  >
                    <div className="text-xs font-medium text-ink truncate">{e.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {fmtDateThai(e.date)} {e.start ? `· ${e.start}` : ''}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Right Calendar Canvas */}
        <div className="xl:col-span-3 rounded-xl border border-line bg-card overflow-hidden">
          {view === 'month' && (
            <div>
              <div className="grid grid-cols-7 border-b border-line bg-bg-2 text-center text-xs font-medium text-muted py-2.5">
                {DOW_SHORT_TH.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((cell) => {
                  const list = byDate[cell.iso] ?? []
                  const isToday = cell.iso === today
                  return (
                    <div
                      key={cell.iso}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropDate(cell.iso)}
                      onDoubleClick={() => openNewModal(cell.iso)}
                      className={`min-h-28 border-b border-r border-line p-1.5 transition ${
                        cell.inMonth ? 'bg-card' : 'bg-bg-2 text-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <button
                          type="button"
                          onClick={() => openNewModal(cell.iso)}
                          className={`w-6 h-6 rounded-full text-xs flex items-center justify-center cursor-pointer ${
                            isToday
                              ? 'bg-violet text-white shadow-sm font-bold'
                              : cell.inMonth
                              ? 'text-ink-2 hover:bg-tint-1'
                              : 'text-muted'
                          }`}
                          title="คลิกเพื่อเพิ่มกิจกรรมในวันนี้"
                        >
                          {cell.day}
                        </button>
                      </div>

                      <div className="space-y-1">
                        {list.slice(0, 4).map((item) => (
                          <div
                            key={`${item.kind}-${item.id}`}
                            draggable
                            onDragStart={() => setDragging({ kind: item.kind, id: item.id })}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              if (item.rawEvent) openEditModal(item.rawEvent)
                            }}
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium truncate cursor-pointer hover:opacity-90"
                            style={{
                              backgroundColor: `${item.color}24`,
                              color: item.color,
                              borderLeft: `3px solid ${item.color}`,
                            }}
                            title={`${item.title} (ลากเพื่อเลื่อนวัน)`}
                          >
                            {item.start && <span className="opacity-80 mr-1">{item.start}</span>}
                            {item.title}
                          </div>
                        ))}
                        {list.length > 4 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCursor(cell.iso)
                              setView('day')
                            }}
                            className="text-[10px] text-muted hover:text-violet pl-1"
                          >
                            +{list.length - 4} รายการเพิ่มเติม
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {view === 'week' && (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-8 border-b border-line bg-bg-2">
                  <div className="p-2 text-[11px] text-muted text-center">เวลา</div>
                  {weekDays.map((wd) => (
                    <div
                      key={wd.iso}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropDate(wd.iso)}
                      className={`p-2 text-center border-l border-line ${
                        wd.iso === today ? 'bg-violet-soft' : ''
                      }`}
                    >
                      <div className="text-[11px] text-muted">{wd.dow}</div>
                      <div className={`text-sm font-semibold ${wd.iso === today ? 'text-violet' : 'text-ink'}`}>
                        {wd.day}
                      </div>
                      {/* All-day pills */}
                      <div className="mt-1 space-y-1">
                        {(byDate[wd.iso] ?? [])
                          .filter((x) => x.allday || !x.start)
                          .map((x) => (
                            <div
                              key={`${x.kind}-${x.id}`}
                              draggable
                              onDragStart={() => setDragging({ kind: x.kind, id: x.id })}
                              onClick={() => x.rawEvent && openEditModal(x.rawEvent)}
                              className="rounded px-1.5 py-0.5 text-[10px] truncate cursor-pointer text-left"
                              style={{ backgroundColor: `${x.color}28`, color: x.color }}
                            >
                              {x.title}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>

                {HOURS.map((h) => (
                  <div key={h} className="grid grid-cols-8 border-b border-line min-h-12">
                    <div className="text-[11px] text-muted text-right pr-2 pt-1">
                      {String(h).padStart(2, '0')}:00
                    </div>
                    {weekDays.map((wd) => {
                      const slotItems = (byDate[wd.iso] ?? []).filter(
                        (x) => !x.allday && x.start && parseInt(x.start.slice(0, 2), 10) === h
                      )
                      return (
                        <div
                          key={wd.iso}
                          onClick={() => openNewModal(wd.iso, h)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDropDate(wd.iso)}
                          className="border-l border-line p-1 hover:bg-tint-1/30 cursor-pointer space-y-1"
                        >
                          {slotItems.map((it) => (
                            <div
                              key={it.id}
                              draggable
                              onDragStart={() => setDragging({ kind: it.kind, id: it.id })}
                              onClick={(ev) => {
                                ev.stopPropagation()
                                if (it.rawEvent) openEditModal(it.rawEvent)
                              }}
                              className="rounded px-1.5 py-1 text-[11px] font-medium truncate"
                              style={{
                                backgroundColor: `${it.color}28`,
                                color: it.color,
                                borderLeft: `3px solid ${it.color}`,
                              }}
                            >
                              <div>{it.title}</div>
                              <div className="text-[10px] opacity-80">
                                {it.start} - {it.end}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'day' && (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">ตารางประจำวันที่ {fmtDateThai(cursor, true)}</h2>
                <button
                  type="button"
                  onClick={() => openNewModal(cursor)}
                  className="text-xs text-violet hover:text-violet cursor-pointer"
                >
                  + เพิ่มรายการวันนี้
                </button>
              </div>
              {(byDate[cursor] ?? []).length === 0 ? (
                <p className="text-sm text-muted py-10 text-center">ไม่มีกิจกรรมหรือเดดไลน์ในวันนี้</p>
              ) : (
                <div className="space-y-2.5">
                  {(byDate[cursor] ?? []).map((it) => (
                    <div
                      key={`${it.kind}-${it.id}`}
                      onClick={() => it.rawEvent && openEditModal(it.rawEvent)}
                      className="flex items-start justify-between gap-4 rounded-xl border border-line bg-bg-2 p-4 hover:border-line-2 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-2 h-10 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: it.color }} />
                        <div>
                          <div className="font-medium text-ink">{it.title}</div>
                          <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {it.allday ? 'ทั้งวัน' : `${it.start ?? ''} - ${it.end ?? ''}`}
                            </span>
                            {it.rawEvent?.loc && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> {it.rawEvent.loc}
                              </span>
                            )}
                          </div>
                          {it.rawEvent?.desc && <p className="text-xs text-muted mt-2">{it.rawEvent.desc}</p>}
                        </div>
                      </div>
                      {it.rawEvent && <Edit3 className="w-4 h-4 text-muted shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'agenda' && (
            <div className="p-5 space-y-4">
              {Object.keys(byDate).length === 0 ? (
                <p className="text-sm text-muted py-10 text-center">ยังไม่มีกิจกรรมในระบบ</p>
              ) : (
                Object.entries(byDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([dateIso, list]) => (
                    <div key={dateIso} className="space-y-2">
                      <div className="text-xs font-semibold text-violet border-b border-line pb-1">
                        {fmtDateThai(dateIso, true)}
                      </div>
                      {list.map((it) => (
                        <div
                          key={`${it.kind}-${it.id}`}
                          onClick={() => it.rawEvent && openEditModal(it.rawEvent)}
                          className="flex items-center justify-between gap-3 rounded-lg bg-bg-2 border border-line px-4 py-2.5 hover:border-line-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                            <span className="text-xs text-muted w-24 shrink-0">
                              {it.allday ? 'ทั้งวัน' : `${it.start ?? ''} - ${it.end ?? ''}`}
                            </span>
                            <span className="text-sm text-ink truncate">{it.title}</span>
                          </div>
                          <span className="text-[11px] text-muted shrink-0">
                            {cats[it.cat]?.label ?? it.cat}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Event Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่'}
        subtitle="ข้อมูลจะถูกบันทึกลงตาราง erp_events ในฐานข้อมูลทันที"
        maxWidth="xl"
      >
        <form onSubmit={onSaveEvent} className="space-y-4">
          <div>
            <label className="block text-xs text-ink-2 mb-1">ชื่อกิจกรรม *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น ประชุมสรุปแบบ UI กับลูกค้า"
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:border-violet"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">หมวดหมู่</label>
              <select
                value={form.cat}
                onChange={(e) => setForm({ ...form, cat: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                {Object.entries(cats).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">วันที่ *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allday}
                onChange={(e) => setForm({ ...form, allday: e.target.checked })}
                className="accent-violet"
              />
              ตลอดทั้งวัน
            </label>
            {!form.allday && (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                  className="rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-sm text-ink"
                />
                <span className="text-muted">ถึง</span>
                <input
                  type="time"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                  className="rounded-lg bg-bg-2 border border-line px-3 py-1.5 text-sm text-ink"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">สถานที่ / ลิงก์ประชุม</label>
              <input
                value={form.loc}
                onChange={(e) => setForm({ ...form, loc: e.target.value })}
                placeholder="เช่น Google Meet / ห้องประชุมชั้น 3"
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-2 mb-1">เชื่อมกับโปรเจกต์</label>
              <select
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              >
                <option value="">— ไม่ระบุโปรเจกต์ —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1.5">ผู้เข้าร่วม</label>
            <div className="flex flex-wrap gap-2">
              {team.map((m) => {
                const active = form.members.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        members: active ? form.members.filter((x) => x !== m.id) : [...form.members, m.id],
                      })
                    }
                    className={`rounded-full px-3 py-1 text-xs border transition cursor-pointer ${
                      active
                        ? 'bg-violet-soft border-violet text-violet'
                        : 'bg-bg-2 border-line text-muted hover:text-ink'
                    }`}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">รายละเอียดเพิ่มเติม</label>
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

          <div className="flex items-center justify-between pt-2">
            {editing ? (
              <button
                type="button"
                disabled={saving}
                onClick={onDeleteEvent}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-xs font-medium text-red hover:bg-red-soft cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบกิจกรรม
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-line-2 px-4 py-2 text-xs text-ink-2 hover:bg-tint-1 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-violet hover:bg-violet-2 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
              >
                {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'สร้างกิจกรรม'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
