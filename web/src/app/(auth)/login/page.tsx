'use client'

import { useState, FormEvent } from 'react'
import { api, ApiError } from '@/lib/api/client'
import { useAuth } from '@/lib/stores/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.login(email.trim(), password)
      useAuth.getState().login(
        {
          id: res.user.id,
          authId: res.user.authId ?? res.user.user_id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          avatar: res.user.avatar ?? null,
        },
        res.token
      )
      window.location.href = '/dashboard/'
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white font-bold text-xl mb-4 shadow-soft"
            style={{ background: 'var(--grad-violet)' }}
          >
            M
          </div>
          <h1 className="text-2xl font-semibold text-ink">MNG ERP</h1>
          <p className="text-sm text-muted mt-1">เข้าสู่ระบบเพื่อจัดการโปรเจกต์ งาน และ AI Workforce</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-card border border-line rounded-2xl p-6 space-y-4 shadow-soft"
        >
          <div>
            <label htmlFor="email" className="block text-sm text-ink-2 mb-1.5">
              อีเมล
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-bg-2 border border-line-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet/40 focus:border-violet"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-ink-2 mb-1.5">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-bg-2 border border-line-2 px-3 py-2.5 pr-11 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet/40 focus:border-violet"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs cursor-pointer"
              >
                {showPw ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-soft border border-red/20 px-3 py-2.5 text-sm text-red"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 text-sm transition-opacity shadow-soft cursor-pointer"
            style={{ background: 'var(--grad-violet)' }}
          >
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          MNG ERP · ปฏิทิน · งาน · AI Workforce
        </p>
      </div>
    </main>
  )
}
