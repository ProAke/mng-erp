import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'

const root = path.resolve(__dirname, '..')
const scripts = ['bangkok-time','data','ui','views','agency-os','project-plan','project-flow','flow-operations','profile','app']

describe('หน้าบัญชีส่วนตัวแยกจากการจัดการผู้ใช้', () => {
  let dom:JSDOM, win:any, ctx:any
  let requests:any[] = [], failDetails = false
  const pause = () => new Promise(resolve=>setTimeout(resolve,30))
  beforeAll(async () => {
    dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost:8080/#/dashboard',runScripts:'outside-only',pretendToBeVisual:true})
    win=dom.window; ctx=dom.getInternalVMContext(); win.scrollTo=()=>{}; win.HTMLElement.prototype.scrollIntoView=()=>{}
    win.fetch=async (url:string,options:any={}) => {
      const req={url:String(url),method:options.method || 'GET',body:options.body?JSON.parse(options.body):undefined}; requests.push(req)
      let data:any={ok:true},status=200
      if(req.url==='/api/health') data={auth:false,work:false,demo:true}
      else if(req.url==='/api/users' && req.method==='GET') data=[{id:'u1',authId:1,name:'Admin',email:'admin@example.test',role:'admin',status:'active'},{id:'u2',authId:2,name:'สมาชิก',email:'user@example.test',role:'user',status:'active'}]
      else if(req.url==='/api/users/2/connections' && req.method==='GET') data={google:true,line:false}
      else if(req.url==='/api/users/me/profile' && req.method==='PUT') {
        if(failDetails) {status=503;data={error:'database unavailable'}} else data={ok:true,...req.body}
      }
      else if(req.url==='/api/users/me/connections' && req.method==='GET') data={google:{enabled:true,linked:false,email:null},line:{enabled:false,linked:false,email:null}}
      else if(req.url==='/api/oauth/providers') data={google:{enabled:true},line:{enabled:false}}
      return {ok:status<400,status,json:async()=>data}
    }
    for(const script of scripts) vm.runInContext(fs.readFileSync(path.join(root,`assets/js/${script}.js`),'utf8'),ctx,{filename:script+'.js'})
    await pause()
    vm.runInContext(`Remote.on=true; Remote.token='user-token'; Remote.user={authId:2,name:'สมาชิก',email:'user@example.test',role:'user'}; Store.data.user={name:'สมาชิก',email:'user@example.test',role:'user'};
      Remote.profile={firstName:'มาลี',lastName:'ใจดี',biography:'<img src=x onerror=alert(1)>',skills:['UX','สื่อสาร'],avatar:null};
      Remote.connections={google:{enabled:true,linked:false,email:null},line:{enabled:false,linked:false,email:null}};`,ctx)
  })
  afterAll(() => {vm.runInContext('App.stopClock()',ctx);dom.window.close()})
  function route(name:string) {vm.runInContext(`location.hash='#/${name}'; App.route();`,ctx)}

  it('shows user/manager the profile, hides admin navigation and rejects the admin route', async () => {
    requests=[]; route('profile')
    const view=win.document.getElementById('view')
    expect(view.textContent).toContain('โปรไฟล์ของฉัน')
    expect(view.textContent).toContain('ชื่อแสดงผล')
    expect(view.textContent).toContain('ชื่อจริง')
    expect(view.textContent).toContain('ความสามารถด้านต่าง ๆ')
    expect(view.textContent).toContain('Google / Gmail')
    expect(view.textContent).toContain('ไม่อ่าน Gmail หรือข้อความ LINE')
    expect((win.document.getElementById('profileBio') as HTMLTextAreaElement).value).toContain('<img')
    expect(view.querySelector('img[src=x]')).toBeNull()
    expect(win.document.querySelector('[data-act="nav:users"]')).toBeNull()
    expect(win.document.querySelector('[data-connection="line"]:disabled')).toBeTruthy()
    vm.runInContext('Remote.connections.line.linked=true',ctx); route('profile')
    expect(view.textContent).toContain('การเข้าสู่ระบบปิดอยู่')
    expect(win.document.querySelector('[data-connection="line"][data-mode="unlink"]:not(:disabled)')).toBeTruthy()
    vm.runInContext('Remote.connections.line.linked=false',ctx)
    route('users'); await pause()
    expect(view.textContent).toContain('คุณไม่มีสิทธิ์จัดการผู้ใช้')
    expect(requests.some(r=>r.url==='/api/users')).toBe(false)
    vm.runInContext("Remote.user.role='manager'; Store.data.user.role='manager';",ctx)
    route('users'); await pause()
    expect(view.textContent).toContain('คุณไม่มีสิทธิ์จัดการผู้ใช้')
    expect(requests.some(r=>r.url==='/api/users')).toBe(false)
    vm.runInContext("openTeamForm({id:'u2',name:'สมาชิก',authUserId:2,authRole:'user',skills:[]})",ctx)
    expect(win.document.getElementById('tmAuthRole')).toBeNull()
    expect(win.document.getElementById('modalRoot').textContent).toContain('ผู้ดูแลจัดการสิทธิ์ได้จากหน้า ผู้ใช้และสิทธิ์')
    vm.runInContext('closeModal()',ctx)
  })

  it('keeps the separate Admin list, actions and profile navigation', async () => {
    vm.runInContext("Remote.user={authId:1,name:'Admin',email:'admin@example.test',role:'admin'};Store.data.user={name:'Admin',email:'admin@example.test',role:'admin'};delete Store.data.authUsers;",ctx)
    route('users'); await pause()
    const view=win.document.getElementById('view')
    expect(view.textContent).toContain('ผู้ใช้และสิทธิ์')
    expect(view.textContent).toContain('สมาชิก')
    expect(view.querySelector('[data-act="user-new"]')).toBeTruthy()
    expect(view.querySelector('[data-act="user-edit"]')).toBeTruthy()
    expect(win.document.querySelector('[data-act="nav:profile"]')).toBeTruthy()
    expect(requests.some(r=>r.url==='/api/users')).toBe(true)
    ;(view.querySelector('[data-act="user-connections"][data-id="2"]') as HTMLButtonElement).click(); await pause()
    expect(win.document.getElementById('modalRoot').textContent).toContain('ออกจาก session เว็บทั้งหมด')
    ;(win.document.getElementById('adminConnectionPassword') as HTMLInputElement).value='test-password'
    ;(win.document.querySelector('[data-admin-unlink="google"]') as HTMLButtonElement).click(); await pause()
    expect(requests.some(r=>r.url==='/api/users/2/connections/google' && r.method==='DELETE' && r.body.password==='test-password')).toBe(true)
    route('profile')
    expect(win.document.getElementById('view').textContent).toContain('ชื่อจริง')
  })

  it('saves skills and biography via the API and leaves unsaved input intact on failure', async () => {
    route('profile'); await pause(); requests=[]
    const bio=win.document.getElementById('profileBio') as HTMLTextAreaElement
    const skills=win.document.getElementById('profileSkills') as HTMLTextAreaElement
    bio.value='ทำงานด้านการตลาด'; skills.value='Design, การสื่อสาร\nUX'
    failDetails=true
    win.document.getElementById('profileDetailsForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}))
    await pause()
    expect((win.document.getElementById('profileBio') as HTMLTextAreaElement).value).toBe('ทำงานด้านการตลาด')
    expect(vm.runInContext('Remote.profile.biography',ctx)).not.toBe('ทำงานด้านการตลาด')
    failDetails=false
    win.document.getElementById('profileDetailsForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}))
    await pause()
    const sent=requests.filter(r=>r.url==='/api/users/me/profile' && r.method==='PUT').at(-1)
    expect(sent.body.skills).toEqual(['Design','การสื่อสาร','UX'])
    expect(vm.runInContext('Remote.profile.biography',ctx)).toBe('ทำงานด้านการตลาด')
    vm.runInContext('Store.save()',ctx)
    expect(win.localStorage.getItem('mng_erp_v2') || '').not.toContain('ทำงานด้านการตลาด')
  })

  it('requires ERP password before opening a connection and never enables unconfigured LINE', async () => {
    route('profile')
    ;(win.document.querySelector('[data-connection="google"]') as HTMLButtonElement).click()
    expect(win.document.getElementById('modalRoot').textContent).toContain('รหัสผ่าน ERP ปัจจุบัน')
    expect(win.document.getElementById('modalRoot').textContent).toContain('ไม่ให้สิทธิ์อ่านอีเมลหรือข้อความ')
    requests=[]; (win.document.getElementById('connectionConfirm') as HTMLButtonElement).click(); await pause()
    expect(requests.some(r=>r.url.includes('/connections/google/start'))).toBe(false)
    vm.runInContext('closeModal()',ctx)
  })

  it('renders login provider buttons but only enables configured services', async () => {
    vm.runInContext("Remote.on=false; Remote.token=null; App.showLogin();",ctx)
    await pause()
    expect((win.document.getElementById('loginGoogle') as HTMLButtonElement).disabled).toBe(false)
    expect((win.document.getElementById('loginLine') as HTMLButtonElement).disabled).toBe(true)
    expect(win.document.querySelector('.login-social-hint').textContent).toContain('ผูกบัญชีในโปรไฟล์ก่อน')
    expect(win.document.getElementById('lgDemo')).toBeNull()
  })
})
