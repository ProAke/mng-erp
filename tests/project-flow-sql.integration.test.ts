/* Optional real-DB test. Uses two randomly named disposable databases on a local Unix socket only.
   Run only with explicit MNG_TEST_DB_ALLOW_CREATE=1 and MNG_TEST_DB_SOCKET. */
import crypto from 'node:crypto'
import http from 'node:http'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import express from 'express'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const enabled = process.env.MNG_TEST_DB_ALLOW_CREATE === '1' && !!process.env.MNG_TEST_DB_SOCKET
const suite = enabled ? describe : describe.skip

suite('Project Flow against a real local MySQL/MariaDB engine', () => {
  const suffix = crypto.randomBytes(6).toString('hex')
  const authName = `mng_flow_ci_auth_${suffix}`
  const workName = `mng_flow_ci_work_${suffix}`
  let admin: any, db: any, server: http.Server, baseUrl = '', token = ''
  let authCreated = false, workCreated = false

  beforeAll(async () => {
    const common: any = {
      socketPath: process.env.MNG_TEST_DB_SOCKET,
      user: process.env.MNG_TEST_DB_USER || 'root',
      password: process.env.MNG_TEST_DB_PASSWORD || '',
      charset:'utf8mb4', dateStrings:true,
    }
    admin = await mysql.createConnection(common)
    await admin.query(`CREATE DATABASE \`${authName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    authCreated = true
    await admin.query(`CREATE DATABASE \`${workName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    workCreated = true
    await admin.query(`USE \`${authName}\``)
    await admin.query(`CREATE TABLE users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255), password VARCHAR(255), name VARCHAR(100), role VARCHAR(20), status VARCHAR(20)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    await admin.query('INSERT INTO users (email,password,name,role,status) VALUES (?,?,?,?,?)', ['flow-test@example.test',await bcrypt.hash('test-only-password', 8),'ผู้ทดสอบ','manager','active'])
    await admin.query(`USE \`${workName}\``)
    // Minimal legacy ci-workflow tables; ensureSchema adds all erp_* columns.
    await admin.query(`CREATE TABLE projects (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, hub_id VARCHAR(200), title VARCHAR(250), description TEXT, stat VARCHAR(20), icon VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    await admin.query(`CREATE TABLE tasks (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id INT UNSIGNED, title VARCHAR(300), description TEXT, status VARCHAR(20), priority VARCHAR(20), due_date DATE NULL, progress INT DEFAULT 0, archived TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    const cfg = require('../server/config')
    cfg.authDb = { ...common, database:authName, connectionLimit:4 }
    cfg.workDb = { ...common, database:workName, connectionLimit:6 }
    cfg.demoOnly = false
    for (const mod of ['../server/db','../server/hermes','../server/auth','../server/routes','../server/workspace-routes','../server/project-workspace-routes']) delete require.cache[require.resolve(mod)]
    db = require('../server/db')
    await db.ensureSchema()
    await db.workPool.query('INSERT INTO erp_team (name,role,email,is_me) VALUES (?,?,?,1)', ['ผู้ทดสอบ','Project Manager','flow-test@example.test'])
    await db.workPool.query('INSERT INTO erp_ai_agents (code,name,role,model) VALUES (?,?,?,?)', ['TEST','Test Agent','Planner','Test Model'])
    const auth = require('../server/auth')
    const api = require('../server/routes')
    const app = express()
    app.use(express.json())
    app.use('/api', auth.middleware, api)
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(server.address() as any).port}/api`; resolve() })
    })
    token = (await auth.login('flow-test@example.test','test-only-password')).token
  }, 30000)

  afterAll(async () => {
    if (server) await new Promise<void>(resolve=>server.close(()=>resolve()))
    if (db) { await db.authPool.end(); await db.workPool.end() }
    if (admin) {
      if (workCreated) await admin.query(`DROP DATABASE \`${workName}\``)
      if (authCreated) await admin.query(`DROP DATABASE \`${authName}\``)
      await admin.end()
    }
  }, 30000)

  async function req(path: string, method='GET', body?: any, authenticated=true) {
    const response = await fetch(baseUrl+path, { method,
      headers:{'Content-Type':'application/json', ...(authenticated ? {Authorization:'Bearer '+token} : {})},
      body:body === undefined ? undefined : JSON.stringify(body),
    })
    return {status:response.status, json:await response.json()}
  }

  it('migrates schemas, authenticates, persists the brief, nodes, tasks, docs, and bootstrap', async () => {
    expect((await req('/docs','GET',undefined,false)).status).toBe(401)
    const member = await req('/teams','POST',{name:'สมาชิกใหม่', role:'ผู้ประสานงาน'})
    const agent = await req('/ai/agents','POST',{name:'AI ใหม่',code:'NEWAI',role:'ผู้ช่วย',model:'Test Model'})
    expect(member.status).toBe(201)
    expect(agent.status).toBe(201)
    const created = await req('/projects','POST',{
      name:'โปรเจกต์ SQL', code:'SQL', start:'2026-10-27', end:'2026-12-31', members:['u1',member.json.id],
      brief:{objective:'ทดสอบการบันทึก', members:['u1',member.json.id], ownerId:member.json.id, aiAgentId:agent.json.id, aiModel:'Test Model'}, autoCreateTasks:true,
    })
    expect(created.status).toBe(200)
    expect(created.json.tasksCreated).toBe(16)
    const pid=created.json.id
    const read = await req(`/projects/${pid}/flow`)
    expect(read.json.flow.brief.objective).toBe('ทดสอบการบันทึก')
    expect(read.json.flow.nodes).toHaveLength(16)
    const [[count]]: any = await db.workPool.query('SELECT COUNT(*) c FROM tasks WHERE project_id=?',[Number(pid.slice(1))])
    expect(count.c).toBe(16)
    read.json.flow.brief.supportPlan = 'ติดตามผลหลังส่งมอบ'
    expect((await req(`/projects/${pid}/flow`,'PUT',read.json.flow)).json.flow.revision).toBe(2)
    expect((await req(`/projects/${pid}/flow`,'PUT',read.json.flow)).status).toBe(409)
    expect((await req(`/projects/${pid}/flow/sync-tasks`,'POST',{})).json.createdCount).toBe(0)
    const guide = await req('/docs','POST',{title:'คู่มือ SQL',body:'# ทดสอบ',projectId:pid})
    expect(guide.status).toBe(201)
    expect((await req('/docs')).json.docs[0].title).toBe('คู่มือ SQL')
    expect((await req(`/docs/${guide.json.id}`,'PATCH',{body:'อัปเดต'})).status).toBe(200)
    expect((await req(`/docs/${guide.json.id}`,'DELETE')).status).toBe(200)
    const bootstrap = await req('/bootstrap')
    expect(bootstrap.status).toBe(200)
    expect(bootstrap.json.projectFlows[pid].brief.supportPlan).toBe('ติดตามผลหลังส่งมอบ')
    expect(bootstrap.json.featureAvailability.projectFlow).toBe(true)
  }, 30000)

  it('serializes simultaneous task generation and rolls back all writes on failure', async () => {
    const project = await req('/projects','POST',{name:'พร้อมกัน',code:'CON',start:'2026-10-27',end:'2026-12-31'})
    expect(project.status).toBe(200)
    const responses = await Promise.all([
      req(`/projects/${project.json.id}/flow/sync-tasks`,'POST',{}),
      req(`/projects/${project.json.id}/flow/sync-tasks`,'POST',{}),
    ])
    expect(responses.map(r=>r.status)).toEqual([200,200])
    expect(responses.map(r=>r.json.createdCount).sort((a,b)=>a-b)).toEqual([0,16])
    const [[projectsBefore]]: any = await db.workPool.query('SELECT COUNT(*) c FROM projects')
    const [[tasksBefore]]: any = await db.workPool.query('SELECT COUNT(*) c FROM tasks')
    await db.workPool.query("CREATE TRIGGER simulate_failure BEFORE INSERT ON erp_project_flows FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test failure'")
    try { expect((await req('/projects','POST',{name:'rollback',autoCreateTasks:true})).status).toBe(500) }
    finally { await db.workPool.query('DROP TRIGGER simulate_failure') }
    const [[projectsAfter]]: any = await db.workPool.query('SELECT COUNT(*) c FROM projects')
    const [[tasksAfter]]: any = await db.workPool.query('SELECT COUNT(*) c FROM tasks')
    expect(projectsAfter.c).toBe(projectsBefore.c)
    expect(tasksAfter.c).toBe(tasksBefore.c)
  }, 30000)
})
