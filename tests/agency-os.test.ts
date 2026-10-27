import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { describe, it, expect, beforeAll } from 'vitest'

const rootDir = path.resolve(__dirname, '..')

describe('MNG ERP (ci-workflow base) + Agency OS (i.playdigital.co.th) integration', () => {
  let dom: JSDOM
  let ctx: any

  beforeAll(async () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')
    dom = new JSDOM(html, {
      url: 'http://localhost:8080/#/calendar',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    })

    const win: any = dom.window
    // Mock fetch so /api/health returns demo mode cleanly without network wait
    win.fetch = async (url: string) => {
      if (String(url).includes('/api/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, auth: false, work: false, demo: true, latencyMs: 1 }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }
    win.scrollTo = () => {}
    win.HTMLElement.prototype.scrollIntoView = () => {}

    // Check where boot happens in app.js
    ctx = dom.getInternalVMContext()
    for (const rel of [
      'assets/js/data.js',
      'assets/js/ui.js',
      'assets/js/views.js',
      'assets/js/agency-os.js',
      'assets/js/project-plan.js',
      'assets/js/project-flow.js',
      'assets/js/app.js',
    ]) {
      const code = fs.readFileSync(path.join(rootDir, rel), 'utf8')
      vm.runInContext(code, ctx, { filename: rel })
    }

    // Wait a tick for async App.init()
    await new Promise(resolve => setTimeout(resolve, 60))
  })

  it('keeps ci-workflow 3-column .app-shell intact and upgrades task keys to <CODE>-10xx', () => {
    const doc = dom.window.document
    expect(doc.querySelector('#appShell')).not.toBeNull()
    expect(doc.querySelector('#rail')).not.toBeNull()
    expect(doc.querySelector('#side')).not.toBeNull()
    expect(doc.querySelector('#topbar')).not.toBeNull()
    expect(doc.querySelector('#view')).not.toBeNull()

    const tasks = vm.runInContext('Store.data.tasks', ctx)
    expect(tasks.length).toBeGreaterThan(20)
    expect(tasks[0].code).toMatch(/^[A-Z]{2,4}-\d{4}$/)
    expect(tasks.some((t: any) => t.code.startsWith('CAL-') || t.code.startsWith('ERP-'))).toBe(true)
  })

  it('renders all existing routes plus Project Flow and Docs cleanly', () => {
    const routes = [
      'dashboard', 'calendar', 'tasks', 'projects', 'project-flow', 'docs',
      'ai', 'chat', 'hr', 'rooms',
      'finance', 'team', 'clients', 'reports', 'settings',
    ]
    for (const r of routes) {
      vm.runInContext(`location.hash = '#/${r}'; App.route();`, ctx)
      const viewHtml = dom.window.document.querySelector('#view')?.innerHTML || ''
      const sideHtml = dom.window.document.querySelector('#side')?.innerHTML || ''
      expect(viewHtml.length, `route #/${r} #view should render`).toBeGreaterThan(80)
      expect(sideHtml.length, `route #/${r} #side should render`).toBeGreaterThan(40)
    }
  })

  it('supports AI Workforce Hub: Master Kill-Switch, Autonomy update, and AI Dispatch to #ai-feed', async () => {
    vm.runInContext(`location.hash = '#/ai'; App.route();`, ctx)
    vm.runInContext(`toggleAllAiAgents(true);`, ctx)
    expect(vm.runInContext(`Store.data.aiAgents.every(a => a.paused === true)`, ctx)).toBe(true)

    vm.runInContext(`toggleAllAiAgents(false);`, ctx)
    expect(vm.runInContext(`Store.data.aiAgents.every(a => a.paused === false)`, ctx)).toBe(true)

    vm.runInContext(`updateAiAgent('ai1', { autonomy: 95 });`, ctx)
    expect(vm.runInContext(`Store.data.aiAgents.find(a => a.id === 'ai1').autonomy`, ctx)).toBe(95)

    const beforeFeed = vm.runInContext(`Store.data.messages.filter(m => m.channelId === 'ch5').length`, ctx)
    vm.runInContext(`openAiDispatchModal('ai1', 't1');`, ctx)
    const form = dom.window.document.querySelector('#aiDispForm') as HTMLFormElement
    expect(form).not.toBeNull()
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    const afterFeed = vm.runInContext(`Store.data.messages.filter(m => m.channelId === 'ch5').length`, ctx)
    expect(afterFeed).toBe(beforeFeed + 1)
  })

  it('supports Team Chat: posting messages with @NOVA auto-reply, reactions, and pins', async () => {
    vm.runInContext(`location.hash = '#/chat'; Store.ui.activeChannel = 'ch1'; App.route();`, ctx)
    const before = vm.runInContext(`Store.data.messages.filter(m => m.channelId === 'ch1').length`, ctx)
    await vm.runInContext(`postChatMessage('ch1', 'สวัสดีทีม @NOVA ช่วยเช็กแผนวันนี้หน่อย');`, ctx)
    const after = vm.runInContext(`Store.data.messages.filter(m => m.channelId === 'ch1').length`, ctx)
    // User message + @NOVA AI reply
    expect(after).toBe(before + 2)

    vm.runInContext(`toggleChatReaction('m1', '🚀'); toggleChatPin('m2');`, ctx)
    expect(vm.runInContext(`Store.data.messages.find(m => m.id === 'm1').reactions['🚀'].includes('u1')`, ctx)).toBe(true)
    expect(vm.runInContext(`Store.data.messages.find(m => m.id === 'm2').pinned`, ctx)).toBe(true)
  })

  it('supports HR Check-in / Clock-out and Leave approval', async () => {
    await vm.runInContext(`doClockIn('wfh');`, ctx)
    expect(vm.runInContext(`meMember().presence`, ctx)).toBe('working')
    await vm.runInContext(`doClockOut();`, ctx)
    expect(vm.runInContext(`meMember().presence`, ctx)).toBe('away')

    vm.runInContext(`decideLeave('lv1', 'approved');`, ctx)
    expect(vm.runInContext(`Store.data.leaves.find(l => l.id === 'lv1').status`, ctx)).toBe('approved')
  })

  it('enforces Room Booking Conflict Guard and supports Command Palette & Pomodoro', async () => {
    const td = vm.runInContext(`todayS()`, ctx)
    vm.runInContext(`openBookingForm('rm1', '${td}');`, ctx)
    const bkForm = dom.window.document.querySelector('#bkForm') as HTMLFormElement
    ;(bkForm.querySelector('[name="title"]') as HTMLInputElement).value = 'คิวซ้อนทดสอบ'
    ;(bkForm.querySelector('[name="start"]') as HTMLInputElement).value = '10:30'
    ;(bkForm.querySelector('[name="end"]') as HTMLInputElement).value = '11:00'

    const countBefore = vm.runInContext(`Store.data.bookings.length`, ctx)
    bkForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    // Must be blocked because bk1 occupies rm1 10:00–11:30 today!
    expect(vm.runInContext(`Store.data.bookings.length`, ctx)).toBe(countBefore)

    // Non-overlapping slot succeeds
    ;(bkForm.querySelector('[name="start"]') as HTMLInputElement).value = '17:00'
    ;(bkForm.querySelector('[name="end"]') as HTMLInputElement).value = '18:00'
    bkForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(vm.runInContext(`Store.data.bookings.length`, ctx)).toBe(countBefore + 1)

    // Command Palette & Pomodoro
    vm.runInContext(`openCommandPalette('NOVA');`, ctx)
    const cmdHtml = dom.window.document.querySelector('#cmdResults')?.innerHTML || ''
    expect(cmdHtml).toContain('NOVA')
    vm.runInContext(`closeModal(); Pomo.toggle();`, ctx)
    expect(vm.runInContext(`Pomo.running`, ctx)).toBe(true)
    vm.runInContext(`Pomo.reset();`, ctx)
    expect(vm.runInContext(`Pomo.running`, ctx)).toBe(false)
  })

  it('matches i.playdigital.co.th layout, color palette, typography, and Dashboard sections', () => {
    const stylesCss = fs.readFileSync(path.join(rootDir, 'assets/css/styles.css'), 'utf8')
    expect(stylesCss).toContain('--bg:#f6f7fc')
    expect(stylesCss).toContain('--ink:#23264d')
    expect(stylesCss).toContain('--violet:#6c5ce7')
    expect(stylesCss).toContain('--mint:#22c793')
    expect(stylesCss).toContain('--amber:#ffb020')
    expect(stylesCss).toContain('--red:#ff5c7a')
    expect(stylesCss).toContain("'Prompt'")
    expect(stylesCss).toContain('width:100vw; height:100vh')

    vm.runInContext(`location.hash = '#/dashboard'; App.route();`, ctx)
    const dashHtml = dom.window.document.querySelector('#view')?.innerHTML || ''
    for (const section of [
      'โปรเจกต์ที่กำลังทำ',
      'AI กำลังทำงาน',
      'งานเร่งด่วน',
      'แนวโน้มงาน &amp; รายได้',
      'โปรเจกต์เด่น',
      'ปฏิทินสัปดาห์นี้',
      'สถานะงานทั้งหมด',
      'ภาระงานทีม',
      'AI utilization',
      'กิจกรรมล่าสุด',
      'วันนี้ ·',
    ]) {
      expect(dashHtml).toContain(section)
    }
  })
})
