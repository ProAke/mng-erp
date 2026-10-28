import http from 'node:http'
import crypto from 'node:crypto'
import express from 'express'
import {describe,it,expect,beforeAll,afterAll,beforeEach} from 'vitest'

describe('Flow action API: permissions, audit, concurrency and safe delivery', () => {
  let server:http.Server, base=''
  let state:any, gate:Promise<void>=Promise.resolve()
  let enabled={aiReady:true,webhookReady:true,aiModel:'model-test'}
  let aiCalls:any[] = [], deliveries:any[] = [], hookMode='ok', failEvent=false
  const now='2026-10-28 12:00:00'
  const copy=(v:any)=>JSON.parse(JSON.stringify(v))
  const manager={user_id:1,name:'ผู้จัดการ',role:'manager'}
  const member={user_id:2,name:'สมาชิก',role:'user'}
  const plan=require('../assets/js/project-plan')

  async function query(db:any, sql:string, p:any[]=[]) {
    const s=sql.replace(/\s+/g,' ').trim()
    if (/^SELECT id, title FROM projects WHERE/i.test(s)) return [db.projects.filter((x:any)=>x.id===Number(p[0]) && (!s.includes('COALESCE') || !x.erp_archived))]
    if (/^SELECT \* FROM erp_project_flows WHERE/i.test(s)) return [db.flows.filter((x:any)=>x.project_id===Number(p[0]))]
    if (/^SELECT id, paused FROM erp_ai_agents/i.test(s)) return [db.agents]
    if (/^SELECT \* FROM erp_flow_actions WHERE event_id/i.test(s)) return [db.actions.filter((x:any)=>x.event_id===p[0])]
    if (/^SELECT \*, .* FROM erp_flow_actions WHERE id=/i.test(s)) return [db.actions.filter((x:any)=>x.id===Number(p[0]) && x.project_id===Number(p[1])).map((x:any)=>({...x,is_stale:x.is_stale||0}))]
    if (/^SELECT \*, .* FROM erp_flow_actions WHERE project_id=/i.test(s)) return [db.actions.filter((x:any)=>x.project_id===Number(p[0])).slice().reverse().map((x:any)=>({...x,is_stale:x.is_stale||0}))]
    if (/^SELECT event_type,actor_name,note,created_at FROM erp_flow_action_events/i.test(s)) return [db.events.filter((x:any)=>x.action_id===Number(p[0])).slice().reverse()]
    if (/^INSERT INTO erp_flow_actions/i.test(s)) {
      const id=db.nextAction++
      db.actions.push({id,event_id:p[0],project_id:p[1],node_id:p[2],node_title:p[3],kind:p[4],title:p[5],destination:p[6],content:p[7],
        created_by:p[8],created_name:p[9],status:'draft',revision:1,attempts:0,delivery_payload:null,
        approved_by:null,approved_name:null,approved_at:null,accepted_at:null,last_error:'',created_at:now,updated_at:now,is_stale:0})
      return [{insertId:id}]
    }
    if (/^INSERT INTO erp_flow_action_events/i.test(s)) {
      if (failEvent) { failEvent=false; throw new Error('simulated audit failure') }
      db.events.push({id:db.nextEvent++,action_id:p[0],event_type:p[1],actor_id:p[2],actor_name:p[3],note:p[4],created_at:now})
      return [{insertId:db.nextEvent-1}]
    }
    if (/^UPDATE erp_flow_actions SET/i.test(s)) {
      const row=db.actions.find((x:any)=>x.id===Number(p[p.length-1]))
      if (!row) return [{affectedRows:0}]
      if (s.includes('SET kind=?')) Object.assign(row,{kind:p[0],title:p[1],destination:p[2],content:p[3],last_error:''})
      else if (s.includes("status='approved'")) Object.assign(row,{status:'approved',approved_by:p[0],approved_name:p[1],approved_at:now,last_error:''})
      else if (s.includes("status='draft',approved_by=NULL")) Object.assign(row,{status:'draft',approved_by:null,approved_name:null,approved_at:null,last_error:''})
      else if (s.includes("status='canceled'")) row.status='canceled'
      else if (s.includes("status='generating'")) Object.assign(row,{status:'generating',last_error:''})
      else if (s.includes("status='draft',content=?")) Object.assign(row,{status:'draft',content:p[0],last_error:''})
      else if (s.includes("status='draft',revision=revision+1,last_error=?")) Object.assign(row,{status:'draft',last_error:p[0]})
      else if (s.includes("status='draft',revision=revision+1,last_error='AI_INTERRUPTED'")) Object.assign(row,{status:'draft',last_error:'AI_INTERRUPTED'})
      else if (s.includes("status='sending'")) Object.assign(row,{status:'sending',attempts:row.attempts+1,delivery_payload:p[0],last_error:''})
      else if (s.includes("status='accepted'")) Object.assign(row,{status:'accepted',accepted_at:now,last_error:''})
      else if (s.includes("status='unknown'")) Object.assign(row,{status:'unknown',last_error:p[0]})
      else throw new Error('unhandled fake SQL: '+s)
      row.revision++; row.updated_at=now; row.is_stale=0
      return [{affectedRows:1}]
    }
    throw new Error('unhandled fake SQL: '+s)
  }
  const workPool={
    query:(sql:string,p:any[]=[])=>query(state,sql,p),
    async getConnection() {
      let transaction:any, unlock:(()=>void)|undefined
      return {
        async beginTransaction() { const previous=gate; gate=new Promise<void>(resolve=>{unlock=resolve}); await previous; transaction=copy(state) },
        query:(sql:string,p:any[]=[])=>query(transaction,sql,p),
        async commit(){state=transaction; unlock?.(); unlock=undefined},
        async rollback(){unlock?.(); unlock=undefined},
        release(){},
      }
    },
  }
  beforeAll(async()=>{
    const dbPath=require.resolve('../server/db'), integPath=require.resolve('../server/flow-integrations')
    const realDb=require(dbPath), realIntegrations=require(integPath)
    require.cache[dbPath]!.exports={...realDb,workPool}
    require.cache[integPath]!.exports={...realIntegrations,
      status:()=>enabled,
      generateDraft:async (input:any)=>{aiCalls.push(copy(input)); return {content:'ร่าง AI ที่ต้องตรวจ',model:'model-test'}},
      dispatch:async (payload:any)=>{deliveries.push(copy(payload)); await new Promise(resolve=>setTimeout(resolve,25)); return hookMode==='ok'?{accepted:true,diagnostic:''}:{accepted:false,diagnostic:'TIMEOUT'}},
    }
    delete require.cache[require.resolve('../server/flow-action-routes')]
    const router=require('../server/flow-action-routes')
    const app=express(); app.use(express.json())
    app.use('/api',(req:any,res,next)=>{
      const token=req.headers.authorization
      if (!token) return res.status(401).json({error:'unauthorized'})
      req.user=token==='Bearer manager'?manager:member
      next()
    },router)
    await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{base=`http://127.0.0.1:${(server.address() as any).port}/api`;resolve()})})
  })
  afterAll(async()=>{if(server) await new Promise<void>(resolve=>server.close(()=>resolve()))})
  beforeEach(()=>{
    const built=plan.build({name:'โปรเจกต์',desc:'เป้าหมาย'}, {objective:'เพิ่มยอด',audience:'กลุ่มลูกค้า',deliverables:'สื่อ',constraints:'ตรวจสิทธิ์',members:[]})
    state={projects:[{id:1,title:'โปรเจกต์',erp_archived:0}],flows:[{project_id:1,brief:JSON.stringify(built.brief),nodes:JSON.stringify(built.nodes),revision:1}],
      agents:[{id:1,paused:0}],actions:[],events:[],nextAction:1,nextEvent:1}
    gate=Promise.resolve(); enabled={aiReady:true,webhookReady:true,aiModel:'model-test'}; aiCalls=[]; deliveries=[]; hookMode='ok'; failEvent=false
  })
  async function req(path:string, method='GET', body?:any, token='manager') {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)})
    return {status:r.status,json:await r.json()}
  }
  const path='/projects/p1/flow/actions'
  const draft=(id=crypto.randomUUID())=>({eventId:id,nodeId:'support',kind:'support',title:'ตอบลูกค้า',destination:'LINE',content:'เนื้อหาร่าง'})

  it('enforces authentication, manager role, saved nodes and idempotent draft creation',async()=>{
    expect((await req(path,'GET',undefined,'')).status).toBe(401)
    expect((await req(path,'GET',undefined,'member')).status).toBe(403)
    expect((await req(path,'POST',draft(),'member')).status).toBe(403)
    expect((await req(path,'POST',{...draft(),nodeId:'missing'})).status).toBe(409)
    expect((await req(path,'POST',{...draft(),eventId:'not-a-uuid'})).status).toBe(400)
    const body=draft(), first=await req(path,'POST',body), retry=await req(path,'POST',body)
    expect(first.status).toBe(201); expect(retry.status).toBe(200)
    expect(retry.json.action.id).toBe(first.json.action.id)
    expect((await req(path,'POST',{...body,title:'ข้อมูลอื่น'})).status).toBe(409)
    expect(state.actions).toHaveLength(1); expect(state.events.map((x:any)=>x.event_type)).toEqual(['created'])
  })

  it('rolls back action creation if the transactional audit event fails',async()=>{
    failEvent=true
    expect((await req(path,'POST',draft())).status).toBe(500)
    expect(state.actions).toHaveLength(0); expect(state.events).toHaveLength(0)
  })

  it('requires explicit AI consent and stores a draft, not an approval or dispatch',async()=>{
    let a=(await req(path,'POST',draft())).json.action
    expect((await req(`${path}/${a.id}/generate`,'POST',{revision:a.revision,instruction:'ช่วยร่าง'})).status).toBe(400)
    enabled.aiReady=false
    expect((await req(`${path}/${a.id}/generate`,'POST',{revision:a.revision,confirm:true,instruction:'ช่วยร่าง'})).status).toBe(503)
    expect(state.actions[0].revision).toBe(1); expect(aiCalls).toHaveLength(0)
    enabled.aiReady=true
    const generated=await req(`${path}/${a.id}/generate`,'POST',{revision:a.revision,confirm:true,instruction:'ช่วยร่างอย่างสุภาพ',url:'https://attacker.invalid',model:'expensive'})
    expect(generated.status).toBe(200); a=generated.json.action
    expect(a.status).toBe('draft'); expect(a.content).toBe('ร่าง AI ที่ต้องตรวจ')
    expect(aiCalls).toHaveLength(1); expect(aiCalls[0].brief.objective).toBe('เพิ่มยอด')
    expect(aiCalls[0].url).toBeUndefined(); expect(aiCalls[0].model).toBeUndefined()
    expect(deliveries).toHaveLength(0)
    expect(state.events.map((x:any)=>x.event_type)).toEqual(['created','ai_started','ai_completed'])
  })

  it('honors the AI Hub kill-switch and rejects a paused or missing selected agent',async()=>{
    const a=(await req(path,'POST',draft())).json.action
    state.agents[0].paused=1
    expect((await req(`${path}/${a.id}/generate`,'POST',{revision:a.revision,confirm:true,instruction:'ร่าง'})).status).toBe(409)
    expect(aiCalls).toHaveLength(0)
    state.agents.push({id:2,paused:0})
    const brief=JSON.parse(state.flows[0].brief); brief.aiAgentId='ai1'; state.flows[0].brief=JSON.stringify(brief)
    expect((await req(`${path}/${a.id}/generate`,'POST',{revision:a.revision,confirm:true,instruction:'ร่าง'})).status).toBe(409)
    state.agents[0].paused=0
    expect((await req(`${path}/${a.id}/generate`,'POST',{revision:a.revision,confirm:true,instruction:'ร่าง'})).status).toBe(200)
    expect(aiCalls).toHaveLength(1)
  })

  it('protects revisions and sends once when two approved requests race',async()=>{
    let a=(await req(path,'POST',draft())).json.action
    expect((await req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true})).status).toBe(409)
    expect((await req(`${path}/${a.id}/approve`,'POST',{revision:a.revision})).status).toBe(400)
    a=(await req(`${path}/${a.id}/approve`,'POST',{revision:a.revision,confirm:true})).json.action
    expect((await req(`${path}/${a.id}`,'PATCH',{revision:a.revision,title:'แก้ไข'})).status).toBe(409)
    const results=await Promise.all([req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true}),req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true})])
    expect(results.map(r=>r.status).sort()).toEqual([200,409])
    expect(deliveries).toHaveLength(1)
    expect(results.find(r=>r.status===200)!.json.action.status).toBe('accepted')
    expect(state.events.map((x:any)=>x.event_type)).toEqual(['created','approved','send_started','webhook_accepted'])
  })

  it('blocks retry on uncertainty until reconciliation, freezes the original payload, and records evidence',async()=>{
    let a=(await req(path,'POST',draft())).json.action
    a=(await req(`${path}/${a.id}/approve`,'POST',{revision:a.revision,confirm:true})).json.action
    hookMode='unknown'; a=(await req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true})).json.action
    expect(a.status).toBe('unknown'); expect(a.lastError).toBe('TIMEOUT')
    expect((await req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true})).status).toBe(409)
    expect((await req(`${path}/${a.id}/reconcile`,'POST',{revision:a.revision,confirm:true,resolution:'not_accepted',note:'สั้น'})).status).toBe(400)
    a=(await req(`${path}/${a.id}/reconcile`,'POST',{revision:a.revision,confirm:true,resolution:'not_accepted',note:'ตรวจบันทึกปลายทางแล้วไม่พบ event'})).json.action
    expect(a.status).toBe('draft'); expect(a.attempts).toBe(1)
    expect((await req(`${path}/${a.id}`,'PATCH',{revision:a.revision,content:'เปลี่ยน'})).status).toBe(409)
    a=(await req(`${path}/${a.id}/approve`,'POST',{revision:a.revision,confirm:true})).json.action
    hookMode='ok'; a=(await req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true})).json.action
    expect(a.status).toBe('accepted'); expect(deliveries).toHaveLength(2)
    expect(deliveries[1]).toEqual(deliveries[0])
    expect(state.events.some((x:any)=>x.event_type==='confirmed_not_accepted' && x.note.includes('ตรวจบันทึก'))).toBe(true)
  })

  it('does not send when webhook configuration is missing and permits canceling a draft',async()=>{
    let a=(await req(path,'POST',draft())).json.action
    a=(await req(`${path}/${a.id}/approve`,'POST',{revision:a.revision,confirm:true})).json.action
    enabled.webhookReady=false
    expect((await req(`${path}/${a.id}/send`,'POST',{revision:a.revision,confirm:true})).status).toBe(503)
    expect(deliveries).toHaveLength(0); expect(state.actions[0].status).toBe('approved')
    a=(await req(`${path}/${a.id}/cancel`,'POST',{revision:a.revision,confirm:true})).json.action
    expect(a.status).toBe('canceled')
  })
})
