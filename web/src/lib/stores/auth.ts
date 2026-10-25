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
  setSession: (token: string, user: SessionUser) => void
  updateUser: (patch: Partial<SessionUser>) => void
  clear: () => void
  bootstrap: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  bootstrapped: false,
  isAuthenticated: false,

  setSession: (token, user) => {
    tokenStore.set(token)
    set({ user, isAuthenticated: true, bootstrapped: true })
  },

  updateUser: (patch) => {
    const cur = get().user
    if (!cur) return
    set({ user: { ...cur, ...patch } })
  },

  clear: () => {
    tokenStore.clear()
    try { useApp.getState().clear() } catch {}
    set({ user: null, isAuthenticated: false, bootstrapped: true })
  },

  bootstrap: async () => {
    const token = tokenStore.get()
    if (!token) {
      set({ user: null, isAuthenticated: false, bootstrapped: true })
      return
    }
    try {
      const data = await api.bootstrap()
      // Hydrate app store from the same bootstrap call to avoid double-fetching
      useApp.getState().setData(data)
      const u = data.user as { user_id?: number; authId?: number; email?: string; name?: string; role?: string; avatar?: string | null } | null
      if (!u?.email) throw new Error('invalid_session')
      const me = data.team.find((m) => m.email && m.email === u.email) ?? data.team.find((m) => m.me)
      set({
        user: {
          id: String(u.user_id ?? u.authId ?? me?.id ?? 'me'),
          authId: u.user_id ?? u.authId ?? me?.authUserId ?? undefined,
          email: u.email,
          name: u.name ?? me?.name ?? u.email,
          role: u.role ?? 'staff',
          avatar: u.avatar ?? me?.avatar ?? null,
        },
        isAuthenticated: true,
        bootstrapped: true,
      })
    } catch {
      tokenStore.clear()
      useApp.getState().clear()
      set({ user: null, isAuthenticated: false, bootstrapped: true })
    }
  },
}))

export const isAdmin = (role?: string) => role === 'super_admin' || role === 'admin'
export const canManage = (role?: string) => role === 'super_admin' || role === 'admin' || role === 'manager'
