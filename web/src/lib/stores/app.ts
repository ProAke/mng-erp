'use client'

import { create } from 'zustand'
import { api, type Bootstrap } from '@/lib/api/client'

interface AppState {
  data: Bootstrap | null
  loading: boolean
  error: string | null
  setData: (data: Bootstrap) => void
  load: (force?: boolean) => Promise<void>
  refresh: () => Promise<void>
  clear: () => void
}

export const useApp = create<AppState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  setData: (data) => set({ data, loading: false, error: null }),
  load: async (force = false) => {
    if (get().loading) return
    if (get().data && !force) return
    set({ loading: true, error: null })
    try {
      const data = await api.bootstrap()
      set({ data, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api.bootstrap()
      set({ data, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },
  clear: () => set({ data: null, loading: false, error: null }),
}))

/* Convenience selectors */
export const useProjects = () => useApp((s) => s.data?.projects ?? [])
export const useTasks = () => useApp((s) => s.data?.tasks ?? [])
export const useTeam = () => useApp((s) => s.data?.team ?? [])
export const useHumanTeam = () => useApp((s) => (s.data?.team ?? []).filter((m) => (m.kind ?? 'human') !== 'ai'))
export const useAiAgents = () => useApp((s) => (s.data?.team ?? []).filter((m) => m.kind === 'ai'))
export const useEvents = () => useApp((s) => s.data?.events ?? [])
export const useClients = () => useApp((s) => s.data?.clients ?? [])
export const useInvoices = () => useApp((s) => s.data?.invoices ?? [])
export const useActivity = () => useApp((s) => s.data?.activity ?? [])
export const useAiRuns = () => useApp((s) => s.data?.aiRuns ?? [])
export const useChannels = () => useApp((s) => s.data?.channels ?? [])
export const useMessages = () => useApp((s) => s.data?.messages ?? [])
export const useCheckins = () => useApp((s) => s.data?.checkins ?? [])
export const useLeaves = () => useApp((s) => s.data?.leaves ?? [])
export const useRooms = () => useApp((s) => s.data?.rooms ?? [])
export const useBookings = () => useApp((s) => s.data?.bookings ?? [])
export const useTrend = () => useApp((s) => s.data?.trend ?? null)
export const useEventCats = () => useApp((s) => s.data?.eventCats ?? {})
export const useSettingsData = () => useApp((s) => s.data?.settings ?? {})
