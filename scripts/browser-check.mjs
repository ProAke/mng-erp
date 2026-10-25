#!/usr/bin/env node
/**
 * scripts/browser-check.mjs — ตรวจเนื้อหาจริงหลัง hydrate (ต้องใช้ browser)
 *
 * ใช้ผ่าน browser_exec เท่านั้น:
 *   browser_exec: goto_url(base) → js() อ่าน document.body.innerText ของทุกหน้า
 *
 * shell เพียงอย่างเดียวไม่พอ: Next.js static export render เฉพาะ shell
 * (AppShell ยังไม่มี token → โชว์ "กำลังตรวจสอบสถานะ…") เนื้อหาจริงต้อง JS รัน
 */
import { fileURLToPath } from 'node:url'

const PAGES = [
  { path: '/login/',     expect: ['MNG', 'อีเมล'] },
  { path: '/dashboard/', expect: ['แดชบอร์ด', 'KPI'] },
  { path: '/tasks/',     expect: ['งาน'] },
  { path: '/projects/',  expect: ['โปรเจกต์'] },
  { path: '/team/',      expect: ['ทีม'] },
  { path: '/finance/',   expect: ['การเงิน'] },
  { path: '/calendar/',  expect: ['ปฏิทิน'] },
  { path: '/reports/',   expect: ['รายงาน'] },
  { path: '/clients/',   expect: ['ลูกค้า'] },
  { path: '/settings/',  expect: ['ตั้งค่า'] },
]

const base = process.argv[2] || 'http://127.0.0.1:8080'
const out = []

for (const p of PAGES) {
  const url = base + p.path
  out.push({ path: p.path, url, expect: p.expect })
}

console.log(JSON.stringify({ base, pages: out }, null, 2))
console.log(`
วิธีตรวจ (browser_exec):
  for each page: goto_url(url); wait_for_load()
  text = js("document.body.innerText")
  ผ่าน = ไม่มี "กำลังตรวจสอบสถานะ" ค้าง และมีคำที่คาดหวังอย่างน้อย 1 คำ
`)
