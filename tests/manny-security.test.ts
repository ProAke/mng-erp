import { describe, expect, it } from 'vitest'

const m = require('../server/manny')
const env = { MANNY_ENCRYPTION_KEY:'a'.repeat(64), MANNY_COMPATIBLE_HOSTS:'ai.partner.example' }

describe('Manny: การเข้ารหัส ขอบเขตปลายทาง และ adapters', () => {
  it('requires a separate 256-bit master key and binds ciphertext to its owner', () => {
    expect(m.masterKey({})).toBeNull()
    expect(m.masterKey({MANNY_ENCRYPTION_KEY:'too-short'})).toBeNull()
    expect(() => m.encryptSecret('not-a-real-key','user:1',{})).toThrow(/MANNY_ENCRYPTION_KEY/)
    const one=m.encryptSecret('test-only-secret','user:1',env), two=m.encryptSecret('test-only-secret','user:1',env)
    expect(one).not.toContain('test-only-secret')
    expect(one).not.toBe(two)
    expect(m.decryptSecret(one,'user:1',env)).toBe('test-only-secret')
    expect(() => m.decryptSecret(one,'user:2',env)).toThrow()
    expect(() => m.decryptSecret(one,'shared:1',env)).toThrow()
    expect(() => m.decryptSecret(one,'user:1',{...env,MANNY_ENCRYPTION_KEY:'b'.repeat(64)})).toThrow()
    expect(() => m.decryptSecret(one.slice(0,-2)+'00','user:1',env)).toThrow()
  })

  it('only permits exact allowlisted HTTPS compatible hosts without URL credentials, queries or IPs', () => {
    expect(m.compatibleEndpoint('https://api.groq.com/openai/v1/chat/completions',env)).toContain('api.groq.com')
    expect(m.compatibleEndpoint('https://ai.partner.example/v1/chat',env)).toContain('ai.partner.example')
    for (const url of ['http://api.groq.com/v1/chat','https://api.groq.com.evil.test/x','https://evil.test/x',
      'https://user:pass@api.groq.com/x','https://api.groq.com/x?secret=1','https://api.groq.com/x#frag',
      'https://127.0.0.1/x','https://[::1]/x','https://api.groq.com:444/x']) {
      expect(m.compatibleEndpoint(url,env)).toBe('')
    }
    expect(m.compatibleEndpoint('https://evil.test/x',{MANNY_COMPATIBLE_HOSTS:'*'})).toBe('')
    expect(() => m.validateConfig({provider:'gemini',model:'../../secret'},env)).toThrow()
  })

  it('rejects non-public IPs and conservatively accepts normal public addresses', () => {
    for (const ip of ['0.0.0.0','10.1.2.3','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1',
      '100.64.0.2','198.18.1.1','224.0.0.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1','2002:c0a8:101::1']) {
      expect(m.publicAddress(ip),ip).toBe(false)
    }
    expect(m.publicAddress('8.8.8.8')).toBe(true)
    expect(m.publicAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('rejects mixed public/private DNS answers and pins the selected public address', async () => {
    const dns=require('node:dns'), original=dns.lookup
    const lookup=()=>new Promise<any>(resolve=>m.secureLookup('allowed.example',{},(error:any,address:any,family:any)=>resolve({error,address,family})))
    try {
      dns.lookup=(_host:any,_options:any,cb:any)=>cb(null,[{address:'8.8.8.8',family:4},{address:'10.1.2.3',family:4}])
      expect((await lookup()).error?.code).toBe('UNSAFE_ADDRESS')
      dns.lookup=(_host:any,_options:any,cb:any)=>cb(null,[{address:'8.8.8.8',family:4}])
      expect(await lookup()).toMatchObject({error:null,address:'8.8.8.8',family:4})
    } finally { dns.lookup=original }
  })

  it('uses the provider-specific auth and request formats without putting a key into a URL', () => {
    const key='unit-test-secret', text='สวัสดี', instruction='ช่วยแก้คำผิด'
    const openai=m.makeProviderRequest({provider:'openai',model:'test-model'},key,text,instruction)
    expect(openai.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(openai.headers.Authorization).toBe('Bearer '+key)
    expect(openai.body.messages[1].content).toContain(text)
    expect(m.parseProviderResponse('openai',JSON.stringify({choices:[{message:{content:'ผลลัพธ์'}}]}))).toBe('ผลลัพธ์')
    const gemini=m.makeProviderRequest({provider:'gemini',model:'gemini-test'},key,text,instruction)
    expect(gemini.url).not.toContain(key)
    expect(gemini.headers['x-goog-api-key']).toBe(key)
    expect(m.parseProviderResponse('gemini',JSON.stringify({candidates:[{content:{parts:[{text:'private thought',thought:true},{text:'ผลลัพธ์'}]}}]}))).toBe('ผลลัพธ์')
    const claude=m.makeProviderRequest({provider:'anthropic',model:'claude-test'},key,text,instruction)
    expect(claude.url).not.toContain(key)
    expect(claude.headers['x-api-key']).toBe(key)
    expect(m.parseProviderResponse('anthropic',JSON.stringify({content:[{type:'text',text:'ผลลัพธ์'}]}))).toBe('ผลลัพธ์')
    const compat=m.makeProviderRequest({provider:'compatible',endpoint:'https://api.groq.com/chat',model:'model'},key,text,instruction)
    expect(compat.url).toBe('https://api.groq.com/chat')
    for (const payload of ['{}','not-json',JSON.stringify({choices:[{message:{content:'x'.repeat(20001)}}]}),
      JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]})])
      expect(()=>m.parseProviderResponse('openai',payload)).toThrow()
    expect(()=>m.parseProviderResponse('gemini',JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]}))).toThrow()
    expect(()=>m.parseProviderResponse('anthropic',JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]}))).toThrow()
  })
})
