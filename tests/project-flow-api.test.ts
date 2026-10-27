import http from 'node:http'
import express from 'express'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('Project Flow & Docs API: authentication, transactions and idempotency', () => {
  let server: http.Server
  let baseUrl = ''
  let createdProject = ''
  let failNextFlowWrite = false
  let state: any = {
    projects: [{ id:1, title:'โปรเจกต์เดิม', erp_code:'OLD', hub_id:'old', erp_start:'2026-10-01', erp_end:'2026-12-01', erp_archived:0, erp_members:'[]' }],
    tasks: [], flows: [], docs: [], clients: [{id:1,name:'ลูกค้า'}],
    team: [{id:1,email:'manager@example.test'}, {id:2,email:'user@example.test'}],
    agents: [{id:1}], nextProject:2, nextTask:1, nextDoc:1,
  }
  let lock: Promise<void> = Promise.resolve()

  const manager = { user_id:1, email:'manager@example.test', name:'Manager', role:'manager' }
  const user = { user_id:2, email:'user@example.test', name:'User', role:'user' }
  const sessions: Record<string, any> = { 'manager-token':manager, 'user-token':user }
  const copy = (v: any) => JSON.parse(JSON.stringify(v))

  async function query(db: any, sql: string, params: any[] = []) {
    const s = sql.replace(/\s+/g, ' ').trim()
    if (/SELECT user_id, name, email, role FROM erp_sessions/i.test(s)) return [sessions[params[0]] ? [copy(sessions[params[0]])] : []]
    if (/SELECT id FROM erp_team WHERE id IN/i.test(s)) return [db.team.filter((x: any) => params[0].includes(x.id)).map((x: any) => ({id:x.id}))]
    if (/SELECT id FROM erp_ai_agents WHERE id IN/i.test(s)) return [db.agents.filter((x: any) => params[0].includes(x.id)).map((x: any) => ({id:x.id}))]
    if (/SELECT id FROM erp_team WHERE LOWER\(email\)/i.test(s)) return [db.team.filter((x: any) => x.email?.toLowerCase() === String(params[0]).toLowerCase()).map((x: any) => ({id:x.id}))]
    if (/INSERT INTO erp_activity/i.test(s)) return [{insertId:1}]
    if (/SELECT id FROM erp_clients WHERE name/i.test(s)) return [db.clients.filter((x: any) => x.name === params[0])]
    if (/SELECT id, title, erp_code, hub_id, erp_start, erp_end FROM projects/i.test(s)) {
      return [db.projects.filter((p: any) => p.id === Number(params[0]) && !p.erp_archived)]
    }
    if (/SELECT id FROM projects WHERE id=/i.test(s)) return [db.projects.filter((p: any) => p.id === Number(params[0]) && !p.erp_archived).map((p: any) => ({id:p.id}))]
    if (/INSERT INTO projects \(/i.test(s)) {
      const id = db.nextProject++
      db.projects.push({ id, hub_id:params[0], title:params[1], description:params[2], stat:params[3], icon:params[4], erp_code:params[5],
        erp_client_id:params[6], erp_client:params[7], erp_budget:params[8], erp_start:params[9], erp_end:params[10],
        erp_grad:params[11], erp_color:params[12], erp_status:params[13], erp_members:params[14], erp_archived:0 })
      return [{insertId:id}]
    }
    if (/UPDATE projects SET erp_members=/i.test(s)) {
      const project = db.projects.find((p: any) => p.id === Number(params[1]))
      if (project) project.erp_members = params[0]
      return [{affectedRows:project ? 1 : 0}]
    }
    if (/SELECT \* FROM erp_project_flows WHERE project_id=/i.test(s)) return [db.flows.filter((f: any) => f.project_id === Number(params[0]))]
    if (/INSERT INTO erp_project_flows/i.test(s)) {
      if (failNextFlowWrite) { failNextFlowWrite = false; throw new Error('simulated DB failure') }
      const [project_id, template_key, brief, zones, nodes, edges, mindmap, ai_stack, revision, updated_by] = params
      const row = {project_id, template_key, brief, zones, nodes, edges, mindmap, ai_stack, revision, updated_by, updated_at:'2026-10-27 12:00:00'}
      db.flows = db.flows.filter((f: any) => f.project_id !== project_id).concat(row)
      return [{affectedRows:1}]
    }
    if (/INSERT INTO tasks \(/i.test(s)) {
      const id = db.nextTask++
      db.tasks.push({ id, project_id:params[0], title:params[1], description:params[2], status:params[3], priority:params[4], due_date:params[5],
        erp_start:params[7], erp_assignee:params[8], erp_ai_agent:params[9], erp_est:params[10], erp_tags:params[13], erp_subtasks:params[14] })
      return [{insertId:id}]
    }
    if (/UPDATE tasks SET erp_code=/i.test(s)) {
      const task = db.tasks.find((t: any) => t.id === Number(params[1]))
      if (task) task.erp_code = params[0]
      return [{affectedRows:task ? 1 : 0}]
    }
    if (/SELECT \* FROM erp_docs WHERE id=/i.test(s)) return [db.docs.filter((d: any) => d.id === Number(params[0]))]
    if (/SELECT id, title FROM erp_docs WHERE id=/i.test(s)) return [db.docs.filter((d: any) => d.id === Number(params[0]))]
    if (/SELECT \* FROM erp_docs ORDER BY/i.test(s)) return [db.docs]
    if (/INSERT INTO erp_docs/i.test(s)) {
      const id = db.nextDoc++
      db.docs.push({id, slug:params[0], category:params[1], icon:params[2], title:params[3], summary:params[4], body:params[5],
        project_id:params[6], author_name:params[7], pinned:params[8], updated_at:'2026-10-27 12:00:00'})
      return [{insertId:id}]
    }
    if (/UPDATE erp_docs SET/i.test(s)) {
      const doc = db.docs.find((d: any) => d.id === Number(params[7]))
      if (doc) Object.assign(doc, { category:params[0], icon:params[1], title:params[2], summary:params[3], body:params[4], project_id:params[5], pinned:params[6] })
      return [{affectedRows:doc ? 1 : 0}]
    }
    if (/DELETE FROM erp_docs/i.test(s)) { db.docs = db.docs.filter((d: any) => d.id !== Number(params[0])); return [{affectedRows:1}] }
    return [[]]
  }

  const workPool = {
    async query(sql: string, params: any[] = []) { return query(state, sql, params) },
    async getConnection() {
      let transaction: any = null
      let unlock: (() => void) | undefined
      return {
        async beginTransaction() {
          const previous = lock
          lock = new Promise<void>(resolve => { unlock = resolve })
          await previous
          transaction = copy(state)
        },
        async query(sql: string, params: any[] = []) { return query(transaction, sql, params) },
        async commit() { state = transaction; transaction = null; unlock?.(); unlock = undefined },
        async rollback() { transaction = null; unlock?.(); unlock = undefined },
        release() {},
      }
    },
  }
  const authPool = {
    async query(sql: string, params: any[] = []) {
      if (/FROM users WHERE id = \?/i.test(sql)) {
        const account = [manager,user].find(u => u.user_id === Number(params[0]))
        return [account ? [{ status:'active', role:account.role, name:account.name }] : []]
      }
      return [[]]
    },
  }

  beforeAll(async () => {
    const dbPath = require.resolve('../server/db')
    const realDb = require('../server/db')
    require.cache[dbPath]!.exports = { ...realDb, workPool, authPool }
    for (const mod of ['../server/hermes', '../server/auth', '../server/routes', '../server/workspace-routes', '../server/project-workspace-routes']) {
      delete require.cache[require.resolve(mod)]
    }
    const auth = require('../server/auth')
    const api = require('../server/routes')
    const app = express()
    app.use(express.json({limit:'15mb'}))
    app.use('/api', auth.middleware, api)
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as any).port}`
        resolve()
      })
    })
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())) })

  async function req(path: string, method='GET', body?: any, token='manager-token') {
    return fetch(baseUrl + '/api' + path, {
      method, headers: { 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer '+token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  it('requires authentication for both planning and team documentation', async () => {
    expect((await req('/docs', 'GET', undefined, '')).status).toBe(401)
    expect((await req('/projects/p1/flow', 'GET', undefined, '')).status).toBe(401)
    expect((await req('/projects', 'POST', {name:'anonymous'}, '')).status).toBe(401)
    expect((await req('/projects', 'POST', {name:'no elevation', autoCreateTasks:true}, 'user-token')).status).toBe(403)
    expect((await req('/projects', 'POST', {name:'invalid color', color:'red\" onmouseover=\"x'})).status).toBe(400)
    expect((await req('/projects', 'POST', {name:'bad date', start:'2026-02-30'})).status).toBe(400)
  })

  it('creates a default 4-zone flow for every new project, even via the existing API', async () => {
    const res = await req('/projects', 'POST', {name:'เปิดตัวสินค้า', code:'NEW', clientName:'ลูกค้า', members:['u1'], start:'2026-10-27', end:'2026-12-01'})
    expect(res.status).toBe(200)
    const out = await res.json()
    createdProject = out.id
    expect(out.flow.revision).toBe(1)
    expect(out.flow.zones).toHaveLength(4)
    expect(out.flow.nodes).toHaveLength(16)
    expect(out.flow.edges.some((edge: any) => edge.kind === 'rework')).toBe(true)
    expect(out.flow.edges.some((edge: any) => edge.kind === 'loop')).toBe(true)
    expect(out.tasksCreated).toBe(0)
    expect(state.projects.find((p: any) => 'p'+p.id === createdProject).erp_status).toBe('todo')
    const get = await (await req(`/projects/${createdProject}/flow`)).json()
    expect(get.flow.mindmap.title).toBe('เปิดตัวสินค้า')
    expect(get.flow.brief.members).toEqual(['u1'])
    expect(state.tasks).toHaveLength(0)
  })

  it('checks permissions, validates references, rejects spoofed links and protects concurrent edits', async () => {
    const current = (await (await req(`/projects/${createdProject}/flow`)).json()).flow
    expect((await req(`/projects/${createdProject}/flow`, 'PUT', current, 'user-token')).status).toBe(403)
    expect((await req(`/projects/${createdProject}/flow/sync-tasks`, 'POST', {}, 'user-token')).status).toBe(403)
    const invalid = copy(current); invalid.brief.ownerId = 'u9999'
    expect((await req(`/projects/${createdProject}/flow`, 'PUT', invalid)).status).toBe(400)
    const updated = copy(current)
    updated.brief.objective = 'เพิ่มยอดขาย'
    updated.brief.ownerId = 'u1'
    updated.brief.aiAgentId = 'ai1'
    updated.brief.aiModel = 'โมเดลที่เลือก'
    updated.nodes[0].taskId = 't9999'
    const response = await req(`/projects/${createdProject}/flow`, 'PUT', updated)
    expect(response.status).toBe(200)
    const saved = (await response.json()).flow
    expect(saved.revision).toBe(2)
    expect(saved.nodes[0].taskId).toBeUndefined()
    expect(saved.mindmap.objective).toBe('เพิ่มยอดขาย')
    expect((await req(`/projects/${createdProject}/flow`, 'PUT', updated)).status).toBe(409)
    expect((await (await req(`/projects/${createdProject}/flow`)).json()).flow.revision).toBe(2)
  })

  it('creates linked tasks once, including concurrent requests, and never loses a stored task link', async () => {
    const single = await (await req(`/projects/${createdProject}/flow/sync-tasks`, 'POST', {nodeId:'audience'})).json()
    expect(single.createdCount).toBe(1)
    expect(single.flow.nodes.find((n: any) => n.id === 'audience').taskId).toMatch(/^t\d+$/)
    const repeat = await (await req(`/projects/${createdProject}/flow/sync-tasks`, 'POST', {nodeId:'audience'})).json()
    expect(repeat.createdCount).toBe(0)
    const concurrent = await Promise.all([
      req(`/projects/${createdProject}/flow/sync-tasks`, 'POST', {}),
      req(`/projects/${createdProject}/flow/sync-tasks`, 'POST', {}),
    ])
    expect(concurrent.map(r=>r.status)).toEqual([200,200])
    const counts = await Promise.all(concurrent.map(async r => (await r.json()).createdCount))
    expect(counts.sort((a,b)=>a-b)).toEqual([0,15])
    expect(state.tasks.filter((t: any) => 'p'+t.project_id === createdProject)).toHaveLength(16)
    expect(state.tasks.every((t: any) => t.due_date === '2026-12-01')).toBe(true)
    const flow = (await (await req(`/projects/${createdProject}/flow`)).json()).flow
    const realTaskId = flow.nodes[0].taskId
    flow.nodes[0].taskId = 't9999'
    const res = await req(`/projects/${createdProject}/flow`, 'PUT', flow)
    expect(res.status).toBe(200)
    expect((await res.json()).flow.nodes[0].taskId).toBe(realTaskId)
    const before = state.tasks.length
    const newFlow = (await (await req(`/projects/${createdProject}/flow`)).json()).flow
    newFlow.nodes = newFlow.nodes.slice(1)
    expect((await req(`/projects/${createdProject}/flow`, 'PUT', newFlow)).status).toBe(200)
    expect(state.tasks.length).toBe(before)
  })

  it('rolls back the project and task inserts if saving the flow fails', async () => {
    const projectsBefore = state.projects.length, tasksBefore = state.tasks.length
    failNextFlowWrite = true
    const res = await req('/projects', 'POST', {name:'ต้อง rollback', code:'ERR', autoCreateTasks:true, start:'2026-10-27', end:'2026-12-01'})
    expect(res.status).toBe(500)
    expect(state.projects).toHaveLength(projectsBefore)
    expect(state.tasks).toHaveLength(tasksBefore)
    expect(state.flows.filter((f: any) => !state.projects.some((p: any) => p.id === f.project_id))).toHaveLength(0)
  })

  it('can create a plan for an existing project and rejects invalid projects', async () => {
    const existing = await (await req('/projects/p1/flow')).json()
    expect(existing.exists).toBe(false)
    const plan = require('../assets/js/project-plan').build({name:'โปรเจกต์เดิม'}, {objective:'แก้ปัญหาลูกค้า'})
    plan.revision = 0
    expect((await req('/projects/p1/flow', 'PUT', plan)).status).toBe(200)
    expect((await req('/projects/p1/flow', 'PUT', plan)).status).toBe(409)
    expect((await req('/projects/p999/flow', 'GET')).status).toBe(404)
    expect((await req('/projects/p1xyz/flow', 'GET')).status).toBe(400)
  })

  it('persists team guides and restricts deletion to managers', async () => {
    const created = await req('/docs', 'POST', {title:'SOP ลูกค้า', category:'ดูแลลูกค้า', summary:'รับเรื่อง', body:'# วิธีทำ\n- ตอบกลับ', projectId:createdProject}, 'user-token')
    expect(created.status).toBe(201)
    const id = (await created.json()).id
    let docs = (await (await req('/docs', 'GET', undefined, 'user-token')).json()).docs
    expect(docs.find((d: any) => d.id === id)).toMatchObject({title:'SOP ลูกค้า', projectId:createdProject, authorName:'User'})
    expect((await req(`/docs/${id}`, 'PATCH', {body:'## อัปเดต\n- ติดตาม'}, 'user-token')).status).toBe(200)
    docs = (await (await req('/docs')).json()).docs
    expect(docs.find((d: any) => d.id === id).body).toContain('ติดตาม')
    expect((await req(`/docs/${id}`, 'DELETE', undefined, 'user-token')).status).toBe(403)
    expect((await req(`/docs/${id}`, 'DELETE')).status).toBe(200)
    expect((await (await req('/docs')).json()).docs).toHaveLength(0)
    expect((await req('/docs', 'POST', {title:'x', body:'y', projectId:'p999'})).status).toBe(400)
  })
})
