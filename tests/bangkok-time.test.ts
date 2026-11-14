import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBangkokDue } from '../web/src/lib/bangkok-date'

const root = path.resolve(__dirname, '..')
const clock = require('../assets/js/bangkok-time')

afterEach(() => { clock.reset(); vi.restoreAllMocks() })

describe('Asia/Bangkok clock and civil dates', () => {
  it.each([
    ['2026-12-31T16:59:59.000Z', '2026-12-31', '23:59', '59'],
    ['2026-12-31T17:00:00.000Z', '2027-01-01', '00:00', '00'],
    ['2024-02-28T17:00:00.000Z', '2024-02-29', '00:00', '00'],
    ['2024-02-29T17:00:00.000Z', '2024-03-01', '00:00', '00'],
  ])('converts the same instant %s into the Bangkok day and time', (instant, date, time, second) => {
    expect(clock.fromInstant(new Date(instant))).toMatchObject({ date, time, second, timezone: 'Asia/Bangkok' })
  })

  it('synchronizes against a UTC server instant, correcting a badly set device clock', () => {
    const device = Date.parse('2020-01-01T00:00:00Z')
    vi.spyOn(Date, 'now').mockReturnValue(device + 100)
    expect(clock.synchronize('2026-12-31T17:00:00.000Z', device, device + 200)).toBe(true)
    expect(clock.current()).toMatchObject({ date:'2027-01-01', time:'00:00' })
    // ไม่ยอมรับเวลาไม่มี Z, ค่าไม่ถูกต้อง หรือคำขอที่ช้า/นาฬิกาย้อนระหว่างวัด
    expect(clock.synchronize('2026-12-31 17:00:00', device, device + 100)).toBe(false)
    expect(clock.synchronize('not-a-date', device, device + 100)).toBe(false)
    expect(clock.synchronize('2026-12-31T17:00:00.000Z', device, device + 10001)).toBe(false)
    expect(clock.synchronize('2026-12-31T17:00:00.000Z', device + 100, device)).toBe(false)
    expect(clock.current()).toMatchObject({ date:'2027-01-01', time:'00:00' })
  })

  it('keeps the separate dashboard due labels on Bangkok civil days, including midnight and leap day', () => {
    const before = clock.fromInstant(new Date('2026-12-31T16:59:59.000Z')).date
    const after = clock.fromInstant(new Date('2026-12-31T17:00:00.000Z')).date
    expect(formatBangkokDue('2026-12-31', before)).toBe('วันนี้')
    expect(formatBangkokDue('2027-01-01', before)).toBe('อีก 1 วัน')
    expect(formatBangkokDue('2026-12-31', after)).toBe('เลยกำหนด 1 วัน')
    expect(formatBangkokDue('2027-01-01', after)).toBe('วันนี้')
    expect(formatBangkokDue('2024-03-01', '2024-02-28')).toBe('อีก 2 วัน')
    expect(formatBangkokDue('2026-02-31', after)).toBe('2026-02-31')
    expect(formatBangkokDue('2026-12-31', '')).toBe('2026-12-31')
  })

  it('preserves date-only values, leap days and skipped/DST days under different process timezones', () => {
    const script = `
      const fs=require('fs'),vm=require('vm');
      const time=require('./assets/js/bangkok-time');
      const now=Date.now(); time.synchronize('2026-12-31T17:00:00.000Z',now,now);
      const ctx=vm.createContext({BangkokTime:time,Date,Intl});
      vm.runInContext(fs.readFileSync('assets/js/ui.js','utf8'),ctx);
      console.log(JSON.stringify(vm.runInContext('({today:todayS(), unchanged:d2s(s2d("2026-03-08")), skipped:d2s(s2d("2011-12-30")), leap:d2s(addDays(s2d("2024-02-28"),1)), year:d2s(addDays(s2d("2026-12-31"),1)), remaining:daysLeft("2027-01-03"), formatted:fmtD("2027-01-01",{full:true})})',ctx)));
    `
    const zones = ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Apia']
    const results = zones.map(TZ => JSON.parse(execFileSync(process.execPath, ['-e', script], {
      cwd:root, env:{...process.env, TZ}, encoding:'utf8', timeout:10000,
    })))
    for (const result of results) expect(result).toEqual({
      today:'2027-01-01', unchanged:'2026-03-08', skipped:'2011-12-30',
      leap:'2024-02-29', year:'2027-01-01', remaining:2,
      formatted:'วันศุกร์ที่ 1 มกราคม 2570',
    })
  })
})

describe('MariaDB session initialization', () => {
  it('initializes each physical connection before queries and transactions, without changing GLOBAL', async () => {
    const { createBangkokPool } = require('../server/db')
    let config: any, initialized = 0, released = 0
    const calls: string[] = []
    const physical = {}
    const conn = {
      connection:physical,
      async query(sql: string) { calls.push(sql); if (sql.startsWith('SET SESSION')) initialized++; return [[], []] },
      async execute(sql: string) { calls.push(sql); return [[], []] },
      release() { released++ },
      destroy() { throw new Error('unexpected destroy') },
    }
    const raw = { getConnection:async()=>conn, end:async()=>{} }
    const pool = createBangkokPool({ timezone:'Z', dateStrings:false }, (opts: any) => { config = opts; return raw })
    await pool.query('SELECT 1')
    const tx = await pool.getConnection()
    await tx.query('START TRANSACTION')
    tx.release()
    await pool.execute('SELECT 2')
    expect(config).toMatchObject({ timezone:'+07:00', dateStrings:true, resetOnRelease:false })
    expect(calls).toEqual(["SET SESSION time_zone = '+07:00'", 'SELECT 1', 'START TRANSACTION', 'SELECT 2'])
    expect(initialized).toBe(1)
    expect(released).toBe(3)
    expect(calls.join(' ')).not.toMatch(/SET GLOBAL/i)
  })

  it('destroys an uninitialized connection and fails closed if setting the session timezone fails', async () => {
    const { createBangkokPool } = require('../server/db')
    let destroyed = false, queryCount = 0
    const conn = {
      connection:{}, async query() { queryCount++; throw new Error('SET failed') },
      release() { throw new Error('bad connection must not be released') },
      destroy() { destroyed = true },
    }
    const pool = createBangkokPool({}, () => ({ getConnection:async()=>conn, end:async()=>{} }))
    await expect(pool.query('SELECT 1')).rejects.toThrow('SET failed')
    expect(destroyed).toBe(true)
    expect(queryCount).toBe(1)
  })

  it('does not seed fabricated clock-ins into a real database', () => {
    const seed = fs.readFileSync(path.join(root, 'server/seed.js'), 'utf8')
    expect(seed).not.toMatch(/INSERT\s+INTO\s+erp_checkins/i)
  })
})
