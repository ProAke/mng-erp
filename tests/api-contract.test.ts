// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, tokenStore, loginResponseSchema, bootstrapSchema } from '../web/src/lib/api/client'

describe('API Contract Tests (Frontend <-> Backend)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    tokenStore.clear()
  })

  it('validates login response including avatar and authId against loginResponseSchema', () => {
    const mockLoginResponse = {
      token: 'abc123def456',
      expires: new Date(Date.now() + 86400000).toISOString(),
      user: {
        id: 'u1',
        authId: 1,
        email: 'admin@mng.local',
        name: 'Admin User',
        role: 'super_admin',
        avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      },
    }

    const result = loginResponseSchema.safeParse(mockLoginResponse)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.user.avatar).toBe(mockLoginResponse.user.avatar)
      expect(result.data.user.authId).toBe(1)
    }
  })

  it('rejects malformed login response missing token', () => {
    const invalidResponse = {
      expires: '2026-12-31T00:00:00Z',
      user: {
        id: 'u1',
        email: 'admin@mng.local',
        name: 'Admin User',
        role: 'admin',
      },
    }

    const result = loginResponseSchema.safeParse(invalidResponse)
    expect(result.success).toBe(false)
  })

  it('validates bootstrap payload and preserves trend, eventCats, and settings', () => {
    const mockBootstrapPayload = {
      user: { user_id: 1, email: 'admin@mng.local', name: 'Admin', role: 'super_admin', avatar: null },
      team: [
        {
          id: 'u1',
          name: 'Admin',
          role: 'Lead',
          color: '#2F6BF0',
          email: 'admin@mng.local',
          phone: '0812345678',
          me: true,
          avatar: null,
          authUserId: 1,
          authRole: 'super_admin',
          authStatus: 'active',
        },
      ],
      projects: [
        {
          id: 'p1',
          name: 'ERP Upgrade',
          short: 'ERP Upgrade',
          client: 'c1',
          clientName: 'Internal',
          grad: 'g-blue',
          color: '#2F6BF0',
          status: 'doing',
          progress: 50,
          budget: 100000,
          spent: 45000,
          start: '2026-01-01',
          end: '2026-12-31',
          owner: 'u1',
          members: ['u1'],
          desc: 'Upgrade system',
          icon: '📁',
          hub: 'erp-1',
          open: 1,
          taskCount: 2,
        },
      ],
      tasks: [
        {
          id: 't1',
          code: 'MNG-1001',
          project: 'p1',
          title: 'Setup CI',
          desc: 'Add GitHub Actions',
          status: 'doing',
          priority: 'high',
          assignee: 'u1',
          start: '2026-04-01',
          due: '2026-04-20',
          progress: 50,
          est: 8,
          tags: ['devops'],
          subtasks: [],
          comments: [],
        },
      ],
      events: [],
      clients: [],
      invoices: [],
      activity: [{ at: '2026-04-17 10:00', u: 'u1', text: 'Created task' }],
      eventCats: {
        meeting: { label: 'ประชุม', cls: 'ev-meeting', color: '#8E7CF3' },
      },
      settings: { orgName: 'MNG Groups', notifyDueSoon: true },
      trend: {
        months: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
        created: [1, 2, 3, 4, 0, 0, 0, 0, 0, 5, 0, 0],
        completed: [1, 1, 2, 3, 0, 0, 0, 0, 0, 4, 0, 0],
        revenue: [0, 0, 120, 0, 0, 0, 0, 0, 0, 250, 0, 0],
        workload: [['ERP Upgrade', 4, '#2F6BF0']],
      },
    }

    const result = bootstrapSchema.safeParse(mockBootstrapPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.trend?.months).toHaveLength(12)
      expect(result.data.eventCats?.meeting?.label).toBe('ประชุม')
      expect(result.data.settings?.orgName).toBe('MNG Groups')
    }
  })

  it('sends { current, password } in api.users.changeMyPassword matching server/users.js', async () => {
    tokenStore.set('tok-test-123')
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    await api.users.changeMyPassword('oldSecret', 'newSecret')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/users/me/password')
    expect(JSON.parse(String(init?.body))).toEqual({
      current: 'oldSecret',
      password: 'newSecret',
    })
  })

  it('sends Authorization Bearer token and FormData on api.drive.upload', async () => {
    tokenStore.set('drive-jwt-token')
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: '/uploads/test.png', id: 'local:test.png', name: 'test.png' }), {
        status: 200,
      })
    )

    const file = new File(['hello'], 'test.png', { type: 'image/png' })
    const out = await api.drive.upload(file)
    expect(out.url).toBe('/uploads/test.png')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/drive/upload')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer drive-jwt-token')
    expect(headers['Content-Type']).toBeUndefined()
    expect(init?.body).toBeInstanceOf(FormData)
  })
})
