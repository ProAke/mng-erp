import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const root = path.resolve(__dirname, '..')
const tick = () => new Promise(resolve => setTimeout(resolve, 60))
const snapshot = {
  date:'2026-12-01', time:'10:15', timezone:'Asia/Bangkok', generatedAt:'2026-12-01T03:15:00.000Z',
  team:[
    {id:'u1',name:'ออฟฟิศ',nickname:'หนึ่ง',department:' Creative ',role:'Designer',color:'#6C5CE7'},
    {id:'u2',name:'ทำงานที่บ้าน',nickname:'สอง',department:'creative',role:'Designer',color:'#22C793'},
    {id:'u3',name:'ออกแล้ว',department:'Development',role:'Dev',color:'#3BA7FF'},
    {id:'u4',name:'<img src=x onerror=window.__xss=1>',department:'',presence:'working',color:'red;display:none'},
    {id:'u5',name:'ข้อมูลไม่ครบ',department:'Development',color:'#F25C8B'},
    {id:'u6',name:'เช็กอินเมื่อวาน',department:'Development',color:'#3BA7FF'},
    {id:'u7',name:'เช็กอินเวลาล่วงหน้า',department:'Development',color:'#3BA7FF'},
    {id:'u8',name:'เวลาไม่ถูกต้อง',department:'Development',color:'#3BA7FF'},
    {id:'u9',name:'เวลาออกก่อนเวลาเข้า',department:'Development',color:'#3BA7FF'},
  ],
  checkins:[
    {id:'ck3',memberId:'u3',date:'2026-12-01',clockIn:'08:00',clockOut:'',mode:'office'},
    {id:'ck1',memberId:'u1',date:'2026-12-01',clockIn:'09:00',clockOut:'',mode:'office'},
    {id:'ck2',memberId:'u2',date:'2026-12-01',clockIn:'09:10',clockOut:'',mode:'wfh'},
    {id:'ck9',memberId:'u3',date:'2026-12-01',clockIn:'08:00',clockOut:'10:00',mode:'office'},
    {id:'ck10',memberId:'u5',date:'2026-12-01',clockIn:'09:00',clockOut:'',mode:'other'},
    {id:'ck11',memberId:'u6',date:'2026-11-30',clockIn:'09:00',clockOut:'',mode:'office'},
    {id:'ck12',memberId:'u7',date:'2026-12-01',clockIn:'10:16',clockOut:'',mode:'office'},
    {id:'ck13',memberId:'u8',date:'2026-12-01',clockIn:'nope',clockOut:'',mode:'wfh'},
    {id:'ck14',memberId:'u9',date:'2026-12-01',clockIn:'10:00',clockOut:'09:00',mode:'office'},
  ],
  events:[
    {id:'e1',cat:'meeting',date:'2026-12-01',title:'ประชุม <img src=x onerror=window.__xss=2>',start:'10:00',end:'11:00',loc:'https://meet.google.com/abc-defg-hij',members:['u1','u2','u99','u1']},
    {id:'e2',cat:'meeting',date:'2026-12-01',title:'นัดถัดไป',start:'13:00',end:'14:00',loc:'https://evil.example/meeting',members:['u1']},
    {id:'e3',cat:'meeting',date:'2026-12-01',title:'นัดจบตามกำหนด',start:'09:00',end:'10:15',members:[]},
    {id:'e4',cat:'meeting',date:'2026-12-01',title:'ประชุมตลอดวัน',allday:true,start:'00:00',end:'23:59',members:['u1']},
    {id:'e5',cat:'meeting',date:'2026-12-01',title:'เวลาไม่ถูกต้อง',start:'14:00',end:'13:00',members:['u1']},
    {id:'e6',cat:'deadline',date:'2026-12-01',title:'ไม่ใช่ประชุม',start:'10:00',end:'11:00',members:['u1']},
  ],
}

describe('3D Office — สถานที่จากเช็กอินและรายชื่อเชิญจากปฏิทิน', () => {
  let dom: JSDOM, win: any, ctx: any
  const el = (s: string) => win.document.querySelector(s) as any
  const click = (s: string) => { const node = el(s); expect(node, `missing ${s}`).toBeTruthy(); node.click() }

  beforeAll(async () => {
    dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
      url:'http://localhost:8080/#/dashboard', runScripts:'outside-only', pretendToBeVisual:true,
    })
    win = dom.window
    win.fetch = async () => ({ok:true,status:200,json:async()=>({ok:true,auth:false,work:false,demo:true})})
    win.scrollTo = () => {}
    win.HTMLElement.prototype.scrollIntoView = () => {}
    win.__snapshot = snapshot
    win.__xss = 0
    ctx = dom.getInternalVMContext()
    for (const rel of ['assets/js/data.js','assets/js/ui.js','assets/js/views.js','assets/js/agency-os.js','assets/js/project-plan.js','assets/js/project-flow.js','assets/js/flow-operations.js','assets/js/office.js','assets/js/app.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, {filename:rel})
    }
    await tick()
  })
  afterAll(() => { vm.runInContext('Office3D.destroy()', ctx); dom.window.close() })

  it('uses the latest record for today, never infers location from presence or department from job title', () => {
    const result = JSON.parse(vm.runInContext(`JSON.stringify((()=>{const m=Office3D.buildModel(window.__snapshot);return {
      office:m.office.map(p=>p.id),wfh:m.wfh.map(p=>p.id),other:m.other.map(p=>[p.id,p.status]),
      groups:m.groups.map(g=>[g.name,g.members.length,g.office.length,g.wfh.length]),
      active:m.activeMeetings.map(m=>[m.event.id,m.invitees.length]),otherMeetings:m.otherMeetings.map(m=>[m.event.id,m.state])
    }})())`,ctx))
    expect(result.office).toEqual(['u1'])
    expect(result.wfh).toEqual(['u2'])
    expect(result.other).toEqual([['u3','out'],['u4','none'],['u5','unknown'],['u6','none'],['u7','unknown'],['u8','unknown'],['u9','unknown']])
    expect(result.groups).toContainEqual(['Creative',2,1,1])
    expect(result.groups).toContainEqual(['ยังไม่ระบุแผนก',1,0,0])
    expect(result.active).toEqual([['e1',3]])
    expect(result.otherMeetings).toEqual([['e2','upcoming'],['e3','ended'],['e4','allday'],['e5','invalid']])
    expect(vm.runInContext("Office3D.meetingState({start:'10:15',end:'11:00'},'10:15')",ctx)).toBe('scheduled')
    expect(vm.runInContext("Office3D.meetingState({start:'10:15',end:'11:00'},'11:00')",ctx)).toBe('ended')
    expect(vm.runInContext("Office3D.meetingState({start:'24:00',end:'25:00'},'10:00')",ctx)).toBe('invalid')
  })

  it('opens only safe HTTPS Meet/Zoom links and rejects deceptive or credential-bearing URLs', () => {
    for (const url of [
      'javascript:alert(1)','http://meet.google.com/abc','https://meet.google.com.attacker.test/a',
      'https://zoom.us.attacker.test/a','https://evil.test/?https://meet.google.com/a',
      'https://name:password@zoom.us/j/1','https://zoom.us:8443/j/1',
    ]) expect(vm.runInContext(`Office3D.meetingUrl(${JSON.stringify(url)})`,ctx)).toBe('')
    expect(vm.runInContext(`Office3D.meetingUrl('เข้าประชุม https://meet.google.com/abc-defg-hij')`,ctx)).toBe('https://meet.google.com/abc-defg-hij')
    expect(vm.runInContext(`Office3D.meetingUrl('https://company.zoom.us/j/123?pwd=hello')`,ctx)).toBe('https://company.zoom.us/j/123?pwd=hello')
  })

  it('renders accurate filtered office, home and invitee tiles safely, with a WebGL fallback', async () => {
    vm.runInContext(`Remote.on=true; window.__mode='ok'; Remote.req=async (p)=>{if(window.__mode==='fail') throw Error('unavailable');return window.__snapshot}; location.hash='#/office'`,ctx)
    await tick(); await tick()
    expect(el('#rail').textContent).toContain('ออฟฟิศ')
    expect(el('#view').textContent).toContain('ข้อมูล ณ 1 ธ.ค. 2569 10:15')
    expect(el('.office-stats').textContent).toContain('1 คน')
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(1)
    expect(win.document.querySelectorAll('.office-home-card')).toHaveLength(1)
    expect(win.document.querySelectorAll('.office-meeting-tile')).toHaveLength(3)
    expect(el('.office-meeting-card').textContent).toContain('ไม่ยืนยันว่าเข้าร่วมแล้ว')
    expect(el('.office-meeting-no-link')).toBeNull()
    const join = el('.office-meeting-join')
    expect(join.href).toBe('https://meet.google.com/abc-defg-hij')
    expect(join.target).toBe('_blank')
    expect(join.rel).toContain('noopener')
    expect(el('.office-upcoming a')).toBeNull()
    expect(el('#view img')).toBeNull()
    expect(win.__xss).toBe(0)
    expect(el('#view').textContent).toContain('<img src=x onerror=window.__xss=2>')
    expect(el('#officeSceneMessage').classList.contains('is-fallback')).toBe(true)
    expect(el('#view').textContent).toContain('ลงเวลาออกแล้ว')
    expect(el('#view').textContent).toContain('ข้อมูลไม่ครบ / เวลาหรือสถานที่ไม่ถูกต้อง')
    const devIndex = vm.runInContext("Office3D.buildModel(window.__snapshot).groups.find(g=>g.name==='Development').index",ctx)
    click(`[data-office-dept="${devIndex}"]`)
    await tick()
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(0)
    expect(win.document.querySelectorAll('.office-home-card')).toHaveLength(0)
    expect(win.document.querySelectorAll('.office-meeting-tile')).toHaveLength(3)
    click('[data-office-all]')
  })

  it('re-evaluates future-dated check-ins when the snapshot clock advances even if rows did not change', async () => {
    vm.runInContext(`window.__snapshot.time='10:16'; Office3D.refresh()`,ctx)
    await tick()
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(2)
    expect(win.document.querySelectorAll('.office-meeting-tile')).toHaveLength(3)
    vm.runInContext(`window.__snapshot.time='10:15'; Office3D.refresh()`,ctx)
    await tick()
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(1)
  })

  it('shows a stale warning or a hard error on API failures instead of replacing real data with demo people', async () => {
    vm.runInContext(`window.__mode='fail'; Office3D.refresh()`,ctx)
    await tick()
    expect(el('.office-warning').textContent).toContain('อาจไม่เป็นปัจจุบัน')
    expect(el('#officeSyncText').textContent).toContain('10:15')
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(1)
    vm.runInContext(`Office3D.destroy(); renderOffice()`,ctx)
    await tick()
    expect(el('.office-error').textContent).toContain('ยังโหลดข้อมูลออฟฟิศไม่ได้')
    expect(el('.office-stats')).toBeNull()
    expect(el('#view').textContent).not.toContain('Worapot')
    vm.runInContext(`window.__mode='ok'; Office3D.refresh()`,ctx)
    await tick()
    expect(el('.office-error')).toBeNull()
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(1)
  })

  it('marks the last snapshot stale if an API request hangs and stops the pending request timer', async () => {
    vm.runInContext(`Office3D.requestTimeoutMs=20; Remote.req=()=>new Promise(()=>{}); Office3D.refresh()`,ctx)
    await tick()
    expect(el('.office-warning').textContent).toContain('อาจไม่เป็นปัจจุบัน')
    expect(vm.runInContext('Office3D.loading',ctx)).toBe(false)
    expect(vm.runInContext('Office3D.requestTimer',ctx)).toBeNull()
    vm.runInContext('Office3D.requestTimeoutMs=12000',ctx)
  })

  it('never relabels a previous demo snapshot as real data after a connection mode change', async () => {
    vm.runInContext(`Office3D.destroy(); Remote.on=false; renderOffice()`,ctx)
    await tick()
    expect(el('#officeSyncText').textContent).toContain('สาธิต/ออฟไลน์')
    expect(el('.office-offline-notice').textContent).toContain('อาจเป็นข้อมูลตัวอย่างหรือข้อมูลเก่า')
    vm.runInContext(`Remote.on=true; Remote.req=async()=>{throw Error('offline')}; Office3D.refresh()`,ctx)
    await tick()
    expect(el('.office-error')).toBeTruthy()
    expect(el('.office-stats')).toBeNull()
  })

  it('cleans up the scene, timer and pending data when leaving the route', async () => {
    vm.runInContext(`Remote.req=()=>new Promise(resolve=>window.__resolveOffice=resolve); Office3D.refresh()`,ctx)
    await tick()
    vm.runInContext(`location.hash='#/dashboard'`,ctx)
    await tick()
    win.__resolveOffice(snapshot)
    await tick()
    expect(vm.runInContext('Office3D.active',ctx)).toBe(false)
    expect(vm.runInContext('Office3D.timer',ctx)).toBeNull()
    expect(el('#officeStage')).toBeNull()
  })

  it('shows and clears the fallback when a WebGL context is lost and restored', async () => {
    vm.runInContext(`
      Office3D.destroy(); Remote.on=true; Remote.req=async()=>window.__snapshot;
      Office3D.modulePromise=Promise.resolve({createOfficeScene(options){
        window.__officeSceneCallbacks=options;
        return {dispose(){},zoom(){},turn(){},reset(){}};
      }});
      renderOffice();
    `,ctx)
    await tick()
    expect(el('#officeSceneMessage').style.display).toBe('none')
    win.__officeSceneCallbacks.onUnavailable()
    expect(el('#officeSceneMessage').textContent).toContain('ดูรายชื่อและแผนกได้')
    expect(el('#officeStage').classList.contains('is-fallback')).toBe(true)
    win.__officeSceneCallbacks.onRestored()
    expect(el('#officeSceneMessage').style.display).toBe('none')
    expect(el('#officeStage').classList.contains('is-fallback')).toBe(false)
    vm.runInContext('Office3D.destroy(); Office3D.modulePromise=null',ctx)
  })

  it('keeps the shell usable and reports a missing Office script', async () => {
    win.__savedRenderOffice=vm.runInContext('renderOffice',ctx)
    vm.runInContext(`renderOffice=undefined; location.hash='#/office'; App.route()`,ctx)
    expect(el('#view').textContent).toContain('ไม่สามารถโหลดหน้าออฟฟิศได้')
    vm.runInContext(`renderOffice=window.__savedRenderOffice; location.hash='#/dashboard'; App.route()`,ctx)
    await tick()
  })

  it('allows department editing in demo without changing the job role', async () => {
    vm.runInContext(`Remote.on=false; openTeamForm(Store.data.team[0])`,ctx)
    el('#tmDepartment').value='  Design Team  '
    const oldRole=el('#tmRole').value
    click('#tmSave')
    await tick()
    expect(vm.runInContext('Store.data.team[0].department',ctx)).toBe('Design Team')
    expect(vm.runInContext('Store.data.team[0].role',ctx)).toBe(oldRole)
    expect(JSON.parse(win.localStorage.getItem('mng_erp_v2')).team[0].department).toBe('Design Team')
  })

  it('keeps the previous clock-out and shows a new same-day WFH check-in in demo', async () => {
    vm.runInContext(`
      Remote.on=false;
      Store.data.checkins=[{id:'ck9',memberId:meMember().id,date:todayS(),clockIn:'00:00',clockOut:'00:00',mode:'office'}];
      location.hash='#/hr'; App.route();
    `,ctx)
    expect(el('[data-hr-reclock="wfh"]')).toBeTruthy()
    expect(el('.hr-mobile-side [data-hr-reclock="wfh"]')).toBeTruthy()
    click('.hr-mobile-side [data-hrflt="wfh"]')
    expect(vm.runInContext('Store.ui.hrFilter',ctx)).toBe('wfh')
    await vm.runInContext(`doClockIn('wfh')`,ctx)
    const rows = () => JSON.parse(vm.runInContext(`JSON.stringify(Store.data.checkins.filter(c=>c.memberId===meMember().id && c.date===todayS()))`,ctx))
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toMatchObject({mode:'wfh',clockOut:''})
    expect(rows()[1]).toMatchObject({id:'ck9',mode:'office',clockIn:'00:00',clockOut:'00:00'})
    expect(el('[data-hr-reclock="wfh"]')).toBeNull()
    vm.runInContext(`location.hash='#/office'; App.route()`,ctx)
    await tick()
    expect(win.document.querySelectorAll('.office-person')).toHaveLength(0)
    expect(win.document.querySelectorAll('.office-home-card')).toHaveLength(1)
    expect(el('.office-home-card').textContent).toContain(vm.runInContext('meMember().name',ctx))
    vm.runInContext(`location.hash='#/dashboard'; App.route()`,ctx)
    expect(el('#side').textContent).toContain(`เช็กอิน (1/${vm.runInContext('Store.data.team.length',ctx)})`)
    vm.runInContext(`location.hash='#/hr'; App.route()`,ctx)
    await vm.runInContext('doClockOut()',ctx)
    expect(rows()[0].clockOut).toMatch(/^\d{2}:\d{2}$/)
    expect(rows()[1].clockOut).toBe('00:00')
    expect(JSON.parse(win.localStorage.getItem('mng_erp_v2')).checkins).toHaveLength(2)
  })
})
