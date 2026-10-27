import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const root = path.resolve(__dirname, '..')
const tick = () => new Promise(resolve => setTimeout(resolve, 30))

describe('Project Brief, Flow, Mindmap and Docs UI', () => {
  let dom: JSDOM
  let ctx: any
  let projectId = ''
  const requests: string[] = []

  beforeAll(async () => {
    dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
      url: 'http://localhost:8080/#/projects', runScripts: 'outside-only', pretendToBeVisual: true,
    })
    const win: any = dom.window
    win.fetch = async (url: string) => {
      requests.push(String(url))
      return { ok: true, status: 200, json: async () => ({ ok: true, auth: false, work: false, demo: true }) }
    }
    win.scrollTo = () => {}
    win.HTMLElement.prototype.scrollIntoView = () => {}
    ctx = dom.getInternalVMContext()
    for (const rel of [
      'assets/js/data.js', 'assets/js/ui.js', 'assets/js/views.js', 'assets/js/agency-os.js',
      'assets/js/project-plan.js', 'assets/js/project-flow.js', 'assets/js/app.js',
    ]) vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel })
    await tick()
  })
  afterAll(() => dom.window.close())

  const el = (selector: string) => dom.window.document.querySelector(selector) as any
  const click = (selector: string) => {
    const found = el(selector)
    expect(found, `missing ${selector}`).toBeTruthy()
    found.click()
  }
  const set = (selector: string, value: string) => {
    const found = el(selector)
    expect(found, `missing ${selector}`).toBeTruthy()
    found.value = value
    found.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }

  it('shows a non-destructive preview for existing projects and links Docs in the navigation', () => {
    vm.runInContext("location.hash = '#/project-flow?project=p1'; App.route()", ctx)
    expect(el('#view').textContent).toContain('ผังนี้เป็นตัวอย่างสำหรับโปรเจกต์เดิม')
    expect(dom.window.document.querySelectorAll('[data-pf-zone]')).toHaveLength(4)
    expect(dom.window.document.querySelectorAll('[data-pf-node]')).toHaveLength(16)
    expect(el('#pfSyncTasks').disabled).toBe(true)
    expect(el('#rail').textContent).toContain('คู่มือ')
    expect(vm.runInContext("Boolean(Store.data.projectFlows.p1)", ctx)).toBe(false)
    expect(el('#view').textContent).toContain('ไม่ได้เชื่อม Webhook')
  })

  it('creates a project with a guided brief, team, model, 4-zone flow, and optional real task records', async () => {
    vm.runInContext('openProjectWizard()', ctx)
    set('#bwName', 'โครงการทดสอบ <img src=x onerror=alert(1)>')
    set('#bwCode', 'TST')
    set('#bw-objective', 'เพิ่มยอด Lead คุณภาพ')
    set('#bw-audience', 'เจ้าของร้านในกรุงเทพ')
    set('#bw-deliverables', 'เว็บไซต์และคู่มือ')
    set('#bw-successMetric', 'ได้รับ 20 Lead')
    click('#bwNext')
    set('#bw-marketingChannels', 'เว็บไซต์ / LINE OA')
    set('#bw-salesProcess', 'คัดกรองและเสนอราคา')
    set('#bw-productionPlan', 'พัฒนาเว็บไซต์')
    set('#bw-supportPlan', 'ตอบลูกค้าภายในหนึ่งวัน')
    click('#bwNext')
    set('#bw-ownerId', 'u1')
    set('#bw-approverId', 'u2')
    el('[data-bw-member][value="u2"]').checked = true
    set('#bw-aiAgentId', 'ai2')
    el('#bw-aiAgentId').dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    expect(el('#bw-aiModel').value).toBeTruthy()
    expect(dom.window.document.querySelectorAll('#bwModels option').length).toBeGreaterThan(0)
    set('#bw-aiModel', 'โมเดลทดสอบ')
    click('#bwNext')
    expect(el('#modalRoot').textContent).toContain('โมเดลทดสอบ')
    el('#bwCreateTasks').checked = true
    click('#bwNext')
    await tick()

    projectId = vm.runInContext("Store.data.projects.find(p => p.code === 'TST').id", ctx)
    expect(projectId).toBeTruthy()
    const flow = vm.runInContext(`Store.data.projectFlows[${JSON.stringify(projectId)}]`, ctx)
    expect(flow.brief.objective).toBe('เพิ่มยอด Lead คุณภาพ')
    expect(flow.brief.members).toEqual(expect.arrayContaining(['u1', 'u2']))
    expect(flow.brief.aiAgentId).toBe('ai2')
    expect(flow.brief.aiModel).toBe('โมเดลทดสอบ')
    expect(flow.nodes).toHaveLength(16)
    expect(flow.nodes.every((n: any) => n.taskId)).toBe(true)
    expect(flow.edges.some((e: any) => e.kind === 'loop')).toBe(true)
    expect(flow.edges.some((e: any) => e.kind === 'rework')).toBe(true)
    expect(vm.runInContext(`Store.data.tasks.filter(t => t.project === ${JSON.stringify(projectId)}).length`, ctx)).toBe(16)
    expect(JSON.parse(dom.window.localStorage.getItem('mng_erp_v2')!).projectFlows[projectId].brief.audience).toBe('เจ้าของร้านในกรุงเทพ')
    expect(el('#view').textContent).toContain('โครงการทดสอบ')
    expect(el('#view img')).toBeNull()
    vm.runInContext(`openProjectForm(Store.data.projects.find(p => p.id === ${JSON.stringify(projectId)}))`, ctx)
    expect(el('#modalRoot img')).toBeNull()
    expect(el('#modalRoot').textContent).toContain('<img src=x onerror=alert(1)>')
    vm.runInContext('closeModal()', ctx)
  })

  it('renders the generated mindmap and lets users edit a node without altering its linked task', async () => {
    click('[data-pf-mode="mindmap"]')
    expect(el('#view').textContent).toContain('เพิ่มยอด Lead คุณภาพ')
    expect(el('#view').textContent).toContain('ตอบลูกค้าภายในหนึ่งวัน')
    click('[data-pf-mode="flow"]')
    click('[data-pf-node="quality"]')
    expect(el('#modalRoot').textContent).toContain('การแก้ผังไม่เปลี่ยนงานที่สร้างไปแล้ว')
    set('#fnTitle', 'ตรวจคุณภาพก่อนส่งลูกค้า')
    set('#fnAssignee', 'u3')
    set('#fnChecklist', 'ตรวจข้อมูล\nให้ลูกค้ายืนยัน')
    click('#fnSave')
    await tick()
    const node = vm.runInContext(`Store.data.projectFlows[${JSON.stringify(projectId)}].nodes.find(n => n.id === 'quality')`, ctx)
    expect(node.title).toBe('ตรวจคุณภาพก่อนส่งลูกค้า')
    expect(node.assigneeId).toBe('u3')
    expect(node.checklist).toEqual(['ตรวจข้อมูล', 'ให้ลูกค้ายืนยัน'])
    expect(vm.runInContext(`Store.data.projectFlows[${JSON.stringify(projectId)}].brief.members.includes('u3')`, ctx)).toBe(true)
    const taskTitle = vm.runInContext(`Store.getTask(${JSON.stringify(node.taskId)}).title`, ctx)
    expect(taskTitle).not.toContain('ก่อนส่งลูกค้า')
    expect(el('#pfSyncTasks').disabled).toBe(true)
  })

  it('updates default steps from an edited brief without replacing customized steps or links', async () => {
    click('#pfEditBrief')
    set('#bw-audience', 'ลูกค้าองค์กร')
    click('#bwNext')
    set('#bw-supportPlan', 'ให้ทีมดูแลผ่าน LINE')
    click('#bwNext')
    click('#bwNext')
    click('#bwNext')
    await tick()
    const flow = vm.runInContext(`Store.data.projectFlows[${JSON.stringify(projectId)}]`, ctx)
    expect(flow.nodes.find((n: any) => n.id === 'audience').desc).toContain('ลูกค้าองค์กร')
    expect(flow.nodes.find((n: any) => n.id === 'support').desc).toContain('ให้ทีมดูแลผ่าน LINE')
    expect(flow.nodes.find((n: any) => n.id === 'quality')).toMatchObject({title:'ตรวจคุณภาพก่อนส่งลูกค้า', assigneeId:'u3'})
    expect(flow.nodes.every((n: any) => n.taskId)).toBe(true)
  })

  it('adds a team member and an AI Agent from the brief and selects them for the project', async () => {
    click('#pfEditBrief')
    click('[data-bw-step="2"]')
    click('#bwToggleMember')
    set('#bwNewMemberName', 'สมาชิกใหม่')
    set('#bwNewMemberRole', 'ผู้จัดการโครงการ')
    set('#bwNewMemberEmail', 'member@example.test')
    click('#bwSaveMember')
    await tick()
    const memberId = vm.runInContext("Store.data.team.find(u => u.name === 'สมาชิกใหม่').id", ctx)
    expect(el(`[data-bw-member][value="${memberId}"]`).checked).toBe(true)
    set('#bw-ownerId', memberId)
    click('#bwToggleAgent')
    set('#bwNewAgentName', 'ผู้ช่วยใหม่')
    set('#bwNewAgentCode', 'PLANBOT')
    set('#bwNewAgentRole', 'วางแผนโครงการ')
    set('#bwNewAgentModel', 'โมเดลใหม่')
    click('#bwSaveAgent')
    await tick()
    const agentId = vm.runInContext("Store.data.aiAgents.find(a => a.code === 'PLANBOT').id", ctx)
    expect(el('#bw-aiAgentId').value).toBe(agentId)
    expect(el('#bw-aiModel').value).toBe('โมเดลใหม่')
    click('#bwNext')
    click('#bwNext')
    await tick()
    const flow = vm.runInContext(`Store.data.projectFlows[${JSON.stringify(projectId)}]`, ctx)
    expect(flow.brief.ownerId).toBe(memberId)
    expect(flow.brief.aiAgentId).toBe(agentId)
    expect(flow.nodes.find((n: any) => n.id === 'content').aiAgentId).toBe(agentId)
  })

  it('creates and escapes a team guide, and keeps it in local state after reloading the Store', async () => {
    vm.runInContext("location.hash = '#/docs'; App.route()", ctx)
    expect(el('#view').textContent).toContain('ความรู้ที่ช่วยให้ทุกโปรเจกต์ไปต่อได้')
    click('#docsNew')
    set('#dgTitle', 'SOP รับบรีฟ')
    set('#dgSummary', 'แนวทางทีม')
    set('#dgBody', '# ขั้นตอน\n- รับบรีฟ\n<script>window.__xss = 1</script>')
    click('#dgSave')
    await tick()
    expect(el('#view').textContent).toContain('SOP รับบรีฟ')
    expect(el('#view').textContent).toContain('<script>window.__xss = 1</script>')
    expect(el('#view script')).toBeNull()
    expect((dom.window as any).__xss).toBeUndefined()
    vm.runInContext('Store.load()', ctx)
    expect(vm.runInContext("Store.data.customDocs.some(d => d.title === 'SOP รับบรีฟ')", ctx)).toBe(true)
    expect(requests.every(x => x === '/api/health')).toBe(true)
  })

  it('prevents edits if the server reports the flow table unavailable', () => {
    vm.runInContext("Remote.on = true; Remote.user = { role:'manager' }; Store.data.featureAvailability = {projectFlow:false,docs:true}; location.hash = '#/project-flow?project=p1'; App.route()", ctx)
    expect(el('#view').textContent).toContain('ยังโหลดข้อมูลผังจากฐานข้อมูลไม่ได้')
    expect(el('#pfEditBrief')).toBeNull()
    vm.runInContext('Remote.on = false', ctx)
  })

  it('does not persist authenticated briefs or guides as offline demo data', () => {
    vm.runInContext("Remote.on = true; Store.data.projectFlows = {p1:{brief:{objective:'ข้อมูลจริง'}}}; Store.data.customDocs = [{title:'คู่มือจริง'}]; Store.save()", ctx)
    const cached = JSON.parse(dom.window.localStorage.getItem('mng_erp_v2')!)
    expect(cached.projectFlows).toEqual({})
    expect(cached.customDocs).toEqual([])
    expect(vm.runInContext('Store.data.customDocs.length', ctx)).toBe(1)
    vm.runInContext('Remote.on = false', ctx)
  })
})
