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
  let admin: any, db: any, server: http.Server, receiver: http.Server, receiverPort = 0, baseUrl = '', token = '', userToken = ''
  let authCreated = false, workCreated = false
  let hookMode = 'ok'
  let heldResponse: (()=>void) | undefined, holdArrived: (()=>void) | undefined
  const received: any[] = []
  const hookSecret = 'test-only-secret-at-least-32-utf8-bytes'

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
    await admin.query('INSERT INTO users (email,password,name,role,status) VALUES (?,?,?,?,?)', ['flow-user@example.test',await bcrypt.hash('test-only-password', 8),'สมาชิกทั่วไป','user','active'])
    await admin.query(`USE \`${workName}\``)
    // Minimal legacy ci-workflow tables; ensureSchema adds all erp_* columns.
    await admin.query(`CREATE TABLE projects (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, hub_id VARCHAR(200), title VARCHAR(250), description TEXT, stat VARCHAR(20), icon VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    await admin.query(`CREATE TABLE tasks (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id INT UNSIGNED, title VARCHAR(300), description TEXT, status VARCHAR(20), priority VARCHAR(20), due_date DATE NULL, progress INT DEFAULT 0, archived TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    const cfg = require('../server/config')
    cfg.authDb = { ...common, database:authName, connectionLimit:4 }
    cfg.workDb = { ...common, database:workName, connectionLimit:6 }
    cfg.demoOnly = false
    for (const mod of ['../server/db','../server/hermes','../server/auth','../server/routes','../server/workspace-routes','../server/project-workspace-routes','../server/flow-action-routes']) delete require.cache[require.resolve(mod)]
    db = require('../server/db')
    await db.ensureSchema()
    await db.workPool.query('INSERT INTO erp_team (name,role,email,is_me) VALUES (?,?,?,1)', ['ผู้ทดสอบ','Project Manager','flow-test@example.test'])
    await db.workPool.query('INSERT INTO erp_ai_agents (code,name,role,model) VALUES (?,?,?,?)', ['TEST','Test Agent','Planner','Test Model'])
    // รับ HTTP เฉพาะในชุดทดสอบ; URL ที่ adapter ตรวจยังเป็น HTTPS และ production ไม่มีทางเลือก HTTP
    receiver = http.createServer((req, res) => {
      const parts: Buffer[] = []
      req.on('data', c=>parts.push(c))
      req.on('end', () => {
        const raw=Buffer.concat(parts).toString('utf8')
        received.push({path:req.url, headers:req.headers, raw, body:JSON.parse(raw)})
        if (req.url === '/hook' && hookMode === 'error') { res.writeHead(500); res.end('upstream private details'); return }
        const send = () => {
          res.writeHead(req.url === '/hook' ? 202 : 200, {'Content-Type':'application/json'})
          res.end(req.url === '/hook' ? '{}' : JSON.stringify({choices:[{message:{content:'ร่างจาก AI ที่ต้องตรวจ'}}]}))
        }
        if ((req.url === '/hook' && hookMode === 'hold-hook') || (req.url === '/chat' && hookMode === 'hold-ai')) {
          heldResponse=send; holdArrived?.(); return
        }
        if (req.url === '/hook' && hookMode === 'slow') setTimeout(send, 100); else send()
      })
    })
    await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', () => { receiverPort=(receiver.address() as any).port; resolve() }))
    const integrationsPath = require.resolve('../server/flow-integrations')
    const realIntegrations = require(integrationsPath)
    const testIntegrations = realIntegrations.createIntegrations({
      env:{FLOW_AI_URL:'https://ai.example.test/chat',FLOW_AI_KEY:'test-key',FLOW_AI_MODEL:'test-model',
        FLOW_WEBHOOK_URL:'https://hook.example.test/hook',FLOW_WEBHOOK_SECRET:hookSecret},
      request:(url: string, opts: any, cb: any) => http.request({hostname:'127.0.0.1',port:receiverPort,path:new URL(url).pathname,method:opts.method,headers:opts.headers}, cb),
    })
    require.cache[integrationsPath]!.exports = {...realIntegrations, ...testIntegrations}
    const auth = require('../server/auth')
    const api = require('../server/routes')
    const app = express()
    app.use(express.json())
    app.use('/api', auth.middleware, api)
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(server.address() as any).port}/api`; resolve() })
    })
    token = (await auth.login('flow-test@example.test','test-only-password')).token
    userToken = (await auth.login('flow-user@example.test','test-only-password')).token
  }, 30000)

  afterAll(async () => {
    if (server) await new Promise<void>(resolve=>server.close(()=>resolve()))
    if (receiver) await new Promise<void>(resolve=>receiver.close(()=>resolve()))
    if (db) { await db.authPool.end(); await db.workPool.end() }
    if (admin) {
      if (workCreated) await admin.query(`DROP DATABASE \`${workName}\``)
      if (authCreated) await admin.query(`DROP DATABASE \`${authName}\``)
      await admin.end()
    }
  }, 30000)

  async function req(path: string, method='GET', body?: any, authenticated: boolean | string=true) {
    const response = await fetch(baseUrl+path, { method,
      headers:{'Content-Type':'application/json', ...(authenticated ? {Authorization:'Bearer '+(typeof authenticated === 'string' ? authenticated : token)} : {})},
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

  it('persists core and all Agency OS areas through the API on real MariaDB', async () => {
    const client=await req('/clients','POST',{name:'ลูกค้า MariaDB',contact:'ผู้ประสานงาน'})
    expect(client.status).toBe(201)
    const project=await req('/projects','POST',{name:'โปรเจกต์ทุกโมดูล',code:'ALL',clientName:'ลูกค้า MariaDB',start:'2026-10-27',end:'2026-12-31',autoCreateTasks:true})
    expect(project.status).toBe(200)
    const pid=project.json.id
    const task=project.json.flow.nodes.find((n:any)=>n.id==='support').taskId
    expect((await req(`/tasks/${task}`,'PATCH',{status:'<img src=x>'})).status).toBe(200)
    const [[statusLog]]:any=await db.workPool.query('SELECT text FROM erp_activity ORDER BY id DESC LIMIT 1')
    expect(statusLog.text).toContain('&lt;img src=x&gt;')
    expect(statusLog.text).not.toContain('<img')
    expect((await req(`/tasks/${task}`,'PATCH',{status:'doing'})).status).toBe(200)
    const feed=await req('/channels','POST',{name:'ai-feed'})
    expect(feed.status).toBe(201)
    const [[feedBefore]]:any=await db.workPool.query('SELECT COUNT(*) c FROM erp_messages WHERE channel_id=?',[Number(feed.json.id.slice(2))])
    const example=await req('/ai/dispatch','POST',{agentId:'ai1',taskId:task,prompt:'ตัวอย่างคำสั่งส่วนตัว',postToFeed:false})
    expect(example.json.simulated).toBe(true)
    expect(example.json.tokens).toBe(0)
    expect(example.json.durationSec).toBe(0)
    expect(example.json.detail).toContain('ไม่ได้เรียก AI')
    let [[feedCount]]:any=await db.workPool.query('SELECT COUNT(*) c FROM erp_messages WHERE channel_id=?',[Number(feed.json.id.slice(2))])
    expect(feedCount.c).toBe(feedBefore.c)
    expect((await req('/ai/dispatch','POST',{agentId:'ai1',prompt:'ตัวอย่างที่อนุญาตให้แชร์',postToFeed:true})).status).toBe(200)
    ;[[feedCount]]=await db.workPool.query('SELECT COUNT(*) c FROM erp_messages WHERE channel_id=?',[Number(feed.json.id.slice(2))])
    expect(feedCount.c).toBe(feedBefore.c+1)
    const event=await req('/events','POST',{title:'ประชุม MariaDB',date:'2026-11-20',project:pid,task})
    expect(event.status).toBe(200)
    const invoice=await req('/invoices','POST',{client:client.json.id,title:'ค่าทดสอบ MariaDB',amount:1000,due:'2026-12-15'})
    expect(invoice.status).toBe(200)
    const channel=await req('/channels','POST',{name:'ทีมทดสอบ-mariadb',projectId:pid,members:['u1']})
    expect(channel.status).toBe(201)
    const message=await req(`/channels/${channel.json.id}/messages`,'POST',{body:'ข้อความทดสอบฐานข้อมูล'})
    expect(message.status).toBe(201)
    expect((await req(`/messages/${message.json.id}`,'PATCH',{body:'แก้ไขข้อความแล้ว'})).status).toBe(200)
    const file=await req('/files/drive-link','POST',{name:'เอกสารทดสอบ',url:'https://drive.google.com/file/d/example/view',channelId:channel.json.id,projectId:pid})
    expect(file.status).toBe(201)
    const room=await req('/rooms','POST',{name:'ห้องทดสอบ MariaDB',capacity:4})
    expect(room.status).toBe(201)
    const booking=await req('/bookings','POST',{roomId:room.json.id,title:'ประชุม',date:'2026-11-20',start:'10:00',end:'11:00'})
    expect(booking.status).toBe(201)
    expect((await req('/bookings','POST',{roomId:room.json.id,title:'ชน',date:'2026-11-20',start:'10:30',end:'11:30'})).status).toBe(409)
    expect((await req('/checkins/clock','POST',{memberId:'u1',date:'2026-11-20',time:'09:00',mode:'wfh'})).status).toBe(200)
    const leave=await req('/leaves','POST',{memberId:'u1',startDate:'2026-11-21',endDate:'2026-11-21',reason:'ทดสอบ'})
    expect(leave.status).toBe(201)
    expect((await req(`/leaves/${leave.json.id}`,'PATCH',{status:'approved'})).status).toBe(200)
    expect((await req('/settings','PUT',{orgName:'องค์กรทดสอบ MariaDB'})).status).toBe(200)
    const boot=await req('/bootstrap')
    expect(boot.status).toBe(200)
    expect(boot.json.clients.some((x:any)=>x.id===client.json.id)).toBe(true)
    expect(boot.json.tasks.find((x:any)=>x.id===task).status).toBe('doing')
    expect(boot.json.events.some((x:any)=>x.id===event.json.id)).toBe(true)
    expect(boot.json.invoices.some((x:any)=>x.id===invoice.json.id)).toBe(true)
    expect(boot.json.channels.some((x:any)=>x.id===channel.json.id)).toBe(true)
    expect(boot.json.messages.some((x:any)=>x.id===message.json.id && x.body==='แก้ไขข้อความแล้ว')).toBe(true)
    expect(boot.json.files.some((x:any)=>x.id===file.json.id)).toBe(true)
    expect(boot.json.rooms.some((x:any)=>x.id===room.json.id)).toBe(true)
    expect(boot.json.bookings.some((x:any)=>x.id===booking.json.id)).toBe(true)
    expect(boot.json.checkins.some((x:any)=>x.date==='2026-11-20' && x.clockIn==='09:00')).toBe(true)
    expect(boot.json.leaves.some((x:any)=>x.id===leave.json.id && x.status==='approved')).toBe(true)
    expect(boot.json.settings.orgName).toBe('องค์กรทดสอบ MariaDB')
    const audit=await req('/db/audit')
    expect(audit.json.ok).toBe(true)
    expect(audit.json.modules).toHaveLength(23)
  }, 30000)

  it('persists drafts, AI generation, approval, signed webhook dispatch and uncertain delivery on MariaDB', async () => {
    received.length=0
    const created = await req('/projects','POST',{name:'ดำเนินการ SQL',code:'ACT',brief:{objective:'เพิ่มความพึงพอใจ', audience:'ลูกค้าทดสอบ'},start:'2026-10-27',end:'2026-12-31'})
    expect(created.status).toBe(200)
    const pid=created.json.id, base=`/projects/${pid}/flow/actions`, eventId=crypto.randomUUID()
    expect((await req('/flow/integrations','GET',undefined,false)).status).toBe(401)
    expect((await req(base,'GET',undefined,userToken)).status).toBe(403)
    const input={eventId,nodeId:'support',kind:'support',title:'ตอบลูกค้า',destination:'ช่องทางทดสอบ',content:''}
    expect((await req(base,'POST',input,userToken)).status).toBe(403)
    let result=await req(base,'POST',input)
    expect(result.status).toBe(201)
    let action=result.json.action
    expect(action.status).toBe('draft')
    expect((await req(base,'POST',input)).json.action.id).toBe(action.id)
    expect((await req(base,'POST',{...input,title:'ต่างจากเดิม'})).status).toBe(409)
    expect((await req(`${base}/${action.id}/generate`,'POST',{revision:action.revision,instruction:'ร่างคำตอบ'})).status).toBe(400)
    expect((await req('/ai/toggle-all','POST',{paused:true},userToken)).status).toBe(403)
    expect((await req('/ai/agents/ai1','PATCH',{paused:true},userToken)).status).toBe(403)
    expect((await req('/ai/toggle-all','POST',{paused:true})).status).toBe(200)
    expect((await req(`${base}/${action.id}/generate`,'POST',{revision:action.revision,confirm:true,instruction:'ร่างคำตอบอย่างสุภาพ'})).status).toBe(409)
    expect((await req('/ai/toggle-all','POST',{paused:false})).status).toBe(200)
    result=await req(`${base}/${action.id}/generate`,'POST',{revision:action.revision,confirm:true,instruction:'ร่างคำตอบอย่างสุภาพ'})
    expect(result.status).toBe(200)
    action=result.json.action
    expect(action.content).toBe('ร่างจาก AI ที่ต้องตรวจ')
    expect(action.status).toBe('draft')
    expect(received.filter(x=>x.path==='/hook')).toHaveLength(0)
    expect(received.find(x=>x.path==='/chat').body.model).toBe('test-model')
    expect(received.find(x=>x.path==='/chat').body.messages[1].content).toContain('เพิ่มความพึงพอใจ')
    result=await req(`${base}/${action.id}/approve`,'POST',{revision:action.revision,confirm:true})
    expect(result.status).toBe(200)
    action=result.json.action
    expect((await req(`${base}/${action.id}`,'PATCH',{revision:action.revision,title:'แก้หลังอนุมัติ'})).status).toBe(409)
    hookMode='slow'
    const sends=await Promise.all([
      req(`${base}/${action.id}/send`,'POST',{revision:action.revision,confirm:true}),
      req(`${base}/${action.id}/send`,'POST',{revision:action.revision,confirm:true}),
    ])
    expect(sends.map(x=>x.status).sort()).toEqual([200,409])
    action=sends.find(x=>x.status===200)!.json.action
    expect(action.status).toBe('accepted')
    const hooks=received.filter(x=>x.path==='/hook')
    expect(hooks).toHaveLength(1)
    expect(hooks[0].headers['idempotency-key']).toBe(eventId)
    const signature=crypto.createHmac('sha256',hookSecret).update(hooks[0].headers['x-mng-timestamp']+'.'+hooks[0].raw).digest('hex')
    expect(hooks[0].headers['x-mng-signature']).toBe('sha256='+signature)
    const reread=await req(`${base}/${action.id}`)
    expect(reread.json.action.status).toBe('accepted')
    expect(reread.json.events.map((e:any)=>e.type)).toEqual(expect.arrayContaining(['created','ai_started','ai_completed','approved','send_started','webhook_accepted']))

    const second=await req(base,'POST',{eventId:crypto.randomUUID(),nodeId:'publish',kind:'media',title:'เผยแพร่',destination:'เว็บทดสอบ',content:'เนื้อหาทดสอบ'})
    let uncertain=second.json.action
    uncertain=(await req(`${base}/${uncertain.id}/approve`,'POST',{revision:uncertain.revision,confirm:true})).json.action
    hookMode='error'
    const firstTry=await req(`${base}/${uncertain.id}/send`,'POST',{revision:uncertain.revision,confirm:true})
    expect(firstTry.status).toBe(200)
    expect(firstTry.json.accepted).toBe(false)
    uncertain=firstTry.json.action
    expect(uncertain.status).toBe('unknown')
    expect(uncertain.lastError).toBe('HTTP_500')
    expect(JSON.stringify(uncertain)).not.toContain('upstream private details')
    expect((await req(`${base}/${uncertain.id}/send`,'POST',{revision:uncertain.revision,confirm:true})).status).toBe(409)
    expect((await req(`${base}/${uncertain.id}/reconcile`,'POST',{revision:uncertain.revision,confirm:true,resolution:'not_accepted',note:'สั้น'})).status).toBe(400)
    uncertain=(await req(`${base}/${uncertain.id}/reconcile`,'POST',{revision:uncertain.revision,confirm:true,resolution:'not_accepted',note:'ตรวจบันทึกปลายทางแล้วไม่พบ event นี้'})).json.action
    expect(uncertain.status).toBe('draft')
    expect((await req(`${base}/${uncertain.id}`,'PATCH',{revision:uncertain.revision,title:'เปลี่ยนเนื้อหา'})).status).toBe(409)
    uncertain=(await req(`${base}/${uncertain.id}/approve`,'POST',{revision:uncertain.revision,confirm:true})).json.action
    hookMode='ok'
    uncertain=(await req(`${base}/${uncertain.id}/send`,'POST',{revision:uncertain.revision,confirm:true})).json.action
    expect(uncertain.status).toBe('accepted')
    const retried=received.filter(x=>x.path==='/hook' && x.body.eventId===uncertain.eventId)
    expect(retried).toHaveLength(2)
    expect(retried[0].raw).toBe(retried[1].raw)
    expect((await req(`${base}/${uncertain.id}`)).json.events.some((e:any)=>e.type==='confirmed_not_accepted')).toBe(true)
  }, 30000)

  it('recovers a stale interrupted send only after an explicit, recorded check', async () => {
    const created=await req('/projects','POST',{name:'กู้สถานะ',code:'RCV'})
    const base=`/projects/${created.json.id}/flow/actions`
    let a=(await req(base,'POST',{nodeId:'support',kind:'support',title:'ติดตาม',destination:'ช่องทาง',content:'ข้อความ'})).json.action
    a=(await req(`${base}/${a.id}/approve`,'POST',{revision:a.revision,confirm:true})).json.action
    await db.workPool.query("UPDATE erp_flow_actions SET status='sending',attempts=1,revision=revision+1 WHERE id=?",[Number(a.id.slice(2))])
    a=(await req(`${base}/${a.id}`)).json.action
    expect(a.stale).toBe(false)
    expect((await req(`${base}/${a.id}/reconcile`,'POST',{revision:a.revision,confirm:true,resolution:'accepted',note:'ตรวจบันทึกปลายทางพบว่าได้รับแล้ว'})).status).toBe(409)
    await db.workPool.query('UPDATE erp_flow_actions SET updated_at=DATE_SUB(NOW(), INTERVAL 3 MINUTE) WHERE id=?',[Number(a.id.slice(2))])
    a=(await req(`${base}/${a.id}`)).json.action
    expect(a.stale).toBe(true)
    a=(await req(`${base}/${a.id}/reconcile`,'POST',{revision:a.revision,confirm:true,resolution:'accepted',note:'ตรวจบันทึกปลายทางพบว่าได้รับแล้ว'})).json.action
    expect(a.status).toBe('accepted')
  }, 30000)

  it('recovers an interrupted AI generation only after an explicit recorded check', async () => {
    const created=await req('/projects','POST',{name:'กู้ร่าง AI',code:'AIR'})
    const base=`/projects/${created.json.id}/flow/actions`
    let a=(await req(base,'POST',{nodeId:'support',kind:'support',title:'ร่าง',destination:'ทีม',content:'ข้อความเดิม'})).json.action
    await db.workPool.query("UPDATE erp_flow_actions SET status='generating',revision=revision+1 WHERE id=?",[Number(a.id.slice(2))])
    a=(await req(`${base}/${a.id}`)).json.action
    const recovery={revision:a.revision,confirm:true,resolution:'reset_generation',note:'ตรวจบันทึกและค่าใช้จ่ายจากผู้ให้บริการแล้ว'}
    expect((await req(`${base}/${a.id}/reconcile`,'POST',recovery)).status).toBe(409)
    await db.workPool.query('UPDATE erp_flow_actions SET updated_at=DATE_SUB(NOW(), INTERVAL 3 MINUTE) WHERE id=?',[Number(a.id.slice(2))])
    a=(await req(`${base}/${a.id}`)).json.action
    expect(a.stale).toBe(true)
    a=(await req(`${base}/${a.id}/reconcile`,'POST',{...recovery,revision:a.revision})).json.action
    expect(a.status).toBe('draft')
    expect(a.content).toBe('ข้อความเดิม')
    expect((await req(`${base}/${a.id}`)).json.events.some((e:any)=>e.type==='ai_reset')).toBe(true)
  }, 30000)

  it('saves in-flight AI and webhook outcomes even if the project is archived', async () => {
    for (const type of ['ai','hook']) {
      const created=await req('/projects','POST',{name:'เก็บคลังระหว่างทำงาน '+type,code:'ARC'})
      const pid=created.json.id, base=`/projects/${pid}/flow/actions`
      let a=(await req(base,'POST',{nodeId:'support',kind:'support',title:'ติดตาม',destination:'ทีม',content:'ข้อความเดิม'})).json.action
      if (type==='hook') a=(await req(`${base}/${a.id}/approve`,'POST',{revision:a.revision,confirm:true})).json.action
      hookMode=type==='hook'?'hold-hook':'hold-ai'
      heldResponse=undefined
      const arrived=new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('mock receiver did not receive request')),5000)
        holdArrived=()=>{clearTimeout(timer);resolve()}
      })
      const path=`${base}/${a.id}/${type==='hook'?'send':'generate'}`
      const pending=req(path,'POST',{revision:a.revision,confirm:true,...(type==='ai'?{instruction:'ร่างใหม่'}:{})})
      try {
        await arrived
        expect((await req(`/projects/${pid}`,'DELETE')).status).toBe(200)
        heldResponse!(); heldResponse=undefined
        const outcome=await pending
        expect(outcome.status).toBe(200)
        expect(outcome.json.action.status).toBe(type==='hook'?'accepted':'draft')
        expect((await req(`${base}/${a.id}`)).status).toBe(404)
        expect((await req(`/projects/${pid}/restore`,'POST',{})).status).toBe(200)
        const restored=await req(`${base}/${a.id}`)
        expect(restored.json.action.status).toBe(type==='hook'?'accepted':'draft')
        expect(restored.json.events.some((e:any)=>e.type===(type==='hook'?'webhook_accepted':'ai_completed'))).toBe(true)
      } finally {
        heldResponse?.(); heldResponse=undefined; holdArrived=undefined; hookMode='ok'
      }
    }
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
