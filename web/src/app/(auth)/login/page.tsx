'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { api, ApiError } from '@/lib/api/client'
import { useAuth } from '@/lib/stores/auth'

export default function LoginPage() {
  const router = useRouter()
  const { setSession, isAuthenticated, bootstrapped, bootstrap } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (bootstrapped && isAuthenticated) {
      router.replace('/dashboard/')
    }
  }, [bootstrapped, isAuthenticated, router])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.login(email.trim(), password)
      setSession(res.token, {
        id: res.user.id,
        authId: res.user.authId,
        email: res.user.email,
        name: res.user.name,
        role: res.user.role,
        avatar: res.user.avatar ?? null,
      })
      router.replace('/dashboard/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900/85 backdrop-blur border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold text-2xl mb-4 shadow-lg shadow-amber-500/20">
            M
          </div>
          <h1 className="text-2xl font-bold text-white">MNG ERP</h1>
          <p className="text-sm text-slate-400 mt-1">ระบบบริหารจัดการงานและโปรเจกต์ — MNG Groups</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">อีเมล</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mng.co.th"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">รหัสผ่าน</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-sm text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-slate-950 font-semibold transition shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            {loading ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 MNG Groups · เชื่อมฐานข้อมูลจริง MariaDB
        </p>
      </div>
    </div>
  )
}
