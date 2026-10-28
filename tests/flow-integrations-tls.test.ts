/* ทดสอบ production transport กับ HTTPS ภายในเครื่องจริงเท่านั้น
   ใบรับรองและคีย์สร้างชั่วคราวเพื่อทดสอบ ไม่ใช่ credential ของระบบ */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import crypto from 'node:crypto'
import {execFile, execFileSync, spawnSync} from 'node:child_process'
import {promisify} from 'node:util'
import {describe, it, expect, beforeAll, afterAll} from 'vitest'

const execFileAsync=promisify(execFile)
const hasOpenSsl=spawnSync('openssl',['version'],{stdio:'ignore'}).status===0
const suite=hasOpenSsl ? describe : describe.skip

suite('Flow production HTTPS transport on loopback', () => {
  let dir='', server:https.Server, port=0, certFile=''
  const secret='test-only-receiver-secret-32-bytes-long'
  const requests:any[]=[]

  beforeAll(async () => {
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'mng-flow-tls-'))
    certFile=path.join(dir,'cert.pem')
    const keyFile=path.join(dir,'key.pem'), configFile=path.join(dir,'openssl.cnf')
    fs.writeFileSync(configFile, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n')
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1',
      '-keyout',keyFile,'-out',certFile,'-config',configFile],{stdio:'ignore'})
    server=https.createServer({key:fs.readFileSync(keyFile),cert:fs.readFileSync(certFile)},(req,res)=>{
      const chunks:Buffer[]=[]
      req.on('data',chunk=>chunks.push(chunk))
      req.on('end',()=>{
        const raw=Buffer.concat(chunks).toString('utf8')
        requests.push({path:req.url,headers:req.headers,raw,body:JSON.parse(raw)})
        res.writeHead(req.url==='/hook'?202:200,{'Content-Type':'application/json'})
        res.end(req.url==='/hook'?'{}':JSON.stringify({choices:[{message:{content:'ผลจากเซิร์ฟเวอร์ HTTPS ทดสอบ'}}]}))
      })
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>{port=(server.address() as any).port;resolve()}))
  },30000)
  afterAll(async () => {
    if (server) await new Promise<void>(resolve=>server.close(()=>resolve()))
    if (dir) fs.rmSync(dir,{recursive:true,force:true})
  })

  it('rejects an untrusted certificate, then calls AI and signs a webhook over trusted TLS', async () => {
    const env={FLOW_AI_URL:`https://127.0.0.1:${port}/chat`,FLOW_AI_KEY:'test-only-ai-key',FLOW_AI_MODEL:'test-model',
      FLOW_WEBHOOK_URL:`https://127.0.0.1:${port}/hook`,FLOW_WEBHOOK_SECRET:secret}
    const {createIntegrations}=require('../server/flow-integrations')
    const rejected=await createIntegrations({env}).dispatch({eventId:'untrusted-test'})
    expect(rejected).toEqual({accepted:false,diagnostic:'NETWORK_ERROR'})
    expect(requests).toHaveLength(0)

    // NODE_EXTRA_CA_CERTS ต้องตั้งก่อน Node เริ่ม จึงใช้ child process พร้อม transport จริง
    const eventId=crypto.randomUUID()
    const script=`
      const i=require('./server/flow-integrations');
      (async()=>{
        const draft=await i.generateDraft({requestId:'test-request',instruction:'ร่าง',project:'ทดสอบ',node:{title:'ดูแล'},brief:{objective:'เป้าหมาย'},currentDraft:''});
        const result=await i.dispatch({eventId:process.env.TEST_EVENT,eventType:'mng.flow.action.approved',action:{content:'ข้อความทดสอบ'}});
        process.stdout.write(JSON.stringify({draft,result}));
      })().catch(e=>{console.error(e.message);process.exitCode=1});`
    const child=await execFileAsync(process.execPath,['-e',script],{
      cwd:path.resolve(__dirname,'..'), env:{...process.env,...env,NODE_EXTRA_CA_CERTS:certFile,TEST_EVENT:eventId}, timeout:20000,
    })
    const output=JSON.parse(child.stdout)
    expect(output.draft.content).toBe('ผลจากเซิร์ฟเวอร์ HTTPS ทดสอบ')
    expect(output.result).toEqual({accepted:true,diagnostic:''})
    expect(requests.map(r=>r.path)).toEqual(['/chat','/hook'])
    expect(requests[0].headers.authorization).toBe('Bearer test-only-ai-key')
    expect(requests[0].body.model).toBe('test-model')
    const hook=requests[1]
    expect(hook.headers['idempotency-key']).toBe(eventId)
    expect(hook.headers['x-mng-event-id']).toBe(eventId)
    expect(hook.body.eventId).toBe(eventId)
    expect(hook.headers.authorization).toBeUndefined()
    expect(hook.headers['x-mng-signature']).toBe('sha256='+crypto.createHmac('sha256',secret)
      .update(hook.headers['x-mng-timestamp']+'.'+hook.raw).digest('hex'))
  },30000)
})
