/* Opt-in: two disposable local MariaDB databases; OAuth providers are simulated, never real accounts. */
import crypto from 'node:crypto'
import http from 'node:http'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import express from 'express'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const enabled = process.env.MNG_TEST_DB_ALLOW_CREATE === '1' && !!process.env.MNG_TEST_DB_SOCKET
const suite = enabled ? describe : describe.skip
const origin = 'https://erp.example.test'
const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAABv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAECP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AC6sx3//2Q=='

suite('Profile and OAuth against disposable MariaDB + simulated providers', () => {
  const suffix = crypto.randomBytes(6).toString('hex')
  const authName = `mng_profile_auth_${suffix}`, workName = `mng_profile_work_${suffix}`
  const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength:2048})
  const key: any = publicKey.export({format:'jwk'}); key.kid='test-key'; key.use='sig'; key.alg='RS256'
  let admin: any, db: any, auth: any, server: http.Server, base = '', adminToken = '', managerToken = '', userToken = '', otherToken = ''
  let authCreated = false, workCreated = false
  let codeCounter = 0
  const codes = new Map<string,any>(), exchanged: any[] = []
  const config = {OAUTH_PUBLIC_URL:origin, GOOGLE_OAUTH_CLIENT_ID:'test-google-id', GOOGLE_OAUTH_CLIENT_SECRET:'test-google-secret', LINE_OAUTH_CLIENT_ID:'test-line-id', LINE_OAUTH_CLIENT_SECRET:'test-line-secret'}

  function signed(claims:any, badSignature=false) {
    const header = Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key',typ:'JWT'})).toString('base64url')
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    const signature = crypto.sign('RSA-SHA256', Buffer.from(header+'.'+payload), privateKey)
    if (badSignature) signature[0] ^= 0xff
    return `${header}.${payload}.${signature.toString('base64url')}`
  }
  async function transport(url:string, options:any) {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return {keys:[key]}
    if (url === 'https://oauth2.googleapis.com/token' || url === 'https://api.line.me/oauth2/v2.1/token') {
      const t = codes.get(options.form.code)
      if (!t) throw new Error('provider rejected code')
      exchanged.push({url, form:{...options.form}})
      if (t.onExchange) t.onExchange()
      if (t.waitForExchange) await t.waitForExchange
      expect(crypto.createHash('sha256').update(options.form.code_verifier).digest('base64url')).toBe(t.challenge)
      expect(options.form.redirect_uri).toBe(`${origin}/api/oauth/${t.provider}/callback`)
      const claims = {iss:t.provider==='google'?'https://accounts.google.com':'https://access.line.me', aud:t.provider==='google'?'test-google-id':'test-line-id',
        sub:t.sub, nonce:t.nonce, iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000)+600,
        ...(t.provider==='google'?{email:t.email || 'same@example.test',email_verified:true}:{}), ...t.overrides}
      if (t.provider === 'google') return {id_token:signed(claims,t.badSignature),access_token:'do-not-save',refresh_token:'do-not-save'}
      t.claims = claims
      return {id_token:'line-id-token-'+options.form.code,access_token:'do-not-save',refresh_token:'do-not-save'}
    }
    if (url === 'https://api.line.me/oauth2/v2.1/verify') {
      const t = codes.get(options.form.id_token.replace('line-id-token-',''))
      expect(options.form.client_id).toBe('test-line-id')
      expect(options.form.nonce).toBe(t.nonce)
      return t.claims
    }
    throw new Error('unexpected provider request')
  }
  beforeAll(async () => {
    const common:any = {socketPath:process.env.MNG_TEST_DB_SOCKET,user:process.env.MNG_TEST_DB_USER||'root',password:process.env.MNG_TEST_DB_PASSWORD||'',charset:'utf8mb4',dateStrings:true}
    admin = await mysql.createConnection(common)
    await admin.query(`CREATE DATABASE \`${authName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); authCreated = true
    await admin.query(`CREATE DATABASE \`${workName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); workCreated = true
    await admin.query(`USE \`${authName}\``)
    await admin.query(`CREATE TABLE users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, name VARCHAR(100) NOT NULL, phone VARCHAR(30), role VARCHAR(20), status VARCHAR(20), last_login_at TIMESTAMP NULL, email_verified_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    const pw = await bcrypt.hash('test-password', 8)
    for (const [email,name,role] of [['admin@example.test','แอดมิน','admin'],['manager@example.test','ผู้จัดการ','manager'],['user@example.test','สมาชิก','user'],['other@example.test','สมาชิกอีกคน','user']])
      await admin.query('INSERT INTO users (email,password,name,role,status) VALUES (?,?,?,?,?)',[email,pw,name,role,'active'])
    await admin.query(`USE \`${workName}\``)
    await admin.query('CREATE TABLE projects (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB')
    await admin.query('CREATE TABLE tasks (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB')
    const cfg = require('../server/config')
    cfg.authDb = {...common,database:authName,connectionLimit:4}; cfg.workDb = {...common,database:workName,connectionLimit:6}; cfg.demoOnly=false
    for (const p of ['../server/db','../server/hermes','../server/auth','../server/profile','../server/users','../server/oauth','../server/workspace-routes']) delete require.cache[require.resolve(p)]
    db = require('../server/db'); await db.ensureSchema()
    await db.workPool.query('INSERT INTO erp_team (name,role,email,auth_user_id) VALUES (?,?,?,?),(?,?,?,?)', ['ผู้จัดการ','PM','manager@example.test',2,'สมาชิก','Dev','user@example.test',null])
    auth = require('../server/auth')
    const oauth = require('../server/oauth').createOAuth({authPool:db.authPool,workPool:db.workPool,createSession:auth.createSession,env:config,transport})
    const app=express(); app.use(express.json({limit:'1mb'}))
    app.use('/api/oauth',oauth.publicRouter)
    app.use('/api/users/me/connections',auth.middleware,oauth.connectionRouter)
    const disabled=require('../server/oauth').createOAuth({authPool:db.authPool,workPool:db.workPool,env:{}})
    app.use('/api/test-disabled-connections',auth.middleware,disabled.connectionRouter)
    app.use('/api/users',auth.middleware,require('../server/users'))
    app.use('/api',auth.middleware,require('../server/workspace-routes'))
    await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{base=`http://127.0.0.1:${(server.address() as any).port}/api`;resolve()})})
    adminToken=(await auth.login('admin@example.test','test-password')).token
    managerToken=(await auth.login('manager@example.test','test-password')).token
    userToken=(await auth.login('user@example.test','test-password')).token
    otherToken=(await auth.login('other@example.test','test-password')).token
  }, 30000)
  afterAll(async () => {
    if(server) await new Promise<void>(resolve=>server.close(()=>resolve()))
    if(db) {await db.authPool.end(); await db.workPool.end()}
    if(admin) {
      if(workCreated) await admin.query(`DROP DATABASE \`${workName}\``)
      if(authCreated) await admin.query(`DROP DATABASE \`${authName}\``)
      await admin.end()
    }
  }, 30000)
  async function call(path:string,method='GET',body?:any,token?:string,headers:Record<string,string>={}) {
    const res=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)})
    return {res,status:res.status,json:res.headers.get('content-type')?.includes('json')?await res.json():null}
  }
  function cookie(res:Response, name:string) {
    const all=(res.headers as any).getSetCookie() as string[]
    return all.find(x=>x.startsWith(name+'='))?.split(';')[0] || ''
  }
  async function begin(provider:'google'|'line',purpose:'login'|'link',token?:string,extra:any={}) {
    const path=purpose==='link'?`/users/me/connections/${provider}/start`:`/oauth/${provider}/start`
    const out=await call(path,'POST',purpose==='link'?{password:'test-password'}:{},token)
    expect(out.status).toBe(200)
    const url=new URL(out.json.url), state=url.searchParams.get('state')!, nonce=url.searchParams.get('nonce')!
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const code=`code${++codeCounter}`
    codes.set(code,{provider,nonce,sub:extra.sub || 'subject-1',challenge:url.searchParams.get('code_challenge'),...extra})
    return {state,code,cookie:cookie(out.res,'__Host-mng_oauth_state'),url}
  }
  async function callback(provider:'google'|'line',flow:any,cookieOverride?:string) {
    return call(`/oauth/${provider}/callback?state=${flow.state}&code=${flow.code}`,'GET',undefined,undefined,{Cookie:cookieOverride===undefined?flow.cookie:cookieOverride})
  }

  it('isolates private profiles, rejects privilege injection, and persists validated details and photo', async () => {
    expect((await call('/users/me/profile')).status).toBe(401)
    expect((await call('/users','GET',undefined,userToken)).status).toBe(403)
    expect((await call('/users','GET',undefined,managerToken)).status).toBe(403)
    expect((await call('/users','GET',undefined,adminToken)).status).toBe(200)
    expect((await call('/users/2','PATCH',{role:'admin'},userToken)).status).toBe(403)
    expect((await call('/users/me','PATCH',{name:'X',email:'user@example.test',role:'admin'},userToken)).status).toBe(400)
    expect((await call('/users/me/profile','PUT',{firstName:'ก'.repeat(81),lastName:'ดี',biography:'',skills:[]},userToken)).status).toBe(400)
    const body={firstName:'มาลี',lastName:'ใจดี',biography:'ประสบการณ์\nออกแบบผลิตภัณฑ์',skills:['UX','Node.js','ux','Thai']}
    const saved=await call('/users/me/profile','PUT',body,userToken)
    expect(saved.status).toBe(200); expect(saved.json.skills).toEqual(['UX','Node.js','Thai'])
    expect((await call('/users/me/profile','GET',undefined,otherToken)).json.firstName).toBe('')
    expect((await call('/users/me/profile/avatar','PUT',{image:'data:image/svg+xml;base64,PHN2Zz4='},userToken)).status).toBe(400)
    expect((await call('/users/me/profile/avatar','PUT',{image:'data:image/jpeg;base64,ZmFrZQ=='},userToken)).status).toBe(400)
    expect((await call('/users/me/profile/avatar','PUT',{image:avatar},userToken)).status).toBe(200)
    const got=await call('/users/me/profile','GET',undefined,userToken)
    expect(got.json).toMatchObject({firstName:'มาลี',lastName:'ใจดี',biography:body.biography,skills:['UX','Node.js','Thai'],avatar})
    const [[row]]:any=await db.workPool.query('SELECT first_name,last_name,biography,skills,avatar_mime,avatar_data FROM erp_user_profiles WHERE user_id=3')
    expect(row.first_name).toBe('มาลี'); expect(Buffer.isBuffer(row.avatar_data)).toBe(true)
    expect((await call('/users/me/profile/avatar','PUT',{image:null},userToken)).status).toBe(200)
    expect((await call('/users/me/profile','GET',undefined,userToken)).json.avatar).toBeNull()
    expect((await call('/users/me/profile','GET',undefined,otherToken)).json.biography).toBe('')
  })

  it('requires password for shared Hub email, clears verification and preserves the existing team identity', async () => {
    await db.authPool.query('UPDATE users SET email_verified_at=NOW() WHERE id IN (2,3)')
    expect((await call('/users/me','PATCH',{name:'สมาชิก',email:'user@example.test'},userToken)).status).toBe(200)
    let [[verification]]:any=await db.authPool.query('SELECT email_verified_at FROM users WHERE id=3')
    expect(verification.email_verified_at).not.toBeNull() // แก้ชื่ออย่างเดียวไม่ล้างสถานะ
    const change={name:'ชื่อแสดงใหม่',email:'new-user@example.test',currentPassword:'wrong'}
    expect((await call('/users/me','PATCH',change,userToken)).status).toBe(400)
    expect((await call('/users/me','PATCH',{...change,email:'manager@example.test',currentPassword:'test-password'},userToken)).status).toBe(409)
    expect((await call('/users/me','PATCH',{...change,currentPassword:'test-password'},userToken)).status).toBe(200)
    ;[[verification]]=await db.authPool.query('SELECT email_verified_at FROM users WHERE id=3')
    expect(verification.email_verified_at).toBeNull()
    expect((await call('/users/me','GET',undefined,userToken)).json).toMatchObject({name:'ชื่อแสดงใหม่',email:'new-user@example.test',role:'user'})
    const [[team]]:any=await db.workPool.query('SELECT id,auth_user_id,email FROM erp_team WHERE name=?',['สมาชิก'])
    expect(team).toMatchObject({id:2,auth_user_id:3,email:'new-user@example.test'})
    // แม้อีเมลในฐานทีมยังเป็นค่าเดิม เจ้าของการลงเวลาต้องไม่เปลี่ยน
    await db.workPool.query('UPDATE erp_team SET email=? WHERE id=2',['user@example.test'])
    try {
      const checkin=await call('/checkins/clock','POST',{mode:'wfh'},userToken)
      expect(checkin.status).toBe(200)
      const [[record]]:any=await db.workPool.query('SELECT member_id FROM erp_checkins ORDER BY id DESC LIMIT 1')
      expect(record.member_id).toBe('u2')
    } finally { await db.workPool.query('UPDATE erp_team SET email=? WHERE id=2',['new-user@example.test']) }
    await expect(auth.login('user@example.test','test-password')).rejects.toThrow()
    expect((await auth.login('new-user@example.test','test-password')).user.authId).toBe(3)
    const [[remaining]]:any=await db.workPool.query('SELECT TIMESTAMPDIFF(SECOND,NOW(),expires_at) AS seconds FROM erp_sessions WHERE token=?',[userToken])
    expect(remaining.seconds).toBeGreaterThan(6*86400) // UPDATE ต้องไม่เลื่อน expiry กลับเป็น NOW() บน MariaDB รุ่นเก่า
    const changedByAdmin=await call('/users/2','PATCH',{email:'new-manager@example.test'},adminToken)
    expect(changedByAdmin.status).toBe(200); expect(changedByAdmin.json.teamSync).toBe(true)
    expect((await call('/users/me','GET',undefined,managerToken)).json.email).toBe('new-manager@example.test')
    const [[manager]]:any=await db.workPool.query('SELECT auth_user_id,email FROM erp_team WHERE id=1')
    expect(manager).toMatchObject({auth_user_id:2,email:'new-manager@example.test'})
    ;[[verification]]=await db.authPool.query('SELECT email_verified_at FROM users WHERE id=2')
    expect(verification.email_verified_at).toBeNull()
  })

  it('does not claim a team member when the new email conflicts with another team record', async () => {
    await db.workPool.query('INSERT INTO erp_team (name,role,email) VALUES (?,?,?),(?,?,?)',
      ['สมาชิกเดิม','Dev','other@example.test','สมาชิกซ้ำ','Dev','occupied@example.test'])
    const response=await call('/users/me','PATCH',{name:'สมาชิกอีกคน',email:'occupied@example.test',currentPassword:'test-password'},otherToken)
    expect(response.status).toBe(409)
    const [[team]]:any=await db.workPool.query('SELECT auth_user_id,email FROM erp_team WHERE email=?',['other@example.test'])
    expect(team).toMatchObject({auth_user_id:null,email:'other@example.test'})
    expect((await call('/users/me','GET',undefined,otherToken)).json.email).toBe('other@example.test')
  })

  it('rejects a stale email edit rather than overwriting a concurrent Hub change', async () => {
    const {createProfileRouter}=require('../server/profile')
    let injected=false, raceServer:http.Server|undefined
    // จำลอง Hub เปลี่ยนอีเมลหลัง preflight แต่ก่อน UPDATE โดยยังใช้ MariaDB จริง
    const racingAuth={query:async (sql:string,params:any[])=>{
      if (!injected && sql.startsWith('UPDATE users SET name=')) {
        injected=true
        await db.authPool.query('UPDATE users SET email=? WHERE id=4',['changed-in-hub@example.test'])
      }
      return db.authPool.query(sql,params)
    }}
    const app=express(); app.use(express.json())
    app.use((req:any,_res,next)=>{req.user={user_id:4,role:'user'};req.token=otherToken;next()})
    app.use('/api/users/me',createProfileRouter({authPool:racingAuth,workPool:db.workPool}))
    try {
      await new Promise<void>(resolve=>{raceServer=app.listen(0,'127.0.0.1',resolve)})
      const url=`http://127.0.0.1:${(raceServer!.address() as any).port}/api/users/me`
      const response=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'สมาชิกอีกคน',email:'proposed@example.test',currentPassword:'test-password'})})
      expect(injected).toBe(true); expect(response.status).toBe(409)
      const [[user]]:any=await db.authPool.query('SELECT email FROM users WHERE id=4')
      expect(user.email).toBe('changed-in-hub@example.test')
    } finally {
      if(raceServer) await new Promise<void>(resolve=>raceServer!.close(()=>resolve()))
      await db.authPool.query('UPDATE users SET email=? WHERE id=4',['other@example.test'])
      await db.workPool.query('UPDATE erp_team SET auth_user_id=NULL WHERE email=?',['other@example.test'])
    }
  })

  it('shows provider status without secrets, requires password and same-origin to begin linking', async () => {
    const status=await call('/oauth/providers')
    expect(status.json).toEqual({google:{enabled:true},line:{enabled:true}})
    expect(JSON.stringify(status.json)).not.toContain('secret')
    expect((await call('/users/me/connections/google/start','POST',{password:'wrong'},userToken)).status).toBe(400)
    expect((await call('/users/me/connections/google/start','POST',{password:'test-password'},userToken,{Origin:'https://attacker.example'})).status).toBe(403)
    const invalid=require('../server/oauth').configFrom({OAUTH_PUBLIC_URL:'http://example.com',GOOGLE_OAUTH_CLIENT_ID:'x',GOOGLE_OAUTH_CLIENT_SECRET:'y'})
    expect(invalid.providers.google.enabled).toBe(false)
  })

  it('links a verified Google subject only after state/cookie/PKCE and ERP password checks', async () => {
    const flow=await begin('google','link',userToken,{sub:'google-subject-A',email:'person@gmail.example'})
    expect(flow.url.origin).toBe('https://accounts.google.com')
    expect(flow.url.searchParams.get('scope')).toBe('openid email')
    expect(flow.cookie).toMatch(/^__Host-mng_oauth_state=/)
    const wrong=await callback('google',flow,'__Host-mng_oauth_state=wrong')
    expect(wrong.res.headers.get('location')).toBe('/?oauth=expired')
    const result=await callback('google',flow)
    expect(result.status).toBe(303); expect(result.res.headers.get('location')).toBe('/?oauth=linked#/profile')
    expect((await callback('google',flow)).res.headers.get('location')).toBe('/?oauth=expired')
    const connections=(await call('/users/me/connections','GET',undefined,userToken)).json
    expect(connections.google).toEqual({enabled:true,linked:true,email:'person@gmail.example'})
    expect(JSON.stringify(connections)).not.toContain('google-subject-A')
    expect((await call('/users/me/connections','GET',undefined,otherToken)).json.google.linked).toBe(false)
    const [[record]]:any=await db.workPool.query('SELECT provider,subject,user_id,provider_email FROM erp_oauth_identities WHERE user_id=3')
    expect(String(record.subject)).toBe('google-subject-A'); expect(record.provider_email).toBe('person@gmail.example')
    expect(JSON.stringify(record)).not.toContain('do-not-save')
  })

  it('never auto-links matching email and gives an existing account a single-use cookie result without a URL token', async () => {
    const unlinked=await begin('google','login',undefined,{sub:'google-other',email:'new-user@example.test'})
    expect((await callback('google',unlinked)).res.headers.get('location')).toBe('/?oauth=not_linked')
    const login=await begin('google','login',undefined,{sub:'google-subject-A'})
    const cb=await callback('google',login)
    expect(cb.res.headers.get('location')).toBe('/?oauth=login')
    const resultCookie=cookie(cb.res,'__Host-mng_oauth_result')
    expect(resultCookie).toBeTruthy(); expect(cb.res.headers.get('location')).not.toContain('token')
    expect((await call('/oauth/complete','POST',{},undefined,{Cookie:resultCookie,Origin:'https://attacker.example'})).status).toBe(403)
    const completed=await call('/oauth/complete','POST',{},undefined,{Cookie:resultCookie})
    expect(completed.status).toBe(200); expect(completed.json.token).toMatch(/^[0-9a-f]{64}$/)
    expect((await call('/users/me','GET',undefined,completed.json.token)).json).toMatchObject({authId:3,email:'new-user@example.test'})
    expect((await call('/oauth/complete','POST',{},undefined,{Cookie:resultCookie})).status).toBe(400)
    const concurrent=await begin('google','login',undefined,{sub:'google-subject-A'})
    const redirects=await Promise.all([callback('google',concurrent),callback('google',concurrent)])
    expect(redirects.map(r=>r.res.headers.get('location')).sort()).toEqual(['/?oauth=expired','/?oauth=login'])
  })

  it('rejects a conflicting identity, expired session, invalid signature, audience, nonce and issuer', async () => {
    const conflict=await begin('google','link',managerToken,{sub:'google-subject-A'})
    expect((await callback('google',conflict)).res.headers.get('location')).toBe('/?oauth=conflict#/profile')
    const temp=(await auth.login('other@example.test','test-password')).token
    const stale=await begin('google','link',temp,{sub:'another-subject'})
    await auth.logout(temp)
    expect((await callback('google',stale)).res.headers.get('location')).toBe('/?oauth=session_expired#/profile')
    for (const bad of [{badSignature:true},{overrides:{aud:'wrong'}},{overrides:{nonce:'wrong'}},{overrides:{iss:'https://evil.test'}},{overrides:{exp:1}}]) {
      const flow=await begin('google','login',undefined,{sub:'google-subject-A',...bad})
      expect((await callback('google',flow)).res.headers.get('location')).toBe('/?oauth=failed')
    }
    const [[n]]:any=await db.workPool.query('SELECT COUNT(*) AS c FROM erp_oauth_identities WHERE provider=?',['google'])
    expect(n.c).toBe(1)
  })

  it('verifies LINE ID token with its provider and blocks suspended accounts; unlink preserves password login', async () => {
    const flow=await begin('line','link',userToken,{sub:'U12345'})
    expect(flow.url.origin).toBe('https://access.line.me'); expect(flow.url.searchParams.get('scope')).toBe('openid')
    expect((await callback('line',flow)).res.headers.get('location')).toBe('/?oauth=linked#/profile')
    const invalid=await begin('line','login',undefined,{sub:'U12345',overrides:{nonce:'wrong'}})
    expect((await callback('line',invalid)).res.headers.get('location')).toBe('/?oauth=failed')
    await db.authPool.query("UPDATE users SET status='suspended' WHERE id=3")
    const blocked=await begin('line','login',undefined,{sub:'U12345'})
    expect((await callback('line',blocked)).res.headers.get('location')).toBe('/?oauth=account_inactive')
    await db.authPool.query("UPDATE users SET status='active' WHERE id=3")
    const good=await begin('line','login',undefined,{sub:'U12345'})
    const cb=await callback('line',good)
    const ticket=cookie(cb.res,'__Host-mng_oauth_result')
    const completed=await call('/oauth/complete','POST',{},undefined,{Cookie:ticket})
    expect(completed.status).toBe(200)
    expect((await call('/users/me/connections/line','DELETE',{password:'wrong'},userToken)).status).toBe(400)
    const startedBeforeUnlink=await begin('line','login',undefined,{sub:'U12345'})
    expect((await call('/users/me/connections/line','DELETE',{password:'test-password'},userToken)).status).toBe(200)
    expect((await callback('line',startedBeforeUnlink)).res.headers.get('location')).toBe('/?oauth=not_linked')
    const later=await begin('line','login',undefined,{sub:'U12345'})
    expect((await callback('line',later)).res.headers.get('location')).toBe('/?oauth=not_linked')
    expect((await auth.login('new-user@example.test','test-password')).user.authId).toBe(3)
    expect(exchanged.length).toBeGreaterThan(5)
  })

  it('cancels pending and in-flight links when a user disconnects, without invalidating their session', async () => {
    const initial=await begin('line','link',userToken,{sub:'U12345'})
    expect((await callback('line',initial)).res.headers.get('location')).toBe('/?oauth=linked#/profile')
    const waiting=await begin('line','link',userToken,{sub:'U12345'})
    let release!:()=>void, started!:()=>void
    const waitForExchange=new Promise<void>(resolve=>{release=resolve})
    const exchangeStarted=new Promise<void>(resolve=>{started=resolve})
    const inflight=await begin('line','link',userToken,{sub:'U12345',onExchange:started,waitForExchange})
    const result=callback('line',inflight)
    try {
      await exchangeStarted
      // state ถูกใช้แล้วแม้ยังคุยกับ provider อยู่
      expect((await callback('line',inflight)).res.headers.get('location')).toBe('/?oauth=expired')
      expect((await call('/users/me/connections/line','DELETE',{password:'test-password'},userToken)).status).toBe(200)
      expect((await callback('line',waiting)).res.headers.get('location')).toBe('/?oauth=expired')
    } finally { release() }
    expect((await result).res.headers.get('location')).toBe('/?oauth=expired#/profile')
    expect((await call('/users/me/connections','GET',undefined,userToken)).json.line.linked).toBe(false)
    expect((await call('/users/me','GET',undefined,userToken)).status).toBe(200)
  })

  it('permits unlink after OAuth configuration is removed while rejecting cross-site requests', async () => {
    const flow=await begin('line','link',userToken,{sub:'U-disabled'})
    expect((await callback('line',flow)).res.headers.get('location')).toBe('/?oauth=linked#/profile')
    const status=await call('/test-disabled-connections','GET',undefined,userToken)
    expect(status.json.line).toEqual({enabled:false,linked:true,email:null})
    expect((await call('/test-disabled-connections/line','DELETE',{password:'test-password'},userToken,{Origin:'https://attacker.example','Sec-Fetch-Site':'cross-site'})).status).toBe(403)
    expect((await call('/test-disabled-connections/line','DELETE',{password:'wrong'},userToken,{'Sec-Fetch-Site':'same-origin'})).status).toBe(400)
    expect((await call('/test-disabled-connections/line','DELETE',{password:'test-password'},userToken,{'Sec-Fetch-Site':'same-origin'})).status).toBe(200)
    expect((await call('/test-disabled-connections','GET',undefined,userToken)).json.line.linked).toBe(false)
  })

  it('lets only Admin revoke another user’s connection and web sessions without exposing subjects', async () => {
    expect((await call('/users/3/connections','GET',undefined,managerToken)).status).toBe(403)
    const list=await call('/users/3/connections','GET',undefined,adminToken)
    expect(list.json).toEqual({google:true,line:false})
    expect(JSON.stringify(list.json)).not.toContain('subject')
    expect((await call('/users/3/connections/google','DELETE',{password:'wrong'},adminToken)).status).toBe(400)
    const pending=await begin('google','link',userToken,{sub:'google-subject-A'})
    let release!:()=>void, started!:()=>void
    const waitForExchange=new Promise<void>(resolve=>{release=resolve})
    const exchangeStarted=new Promise<void>(resolve=>{started=resolve})
    const inflight=await begin('google','link',userToken,{sub:'google-subject-A',onExchange:started,waitForExchange})
    const inflightResult=callback('google',inflight)
    try {
      await exchangeStarted
      expect((await call('/users/3/connections/google','DELETE',{password:'test-password'},adminToken)).status).toBe(200)
      expect((await callback('google',pending)).res.headers.get('location')).toBe('/?oauth=expired')
    } finally { release() }
    // session ถูกยกเลิกก่อน callback ที่ค้างอยู่จะผูกกลับได้
    expect((await inflightResult).res.headers.get('location')).toBe('/?oauth=session_expired#/profile')
    expect((await call('/users/me','GET',undefined,userToken)).status).toBe(401)
    const login=await begin('google','login',undefined,{sub:'google-subject-A'})
    expect((await callback('google',login)).res.headers.get('location')).toBe('/?oauth=not_linked')
    expect((await auth.login('new-user@example.test','test-password')).user.authId).toBe(3)
    const hash=await bcrypt.hash('test-password',8)
    await db.authPool.query('INSERT INTO users (email,password,name,role,status) VALUES (?,?,?,?,?)',['super@example.test',hash,'Super','super_admin','active'])
    expect((await call('/users/5/connections','GET',undefined,adminToken)).status).toBe(403)
  })

  it('reports unavailable profile storage rather than returning an empty profile or false success', async () => {
    const fresh=(await auth.login('new-user@example.test','test-password')).token
    await db.workPool.query('RENAME TABLE erp_user_profiles TO erp_profile_temporarily_unavailable')
    try {
      expect((await call('/users/me/profile','GET',undefined,fresh)).status).toBe(503)
      expect((await call('/users/me/profile','PUT',{firstName:'ทดสอบ',lastName:'',biography:'',skills:[]},fresh)).status).toBe(503)
    } finally { await db.workPool.query('RENAME TABLE erp_profile_temporarily_unavailable TO erp_user_profiles') }
    expect((await call('/users/me/profile','GET',undefined,fresh)).json.firstName).toBe('มาลี')
  })
})
