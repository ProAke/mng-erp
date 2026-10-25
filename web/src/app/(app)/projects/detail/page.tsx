'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/lib/stores/auth'
import { api } from '@/lib/api/client'
import RichTextEditor from '@/components/editor/RichTextEditor'

export default function ProjectDetailPage() {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    // Upload to Google Drive via backend (placeholder — ต่อ Google Drive API ทีหลัง)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/drive/upload', { method: 'POST', body: formData })
    if (!res.ok) throw new Error('upload failed')
    const data = await res.json()
    return data.url
  }, [])

  const handleSave = async () => {
    if (!title.trim()) { setMessage('กรุณาใส่ชื่อโปรเจกต์'); return }
    setSaving(true)
    try {
      await api.projects.create({ name: title, description: content })
      setMessage('บันทึกโปรเจกต์สำเร็จ ✅')
      setTitle('')
      setContent('')
    } catch (e: any) {
      setMessage(`เกิดข้อผิดพลาด: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold text-ink">รายละเอียดโปรเจกต์</h1>
        <p className="text-sm text-muted mt-0.5">สร้างและแก้ไขรายละเอียดโปรเจกต์ — ใช้ Rich Text Editor</p>
      </header>

      <section className="rounded-xl bg-card border border-line p-5 space-y-4">
        <div>
          <label className="block text-sm text-ink-2 mb-1.5">ชื่อโปรเจกต์</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น MNG ERP — Phase 2"
            className="w-full rounded-lg bg-bg-2 border border-line-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-violet"
          />
        </div>

        <div>
          <label className="block text-sm text-ink-2 mb-1.5">รายละเอียด (Rich Text)</label>
          <div className="rounded-lg border border-line-2 overflow-hidden bg-white">
            <RichTextEditor value={content} onChange={setContent} onImageUpload={handleImageUpload} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-violet hover:bg-violet-2 disabled:opacity-50 px-4 py-2 text-sm font-medium text-muted transition-colors"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกโปรเจกต์'}
          </button>
          {message && (
            <span className={`text-sm ${message.includes('✅') ? 'text-mint' : 'text-red'}`}>
              {message}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-card border border-line p-5">
        <h2 className="text-sm font-medium text-ink-2 mb-3">ฟีเจอร์ที่ CKEditor 5 รองรับ</h2>
        <ul className="grid grid-cols-2 gap-2 text-xs text-ink-2">
          <li>✅ Bold, Italic, Underline, Strikethrough</li>
          <li>✅ Headings (H1-H3)</li>
          <li>✅ Bulleted / Numbered / Todo lists</li>
          <li>✅ Block quote, Code block</li>
          <li>✅ Tables (with toolbar)</li>
          <li>✅ Image upload (→ Google Drive)</li>
          <li>✅ Media embed (YouTube, etc.)</li>
          <li>✅ Font color, size, family</li>
          <li>✅ Alignment, Indent/Outdent</li>
          <li>✅ Find & Replace, Source editing</li>
          <li>✅ Autoformat (markdown shortcuts)</li>
          <li>✅ Horizontal line, Page break</li>
        </ul>
      </section>
    </div>
  )
}
