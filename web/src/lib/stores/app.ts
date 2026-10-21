// lib/stores/app.ts
// Application data store — ข้อมูลจาก /api/bootstrap (one round-trip)

import { create } from 'zustand'
import { api, type Bootstrap } from '@/lib/api/client'

interface AppState {
  data: Bootstrap | null
  loading: boolean
  error: string | null
  lastFetched: number | null

  load: () => Promise<Bootstrap | null>
  refresh: () => Promise<void>
  clear: () => void
}

export const useApp = create<AppState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  lastFetched: null,

  load: async () => {
    if (get().loading) return get().data
    set({ loading: true, error: null })
    try {
      const data = await api.bootstrap()
      set({ data, loading: false, lastFetched: Date.now() })
      return data
    } catch (e: any) {
      set({ loading: false, error: e.message || 'load_failed' })
      return null
    }
  },

  refresh: async () => {
    await get().load()
  },

  clear: () => set({ data: null, error: null, lastFetched: null }),
}))

/* ---------- selectors ---------- */

export const useProjects = () => useApp((s) => s.data?.projects ?? [])
export const useTasks = () => useApp((s) => s.data?.tasks ?? [])
export const useTeam = () => useApp((s) => s.data?.team ?? [])
export const useClients = () => useApp((s) => s.data?.clients ?? [])
export const useEvents = () => useApp((s) => s.data?.events ?? [])
export const useInvoices = () => useApp((s) => s.data?.invoices ?? [])
export const useActivity = () => useApp((s) => s.data?.activity ?? [])
