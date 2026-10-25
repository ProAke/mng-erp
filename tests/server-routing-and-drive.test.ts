import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'http'
import type { AddressInfo } from 'net'

process.env.DB_AUTH_PASS ||= 'test-auth-pass'
process.env.DB_WORK_PASS ||= 'test-work-pass'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app } = require('../server/index.js')

describe('Express Static Export Routing & Drive Auth Integration', () => {
  let server: Server
  let baseUrl = ''

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('serves Next.js static export at / with no-store cache headers', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const html = await res.text()
    expect(html).toContain('MNG ERP')
    // Must NOT be the legacy Vanilla SPA
    expect(html).not.toContain('assets/js/app.js')
  })

  it('serves directory index.html for routes both with and without trailing slash', async () => {
    for (const route of ['/login', '/login/', '/dashboard', '/projects/detail', '/calendar', '/settings']) {
      const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' })
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('/_next/static/')
    }
  })

  it('returns 404 for /hub, /workspace, and missing static assets instead of SPA HTML', async () => {
    const hubRes = await fetch(`${baseUrl}/hub`)
    expect(hubRes.status).toBe(404)

    const wsRes = await fetch(`${baseUrl}/workspace`)
    expect(wsRes.status).toBe(404)

    const missingJs = await fetch(`${baseUrl}/nonexistent-bundle.js`)
    expect(missingJs.status).toBe(404)
  })

  it('protects /api/drive/status and /api/drive/upload with auth while allowing OAuth callback with CSRF check', async () => {
    const statusUnauth = await fetch(`${baseUrl}/api/drive/status`)
    expect(statusUnauth.status).toBe(401)

    const uploadUnauth = await fetch(`${baseUrl}/api/drive/upload`, { method: 'POST' })
    expect(uploadUnauth.status).toBe(401)

    // OAuth callback is reachable without Bearer token, but rejects missing/invalid CSRF state
    const callbackBadState = await fetch(`${baseUrl}/api/drive/callback?code=fake&state=invalid`)
    expect(callbackBadState.status).toBe(400)
  })
})
