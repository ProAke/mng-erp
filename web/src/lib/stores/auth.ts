'use client'

import { create } from 'zustand'
import { api, tokenStore } from '@/lib/api/client'
import { useApp } from '@/lib/stores/app'

export interface SessionUser {
  id: string
  authId?: number
  email: string
  name: string
  role: string
  avatar?: string | null
}

interface AuthState {
  user: SessionUser | null
  bootstrapped: boolean
  isAuthenticated: boolean
  login: (user: SessionUser, token: string) => void
  setSession: (token: string, user: SessionUser) => void
  updateUser: (patch: Partial<SessionUser>) => void
  logout: () => Promise<void>
  clear: () => void
  bootstrap: () => Promise<SessionUser | null>
}

/* ---------- คีย์ทั้งหมดที่เคยใช้เก็บ auth ไว้ ----------
   ล้างให้ครบทุกคีย์ ป้องกัน token เก่าค้างแล้วกลับเข้าระบบเอง */
const LEGACY_KEYS = ['mng.token', 'mng_token', 'mng_erp_token', 'mng_user', 'mng_session']

export function clearAuthStorage(): void {
  tokenStore.clear()
  if (typeof window === 'undefined') return
  LEGACY_KEYS.forEach((k) => {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  })
  try {
    window.sessionStorage.clear()
  } catch {
    /* ignore */
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  bootstrapped: false,
  isAuthenticated: false,

  login: (user, token) => {
    tokenStore.set(token)
    set({ user, isAuthenticated: true, bootstrapped: true })
  },

  setSession: (token, user) => {
    tokenStore.set(token)
    set({ user, isAuthenticated: true, bootstrapped: true })
  },

  updateUser: (patch) => {
    const cur = get().user
    if (!cur) return
    set({ user: { ...cur, ...patch } })
  },

  logout: async () => {
    try {
      await api.auth.logout()
    } catch {
      /* ล้างฝั่ง client ต่อแม้เรียก server ไม่สำเร็จ */
    }
    clearAuthStorage()
    try {
      useApp.getState().clear()
    } catch {
      /* ignore */
    }
    set({ user: null, isAuthenticated: false, bootstrapped: true })
  },

  clear: () => {
    clearAuthStorage()
    try {
      useApp.getState().clear()
    } catch {
      /* ignore */
    }
    set({ user: null, isAuthenticated: false, bootstrapped: true })
  },

  bootstrap: async () => {
    const token = tokenStore.get()
    if (!token) {
      set({ user: null, isAuthenticated: false, bootstrapped: true })
      return null
    }
    try {
      const data = await api.bootstrap()
      useApp.getState().setData(data)
      const u = data.user as {
        user_id?: number
        authId?: number
        email?: string
        name?: string
        role?: string
        avatar?: string | null
      } | null
      if (!u?.email) throw new Error('invalid_session')
      const me =
        data.team.find((m) => m.email && m.email === u.email) ??
        data.team.find((m) => m.me)
      const sessionUser: SessionUser = {
        id: String(u.user_id ?? u.authId ?? me?.id ?? 'me'),
        authId: u.user_id ?? u.authId ?? me?.authUserId ?? undefined,
        email: u.email,
        name: u.name ?? me?.name ?? u.email,
        role: u.role ?? 'staff',
        avatar: u.avatar ?? me?.avatar ?? null,
      }
      set({
        user: sessionUser,
        isAuthenticated: true,
        bootstrapped: true,
      })
      return sessionUser
    } catch {
      clearAuthStorage()
      useApp.getState().clear()
      set({ user: null, isAuthenticated: false, bootstrapped: true })
      return null
    }
  },
}))

export const isAdmin = (role?: string) => role === 'super_admin' || role === 'admin'
export const canManage = (role?: string) => role === 'super_admin' || role === 'admin' || role === 'manager'
