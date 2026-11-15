import http from 'node:http'
import crypto from 'node:crypto'
import express from 'express'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'

const oauth = require('../server/oauth')
const {decodeAvatar,jpegDimensions,normalizeSkills} = require('../server/profile')
const origin='https://erp.example.test'

describe('ขอบเขตความปลอดภัยของโปรไฟล์และ OAuth (provider จำลอง)', () => {
  it('fails closed for missing/unsafe configuration and enables HTTP only for explicitly allowed localhost', () => {
    const credentials={GOOGLE_OAUTH_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret'}
    for(const u of ['', 'http://erp.example.test', 'https://erp.example.test/path', 'https://user:pass@erp.example.test', 'https://erp.example.test/?x=1'])
      expect(oauth.configFrom({...credentials,OAUTH_PUBLIC_URL:u}).providers.google.enabled).toBe(false)
    expect(oauth.configFrom({...credentials,OAUTH_PUBLIC_URL:origin}).providers.google.enabled).toBe(true)
    expect(oauth.configFrom({...credentials,OAUTH_PUBLIC_URL:'http://localhost:3000'}).providers.google.enabled).toBe(false)
    expect(oauth.configFrom({...credentials,OAUTH_PUBLIC_URL:'http://localhost:3000',OAUTH_ALLOW_HTTP_LOCAL:'1'}).providers.google.enabled).toBe(true)
  })

  it('requires exact issuer, audience, nonce, unexpired claims and a bounded subject', () => {
    const now=Date.now(), base={iss:'https://accounts.google.com',aud:'client',sub:'subject',exp:now/1000+30,iat:now/1000,nonce:'nonce'}
    expect(oauth.validClaims(base,'google','client','nonce',now)).toBe(true)
    for(const bad of [{iss:'https://attacker.example'}, {aud:'other'}, {nonce:'other'}, {exp:now/1000-1}, {iat:now/1000+61}, {sub:'a'.repeat(256)}, {sub:'with space'}, {azp:'other'}])
      expect(oauth.validClaims({...base,...bad},'google','client','nonce',now)).toBe(false)
    expect(oauth.validClaims({...base,iss:'https://access.line.me'},'line','client','nonce',now)).toBe(true)
    expect(oauth.validClaims(base,'line','client','nonce',now)).toBe(false)
  })

  it('normalizes skills and rejects SVG, spoofed JPEG and oversized images', () => {
    expect(normalizeSkills([' UX ','ux','สื่อสาร'])).toEqual(['UX','สื่อสาร'])
    expect(()=>normalizeSkills(Array(21).fill('a'))).toThrow()
    expect(()=>normalizeSkills(['a'.repeat(41)])).toThrow()
    expect(()=>decodeAvatar('data:image/svg+xml;base64,PHN2Zz4=')).toThrow()
    expect(()=>decodeAvatar('data:image/jpeg;base64,ZmFrZQ==')).toThrow()
    expect(()=>decodeAvatar('data:image/jpeg;base64,'+'A'.repeat(400000))).toThrow()
    expect(jpegDimensions(Buffer.from('ffd80000ffd9','hex'))).toBeNull()
  })
})

describe('OAuth callback — signed Google JWT and LINE verify endpoint, without external network', () => {
  let server:http.Server, base='', mode='ok', expected:any={}
  const states=new Map<string,any>()
  const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048})
  const key:any=publicKey.export({format:'jwk'});key.kid='unit-key';key.use='sig';key.alg='RS256'
  const pool:any={
    async query(sql:string, params:any[]=[]) {
      if (/DELETE FROM erp_oauth_states WHERE expires_at/i.test(sql)) return [{affectedRows:0}]
      if (/INSERT INTO erp_oauth_states/i.test(sql)) {
        const [state_hash,provider,purpose,user_id,session_hash,verifier,nonce]=params
        states.set(state_hash,{state_hash,provider,purpose,user_id,session_hash,verifier,nonce});return [{affectedRows:1}]
      }
      throw new Error('unexpected pool SQL '+sql)
    },
    async getConnection() {return {
      async beginTransaction(){}, async commit(){}, async rollback(){}, release(){},
      async query(sql:string,params:any[]=[]) {
        if (/SELECT \* FROM erp_oauth_states/i.test(sql)) return [states.has(params[0])?[states.get(params[0])]:[]]
        if (/DELETE FROM erp_oauth_states WHERE state_hash/i.test(sql)) {states.delete(params[0]);return [{affectedRows:1}]}
        if (/SELECT user_id FROM erp_oauth_identities/i.test(sql)) return [[]]
        throw new Error('unexpected conn SQL '+sql)
      },
    }}
  }
  function jwt(claims:any) {
    const a=Buffer.from(JSON.stringify({alg:'RS256',kid:'unit-key'})).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url')
    const sig=crypto.sign('RSA-SHA256',Buffer.from(a+'.'+b),privateKey);if(mode==='bad_signature')sig[0]^=1
    return a+'.'+b+'.'+sig.toString('base64url')
  }
  const transport=async (url:string,options:any) => {
    if(url.includes('/certs')) return {keys:[key]}
    if(url.endsWith('/token')) {
      expect(crypto.createHash('sha256').update(options.form.code_verifier).digest('base64url')).toBe(expected.challenge)
      if(expected.provider==='line') return {id_token:'test-line-token'}
      const now=Math.floor(Date.now()/1000)
      return {id_token:jwt({iss:'https://accounts.google.com',aud:mode==='bad_aud'?'wrong':'google-id',sub:'subject',nonce:mode==='bad_nonce'?'wrong':expected.nonce,iat:now,exp:now+300})}
    }
    if(url==='https://api.line.me/oauth2/v2.1/verify') {
      expect(options.form.nonce).toBe(expected.nonce)
      const now=Math.floor(Date.now()/1000)
      return {iss:'https://access.line.me',aud:'line-id',sub:'U123',nonce:mode==='bad_nonce'?'wrong':expected.nonce,iat:now,exp:now+300}
    }
    throw new Error('unexpected URL')
  }
  beforeAll(async()=>{
    const app=express();app.use(express.json());const service=oauth.createOAuth({workPool:pool,authPool:{},env:{OAUTH_PUBLIC_URL:origin,GOOGLE_OAUTH_CLIENT_ID:'google-id',GOOGLE_OAUTH_CLIENT_SECRET:'test',LINE_OAUTH_CLIENT_ID:'line-id',LINE_OAUTH_CLIENT_SECRET:'test'},transport})
    app.use('/api/oauth',service.publicRouter)
    await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{base=`http://127.0.0.1:${(server.address() as any).port}/api/oauth`;resolve()})})
  })
  afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})
  async function start(provider='google') {
    const response=await fetch(base+'/'+provider+'/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})
    expect(response.status).toBe(200)
    const cookies=(response.headers as any).getSetCookie() as string[]
    const cookie=cookies[0].split(';')[0]
    expect(cookies[0]).toContain('HttpOnly');expect(cookies[0]).toContain('Secure');expect(cookies[0]).toContain('SameSite=Lax')
    const url=new URL((await response.json()).url),state=url.searchParams.get('state')!
    expected={provider,nonce:url.searchParams.get('nonce'),challenge:url.searchParams.get('code_challenge')}
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/oauth/${provider}/callback`)
    return {state,cookie}
  }
  async function callback(provider:string,flow:any,cookie=flow.cookie) {
    return fetch(base+`/${provider}/callback?code=test&state=${flow.state}`,{headers:{Cookie:cookie},redirect:'manual'})
  }
  it('rejects cross-site starts, mismatched cookies and replayed state',async()=>{
    const denied=await fetch(base+'/google/start',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'})
    expect(denied.status).toBe(403)
    mode='ok';const flow=await start()
    expect((await callback('google',flow,'__Host-mng_oauth_state=wrong')).headers.get('location')).toBe('/?oauth=expired')
    expect((await callback('google',flow)).headers.get('location')).toBe('/?oauth=not_linked')
    expect((await callback('google',flow)).headers.get('location')).toBe('/?oauth=expired')
  })
  it('verifies signed Google tokens and rejects tampering, wrong audience or nonce',async()=>{
    for(const m of ['bad_signature','bad_aud','bad_nonce']) {
      mode=m;const flow=await start()
      expect((await callback('google',flow)).headers.get('location')).toBe('/?oauth=failed')
    }
    mode='ok';const flow=await start()
    expect((await callback('google',flow)).headers.get('location')).toBe('/?oauth=not_linked')
  })
  it('calls LINE token verification with nonce and rejects mismatched claims',async()=>{
    mode='ok';const flow=await start('line')
    expect((await callback('line',flow)).headers.get('location')).toBe('/?oauth=not_linked')
    mode='bad_nonce';const invalid=await start('line')
    expect((await callback('line',invalid)).headers.get('location')).toBe('/?oauth=failed')
  })
})
