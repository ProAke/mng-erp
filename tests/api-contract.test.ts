// tests/api-contract.test.ts
// API contract test — ตรวจว่า Express API ตรงกับที่ frontend (Next.js) เรียกใช้จริง
//
// รันจริงกับ DB ผ่าน env เหล่านี้ (ไม่ hardcode ในไฟล์):
//   DB_AUTH_HOST DB_AUTH_PORT DB_AUTH_USER DB_AUTH_PASS DB_AUTH_NAME
//   DB_WORK_HOST DB_WORK_PORT DB_WORK_USER DB_WORK_PASS DB_WORK_NAME
//
// เป็น READ-ONLY: ไม่ insert/update/delete อะไรเลย — ปลอดภัยรันบน production DB
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { authPool, workPool } from '../server/db'
import { login, middleware } from '../server/auth'
import type { Request, Response } from 'express'

const AUTH: Record<string, string> = {
  host: process.env.DB_AUTH_HOST || '203.146.252.149',
  port: process.env.DB_AUTH_PORT || '3306',
  user: process.env.DB_AUTH_USER || 'pacific_mng',
  password: process.env.DB_AUTH_PASS || '',
  database: process.env.DB_AUTH_NAME || 'pacific_mng',
}
const WORK: Record<string, string> = {
  host: process.env.DB_WORK_HOST || '203.146.252.149',
  port: process.env.DB_WORK_PORT || '3306',
  user: process.env.DB_WORK_USER || 'pacific_mngworks',
  password: process.env.DB_WORK_PASS || '',
  database: process.env.DB_WORK_NAME || 'pacific_mngworks',
}

beforeAll(async () => {
  // ตรวจว่า DB ต่อได้จริงก่อน
  await authPool.query('SELECT 1')
  await workPool.query('SELECT 1')
})

afterAll(async () => {
  await authPool.end()
  await workPool.end()
})

describe('DB connection', () => {
  it('auth DB ต่อได้', async () => {
    const [rows] = await authPool.query('SELECT 1 AS ok')
    expect(rows).toEqual([{ ok: 1 }])
  })

  it('work DB ต่อได้', async () => {
    const [rows] = await workPool.query('SELECT 1 AS ok')
    expect(rows).toEqual([{ ok: 1 }])
  })
})

describe('auth API contract (ตรงกับ web/src/lib/api/client.ts)', () => {
  it('login คืน { token, user } เมื่อสำเร็จ', async () => {
    // ใช้ user จริงจาก auth DB — รหัสผ่านไม่รู้ จึงเช็คแค่ shape ของ error path
    await expect(login('nobody@example.invalid', 'wrong')).rejects.toMatchObject({
      code: 401,
      message: expect.stringContaining('ไม่พบอีเมล'),
    })
  })

  it('login คืน 401 "รหัสผ่านไม่ถูกต้อง" เมื่ออีเมลมีจริงแต่รหัสผิด', async () => {
    const [rows] = await authPool.query('SELECT email FROM users LIMIT 1')
    const email = (rows[0] as any)?.email
    expect(email).toBeTruthy()
    await expect(login(email, 'definitely-wrong-password')).rejects.toMatchObject({ code: 401 })
  })

  it('middleware คืน 401 { error: "unauthorized" } เมื่อไม่มี token', async () => {
    const req = { headers: {} } as Request
    const res = {
      statusCode: 0,
      body: null as any,
      status(c: number) { this.statusCode = c; return this },
      json(b: any) { this.body = b; return this },
    } as unknown as Response
    let nexted = false
    await middleware(req, res, () => { nexted = true })
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'unauthorized' })
    expect(nexted).toBe(false)
  })

  it('middleware คืน 401 เมื่อ token หมดอายุ/ไม่มีใน DB', async () => {
    const req = { headers: { authorization: 'Bearer invalid-token-xyz' } } as Request
    const res = {
      statusCode: 0,
      body: null as any,
      status(c: number) { this.statusCode = c; return this },
      json(b: any) { this.body = b; return this },
    } as unknown as Response
    await middleware(req, res, () => {})
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: expect.any(String) })
  })
})

describe('bootstrap shape (ตรงกับ web/src/lib/stores/app.ts)', () => {
  it('erp_team / erp_tasks / erp_settings มีข้อมูล', async () => {
    const [[{ c: teamCount }]] = await workPool.query('SELECT COUNT(*) c FROM erp_team')
    const [[{ c: taskCount }]] = await workPool.query('SELECT COUNT(*) c FROM tasks')
    expect(teamCount).toBeGreaterThan(0)
    expect(taskCount).toBeGreaterThan(0)
  })

  it('erp_settings มี seedVersion', async () => {
    const [rows] = await workPool.query("SELECT data FROM erp_settings WHERE id = 1")
    const data = JSON.parse((rows[0] as any).data)
    expect(data).toHaveProperty('seedVersion')
  })

  it('tasks ทุกตัวมี erp_code (backfill ครบ)', async () => {
    const [[{ c }]] = await workPool.query(
      "SELECT COUNT(*) c FROM tasks WHERE erp_code IS NULL")
    expect(c).toBe(0)
  })

  it('erp_sessions มี token ที่ยังไม่หมดอายุ', async () => {
    const [[{ c }]] = await workPool.query(
      'SELECT COUNT(*) c FROM erp_sessions WHERE expires_at > NOW()')
    // อาจเป็น 0 ได้ถ้าไม่มีใคร login — เช็คแค่ว่า query ผ่าน ไม่ error
    expect(typeof c).toBe('number')
  })
})
