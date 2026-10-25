// lib/stores/app.ts
// Application data store — ข้อมูลจาก /api/bootstrap (one round-trip)
//
// ⚠️ selector ต้องคืนค่าที่ referentially stable เสมอ
// ถ้าเขียน `s.data?.projects ?? []` จะได้ array ใหม่ทุกครั้งที่เรียก
// → zustand v5 เห็นว่า state เปลี่ยนทุก render → React error #185 (infinite loop)
// วิธีแก่: เก็บ array ว่างไว้เป็นค่าคงที่ + ใช้ useShallow สำหรับ selector ที่คืน array

import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
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

// ค่าคงที่ (stable reference) ใช้เป็นค่า default — ห้ามประกาศ `?? []` ใน selector
const EMPTY: any[] = []

// selector ที่คืน array ต้องครอบด้วย useShallow ไม่งั้นได้ reference ใหม่ทุกครั้บ
export const useProjects = () => useApp(useShallow((s) => s.data?.projects ?? EMPTY))
export const useTasks = () => useApp(useShallow((s) => s.data?.tasks ?? EMPTY))
export const useTeam = () => useApp(useShallow((s) => s.data?.team ?? EMPTY))
export const useClients = () => useApp(useShallow((s) => s.data?.clients ?? EMPTY))
export const useEvents = () => useApp(useShallow((s) => s.data?.events ?? EMPTY))
export const useInvoices = () => useApp(useShallow((s) => s.data?.invoices ?? EMPTY))
export const useActivity = () => useApp(useShallow((s) => s.data?.activity ?? EMPTY))
