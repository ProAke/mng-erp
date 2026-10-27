import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import express from 'express'
import bcrypt from 'bcryptjs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(__dirname, '..')

describe('Hermes & External AI API — Mandatory User/Password + 20 Rotating Token Pool', () => {
  let server: http.Server
  let baseUrl = ''
  let tempStateDir = ''

  // Simulated pacific_mng.users + pacific_mngworks.erp_api_tokens
  const agentPassword = 'HermesSecure#2026!'
  const passwordHash = bcrypt.hashSync(agentPassword, 8)
  const usersDb: any[] = [
    {
      id: 9,
      email: 'hermes@mng.co.th',
      password: passwordHash,
      name: 'Hermes AI Agent',
      role: 'manager',
      status: 'active',
    },
  ]

  const apiTokensDb: any[] = []
  const tasksDb: any[] = [
    {
      id: 1,
      project_id: 1,
      erp_code: 'MNG-1001',
      title: 'งานทดสอบระบบ Hermes',
      description: 'รายละเอียดงาน',
      status: 'doing',
      priority: 'high',
      erp_prio: 'urgent',
      due_date: '2026-11-05',
      progress: 50,
      archived: 0,
    },
  ]
  const projectsDb: any[] = [
    { id: 1, hub_id: 'mng', title: 'MNG Flagship', erp_code: 'MNG', erp_status: 'doing', erp_budget: 200000, erp_archived: 0 },
  ]

  beforeAll(async () => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mng-hermes-test-'))

    const dbModPath = require.resolve('../server/db')
    const mockAuthPool = {
      async query(sql: string, params: any[] = []) {
        const s = sql.trim()
        if (/FROM users WHERE LOWER\(email\)/i.test(s) || /FROM users WHERE email/i.test(s)) {
          const email = String(params[0] || '').toLowerCase()
          return [usersDb.filter(u => u.email.toLowerCase() === email)]
        }
        if (/FROM users WHERE id = \?/i.test(s)) {
          return [usersDb.filter(u => u.id === Number(params[0]))]
        }
        if (/SELECT COUNT\(\*\) c FROM users/i.test(s)) {
          return [[{ c: usersDb.length }]]
        }
        return [[]]
      },
    }

    const mockWorkPool = {
      async query(sql: string, params: any[] = []) {
        const s = sql.trim()

        // erp_api_tokens queries
        if (/FROM erp_api_tokens\s+WHERE user_id = \? AND revoked = 0/i.test(s)) {
          const uid = Number(params[0])
          return [
            apiTokensDb
              .filter(r => r.user_id === uid && r.revoked === 0 && new Date(r.expires_at).getTime() > Date.now())
              .sort((a, b) => a.slot - b.slot),
          ]
        }
        if (/FROM erp_api_tokens WHERE user_id = \? LIMIT 1/i.test(s)) {
          const hit = apiTokensDb.find(r => r.user_id === Number(params[0]))
          return [hit ? [{ strict_dual_auth: hit.strict_dual_auth }] : []]
        }
        if (/DELETE FROM erp_api_tokens WHERE user_id = \?/i.test(s)) {
          const uid = Number(params[0])
          for (let i = apiTokensDb.length - 1; i >= 0; i--) {
            if (apiTokensDb[i].user_id === uid) apiTokensDb.splice(i, 1)
          }
          return [{ affectedRows: 1 }]
        }
        if (/INSERT INTO erp_api_tokens/i.test(s)) {
          const [user_id, slot, token_hash, token_enc, token_preview, label, strict_dual_auth, days] = params
          const expires_at = new Date(Date.now() + Number(days || 60) * 86400 * 1000).toISOString()
          const existingIdx = apiTokensDb.findIndex(r => r.user_id === user_id && r.slot === slot)
          const row = {
            id: existingIdx >= 0 ? apiTokensDb[existingIdx].id : apiTokensDb.length + 1,
            user_id,
            slot,
            token_hash,
            token_enc,
            token_preview,
            label,
            strict_dual_auth,
            use_count: 0,
            last_used_at: null,
            last_agent: null,
            revoked: 0,
            expires_at,
            created_at: new Date().toISOString(),
          }
          if (existingIdx >= 0) apiTokensDb[existingIdx] = row
          else apiTokensDb.push(row)
          return [{ insertId: row.id }]
        }
        if (/FROM erp_api_tokens\s+WHERE token_hash = \?/i.test(s)) {
          const hash = params[0]
          const hit = apiTokensDb.find(
            r => r.token_hash === hash && r.revoked === 0 && new Date(r.expires_at).getTime() > Date.now()
          )
          return [hit ? [hit] : []]
        }
        if (/UPDATE erp_api_tokens SET use_count = use_count \+ 1/i.test(s)) {
          const agent = params[0]
          const id = params[1]
          const hit = apiTokensDb.find(r => r.id === id)
          if (hit) {
            hit.use_count += 1
            hit.last_agent = agent
            hit.last_used_at = new Date().toISOString()
          }
          return [{ affectedRows: 1 }]
        }
        if (/FROM erp_api_tokens WHERE user_id = \? ORDER BY slot ASC/i.test(s)) {
          return [apiTokensDb.filter(r => r.user_id === Number(params[0])).sort((a, b) => a.slot - b.slot)]
        }
        if (/UPDATE erp_api_tokens SET strict_dual_auth = \? WHERE user_id = \?/i.test(s)) {
          const val = params[0]
          const uid = Number(params[1])
          let count = 0
          apiTokensDb.forEach(r => {
            if (r.user_id === uid) {
              r.strict_dual_auth = val
              count++
            }
          })
          return [{ affectedRows: count }]
        }
        if (/UPDATE erp_api_tokens SET revoked = 1 WHERE user_id = \?/i.test(s)) {
          const uid = Number(params[0])
          let count = 0
          apiTokensDb.forEach(r => {
            if (r.user_id === uid) {
              r.revoked = 1
              count++
            }
          })
          return [{ affectedRows: count }]
        }

        // ERP data queries for overview & tasks
        if (/SELECT t\.\* FROM tasks/i.test(s) || /SELECT \* FROM tasks/i.test(s)) {
          return [tasksDb.filter(t => !t.archived)]
        }
        if (/SELECT erp_code, hub_id, title FROM projects/i.test(s)) {
          return [projectsDb.filter(p => p.id === Number(params[0]))]
        }
        if (/INSERT INTO tasks/i.test(s)) {
          const id = tasksDb.length + 1
          tasksDb.push({
            id,
            project_id: params[0] || 1,
            title: params[1],
            description: params[2],
            status: params[3],
            priority: params[4],
            due_date: params[5],
            progress: params[6],
            erp_prio: params[11] || 'med',
            archived: 0,
          })
          return [{ insertId: id }]
        }
        if (/UPDATE tasks SET erp_code=\?/i.test(s)) {
          const hit = tasksDb.find(t => t.id === params[1])
          if (hit) hit.erp_code = params[0]
          return [{ affectedRows: 1 }]
        }
        if (/SELECT \* FROM projects/i.test(s) || /SELECT id, erp_code, title, erp_client, erp_status, erp_progress, erp_budget FROM projects/i.test(s)) {
          return [projectsDb]
        }
        if (/SELECT COUNT\(\*\) c FROM/i.test(s)) return [[{ c: 5 }]]
        if (/INSERT INTO erp_activity/i.test(s)) return [{ insertId: 1 }]
        return [[]]
      },
    }

    require.cache[dbModPath] = {
      id: dbModPath,
      filename: dbModPath,
      loaded: true,
      exports: {
        authPool: mockAuthPool,
        workPool: mockWorkPool,
        TABLES: require('../server/db').TABLES,
      },
    } as any

    // Clear cached modules so they bind to mocked pools
    for (const rel of ['../server/hermes', '../server/auth', '../server/routes', '../server/workspace-routes']) {
      delete require.cache[require.resolve(rel)]
    }

    const hermes = require('../server/hermes')
    const auth = require('../server/auth')
    const apiRoutes = require('../server/routes')

    const app = express()
    app.use(express.json())
    app.get('/api/hermes/manual.md', hermes.serveMarkdownDoc('docs/API-MANUAL.md'))
    app.get('/api/hermes/skill.md', hermes.serveMarkdownDoc('skills/mng-erp/SKILL.md'))
    app.get('/api/hermes/client.py', hermes.serveMarkdownDoc('skills/mng-erp/scripts/mng_erp_client.py', 'text/x-python; charset=utf-8'))
    app.post('/api/hermes/login', hermes.loginHermesHandler)
    app.use('/api/hermes', auth.middleware, hermes.router)
    app.use('/api', auth.middleware, apiRoutes)

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    if (tempStateDir && fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true })
    }
  })

  it('rejects unauthenticated requests and invalid user/password logins', async () => {
    const noAuth = await fetch(`${baseUrl}/api/tasks`)
    expect(noAuth.status).toBe(401)
    const noAuthBody = await noAuth.json()
    expect(noAuthBody.error).toBe('unauthorized')

    const badPass = await fetch(`${baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hermes@mng.co.th', password: 'wrong-password' }),
    })
    expect(badPass.status).toBe(401)

    const unknownUser = await fetch(`${baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@mng.co.th', password: agentPassword }),
    })
    expect(unknownUser.status).toBe(401)
  })

  it('issues 20 distinct rotating tokens on login and preserves active pool across concurrent logins', async () => {
    const res1 = await fetch(`${baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hermes@mng.co.th', password: agentPassword, poolSize: 20 }),
    })
    expect(res1.status).toBe(200)
    const data1 = await res1.json()
    expect(data1.ok).toBe(true)
    expect(data1.poolSize).toBe(20)
    expect(data1.tokens).toHaveLength(20)

    const uniqueTokens = new Set(data1.tokens.map((t: any) => t.token))
    expect(uniqueTokens.size).toBe(20)
    expect(data1.tokens[0].slot).toBe(1)
    expect(data1.tokens[0].token).toMatch(/^mng_s01_[0-9a-f]{48}$/)
    expect(data1.tokens[19].slot).toBe(20)
    expect(data1.tokens[19].token).toMatch(/^mng_s20_[0-9a-f]{48}$/)

    // Second concurrent login without rotate=true returns the exact same 20 active tokens
    const res2 = await fetch(`${baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hermes@mng.co.th', password: agentPassword }),
    })
    const data2 = await res2.json()
    expect(data2.tokens.map((t: any) => t.token)).toEqual(data1.tokens.map((t: any) => t.token))
  })

  it('cycles round-robin across all 20 tokens and tracks slot usage headers & counts', async () => {
    const loginRes = await fetch(`${baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hermes@mng.co.th', password: agentPassword }),
    })
    const { tokens } = await loginRes.json()

    // Cycle through all 20 slots round-robin (1..20)
    for (let i = 0; i < 20; i++) {
      const slotObj = tokens[i]
      const r = await fetch(`${baseUrl}/api/hermes/me`, {
        headers: { Authorization: `Bearer ${slotObj.token}` },
      })
      expect(r.status).toBe(200)
      expect(r.headers.get('x-token-slot')).toBe(String(i + 1))
      expect(r.headers.get('x-next-recommended-slot')).toBe(String(((i + 1) % 20) + 1))
      const me = await r.json()
      expect(me.tokenSlot).toBe(i + 1)
      expect(me.user.email).toBe('hermes@mng.co.th')
    }

    // Verify all 20 slots recorded useCount >= 1
    const statsRes = await fetch(`${baseUrl}/api/hermes/tokens`, {
      headers: { 'X-API-Token': tokens[0].token },
    })
    const stats = await statsRes.json()
    expect(stats.activeCount).toBe(20)
    expect(stats.totalUses).toBeGreaterThanOrEqual(21)
    expect(stats.slots.every((s: any) => s.useCount >= 1)).toBe(true)
  })

  it('enforces live account suspension and Strict Dual-Auth (Token + User/Password)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hermes@mng.co.th', password: agentPassword }),
    })
    const { tokens } = await loginRes.json()
    const tok = tokens[3].token // Slot 4

    // 1) Suspend user -> immediately blocks active token
    usersDb[0].status = 'suspended'
    const blockedRes = await fetch(`${baseUrl}/api/hermes/overview`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
    expect(blockedRes.status).toBe(403)
    usersDb[0].status = 'active'

    // 2) Enable Strict Dual-Auth -> token alone returns 401, token + email/password returns 200
    const polOn = await fetch(`${baseUrl}/api/hermes/tokens/policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ password: agentPassword, strictDualAuth: true }),
    })
    expect(polOn.status).toBe(200)

    const tokenOnly = await fetch(`${baseUrl}/api/hermes/overview`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
    expect(tokenOnly.status).toBe(401)
    expect((await tokenOnly.json()).error).toBe('strict_dual_auth_required')

    const dualAuthOk = await fetch(`${baseUrl}/api/hermes/overview`, {
      headers: {
        Authorization: `Bearer ${tok}`,
        'X-Auth-Email': 'hermes@mng.co.th',
        'X-Auth-Password': agentPassword,
      },
    })
    expect(dualAuthOk.status).toBe(200)

    // Turn Strict Dual-Auth back off
    await fetch(`${baseUrl}/api/hermes/tokens/policy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
        'X-Auth-Email': 'hermes@mng.co.th',
        'X-Auth-Password': agentPassword,
      },
      body: JSON.stringify({ password: agentPassword, strictDualAuth: false }),
    })
  })

  it('executes bundled Python Hermes client (mng_erp_client.py) with self-login & round-robin token rotation', async () => {
    const scriptPath = path.join(rootDir, 'skills/mng-erp/scripts/mng_erp_client.py')
    const env = {
      ...process.env,
      MNG_ERP_URL: baseUrl,
      MNG_ERP_EMAIL: 'hermes@mng.co.th',
      MNG_ERP_PASSWORD: agentPassword,
      MNG_ERP_STATE_DIR: tempStateDir,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
    }

    // Missing credentials must fail cleanly
    let missingFailed = false
    try {
      await execFileAsync('python3', [scriptPath, 'whoami'], {
        env: { ...env, MNG_ERP_EMAIL: '', MNG_ERP_PASSWORD: '' },
      })
    } catch {
      missingFailed = true
    }
    expect(missingFailed).toBe(true)

    // Rotate & login via Python client
    const { stdout: loginStdout } = await execFileAsync('python3', [scriptPath, 'login', '--rotate'], { env })
    const loginOut = JSON.parse(loginStdout)
    expect(loginOut.ok).toBe(true)
    expect(loginOut.poolSize).toBe(20)
    expect(loginOut.slotsIssued).toHaveLength(20)

    // Three consecutive calls must automatically advance usedTokenSlot: 1 -> 2 -> 3
    const call1 = JSON.parse((await execFileAsync('python3', [scriptPath, 'whoami'], { env })).stdout)
    const call2 = JSON.parse((await execFileAsync('python3', [scriptPath, 'whoami'], { env })).stdout)
    const call3 = JSON.parse(
      (
        await execFileAsync(
          'python3',
          [scriptPath, 'task-create', '--title', 'งานที่สร้างจาก Hermes CLI', '--project', 'p1', '--priority', 'urgent'],
          { env }
        )
      ).stdout
    )

    expect(call1.usedTokenSlot).toBe(1)
    expect(call2.usedTokenSlot).toBe(2)
    expect(call3.usedTokenSlot).toBe(3)
    expect(call3.data.code).toBe('MNG-1002')
  })

  it('serves API Manual (.md), Hermes SKILL.md (authoring spec compliant), and client.py publicly', async () => {
    const [manRes, skillRes, pyRes] = await Promise.all([
      fetch(`${baseUrl}/api/hermes/manual.md`),
      fetch(`${baseUrl}/api/hermes/skill.md`),
      fetch(`${baseUrl}/api/hermes/client.py`),
    ])
    expect(manRes.status).toBe(200)
    expect(skillRes.status).toBe(200)
    expect(pyRes.status).toBe(200)

    const manualMd = await manRes.text()
    const skillMd = await skillRes.text()
    const clientPy = await pyRes.text()

    expect(manualMd).toContain('POST /api/hermes/login')
    expect(manualMd).toContain('Round-Robin')
    expect(clientPy).toContain('class MngErpClient')

    // Validate NousResearch/hermes-agent SKILL.md authoring standards
    const descMatch = skillMd.match(/^description:\s*(.+)$/m)
    expect(descMatch).toBeTruthy()
    const desc = descMatch![1].trim()
    expect(desc.length).toBeLessThanOrEqual(60)
    expect(desc.endsWith('.')).toBe(true)

    const requiredSections = [
      '# MNG ERP Skill',
      '## When to Use',
      '## Prerequisites',
      '## How to Run',
      '## Quick Reference',
      '## Procedure',
      '## Pitfalls',
      '## Verification',
    ]
    let lastPos = -1
    for (const heading of requiredSections) {
      const idx = skillMd.indexOf(heading)
      expect(idx).toBeGreaterThan(lastPos)
      lastPos = idx
    }
  })
})
