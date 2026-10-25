'use client'

import { useMemo, useState, FormEvent, ChangeEvent } from 'react'
import {
  Plus,
  Pin,
  Send,
  Paperclip,
  Trash2,
  Bot,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api/client'
import { useApp, useChannels, useMessages, useProjects, useTeam } from '@/lib/stores/app'
import { canManage, useAuth } from '@/lib/stores/auth'
import { Modal } from '@/components/ui/Modal'
import { initials } from '@/lib/erp-helpers'

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉', '✅']

export default function TeamChatPage() {
  const { refresh } = useApp()
  const { user } = useAuth()
  const channels = useChannels()
  const messages = useMessages()
  const team = useTeam()
  const projects = useProjects()
  const allowManage = canManage(user?.role)

  const [selectedId, setSelectedId] = useState<string>('')
  const [onlyPinned, setOnlyPinned] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  // New channel modal
  const [createOpen, setCreateOpen] = useState(false)
  const [chForm, setChForm] = useState({ name: '', emoji: '💬', topic: '', projectId: '', pinned: false })

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === selectedId) ?? channels[0] ?? null,
    [channels, selectedId]
  )

  const channelMessages = useMemo(() => {
    if (!activeChannel) return []
    return messages.filter(
      (m) => m.channelId === activeChannel.id && (!onlyPinned || m.pinned)
    )
  }, [messages, activeChannel, onlyPinned])

  async function onSend(e: FormEvent) {
    e.preventDefault()
    if (!activeChannel || !text.trim()) return
    setSending(true)
    const msgText = text.trim()
    setText('')
    try {
      await api.channels.sendMessage(activeChannel.id, { text: msgText })
      await refresh()
    } catch (err) {
      setText(msgText)
      alert(err instanceof ApiError ? err.message : 'ส่งข้อความไม่สำเร็จ')
    } finally {
      setSending(false)
    }
  }

  async function onUploadAttachment(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeChannel) return
    setUploading(true)
    try {
      const up = await api.drive.upload(file)
      await api.channels.sendMessage(activeChannel.id, {
        text: text.trim() || `แชร์ไฟล์: ${file.name}`,
        attachmentUrl: up.url,
        attachmentName: file.name,
      })
      setText('')
      await refresh()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'อัปโหลดไฟล์ไม่สำเร็จ')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function onReact(msgId: string, emoji: string) {
    try {
      await api.channels.reactOrPinMessage(msgId, { emoji })
      await refresh()
    } catch {
      /* ignore */
    }
  }

  async function onTogglePin(msgId: string, curPinned: boolean) {
    try {
      await api.channels.reactOrPinMessage(msgId, { pinned: !curPinned })
      await refresh()
    } catch {
      /* ignore */
    }
  }

  async function onDeleteMessage(msgId: string) {
    if (!window.confirm('ลบข้อความนี้?')) return
    try {
      await api.channels.deleteMessage(msgId)
      await refresh()
    } catch {
      /* ignore */
    }
  }

  async function onCreateChannel(e: FormEvent) {
    e.preventDefault()
    if (!chForm.name.trim()) return
    try {
      const res = await api.channels.create({
        name: chForm.name.trim(),
        emoji: chForm.emoji || '💬',
        topic: chForm.topic.trim(),
        projectId: chForm.projectId || undefined,
        pinned: chForm.pinned,
      })
      await refresh()
      setSelectedId(res.id)
      setCreateOpen(false)
      setChForm({ name: '', emoji: '💬', topic: '', projectId: '', pinned: false })
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'สร้างห้องแชทไม่สำเร็จ')
    }
  }

  async function onDeleteChannel(channelId: string, name: string) {
    if (!window.confirm(`ลบห้องแชท #${name} และข้อความทั้งหมดในห้อง?`)) return
    try {
      await api.channels.remove(channelId)
      setSelectedId('')
      await refresh()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'ลบห้องไม่สำเร็จ')
    }
  }

  return (
    <div className="h-[calc(100vh-9.5rem)] min-h-[540px] rounded-2xl border border-line bg-card overflow-hidden grid grid-cols-1 md:grid-cols-12">
      {/* Channels Sidebar */}
      <div className="md:col-span-4 lg:col-span-3 border-b md:border-b-0 md:border-r border-line bg-bg-2 flex flex-col">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h1 className="font-bold text-ink text-sm">ห้องพูดคุยทีม (Channels)</h1>
            <p className="text-[11px] text-muted">แชร์งาน ไฟล์ และสั่งงาน @AI</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-violet hover:bg-violet-2 p-1.5 text-white shadow-sm cursor-pointer"
            title="สร้างห้องแชทใหม่"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map((ch) => {
            const active = activeChannel?.id === ch.id
            const count = messages.filter((m) => m.channelId === ch.id).length
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => setSelectedId(ch.id)}
                className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition cursor-pointer ${
                  active
                    ? 'bg-violet-soft text-violet border border-violet/30 font-semibold'
                    : 'text-ink-2 hover:bg-tint-1/70'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="text-base">{ch.emoji}</span>
                  <span className="truncate">#{ch.name}</span>
                  {ch.pinned && <Pin className="w-3 h-3 text-violet shrink-0" />}
                </span>
                <span className="text-[10px] text-muted tabular-nums">{count}</span>
              </button>
            )
          })}
          {channels.length === 0 && (
            <div className="p-4 text-xs text-muted text-center">ยังไม่มีห้องแชท กด + เพื่อสร้างห้องแรก</div>
          )}
        </div>
      </div>

      {/* Chat Stream */}
      <div className="md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div className="px-5 py-3.5 border-b border-line flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-ink flex items-center gap-2">
                  <span>{activeChannel.emoji}</span>
                  <span>#{activeChannel.name}</span>
                </div>
                {activeChannel.topic && (
                  <p className="text-xs text-muted truncate mt-0.5">{activeChannel.topic}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOnlyPinned((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                    onlyPinned
                      ? 'border-violet bg-violet-soft text-violet'
                      : 'border-line-2 text-ink-2 hover:bg-tint-1'
                  }`}
                >
                  <Pin className="w-3 h-3" /> ที่ปักหมุด
                </button>
                {allowManage && channels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteChannel(activeChannel.id, activeChannel.name)}
                    className="rounded-lg border border-red/30 bg-red-soft p-1.5 text-red hover:bg-red-soft cursor-pointer"
                    title="ลบห้องแชท"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {channelMessages.map((m) => {
                const author = team.find((x) => x.id === m.authorId)
                const isAi = m.kind === 'ai' || author?.kind === 'ai'
                const isSys = m.kind === 'system'
                const reactions = m.reactions ?? {}

                if (isSys) {
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl bg-bg-2 border border-line px-4 py-2.5 text-xs text-muted text-center"
                    >
                      {m.text}
                    </div>
                  )
                }

                return (
                  <div
                    key={m.id}
                    className={`group rounded-2xl border p-3.5 transition ${
                      isAi
                        ? 'border-violet/30 bg-violet-soft'
                        : m.pinned
                        ? 'border-violet/30 bg-violet-soft'
                        : 'border-line bg-bg-2 hover:border-line-2'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: author?.color ?? '#475569' }}
                        >
                          {isAi ? <Bot className="w-4 h-4" /> : initials(author?.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-ink">
                              {author?.nickname ? `${author.nickname} (${author.name})` : author?.name ?? 'ทีมงาน'}
                            </span>
                            {isAi && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-soft text-violet">
                                AI Agent
                              </span>
                            )}
                            {m.pinned && (
                              <span className="text-[10px] text-violet inline-flex items-center gap-0.5">
                                <Pin className="w-2.5 h-2.5" /> ปักหมุด
                              </span>
                            )}
                            <span className="text-[11px] text-muted">{m.at}</span>
                          </div>

                          <p className="text-sm text-ink mt-1 whitespace-pre-wrap leading-relaxed">
                            {m.text}
                          </p>

                          {m.attachmentUrl && (
                            <div className="mt-2">
                              {/\.(png|jpe?g|gif|webp)$/i.test(m.attachmentName || m.attachmentUrl) ? (
                                <a href={m.attachmentUrl} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={m.attachmentUrl}
                                    alt={m.attachmentName || 'attachment'}
                                    className="max-h-52 rounded-xl border border-line-2 object-contain"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={m.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-card border border-line-2 px-3 py-1.5 text-xs text-violet hover:underline"
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                  {m.attachmentName || 'เปิดไฟล์แนบ'}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Reactions Bar */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {Object.entries(reactions).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => onReact(m.id, emoji)}
                                className="inline-flex items-center gap-1 rounded-full bg-tint-1 hover:bg-tint-3 border border-line-2 px-2 py-0.5 text-xs text-ink cursor-pointer"
                              >
                                <span>{emoji}</span>
                                <span className="text-[11px] text-violet">{users.length}</span>
                              </button>
                            ))}

                            <div className="opacity-70 group-hover:opacity-100 flex items-center gap-1 ml-1">
                              {QUICK_REACTIONS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => onReact(m.id, em)}
                                  className="rounded hover:bg-tint-1 px-1 py-0.5 text-xs cursor-pointer"
                                  title={`กด ${em}`}
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 shrink-0">
                        <button
                          type="button"
                          onClick={() => onTogglePin(m.id, m.pinned)}
                          className="p-1 text-muted hover:text-violet cursor-pointer"
                          title={m.pinned ? 'เลิกปักหมุด' : 'ปักหมุดข้อความ'}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMessage(m.id)}
                          className="p-1 text-muted hover:text-red cursor-pointer"
                          title="ลบข้อความ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {channelMessages.length === 0 && (
                <div className="py-12 text-center text-sm text-muted">
                  ยังไม่มีข้อความในห้องนี้ เริ่มพูดคุยหรือพิมพ์ <code className="text-violet">@NOVA</code> เพื่อเรียก AI ได้เลย
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="p-3.5 border-t border-line bg-bg-2 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet" /> เรียก AI ด่วน:
                </span>
                {['@NOVA ช่วยสรุปงานค้างและใบแจ้งหนี้วันนี้หน่อย', '@BYTE เช็กภาพรวมงานเทคนิคให้หน่อย'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setText(chip)}
                    className="rounded-full bg-violet-soft hover:bg-violet-soft border border-violet/30 px-2.5 py-0.5 text-violet cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <form onSubmit={onSend} className="flex items-center gap-2">
                <label
                  className="rounded-xl border border-line bg-card hover:bg-tint-1 p-2.5 text-ink-2 cursor-pointer shrink-0"
                  title="แนบรูปภาพหรือไฟล์ (Google Drive / Server)"
                >
                  <Paperclip className="w-4 h-4" />
                  <input type="file" onChange={onUploadAttachment} className="hidden" disabled={uploading} />
                </label>

                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    uploading
                      ? 'กำลังอัปโหลดไฟล์แนบ…'
                      : `ส่งข้อความใน #${activeChannel.name} (พิมพ์ @NOVA หรือ @BYTE เพื่อให้ AI ตอบ)…`
                  }
                  className="flex-1 rounded-xl bg-card border border-line px-3.5 py-2.5 text-sm text-ink placeholder-muted focus:outline-none focus:border-violet"
                />

                <button
                  type="submit"
                  disabled={sending || uploading || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet hover:bg-violet-2 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white shadow-sm cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" /> ส่ง
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted">
            เลือกห้องแชทด้านซ้ายเพื่อเริ่มสนทนา
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="สร้างห้องพูดคุยใหม่" maxWidth="md">
        <form onSubmit={onCreateChannel} className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-ink-2 mb-1">ไอคอน</label>
              <input
                value={chForm.emoji}
                onChange={(e) => setChForm({ ...chForm, emoji: e.target.value })}
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-center text-ink"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-xs text-ink-2 mb-1">ชื่อห้อง *</label>
              <input
                required
                value={chForm.name}
                onChange={(e) => setChForm({ ...chForm, name: e.target.value })}
                placeholder="เช่น project-calmat"
                className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">หัวข้อประจำห้อง (Topic)</label>
            <input
              value={chForm.topic}
              onChange={(e) => setChForm({ ...chForm, topic: e.target.value })}
              placeholder="เป้าหมายหรือเรื่องที่ใช้พูดคุยในห้องนี้"
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-2 mb-1">ผูกกับโปรเจกต์ (ไม่บังคับ)</label>
            <select
              value={chForm.projectId}
              onChange={(e) => setChForm({ ...chForm, projectId: e.target.value })}
              className="w-full rounded-lg bg-bg-2 border border-line px-3 py-2 text-sm text-ink"
            >
              <option value="">— ห้องส่วนกลาง —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={chForm.pinned}
              onChange={(e) => setChForm({ ...chForm, pinned: e.target.checked })}
              className="accent-violet"
            />
            ปักหมุดไว้ด้านบนสุดของรายการห้อง
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-line-2 px-4 py-2 text-xs text-ink-2 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="rounded-lg bg-violet hover:bg-violet-2 px-4 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
            >
              สร้างห้องแชท
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
