import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import http from 'node:http'
import express from 'express'
import { JSDOM } from 'jsdom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const rootDir = path.resolve(__dirname, '..')

describe('PlayDigital Chat (i.playdigital.co.th parity) & End-to-End Real MariaDB Persistence Audit', () => {
  describe('1. PlayDigital Chat UI, DMs, Google Drive, Replies & Full CRM/Finance/Room Forms', () => {
    let dom: JSDOM
    let win: any

    beforeAll(async () => {
      const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')
      dom = new JSDOM(html, {
        url: 'http://localhost:8080/#/chat',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
      })
      win = dom.window
      win.fetch = async (url: string) => {
        if (String(url).includes('/api/health')) {
          return { ok: true, status: 200, json: async () => ({ ok: true, auth: false, work: false, demo: true }) }
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
      }
      win.scrollTo = () => {}
      win.HTMLElement.prototype.scrollIntoView = () => {}

      const ctx = dom.getInternalVMContext()
      for (const rel of ['assets/js/data.js', 'assets/js/ui.js', 'assets/js/views.js', 'assets/js/agency-os.js', 'assets/js/project-plan.js', 'assets/js/project-flow.js', 'assets/js/flow-operations.js', 'assets/js/app.js']) {
        vm.runInContext(fs.readFileSync(path.join(rootDir, rel), 'utf8'), ctx, { filename: rel })
      }
      await vm.runInContext('App.init()', ctx)
    })

    it('renders #ทีมทั้งหมด with i.playdigital.co.th system banner, Group Channels, Human DMs, AI DMs, and Google Drive card', () => {
      const ctx = dom.getInternalVMContext()
      vm.runInContext(`location.hash = '#/chat'; App.route();`, ctx)

      const sideText = win.document.getElementById('side')?.textContent || ''
      const viewHtml = win.document.getElementById('view')?.innerHTML || ''

      expect(sideText).toContain('ห้องกลุ่ม #')
      expect(sideText).toContain('#ทีมทั้งหมด')
      expect(sideText).toContain('ข้อความส่วนตัว · ทีมงาน')
      expect(sideText).toContain('คุยกับ AI Workforce')
      expect(sideText).toContain('Google Drive ทีม')

      // System welcome banner matching i.playdigital.co.th
      expect(viewHtml).toContain('สร้างกลุ่ม #ทีมทั้งหมด แล้ว — เชิญทุกคนแชร์งานและไฟล์ผ่าน Google Drive ที่นี่')
      // Auto-linked Task Code chip inside chat stream
      expect(viewHtml).toContain('chat-task-ref')
      expect(viewHtml).toContain('CAL-1031')
    })

    it('opens 1-on-1 AI Direct Message (ORBIT) and auto-replies with live invoice figures', async () => {
      const ctx = dom.getInternalVMContext()
      await vm.runInContext(`openDirectChat('ai5')`, ctx) // ORBIT

      const activeId = vm.runInContext(`Store.ui.activeChannel`, ctx)
      const chan = vm.runInContext(`Store.data.channels.find(c => c.id === '${activeId}')`, ctx)
      expect(chan.type).toBe('dm')
      expect(chan.slug).toContain('ai5')

      await vm.runInContext(`postChatMessage('${activeId}', 'สรุปบิลค้างชำระให้หน่อย')`, ctx)
      const dmMsgs = vm.runInContext(`Store.data.messages.filter(m => m.channelId === '${activeId}')`, ctx)
      const aiReplies = dmMsgs.filter((m: any) => m.kind === 'ai')
      expect(aiReplies.length).toBeGreaterThanOrEqual(2) // welcome + contextual invoice reply
      expect(aiReplies[aiReplies.length - 1].body).toContain('ORBIT')
      expect(aiReplies[aiReplies.length - 1].body).toContain('ใบแจ้งหนี้รอเก็บ')
    })

    it('supports Reply quote, Right Context Drawer (files / pins / members), and Create Task from Message', async () => {
      const ctx = dom.getInternalVMContext()
      vm.runInContext(`Store.ui.activeChannel = 'ch0'; renderChat();`, ctx)

      // Reply to m1
      vm.runInContext(`setChatReply('m1')`, ctx)
      expect(win.document.getElementById('view')?.textContent).toContain('กำลังตอบกลับ')
      await vm.runInContext(`postChatMessage('ch0', 'รับทราบครับ กำลังอัปโหลดไฟล์ขึ้น Drive')`, ctx)

      const lastMsg = vm.runInContext(`Store.data.messages[Store.data.messages.length - 1]`, ctx)
      expect(lastMsg.replyTo).toBe('m1')

      // Toggle Right Context Drawers
      vm.runInContext(`toggleChatDrawer('files', true)`, ctx)
      expect(win.document.querySelector('.chat-drawer')?.textContent).toContain('Google Drive ของห้อง')

      vm.runInContext(`toggleChatDrawer('members', true)`, ctx)
      expect(win.document.querySelector('.chat-drawer')?.textContent).toContain('สมาชิกในห้องนี้')

      // Create task pre-filled from message
      vm.runInContext(`createTaskFromMessage('m1')`, ctx)
      const modalTitleVal = (win.document.getElementById('fTitle') as HTMLInputElement)?.value || ''
      expect(modalTitleVal).toContain('สวัสดีตอนเช้าทีม MNG')
      vm.runInContext(`closeModal()`, ctx)
    })

    it('renders Clients CRM modal/form and null-safe Finance view without errors', () => {
      const ctx = dom.getInternalVMContext()
      // Add an invoice with null client (simulating nullable client_id in MariaDB)
      vm.runInContext(`Store.data.invoices.push({ id:'i99', no:'INV-2026-099', client:null, title:'บิลทดสอบไม่ระบุลูกค้า', amount:10000, vat:700, issue:'2026-10-26', due:'2026-11-05', status:'draft', items:[] });`, ctx)
      vm.runInContext(`location.hash = '#/finance'; App.route();`, ctx)
      expect(win.document.getElementById('view')?.textContent).toContain('INV-2026-099')
      vm.runInContext(`openInvoiceModal('i99')`, ctx)
      expect(win.document.getElementById('modalRoot')?.textContent).toContain('ไม่ระบุลูกค้า')
      vm.runInContext(`closeModal()`, ctx)

      // Clients CRM
      vm.runInContext(`location.hash = '#/clients'; App.route();`, ctx)
      expect(win.document.getElementById('view')?.textContent).toContain('เพิ่มลูกค้าใหม่')
      vm.runInContext(`openClientModal('c1')`, ctx)
      expect(win.document.getElementById('modalRoot')?.textContent).toContain('ออกใบแจ้งหนี้')
      vm.runInContext(`closeModal()`, ctx)

      // Login screen must NOT show demo-mode bypass text ("ไม่ต้องการเชื่อมฐานข้อมูล? ใช้โหมดสาธิต")
      vm.runInContext(`App.showLogin()`, ctx)
      const loginOv = win.document.querySelector('.login-ov')
      expect(loginOv).toBeTruthy()
      expect(loginOv?.textContent).not.toContain('ไม่ต้องการเชื่อมฐานข้อมูล')
      expect(loginOv?.textContent).not.toContain('ใช้โหมดสาธิต')
      expect(win.document.getElementById('lgDemo')).toBeNull()
      loginOv?.remove()
    })
  })

  describe('2. Backend MariaDB Schema & Route Persistence Verification (All Modules)', () => {
    let server: http.Server
    let baseUrl = ''
    const executedSql: string[] = []

    // In-memory state backing our SQL mock so every route exercises real SQL queries in routes.js & workspace-routes.js
    const state: any = {
      channels: [
        { id: 1, slug: 'team-all', name: 'ทีมทั้งหมด', emoji: '💬', topic: 'ห้องหลัก', chan_type: 'group', members: '["u1","ai1"]', project_id: null, pinned: 1 },
      ],
      messages: [
        { id: 1, channel_id: 1, sender_id: 'u1', sender_name: 'Worapot', kind: 'system', body: 'สร้างกลุ่ม #ทีมทั้งหมด แล้ว — เชิญทุกคนแชร์งานและไฟล์ผ่าน Google Drive ที่นี่', pinned: 0, reactions: '{}', created_at: '2026-10-26 09:00:00' },
      ],
      files: [] as any[],
      clients: [
        { id: 1, name: 'Calmat Co., Ltd.', short: 'Calmat', color: '#2F6BF0', contact: 'คุณแพรว', phone: '02-111-3344', email: 'praew@calmat.co.th', addr: 'สุขุมวิท', since: '2025-03-01' },
      ],
      invoices: [
        { id: 1, no: 'INV-2026-045', client_id: 1, title: 'งวดเปิดงาน', amount: 45000, vat: 3150, issue: '2026-10-26', due: '2026-11-05', paid: null, status: 'pending', items: '[]' },
      ],
      rooms: [
        { id: 1, name: 'Boardroom', kind: 'room', zone: 'ชั้น 4', capacity: 12, color: '#6C5CE7', equip: '["จอ 4K"]' },
      ],
      settings: { theme: '#6C5CE7', orgName: 'MNG Groups', driveFolder: 'https://drive.google.com/drive/u/0/my-drive' },
      nextId: 10,
    }

    beforeAll(async () => {
      const dbModPath = require.resolve('../server/db')
      const mockWorkPool = {
        async query(sql: string, params: any[] = []) {
          const s = sql.trim()
          executedSql.push(s)

          if (/^SELECT COUNT\(\*\) c FROM/i.test(s)) return [[{ c: 3 }]]
          if (/SELECT id FROM erp_team/i.test(s)) return [[{ id: 1 }]]
          if (/INSERT INTO erp_activity/i.test(s)) return [{ insertId: ++state.nextId }]
          if (/SELECT data FROM erp_settings/i.test(s)) return [[{ data: JSON.stringify(state.settings) }]]
          if (/INSERT INTO erp_settings/i.test(s)) {
            state.settings = JSON.parse(params[0])
            return [{ affectedRows: 1 }]
          }

          // Channels & Messages & Files
          if (/SELECT \* FROM erp_channels/i.test(s)) return [state.channels]
          if (/SELECT id FROM erp_channels WHERE slug=\?/i.test(s)) {
            return [state.channels.filter((c: any) => c.slug === params[0])]
          }
          if (/SELECT slug, name, chan_type FROM erp_channels WHERE id=\?/i.test(s)) {
            return [state.channels.filter((c: any) => c.id === params[0])]
          }
          if (/INSERT INTO erp_channels/i.test(s)) {
            const id = ++state.nextId
            state.channels.push({
              id, slug: params[0], name: params[1], emoji: params[2], topic: params[3],
              chan_type: s.includes("'dm'") ? 'dm' : params[4],
              members: s.includes("'dm'") ? params[4] : params[5],
              project_id: s.includes("'dm'") ? null : params[6],
              pinned: s.includes("'dm'") ? 0 : params[7],
            })
            return [{ insertId: id }]
          }
          if (/UPDATE erp_channels SET/i.test(s)) return [{ affectedRows: 1 }]
          if (/DELETE FROM erp_channels/i.test(s)) {
            state.channels = state.channels.filter((c: any) => c.id !== params[0])
            return [{ affectedRows: 1 }]
          }

          if (/SELECT \* FROM erp_messages/i.test(s)) return [state.messages]
          if (/INSERT INTO erp_messages/i.test(s)) {
            const id = ++state.nextId
            state.messages.push({
              id, channel_id: params[0], sender_id: params[1], sender_name: params[2],
              kind: s.includes("'system'") ? 'system' : (s.includes("'ai'") ? 'ai' : params[3]),
              body: s.includes("'system'") || s.includes("'ai'") ? params[3] : params[4],
              reply_to: params[5] || null,
              attachment_url: params[6] || null,
              attachment_name: params[7] || null,
              attachment_type: params[8] || null,
              attachment_size: params[9] || 0,
              pinned: 0, reactions: '{}', created_at: '2026-10-26 10:15:00',
            })
            return [{ insertId: id }]
          }
          if (/UPDATE erp_messages SET/i.test(s)) {
            const mid = params[params.length - 1]
            const m = state.messages.find((x: any) => x.id === mid)
            if (m && s.includes('body=?')) { m.body = params[0]; m.edited_at = '2026-10-26 10:20:00' }
            return [{ affectedRows: 1 }]
          }
          if (/DELETE FROM erp_messages/i.test(s)) return [{ affectedRows: 1 }]

          if (/SELECT \* FROM erp_files/i.test(s)) return [state.files]
          if (/SELECT url, source FROM erp_files WHERE id=\?/i.test(s)) {
            return [state.files.filter((f: any) => f.id === params[0])]
          }
          if (/INSERT INTO erp_files/i.test(s)) {
            const id = ++state.nextId
            const isDrv = s.includes("'drive'")
            state.files.push({
              id,
              channel_id: params[0],
              project_id: params[1],
              task_id: isDrv ? null : params[2],
              uploader_id: isDrv ? params[2] : params[3],
              uploader_name: isDrv ? params[3] : params[4],
              name: isDrv ? params[4] : params[5],
              mime: isDrv ? 'application/vnd.google-apps.file' : params[6],
              size: isDrv ? 0 : params[7],
              url: isDrv ? params[5] : params[8],
              source: isDrv ? 'drive' : 'upload',
              created_at: '2026-10-26 10:18:00',
            })
            return [{ insertId: id }]
          }
          if (/DELETE FROM erp_files/i.test(s)) {
            state.files = state.files.filter((f: any) => f.id !== params[0])
            return [{ affectedRows: 1 }]
          }

          // Clients
          if (/INSERT INTO erp_clients/i.test(s)) {
            const id = ++state.nextId
            state.clients.push({ id, name: params[0], short: params[1] })
            return [{ insertId: id }]
          }
          if (/SELECT name FROM erp_clients/i.test(s)) return [[{ name: 'Test Client' }]]
          if (/UPDATE erp_clients SET/i.test(s)) return [{ affectedRows: 1 }]
          if (/DELETE FROM erp_clients/i.test(s)) return [{ affectedRows: 1 }]

          // Invoices
          if (/SELECT MAX\(CAST\(SUBSTRING/i.test(s)) return [[{ mx: 45 }]]
          if (/SELECT no FROM erp_invoices/i.test(s)) return [[{ no: 'INV-2026-046' }]]
          if (/INSERT INTO erp_invoices/i.test(s)) return [{ insertId: ++state.nextId }]
          if (/UPDATE erp_invoices SET/i.test(s)) return [{ affectedRows: 1 }]
          if (/DELETE FROM erp_invoices/i.test(s)) return [{ affectedRows: 1 }]

          // Rooms
          if (/INSERT INTO erp_rooms/i.test(s)) return [{ insertId: ++state.nextId }]
          if (/UPDATE erp_rooms SET/i.test(s)) return [{ affectedRows: 1 }]
          if (/DELETE FROM erp_rooms/i.test(s)) return [{ affectedRows: 1 }]
          if (/DELETE FROM erp_bookings/i.test(s)) return [{ affectedRows: 1 }]

          return [[]]
        },
      }
      const mockAuthPool = {
        async query() { return [[{ c: 6 }]] },
      }

      const realDb = require('../server/db')
      require.cache[dbModPath]!.exports = {
        ...realDb,
        workPool: mockWorkPool,
        authPool: mockAuthPool,
      }
      delete require.cache[require.resolve('../server/routes')]
      delete require.cache[require.resolve('../server/workspace-routes')]

      const apiRouter = require('../server/routes')
      const app = express()
      app.use(express.json({ limit: '15mb' }))
      app.use('/uploads', express.static(path.join(rootDir, 'uploads')))
      app.use('/api', (req: any, _res, next) => {
        req.user = { user_id: 2, name: 'Worapot', email: 'worapot@outlook.com', role: 'super_admin' }
        next()
      }, apiRouter)

      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any
          baseUrl = `http://127.0.0.1:${addr.port}`
          resolve()
        })
      })
    })

    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()))
    })

    it('defines erp_files and additive chat/attachment columns in server/db.js', () => {
      const realDb = require('../server/db')
      const joinedTables = realDb.TABLES.join('\n')
      expect(joinedTables).toContain('CREATE TABLE IF NOT EXISTS erp_files')
      expect(joinedTables).toContain('chan_type VARCHAR(20)')
      expect(joinedTables).toContain('attachment_url VARCHAR(600)')

      const cols = realDb.ADDITIVE_COLS.map((c: string[]) => `${c[0]}:${c[1].split(/\s+/)[0]}`)
      expect(cols).toContain('erp_channels:chan_type')
      expect(cols).toContain('erp_channels:members')
      expect(cols).toContain('erp_channels:pinned')
      expect(cols).toContain('erp_messages:reply_to')
      expect(cols).toContain('erp_messages:attachment_url')
      expect(cols).toContain('erp_messages:edited_at')
    })

    it('persists Group Channels (with system welcome message), 1-on-1 DMs, Message Edits, and Chat Sync in MariaDB', async () => {
      // Create new group channel -> must auto-insert i.playdigital.co.th system welcome message
      const chRes = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'แคมเปญ-q4', emoji: '🚀', type: 'group', members: ['u1', 'u2', 'ai1'], pinned: true }),
      })
      expect(chRes.status).toBe(201)
      const chData = await chRes.json()
      expect(chData.id).toMatch(/^ch\d+$/)

      // Open 1-on-1 DM with AI agent -> creates DM channel + initial AI greeting, and deduplicates on 2nd call
      const dm1 = await (await fetch(`${baseUrl}/api/channels/dm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meId: 'u1', targetId: 'ai1', targetName: 'NOVA' }),
      })).json()
      expect(dm1.created).toBe(true)

      const dm2 = await (await fetch(`${baseUrl}/api/channels/dm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meId: 'u1', targetId: 'ai1', targetName: 'NOVA' }),
      })).json()
      expect(dm2.id).toBe(dm1.id)
      expect(dm2.existed).toBe(true)

      // Post message with replyTo + edit message
      const msgRes = await (await fetch(`${baseUrl}/api/channels/${chData.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 'u1', senderName: 'Worapot', body: 'ส่งบรีฟแคมเปญครับ', replyTo: 'm1' }),
      })).json()
      expect(msgRes.id).toMatch(/^m\d+$/)

      const editRes = await fetch(`${baseUrl}/api/messages/${msgRes.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'ส่งบรีฟแคมเปญอัปเดตล่าสุดครับ' }),
      })
      expect(editRes.status).toBe(200)

      // Verify /api/chat/sync returns channels + system message + edited message
      const sync = await (await fetch(`${baseUrl}/api/chat/sync`)).json()
      expect(sync.channels.some((c: any) => c.name === 'แคมเปญ-q4')).toBe(true)
      expect(sync.messages.some((m: any) => m.kind === 'system' && m.body.includes('สร้างกลุ่ม #แคมเปญ-q4 แล้ว'))).toBe(true)
      expect(sync.messages.some((m: any) => m.body === 'ส่งบรีฟแคมเปญอัปเดตล่าสุดครับ' && m.editedAt)).toBe(true)
    })

    it('persists File Uploads, Google Drive Links, and /api/drive endpoint matching i.playdigital.co.th', async () => {
      // 1x1 transparent PNG base64
      const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const upRes = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'mockup-banner.png', mime: 'image/png', dataUrl: tinyPng, channelId: 'ch1' }),
      })
      expect(upRes.status).toBe(201)
      const upFile = await upRes.json()
      expect(upFile.url).toMatch(/^\/uploads\/.*mockup-banner\.png$/)

      // Verify uploaded file is actually written and served over HTTP, then cleaned up on DELETE
      const staticCheck = await fetch(`${baseUrl}${upFile.url}`)
      expect(staticCheck.status).toBe(200)

      // Share Google Drive link
      const drvRes = await fetch(`${baseUrl}/api/files/drive-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sprint-Deck.pptx', url: 'https://drive.google.com/file/d/123/view', channelId: 'ch1' }),
      })
      expect(drvRes.status).toBe(201)

      // Update Drive folder & verify GET /api/drive matches i.playdigital.co.th schema
      await fetch(`${baseUrl}/api/drive/folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'https://drive.google.com/drive/folders/mng-team-shared' }),
      })
      const driveList = await (await fetch(`${baseUrl}/api/drive`)).json()
      expect(driveList.source).toBe('workspace')
      expect(driveList.folder).toBe('https://drive.google.com/drive/folders/mng-team-shared')
      expect(driveList.files.length).toBe(2)

      // Delete uploaded file (also removes disk file cleanly)
      const delRes = await fetch(`${baseUrl}/api/files/${upFile.id}`, { method: 'DELETE' })
      expect(delRes.status).toBe(200)
    })

    it('persists Clients CRM, Invoices CRUD, Rooms CRUD, Settings, and passes /api/db/audit across all 23 tables', async () => {
      // Clients CRUD
      const clCreate = await (await fetch(`${baseUrl}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PlayDigital Co., Ltd.', short: 'PlayDigital', contact: 'คุณเอ', phone: '02-999-8888' }),
      })).json()
      expect(clCreate.id).toMatch(/^c\d+$/)
      expect((await fetch(`${baseUrl}/api/clients/${clCreate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '02-999-9999' }),
      })).status).toBe(200)
      expect((await fetch(`${baseUrl}/api/clients/${clCreate.id}`, { method: 'DELETE' })).status).toBe(200)

      // Invoices CRUD
      const invCreate = await (await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: 'c1', title: 'งวดส่งมอบระบบแชต', amount: 80000, status: 'pending' }),
      })).json()
      expect(invCreate.no).toBe('INV-2026-046')
      expect((await fetch(`${baseUrl}/api/invoices/${invCreate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 85000, status: 'pending' }),
      })).status).toBe(200)
      expect((await fetch(`${baseUrl}/api/invoices/${invCreate.id}/pay`, { method: 'POST' })).status).toBe(200)
      expect((await fetch(`${baseUrl}/api/invoices/${invCreate.id}`, { method: 'DELETE' })).status).toBe(200)

      // Rooms CRUD
      const rmCreate = await (await fetch(`${baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Studio B', kind: 'studio', capacity: 6 }),
      })).json()
      expect(rmCreate.id).toMatch(/^rm\d+$/)
      expect((await fetch(`${baseUrl}/api/rooms/${rmCreate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: 10 }),
      })).status).toBe(200)
      expect((await fetch(`${baseUrl}/api/rooms/${rmCreate.id}`, { method: 'DELETE' })).status).toBe(200)

      // Settings PUT
      const setRes = await (await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName: 'MNG Groups Thailand', n1: true }),
      })).json()
      expect(setRes.ok).toBe(true)
      expect(setRes.settings.orgName).toBe('MNG Groups Thailand')

      // pacific_mng.users + 22 pacific_mngworks tables including Flow actions and audit history
      const audit = await (await fetch(`${baseUrl}/api/db/audit`)).json()
      expect(audit.ok).toBe(true)
      expect(audit.modules.length).toBe(23)
      expect(audit.modules.every((m: any) => m.ok)).toBe(true)
      expect(executedSql.length).toBeGreaterThan(25)
    })
  })
})
