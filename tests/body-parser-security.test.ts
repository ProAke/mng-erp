import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { deflateSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))

// Express 4 ใช้ body-parser 1.x; GHSA-27r3-jxmh-p828 แก้ตั้งแต่ 1.20.9
function patchedVersion(version:string) {
  const m = /^1\.(\d+)\.(\d+)$/.exec(version)
  return !!m && (+m[1] > 20 || (+m[1] === 20 && +m[2] >= 9))
}

async function startServer() {
  // แยก process เพื่อให้ตรวจได้ว่าคำขอร้ายทำให้เซิร์ฟเวอร์ล้มหรือไม่ และไม่แตะฐานข้อมูลจริง
  const script = `process.env.VITEST='1'; const {app}=require('./server/index');
    const server=app.listen(0,'127.0.0.1',()=>console.log('SECURITY_TEST_READY:'+server.address().port));`
  const child = spawn(process.execPath, ['-e', script], {
    cwd:root,
    env:{...process.env, VITEST:'1', DB_AUTH_PASS:'', DB_WORK_PASS:''},
    stdio:['ignore','pipe','pipe'],
  })
  let stdout = '', stderr = ''
  child.stderr.on('data', (chunk:Buffer) => { stderr += chunk.toString() })
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('เซิร์ฟเวอร์ทดสอบไม่เริ่ม: ' + stderr)), 5000)
      child.once('error', err => { clearTimeout(timer); reject(err) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error('เซิร์ฟเวอร์ทดสอบหยุดก่อนเริ่ม: ' + code + ' ' + stderr)) })
      child.stdout.on('data', (chunk:Buffer) => {
        stdout += chunk.toString()
        const match = stdout.match(/SECURITY_TEST_READY:(\d+)/)
        if (match) { clearTimeout(timer); resolve(+match[1]) }
      })
    })
    return {child, port, stderr:() => stderr}
  } catch (e) {
    child.kill('SIGTERM')
    throw e
  }
}

async function stopServer(child:any) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(resolve => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, wait(1000)])
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

function post(port:number, route:string, encoding:string, compressed:Buffer, trailing?:Buffer) {
  return new Promise<{status:number, body:string, cache:string}>((resolve, reject) => {
    const first = trailing ? Buffer.concat([compressed, Buffer.from([0])]) : compressed
    const length = first.length + (trailing?.length || 0)
    let sent = false, ended = false, result:{status:number,body:string,cache:string}, timer:NodeJS.Timeout | undefined
    const done = () => { if (sent && ended) resolve(result) }
    const req = http.request({
      hostname:'127.0.0.1', port, path:route, method:'POST',
      headers:{'Content-Type':'application/json', 'Content-Encoding':encoding, 'Content-Length':length},
    }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('error', reject)
      res.on('end', () => {
        result = {status:res.statusCode || 0, body, cache:String(res.headers['cache-control'] || '')}
        ended = true; done()
      })
    })
    req.on('finish', () => { sent = true; done() })
    req.on('error', err => { if (timer) clearTimeout(timer); reject(err) })
    req.setTimeout(3000, () => req.destroy(new Error('ส่งคำขอทดสอบหมดเวลา')))
    if (trailing) {
      // ส่ง trailing bytes หลัง decoder อ่าน frame เสร็จ เพื่อทดสอบเงื่อนไขใน advisory จริง
      req.write(first)
      timer = setTimeout(() => req.end(trailing), 30)
    } else req.end(first)
  })
}

describe('ป้องกัน body-parser DoS จาก compressed request (GHSA-27r3-jxmh-p828)', () => {
  it('locks a patched parser and configures the override for workspace and standalone installs', () => {
    for (const dir of ['', 'server']) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
      const lock = JSON.parse(fs.readFileSync(path.join(root, dir, 'package-lock.json'), 'utf8'))
      expect(manifest.overrides?.express?.['body-parser']).toBe('~1.20.9')
      const entries = Object.entries(lock.packages).filter(([key]) => /(?:^|\/)node_modules\/body-parser$/.test(key))
      expect(entries.length).toBeGreaterThan(0)
      for (const [, value] of entries) expect(patchedVersion((value as any).version)).toBe(true)
    }
  })

  it('uses the patched body-parser actually resolved by the server’s Express installation', () => {
    const serverRequire = createRequire(path.join(root, 'server/index.js'))
    const expressRequire = createRequire(serverRequire.resolve('express'))
    expect(patchedVersion(expressRequire('body-parser/package.json').version)).toBe(true)
  })

  for (const route of ['/api/unknown', '/api/manny/assist']) {
    it(`keeps the real app alive after a gzip frame with trailing bytes at ${route}`, async () => {
      const server = await startServer()
      try {
        const response = await post(server.port, route, 'gzip', gzipSync('{"a":1}'), Buffer.alloc(100 * 1024, 0x58))
        expect(response.status).toBe(401)
        await wait(300) // อนุญาตให้ error จาก decoder ที่จบไปแล้วเกิดขึ้นก่อนตรวจ process
        expect(server.child.exitCode, server.stderr()).toBeNull()
        const health = await fetch(`http://127.0.0.1:${server.port}/api/health`)
        expect(health.status).toBe(200)
        expect((await health.json()).demo).toBe(true)
      } finally { await stopServer(server.child) }
    }, 10000)
  }

  it('continues to parse legitimate compressed JSON and enforce Manny’s decompressed limit', async () => {
    const server = await startServer()
    try {
      for (const route of ['/api/unknown', '/api/manny/assist']) {
        expect((await post(server.port, route, 'gzip', gzipSync('{"a":1}'))).status).toBe(401)
        expect((await post(server.port, route, 'deflate', deflateSync('{"a":1}'))).status).toBe(401)
        expect((await post(server.port, route, 'gzip', gzipSync('not-json'))).status).toBe(400)
      }
      const large = await post(server.port, '/api/manny/assist', 'gzip', gzipSync(JSON.stringify({text:'x'.repeat(70000)})))
      expect(large.status).toBe(413)
      expect(large.cache).toContain('no-store')
      expect(server.child.exitCode, server.stderr()).toBeNull()
      expect((await fetch(`http://127.0.0.1:${server.port}/api/health`)).status).toBe(200)
    } finally { await stopServer(server.child) }
  }, 10000)
})
