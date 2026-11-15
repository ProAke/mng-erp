import http from 'node:http'
import express from 'express'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('3D Office API — auth, department and truthful snapshot', () => {
  let server: http.Server, base = ''
  const executed: {sql:string,params:any[]}[] = []
  let failTeam = false, nextId = 2
  const state: any = {
    team:[{id:1,name:'สมาชิกเดิม',nickname:'เดิม',role:'Designer',department:null,color:'#6C5CE7',email:null,phone:null,presence:'working',skills:'[]'}],
    checks:[{id:4,member_id:'u1',date:'',clock_in:'09:00',clock_out:null,mode:'office',note:'ข้อมูลส่วนตัว'}],
    events:[{id:7,title:'ประชุม',cat:'meeting',date:'',start:'09:00',end:'10:00',allday:0,loc:'https://meet.google.com/abc',members:'[1,"u2",2,"u3","evil"]',descp:'ข้อมูลส่วนตัว'}],
  }
  const dbPath = require.resolve('../server/db')
  const oldDb = require.cache[dbPath]
  const modules = ['../server/hermes','../server/auth','../server/office-routes','../server/routes','../server/workspace-routes','../server/project-workspace-routes','../server/flow-action-routes']
  const caches = modules.map(p => [require.resolve(p),require.cache[require.resolve(p)]] as const)

  beforeAll(async () => {
    const workPool = { async query(sql:string, params:any[] = []) {
      const s=sql.replace(/\s+/g,' ').trim(); executed.push({sql:s,params})
      if (/SELECT user_id, name, email, role FROM erp_sessions/i.test(s)) {
        if (params[0] === 'manager') return [[{user_id:1,name:'Manager',email:'manager@test.invalid',role:'manager'}]]
        if (params[0] === 'member') return [[{user_id:2,name:'Member',email:'member@test.invalid',role:'user'}]]
        return [[]]
      }
      if (/SELECT id, name, nickname, role, department, color FROM erp_team/i.test(s)) {
        if (failTeam) throw new Error('unknown column department')
        return [state.team]
      }
      if (/SELECT id, member_id, date, clock_in, clock_out, mode FROM erp_checkins/i.test(s)) return [state.checks.map((c:any)=>({...c,date:params[0]}))]
      if (/SELECT id, title, cat, date, start, end, allday, loc, members FROM erp_events/i.test(s)) return [state.events.map((e:any)=>({...e,date:params[0]}))]
      if (/SELECT \* FROM erp_team ORDER BY id/i.test(s)) return [state.team]
      if (/SELECT id, name FROM erp_team WHERE id/i.test(s)) return [state.team.filter((m:any)=>m.id===Number(params[0]))]
      if (/INSERT INTO erp_team/i.test(s)) {
        const [name,nickname,presence,skills,role,department,color,email,phone,auth_user_id]=params
        state.team.push({id:nextId,name,nickname,presence,skills,role,department,color,email,phone,auth_user_id})
        return [{insertId:nextId++}]
      }
      if (/UPDATE erp_team SET/i.test(s)) {
        const member=state.team.find((m:any)=>m.id===Number(params.at(-1)))
        const sets=s.match(/SET (.+) WHERE/i)?.[1].split(', ') || []
        sets.forEach((v:string,i:number)=>{ const col=v.split('=')[0].trim(); member[col]=params[i] })
        return [{affectedRows:1}]
      }
      if (/INSERT INTO erp_activity/i.test(s)) return [{insertId:1}]
      throw new Error('unexpected SQL: '+s)
    }}
    const authPool = { async query(sql:string,params:any[]=[]) {
      if (/SELECT status, role, name, email FROM users/i.test(sql)) return [[{status:'active',role:params[0]===1?'manager':'user',name:params[0]===1?'Manager':'Member',email:params[0]===1?'manager@example.test':'member@example.test'}]]
      if (/SELECT id FROM users WHERE email/i.test(sql)) return [[]]
      return [[]]
    }}
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{workPool,authPool}} as any
    for(const [p] of caches) delete require.cache[p]
    const auth=require('../server/auth')
    const router=require('../server/routes')
    const app=express(); app.use(express.json()); app.use('/api',auth.middleware,router)
    await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{base=`http://127.0.0.1:${(server.address() as any).port}/api`;resolve()})})
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve=>server.close(()=>resolve()))
    for(const [p,old] of caches) { if(old) require.cache[p]=old; else delete require.cache[p] }
    if(oldDb) require.cache[dbPath]=oldDb; else delete require.cache[dbPath]
  })
  async function req(path:string,method='GET',body?:any,token?:string) {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)})
    return {status:r.status,json:await r.json()}
  }

  it('requires login, queries all check-ins for the server Bangkok day and removes private notes', async () => {
    expect((await req('/office/snapshot')).status).toBe(401)
    const out=await req('/office/snapshot','GET',undefined,'member')
    expect(out.status).toBe(200)
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(out.json.generatedAt))
    expect(out.json.date).toBe(today)
    expect(out.json.timezone).toBe('Asia/Bangkok')
    expect(out.json.team[0]).toMatchObject({id:'u1',department:''})
    expect(out.json.checkins[0]).toMatchObject({id:'ck4',memberId:'u1',mode:'office'})
    expect(out.json.checkins[0].note).toBeUndefined()
    expect(out.json.events[0].desc).toBeUndefined()
    expect(out.json.events[0].members).toEqual(['u1','u2','u3'])
    const checkQuery=executed.find(x=>/FROM erp_checkins/i.test(x.sql))!
    expect(checkQuery.params).toEqual([today])
    expect(checkQuery.sql).not.toMatch(/LIMIT/i)
    expect(checkQuery.sql).toMatch(/ORDER BY id DESC/i)
    expect(executed.find(x=>/FROM erp_events WHERE/i.test(x.sql))!.params).toEqual([today])
  })

  it('handles DB/migration failure with 503, not zero people or demo fallback', async () => {
    failTeam=true
    const out=await req('/office/snapshot','GET',undefined,'manager')
    expect(out.status).toBe(503)
    expect(out.json.error).toBe('office_snapshot_unavailable')
    expect(out.json.team).toBeUndefined()
    failTeam=false
  })

  it('persists user-defined departments only for managers, validates and supports clearing', async () => {
    expect((await req('/teams','POST',{name:'No',department:'Ops'},'member')).status).toBe(403)
    expect((await req('/teams','POST',{name:'Bad',department:['Ops']},'manager')).status).toBe(400)
    expect((await req('/teams','POST',{name:'Bad',department:'a'.repeat(81)},'manager')).status).toBe(400)
    const added=await req('/teams','POST',{name:'คนใหม่',role:'Developer',department:'  Customer   Success  '},'manager')
    expect(added.status).toBe(201)
    expect((await req('/teams','GET',undefined,'member')).json.members.find((m:any)=>m.id===added.json.id).department).toBe('Customer Success')
    expect((await req(`/teams/${added.json.id}`,'PATCH',{department:'Creative'},'member')).status).toBe(403)
    expect((await req(`/teams/${added.json.id}`,'PATCH',{department:{bad:true}},'manager')).status).toBe(400)
    expect((await req(`/teams/${added.json.id}`,'PATCH',{department:'Creative'},'manager')).status).toBe(200)
    expect(state.team[1].department).toBe('Creative')
    expect(state.team[1].role).toBe('Developer')
    expect((await req(`/teams/${added.json.id}`,'PATCH',{department:null},'manager')).status).toBe(200)
    expect(state.team[1].department).toBeNull()
  })
})
