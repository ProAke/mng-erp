import http from 'node:http'
import crypto from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const { createIntegrations, endpoint, postJson } = require('../server/flow-integrations')

describe('Project Flow external integrations', () => {
  let server: http.Server, port = 0
  let requests: any[] = []
  let mode = 'ok'
  const secret = 'test-only-webhook-secret-at-least-32-bytes'
  const env = {
    FLOW_AI_URL:'https://provider.example.test/v1/chat/completions', FLOW_AI_KEY:'test-ai-key', FLOW_AI_MODEL:'model-test',
    FLOW_WEBHOOK_URL:'https://receiver.example.test/hook', FLOW_WEBHOOK_SECRET:secret,
  }
  // เปลี่ยนเฉพาะ transport ของชุดทดสอบ: โค้ด production ยังบังคับ HTTPS เสมอ
  const request = (url: string, options: any, cb: any) => http.request({
    hostname:'127.0.0.1', port, path:new URL(url).pathname, method:options.method, headers:options.headers,
  }, cb)
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        requests.push({path:req.url, headers:req.headers, raw, body:JSON.parse(raw)})
        if (mode === 'close') { req.socket.destroy(); return }
        if (mode === 'redirect') { res.writeHead(302, {Location:'/redirected'}); res.end('secret-provider-error'); return }
        if (mode === 'error') { res.writeHead(500); res.end('secret-provider-error'); return }
        if (mode === 'large') { res.writeHead(200); res.end('x'.repeat(70000)); return }
        res.writeHead(req.url === '/hook' ? 202 : 200, {'Content-Type':'application/json'})
        res.end(req.url === '/hook' ? '{}' : JSON.stringify({choices:[{message:{content:'ร่างทดสอบ <script>unsafe</script>'}}]}))
      })
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>{port=(server.address() as any).port; resolve()}))
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve=>server.close(()=>resolve())) })
  const integration = () => createIntegrations({env, request})

  it('defaults off, accepts only HTTPS without credentials, query strings or fragments, and hides secrets', async () => {
    expect(endpoint('http://example.test/path')).toBe('')
    expect(endpoint('https://user:password@example.test/path')).toBe('')
    expect(endpoint('https://example.test/path?key=secret')).toBe('')
    expect(endpoint('https://example.test/path#secret')).toBe('')
    const disabled = createIntegrations({env:{...env,FLOW_AI_URL:'http://localhost', FLOW_WEBHOOK_SECRET:'short'}, request})
    expect(disabled.status()).toEqual({aiReady:false, aiModel:null, webhookReady:false})
    await expect(disabled.generateDraft({})).rejects.toMatchObject({status:503})
    await expect(disabled.dispatch({})).rejects.toMatchObject({status:503})
    expect(JSON.stringify(integration().status())).not.toContain(secret)
    expect(JSON.stringify(integration().status())).not.toContain('test-ai-key')
    expect(JSON.stringify(integration().status())).not.toContain('provider.example.test')
  })

  it('calls the configured chat-completions model with only the selected context and does not publish', async () => {
    mode='ok'; requests=[]
    const output = await integration().generateDraft({requestId:'request-id', instruction:'ช่วยร่าง', project:'ทดสอบ',
      node:{title:'ตอบลูกค้า', description:'ตรวจคำตอบ'}, brief:{objective:'เป้าหมาย'}, currentDraft:'ร่างเดิม'})
    expect(output).toEqual({content:'ร่างทดสอบ <script>unsafe</script>', model:'model-test'})
    expect(requests).toHaveLength(1)
    expect(requests[0].path).toBe('/v1/chat/completions')
    expect(requests[0].headers.authorization).toBe('Bearer test-ai-key')
    expect(requests[0].body.model).toBe('model-test')
    expect(requests[0].body.messages[1].content).toContain('เป้าหมาย')
    expect(requests[0].body.max_tokens).toBe(1200)
  })

  it('signs the exact outbound bytes and uses a stable event id as idempotency key', async () => {
    mode='ok'; requests=[]
    const payload = {eventId:'a-test-event-id', eventType:'mng.flow.action.approved', action:{content:'สวัสดี'}}
    expect(await integration().dispatch(payload)).toEqual({accepted:true, diagnostic:''})
    expect(requests).toHaveLength(1)
    const sent = requests[0]
    expect(sent.path).toBe('/hook')
    expect(sent.headers['idempotency-key']).toBe(payload.eventId)
    expect(sent.headers['x-mng-event-id']).toBe(payload.eventId)
    const signature = crypto.createHmac('sha256',secret).update(sent.headers['x-mng-timestamp']+'.'+sent.raw).digest('hex')
    expect(sent.headers['x-mng-signature']).toBe('sha256='+signature)
    expect(sent.headers.authorization).toBeUndefined()
  })

  it('never follows redirects or exposes provider response bodies and treats failures as uncertain', async () => {
    mode='redirect'; requests=[]
    const payload = {eventId:'event-2', eventType:'test'}
    expect(await integration().dispatch(payload)).toEqual({accepted:false, diagnostic:'HTTP_302'})
    expect(requests).toHaveLength(1)
    await expect(integration().generateDraft({requestId:'req'})).rejects.toMatchObject({status:502, code:'HTTP_302'})
    mode='error'
    const out = await integration().dispatch(payload)
    expect(out).toEqual({accepted:false, diagnostic:'HTTP_500'})
    expect(JSON.stringify(out)).not.toContain('secret-provider-error')
    mode='close'
    expect(await integration().dispatch(payload)).toEqual({accepted:false, diagnostic:'NETWORK_ERROR'})
    mode='large'
    expect(await integration().dispatch(payload)).toEqual({accepted:false, diagnostic:'RESPONSE_TOO_LARGE'})
  })

  it('has a bounded request time', async () => {
    // test timeout against a transport that doesn't write a request at all
    const fake = (_url: string, _opts: any, _cb: any) => {
      const {EventEmitter} = require('node:events')
      const req = new EventEmitter() as any
      req.end = () => {}
      req.destroy = () => {}
      return req
    }
    await expect(postJson('https://example.test', {}, {}, {request:fake, timeout:30})).rejects.toMatchObject({code:'TIMEOUT'})
  })
})
