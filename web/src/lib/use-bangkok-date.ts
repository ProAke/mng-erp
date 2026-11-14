'use client'

import { useEffect, useState } from 'react'
import BangkokTime from '../../../assets/js/bangkok-time'

// หน้า web เป็น scaffold แยก ไม่แทนที่ Vanilla SPA; ใช้นาฬิกาเดียวกันเมื่อเปิดใช้งาน
export function useBangkokDate() {
  // ค่าเริ่มต้นตรงกันระหว่าง prerender และ hydration แล้วจึงอ่านเวลาใน browser
  const [clock, setClock] = useState({ date: '', synced: false })

  useEffect(() => {
    let active = true
    let inFlight = false
    let synced = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    BangkokTime.reset()

    async function refresh() {
      if (!active || inFlight) return
      inFlight = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 5000)
      const sentAt = Date.now()
      try {
        const response = await fetch('/api/clock', { cache: 'no-store', signal: controller.signal })
        const receivedAt = Date.now()
        const data = response.ok ? await response.json() : null
        if (active && data?.timezone === BangkokTime.timezone && BangkokTime.synchronize(data.serverTime, sentAt, receivedAt)) {
          synced = true
        }
      } catch {
        // ถ้าเคยเทียบสำเร็จให้ใช้ค่าล่าสุดต่อไป; มิฉะนั้นแจ้งว่าใช้เวลาอุปกรณ์
      } finally {
        clearTimeout(timeout)
        inFlight = false
        if (active) {
          setClock({ date: BangkokTime.current().date, synced })
          clearTimeout(timer)
          const delay = 60_000 - (BangkokTime.now().getTime() % 60_000) + 25
          timer = setTimeout(() => { void refresh() }, delay)
        }
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer)
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    void refresh()
    return () => {
      active = false
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return clock
}
