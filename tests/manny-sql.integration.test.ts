/* Opt-in: MariaDB บน Unix socket ภายในเครื่อง + provider จำลองเท่านั้น */
import crypto from 'node:crypto'
import http from 'node:http'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.MNG_TEST_DB_ALLOW_CREATE === '1' && !!process.env.MNG_TEST_DB_SOCKET
const suite = enabled ? describe : describe.skip

suite('Manny: แยกคีย์ต่อบัญชีและสุ่มส่วนกลางบน MariaDB แยก', () => {
  const suffix=crypto.randomBytes(6).toString('hex')
  const authName=`mng_manny_auth_${suffix}`, workName=`mng_manny_work_${suffix}`
  const env={MANNY_ENCRYPTION_KEY:'e'.repeat(64),MANNY_COMPATIBLE_HOSTS:'ai.partner.example'}
  const adminPw='test-admin-password', alicePw='test-alice-password', bobPw='test-bob-password'
  let conn:any, db:any, auth:any, server:http.Server, base='', adminToken='', aliceToken='', bobToken=''
  let authCreated=false, workCreated=false, choice=0, mode='ok', releaseHold:()=>void=()=>{}, arrived:()=>void=()=>{}
  const received:any[]=[]
  beforeAll(async () => {
    conn=await mysql.createConnection({socketPath:process.env.MNG_TEST_DB_SOCKET,user:'root'})
    await conn.query(`CREATE DATABASE \`${authName}\` CHARACTER SET utf8mb4`); authCreated=true
    await conn.query(`CREATE DATABASE \`${workName}\` CHARACTER SET utf8mb4`); workCreated=true
    await conn.query(`USE \`${authName}\``)
    await conn.query('CREATE TABLE users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,email VARCHAR(255),password VARCHAR(255),name VARCHAR(100),role VARCHAR(20),status VARCHAR(20)) ENGINE=InnoDB')
    for (const [email,pw,name,role] of [['admin@example.test',adminPw,'Admin','admin'],['alice@example.test',alicePw,'Alice','user'],['bob@example.test',bobPw,'Bob','manager']]) {
      await conn.query('INSERT INTO users(email,password,name,role,status) VALUES (?,?,?,?,?)',[email,await bcrypt.hash(pw,8),name,role,'active'])
    }
    await conn.query(`USE \`${workName}\``)
    await conn.query('CREATE TABLE projects (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, hub_id VARCHAR(200), title VARCHAR(250), description TEXT, stat VARCHAR(20), icon VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4')
    await conn.query('CREATE TABLE tasks (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id INT UNSIGNED, title VARCHAR(300), description TEXT, status VARCHAR(20), priority VARCHAR(20), due_date DATE NULL, progress INT DEFAULT 0, archived TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4')
    const common={socketPath:process.env.MNG_TEST_DB_SOCKET,user:'root',dateStrings:true,connectionLimit:4}
    const cfg=require('../server/config'); cfg.authDb={...common,database:authName}; cfg.workDb={...common,database:workName}; cfg.demoOnly=false
    for (const mod of ['../server/db','../server/hermes','../server/auth','../server/manny']) delete require.cache[require.resolve(mod)]
    db=require('../server/db'); await db.ensureSchema(); auth=require('../server/auth')
    const post=async (url:string,headers:any,body:any) => {
      received.push({url,headers,body})
      if (mode==='hold') { arrived(); await new Promise<void>(resolve=>{releaseHold=resolve}) }
      if (mode==='error') return {status:401,body:'private upstream diagnostics with secret'}
      if (url.includes('generativelanguage')) return {status:200,body:JSON.stringify({candidates:[{content:{parts:[{text:'เรียบเรียงโดย Gemini'}]}}]})}
      if (url.includes('anthropic')) return {status:200,body:JSON.stringify({content:[{type:'text',text:'เรียบเรียงโดย Claude'}]})}
      return {status:200,body:JSON.stringify({choices:[{message:{content:'เรียบเรียงโดย OpenAI'}}]})}
    }
    const {router}=require('../server/manny').createManny({authPool:db.authPool,workPool:db.workPool,env,post,randomInt:(max:number)=>choice % max})
    const app=express(); app.use(express.json()); app.use('/api/manny',auth.middleware,router)
    await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{base=`http://127.0.0.1:${(server.address() as any).port}/api/manny`;resolve()})})
    adminToken=(await auth.login('admin@example.test',adminPw)).token
    aliceToken=(await auth.login('alice@example.test',alicePw)).token
    bobToken=(await auth.login('bob@example.test',bobPw)).token
  },30000)
  afterAll(async () => {
    if(server) await new Promise<void>(resolve=>server.close(()=>resolve()))
    if(db){await db.authPool.end(); await db.workPool.end()}
    if(conn){if(workCreated) await conn.query(`DROP DATABASE \`${workName}\``);if(authCreated) await conn.query(`DROP DATABASE \`${authName}\``);await conn.end()}
  },30000)
  async function req(path:string,method='GET',body?:any,token=aliceToken,headers:any={}) {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
    return {status:r.status,json:await r.json()}
  }
  const shared = (label:string,provider:string,model:string,apiKey:string) => ({label,provider,model,apiKey,password:adminPw})

  it('requires an active web session, role, password and same-origin requests', async () => {
    expect((await req('/settings','GET',undefined,'')).status).toBe(401)
    expect((await req('/shared','POST',shared('no','openai','test','key'),aliceToken)).status).toBe(403)
    expect((await req('/personal','PUT',{provider:'openai',model:'test',apiKey:'key',password:'wrong'},aliceToken)).status).toBe(400)
    expect((await req('/personal','PUT',{provider:'compatible',model:'test',endpoint:'https://evil.test/chat',apiKey:'key',password:alicePw},aliceToken)).status).toBe(400)
    expect((await req('/settings','GET',undefined,aliceToken,{Origin:'https://evil.test','Sec-Fetch-Site':'cross-site'})).status).toBe(403)
  })

  let firstId='', secondId=''
  it('stores multiple admin keys encrypted and never returns secrets in settings', async () => {
    const a=await req('/shared','POST',shared('OpenAI pool','openai','model-a','shared-key-A'),adminToken)
    const b=await req('/shared','POST',shared('Gemini pool','gemini','model-b','shared-key-B'),adminToken)
    expect(a.status).toBe(201); expect(b.status).toBe(201); firstId=a.json.id;secondId=b.json.id
    const [rows]=await db.workPool.query('SELECT * FROM erp_manny_shared_keys ORDER BY label')
    expect(rows).toHaveLength(2)
    expect(JSON.stringify(rows)).not.toContain('shared-key-A'); expect(JSON.stringify(rows)).not.toContain('shared-key-B')
    const adminSettings=await req('/settings','GET',undefined,adminToken)
    expect(adminSettings.json.shared).toHaveLength(2); expect(adminSettings.json.sharedCount).toBe(2)
    expect(JSON.stringify(adminSettings.json)).not.toContain('shared-key-')
    const userSettings=await req('/settings')
    expect(userSettings.json.shared).toBeUndefined(); expect(userSettings.json.sharedProviders).toHaveLength(2)
    expect(JSON.stringify(userSettings.json)).not.toContain('shared-key-')
  })

  it('randomly selects a shared provider per request when no personal setting exists', async () => {
    const input={text:'ข้อความเฉพาะช่อง',instruction:'จัดเรียงให้ถูกต้อง',confirm:true}
    choice=0; const a=await req('/assist','POST',input,aliceToken)
    choice=1; const b=await req('/assist','POST',input,aliceToken)
    expect(a.status).toBe(200); expect(b.status).toBe(200)
    expect(a.json.source).toBe('shared'); expect(b.json.source).toBe('shared')
    expect(new Set([a.json.provider,b.json.provider])).toEqual(new Set(['openai','gemini']))
    const last=received.slice(-2); expect(last.some(x=>x.headers.Authorization==='Bearer shared-key-A')).toBe(true)
    expect(last.some(x=>x.headers['x-goog-api-key']==='shared-key-B')).toBe(true)
    expect(JSON.stringify(last)).toContain(input.text); expect(JSON.stringify(last)).toContain(input.instruction)
    expect(JSON.stringify([a.json,b.json])).not.toContain('shared-key-')
  })

  it('keeps Alice and Bob isolated, even if a client supplies another user id', async () => {
    const a=await req('/personal','PUT',{user_id:3,provider:'anthropic',model:'claude-test',apiKey:'alice-private-key',password:alicePw},aliceToken)
    expect(a.status).toBe(200)
    const [rows]=await db.workPool.query('SELECT user_id,secret_enc FROM erp_manny_user_settings')
    expect(rows).toHaveLength(1); expect(Number(rows[0].user_id)).toBe(2); expect(rows[0].secret_enc).not.toContain('alice-private-key')
    const as=await req('/settings','GET',undefined,aliceToken), bs=await req('/settings','GET',undefined,bobToken)
    expect(as.json.personal.provider).toBe('anthropic'); expect(bs.json.personal).toBeNull()
    expect(JSON.stringify(as.json)).not.toContain('alice-private-key')
    const input={text:'ข้อมูลของ Alice',instruction:'แก้คำผิด',confirm:true}
    choice=0;const mine=await req('/assist','POST',input,aliceToken)
    expect(mine.json).toMatchObject({provider:'anthropic',source:'personal',text:'เรียบเรียงโดย Claude'})
    expect(received.at(-1).headers['x-api-key']).toBe('alice-private-key')
    const bob=await req('/assist','POST',{...input,text:'ข้อมูลของ Bob'},bobToken)
    expect(bob.json.source).toBe('shared'); expect(received.at(-1).headers['x-api-key']).not.toBe('alice-private-key')
  })

  it('does not silently fall back on a failed personal provider or disclose provider diagnostics', async () => {
    const before=received.length; mode='error'
    const r=await req('/assist','POST',{text:'ข้อความ',instruction:'แก้',confirm:true},aliceToken)
    mode='ok';expect(r.status).toBe(502); expect(received.length).toBe(before+1)
    expect(JSON.stringify(r.json)).not.toContain('private upstream'); expect(JSON.stringify(r.json)).not.toContain('alice-private-key')
    expect((await req('/assist','POST',{text:'x',instruction:'x',confirm:false},aliceToken)).status).toBe(400)
    const [[saved]]=await db.workPool.query('SELECT secret_enc FROM erp_manny_user_settings WHERE user_id=2')
    await db.workPool.query("UPDATE erp_manny_user_settings SET secret_enc='tampered' WHERE user_id=2")
    const count=received.length
    expect((await req('/assist','POST',{text:'x',instruction:'x',confirm:true},aliceToken)).status).toBe(503)
    expect(received.length).toBe(count) // ไม่เปลี่ยนไปใช้คีย์ส่วนกลางเมื่อถอดรหัสส่วนตัวไม่ได้
    await db.workPool.query('UPDATE erp_manny_user_settings SET secret_enc=? WHERE user_id=2',[saved.secret_enc])
  })

  it('limits concurrent generation and supports per-account deletion / admin pool disable', async () => {
    const input={text:'ต้นฉบับ',instruction:'จัดใหม่',confirm:true}
    mode='hold'; const ready=new Promise<void>(resolve=>{arrived=resolve}); const first=req('/assist','POST',input,aliceToken); await ready
    const second=await req('/assist','POST',input,aliceToken);expect(second.status).toBe(429)
    mode='ok'; releaseHold(); expect((await first).status).toBe(200)
    expect((await req('/personal','DELETE',{password:alicePw},aliceToken)).status).toBe(200)
    expect((await req('/settings','GET',undefined,aliceToken)).json.personal).toBeNull()
    expect((await req('/shared/'+firstId,'PATCH',{password:'wrong',enabled:false},adminToken)).status).toBe(400)
    expect((await req('/shared/'+firstId,'PATCH',{password:adminPw,enabled:false},adminToken)).status).toBe(200)
    expect((await req('/shared/'+secondId,'DELETE',{password:adminPw},aliceToken)).status).toBe(403)
    expect((await req('/shared/'+secondId,'DELETE',{password:adminPw},adminToken)).status).toBe(200)
    expect((await req('/assist','POST',input,aliceToken)).status).toBe(503)
  })
})
