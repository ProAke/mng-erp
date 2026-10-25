'use client'
// lib/stores/app.ts
// Application data store — ข้อมูลจาก /api/bootstrap (one round-trip)
//
// selector ที่คืน array ต้องใช้ EMPTY คงที่ + useShallow เสมอ
// เพื่อป้องกัน React error #185 (infinite loop) ใน Zustand v5

import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
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

/* ---------- selectors (referentially stable via EMPTY + useShallow) ---------- */

const EMPTY: never[] = []
const EMPTY_OBJ: Record<string, never> = {}

export const useProjects = () => useApp(useShallow((s) => s.data?.projects ?? EMPTY))
export const useTasks = () => useApp(useShallow((s) => s.data?.tasks ?? EMPTY))
export const useTeam = () => useApp(useShallow((s) => s.data?.team ?? EMPTY))
export const useHumanTeam = () =>
  useApp(useShallow((s) => (s.data?.team ?? EMPTY).filter((m) => (m.kind ?? 'human') !== 'ai')))
export const useAiAgents = () =>
  useApp(useShallow((s) => (s.data?.team ?? EMPTY).filter((m) => m.kind === 'ai')))
export const useEvents = () => useApp(useShallow((s) => s.data?.events ?? EMPTY))
export const useClients = () => useApp(useShallow((s) => s.data?.clients ?? EMPTY))
export const useInvoices = () => useApp(useShallow((s) => s.data?.invoices ?? EMPTY))
export const useActivity = () => useApp(useShallow((s) => s.data?.activity ?? EMPTY))
export const useAiRuns = () => useApp(useShallow((s) => s.data?.aiRuns ?? EMPTY))
export const useChannels = () => useApp(useShallow((s) => s.data?.channels ?? EMPTY))
export const useMessages = () => useApp(useShallow((s) => s.data?.messages ?? EMPTY))
export const useCheckins = () => useApp(useShallow((s) => s.data?.checkins ?? EMPTY))
export const useLeaves = () => useApp(useShallow((s) => s.data?.leaves ?? EMPTY))
export const useRooms = () => useApp(useShallow((s) => s.data?.rooms ?? EMPTY))
export const useBookings = () => useApp(useShallow((s) => s.data?.bookings ?? EMPTY))
export const useTrend = () => useApp((s) => s.data?.trend ?? null)
export const useEventCats = () => useApp((s) => s.data?.eventCats ?? EMPTY_OBJ)
export const useSettingsData = () => useApp((s) => s.data?.settings ?? EMPTY_OBJ)
