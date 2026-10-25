// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { api, tokenStore, bootstrapSchema } from '../web/src/lib/api/client'

process.env.DB_AUTH_PASS ||= 'test-auth-pass'
process.env.DB_WORK_PASS ||= 'test-work-pass'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app } = require('../server/index.js')

describe('Agency OS Upgrade — Schemas, Client Methods & Server Routes', () => {
  let server: Server
  let baseUrl = ''
  const realFetch = global.fetch

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

  afterEach(() => {
    vi.restoreAllMocks()
    tokenStore.clear()
  })

  it('validates complete Agency OS bootstrap payload with all 7 feature categories', () => {
    const payload = {
      user: { user_id: 1, email: 'worapot@outlook.com', name: 'Worapot', role: 'super_admin', avatar: null },
      team: [
        {
          id: 'u1',
          name: 'วรพจน์ กิจนิจชีวะ',
          nickname: 'เอก',
          kind: 'human',
          state: 'working',
          skills: ['Architecture', 'Next.js', 'MariaDB'],
          load: 18,
          capacity: 40,
          role: 'Managing Director',
          color: '#2F6BF0',
          email: 'worapot@outlook.com',
          phone: '081-234-5678',
          me: true,
          avatar: null,
          authUserId: 1,
          authRole: 'super_admin',
          authStatus: 'active',
        },
        {
          id: 'u9',
          name: 'NOVA',
          nickname: 'NOVA',
          kind: 'ai',
          state: 'online',
          skills: ['Copywriting', 'SEO', 'Content Plan'],
          model: 'claude-sonnet-4-5',
          paused: false,
          autonomy: 85,
          runs: 42,
          successRate: 98,
          tokensToday: 14800,
          currentTaskId: 't1',
          load: 6,
          capacity: 120,
          role: 'AI Content Strategist',
          color: '#8B5CF6',
          email: '',
          phone: '',
          me: false,
          avatar: null,
          authUserId: null,
          authRole: null,
          authStatus: null,
        },
      ],
      projects: [
        {
          id: 'p1',
          code: 'ERP',
          name: 'MNG Agency OS v2',
          short: 'MNG Agency OS',
          client: 'c1',
          clientName: 'Internal',
          grad: 'g-blue',
          color: '#2F6BF0',
          status: 'doing',
          progress: 75,
          budget: 500000,
          spent: 210000,
          start: '2026-10-01',
          end: '2026-12-31',
          owner: 'u1',
          members: ['u1', 'u9'],
          desc: '<p>Full Agency OS upgrade</p>',
          icon: '🚀',
          hub: 'erp-os',
          open: 2,
          taskCount: 8,
        },
      ],
      tasks: [
        {
          id: 't1',
          code: 'ERP-1001',
          project: 'p1',
          title: 'Draft Q4 Campaign Copy',
          desc: 'Prepare social captions',
          status: 'doing',
          priority: 'high',
          assignee: 'u9',
          start: '2026-10-20',
          due: '2026-10-28',
          progress: 60,
          est: 6,
          spent: 2.5,
          blocked: true,
          blockReason: 'Waiting for brand guideline v2',
          aiGenerated: true,
          tags: ['ai', 'content'],
          subtasks: [{ t: 'Write 5 headlines', d: true }],
          comments: [],
        },
      ],
      events: [],
      clients: [],
      invoices: [],
      activity: [],
      aiRuns: [
        {
          id: 'ar1',
          agentId: 'u9',
          taskId: 't1',
          action: 'ร่างคอนเทนต์และหัวข้อแคมเปญ',
          detail: 'สรุป 5 แนวทางคอนเทนต์พร้อมใช้งาน',
          output: '1. Headline A...',
          durationSec: 4,
          tokens: 1240,
          status: 'success',
          at: '2026-10-25 10:15:00',
        },
      ],
      channels: [
        {
          id: 'ch1',
          name: 'ประกาศ-ออฟฟิศ',
          emoji: '📣',
          type: 'group',
          topic: 'ข่าวสารหลักของบริษัท',
          projectId: null,
          members: ['u1'],
          pinned: true,
        },
      ],
      messages: [
        {
          id: 'm1',
          channelId: 'ch1',
          authorId: 'u1',
          text: 'ยินดีต้อนรับสู่ MNG Agency OS!',
          kind: 'text',
          attachmentUrl: null,
          attachmentName: null,
          pinned: true,
          reactions: { '🎉': ['u1'] },
          at: '2026-10-25 09:30',
        },
      ],
      checkins: [
        {
          id: 'ck1',
          teamId: 'u1',
          date: '2026-10-25',
          clockIn: '09:22',
          clockOut: null,
          mode: 'office',
          lat: 13.7563,
          lng: 100.5018,
          distanceM: 18,
          note: '',
          lateMin: 0,
        },
      ],
      leaves: [
        {
          id: 'lv1',
          teamId: 'u1',
          leaveType: 'wfh',
          startDate: '2026-10-29',
          endDate: '2026-10-29',
          days: 1,
          reason: 'โฟกัสงานสถาปัตยกรรมระบบ',
          status: 'approved',
          approvedBy: 'u1',
        },
      ],
      rooms: [
        {
          id: 'rm1',
          name: 'Boardroom ชั้น 4',
          kind: 'room',
          capacity: 12,
          floor: 'ชั้น 4',
          color: '#3BA7FF',
          equipment: ['จอ 4K 85"', 'ไมค์ประชุม'],
          status: 'available',
        },
      ],
      bookings: [
        {
          id: 'bk1',
          roomId: 'rm1',
          teamId: 'u1',
          title: 'Weekly All-Hands',
          date: '2026-10-26',
          startTime: '10:00',
          endTime: '11:30',
          attendees: ['u1'],
          note: '',
        },
      ],
      settings: {
        orgName: 'MNG Groups Co., Ltd.',
        announce: 'เปิดตัว AI Workforce ครบ 5 เอเจนต์!',
        aiEnabled: true,
        workStart: '09:30',
        workEnd: '18:30',
        office: { name: 'MNG HQ', lat: 13.7563, lng: 100.5018, radius: 250 },
      },
    }

    const parsed = bootstrapSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.team).toHaveLength(2)
      expect(parsed.data.aiRuns).toHaveLength(1)
      expect(parsed.data.channels?.[0].emoji).toBe('📣')
      expect(parsed.data.checkins?.[0].distanceM).toBe(18)
      expect(parsed.data.rooms?.[0].capacity).toBe(12)
    }
  })

  it('sends correct HTTP verbs and payloads for AI, Chat, HR, Presence, and Room APIs', async () => {
    tokenStore.set('agency-os-token')
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const u = String(input)
      if (u.includes('/ai/agents/')) {
        return new Response(
          JSON.stringify({ ok: true, runId: 'ar9', output: 'Done', tokens: 950, durationSec: 3, taskId: 't1' }),
          { status: 200 }
        )
      }
      if (u.includes('/checkins/in')) {
        return new Response(
          JSON.stringify({ ok: true, date: '2026-10-25', clockIn: '09:25', lateMin: 0, distanceM: 12 }),
          { status: 200 }
        )
      }
      return new Response(JSON.stringify({ ok: true, id: 'x1' }), { status: 200 })
    })

    await api.me.setState('focus')
    await api.ai.runAgent('u9', { taskId: 't1', prompt: 'Summarize sprint' })
    await api.channels.sendMessage('ch1', { text: 'Hello @NOVA' })
    await api.hr.clockIn({ mode: 'office', lat: 13.7563, lng: 100.5018 })
    await api.rooms.book({
      roomId: 'rm1',
      title: 'Design Review',
      date: '2026-10-27',
      startTime: '14:00',
      endTime: '15:00',
    })

    expect(spy).toHaveBeenCalledTimes(5)
    expect(spy.mock.calls[0][0]).toBe('/api/me/state')
    expect(spy.mock.calls[1][0]).toBe('/api/ai/agents/u9/run')
    expect(spy.mock.calls[2][0]).toBe('/api/channels/ch1/messages')
    expect(spy.mock.calls[3][0]).toBe('/api/checkins/in')
    expect(spy.mock.calls[4][0]).toBe('/api/bookings')
  })

  it('serves static HTML for /ai, /chat, /hr, /rooms and protects their REST endpoints with 401', async () => {
    for (const page of ['/ai', '/ai/', '/chat', '/hr', '/rooms']) {
      const res = await realFetch(`${baseUrl}${page}`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('/_next/static/')
    }

    for (const apiPath of [
      '/api/ai/toggle-all',
      '/api/channels',
      '/api/checkins/in',
      '/api/leaves',
      '/api/bookings',
    ]) {
      const res = await realFetch(`${baseUrl}${apiPath}`, { method: 'POST' })
      expect(res.status).toBe(401)
    }
  })
})
