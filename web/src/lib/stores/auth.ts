// lib/stores/auth.ts
// Auth state — Zustand store + React Query
// Backend: Bearer token (erp_sessions) → เก็บ token ใน localStorage

import { create } from 'zustand'
import { api, tokenStore, type User } from '@/lib/api/client'

export interface SessionUser {
  id: string
  authId: number
  name: string
  email: string
  role: string
}

interface AuthState {
  user: SessionUser | null
  isAuthenticated: boolean
  /** login ผ่าน → เก็บ token + user */
  login: (user: SessionUser, token: string) => void
  /** logout → เรียก server ลบ session แล้วล้าง state */
  logout: () => Promise<void>
  /** เช็ค session ปัจจุบันจาก /api/bootstrap (ใช้ตอน app boot) */
  bootstrap: () => Promise<SessionUser | null>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  login: (user, token) => {
    tokenStore.set(token)
    set({ user, isAuthenticated: true })
  },

  logout: async () => {
    // เรียก server ลบ session ก่อน (สำคัญ — ไม่งั้น token ยังมีผลที่ DB)
    try {
      await api.logout()
    } catch {
      // ล้มเหลวตอนนี้ก็ล้างฝั่ง client ต่อ — ไม่บล็อก user
    }
    tokenStore.clear()
    set({ user: null, isAuthenticated: false })
  },

  bootstrap: async () => {
    if (!tokenStore.get()) return null
    try {
      const data = await api.bootstrap()
      const user: SessionUser = {
        id: `u${data.user.user_id}`,
        authId: data.user.user_id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      }
      set({ user, isAuthenticated: true })
      return user
    } catch {
      tokenStore.clear()
      set({ user: null, isAuthenticated: false })
      return null
    }
  },
}))

/** convenience helper — ดึง role ปัจจุบัน */
export const useRole = () => useAuth((s) => s.user?.role)
export const isAdmin = (role?: string) => role === 'super_admin' || role === 'admin'
