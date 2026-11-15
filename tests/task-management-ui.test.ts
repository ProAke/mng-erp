import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const root = path.resolve(__dirname, '..')
const tick = () => new Promise(resolve=>setTimeout(resolve,35))
const snapshot = () => ({
  ok:true,generatedAt:'2026-10-10T03:00:00.000Z',date:'2026-10-10',timezone:'Asia/Bangkok',
  projects:[
    {id:'p1',code:'MAIN',name:'โครงการหลัก',start:'2026-10-01',end:'2026-10-30',status:'doing',color:'#6c5ce7',members:['u1']},
    {id:'p2',code:'SUB',name:'โครงการย่อย',start:'2026-10-01',end:'2026-10-25',status:'doing',color:'#3ba7ff',members:['u2']},
    {id:'p3',code:'EMPTY',name:'ไม่มีวันที่',start:null,end:null,status:'doing',color:'#ffffff',members:[]},
  ],
  tasks:[
    {id:'t1',project:'p1',code:'MAIN-101',title:'<img src=x onerror=window.__xss=1>',start:'2026-10-01',due:'2026-10-20',status:'doing',progress:50,assignee:'u1',subtasks:[{t:'เตรียมงาน',d:true}]},
    {id:'t2',project:'p2',code:'SUB-102',title:'ทดสอบระบบ',start:'2026-10-04',due:'2026-10-21',status:'doing',progress:40,assignee:'u2',subtasks:[],aiAgentId:'ai1'},
    {id:'t3',project:'p3',code:'EMPTY-103',title:'ยังไม่ระบุวัน',start:null,due:null,status:'todo',progress:0,assignee:null,subtasks:[]},
  ],
  team:[{id:'u1',name:'เอก ทีมหลัก',role:'PM',color:'#6c5ce7'}, {id:'u2',name:'นุ่น ทีมพัฒนา',role:'Dev',color:'red\" onmouseover=\"window.__xss=2'}],
  aiAgents:[{id:'ai1',code:'BOT',name:'Bot'}], links:[{childId:'p2',parentId:'p1'}],
  issues:[{id:'ti1',taskId:'t2',description:'<img src=x onerror=window.__xss=3>',status:'open',revision:1,createdBy:'ผู้ทดสอบ',createdAt:'2026-10-10 09:00:00',events:[]}],
})

describe('Task Management UI — project line, team and issue history', () => {
  let dom: JSDOM, win:any, ctx:any
  const el = (s:string) => win.document.querySelector(s) as any
  const click = (s:string) => { const node=el(s); expect(node,`missing ${s}`).toBeTruthy(); node.click() }
  const val = (s:string,v:string,event='input') => { const node=el(s); expect(node,`missing ${s}`).toBeTruthy(); node.value=v; node.dispatchEvent(new win.Event(event,{bubbles:true})) }

  beforeAll(async () => {
    dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {url:'http://localhost:8080/#/dashboard',runScripts:'outside-only',pretendToBeVisual:true})
    win=dom.window; win.__xss=0; win.__snapshot=snapshot(); win.__calls=[]; win.__fail=false
    win.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,auth:false,work:false,demo:true})})
    win.scrollTo=()=>{}; win.HTMLElement.prototype.scrollIntoView=()=>{}
    ctx=dom.getInternalVMContext()
    for (const rel of ['assets/js/bangkok-time.js','assets/js/data.js','assets/js/ui.js','assets/js/views.js','assets/js/agency-os.js','assets/js/project-plan.js','assets/js/project-flow.js','assets/js/flow-operations.js','assets/js/office.js','assets/js/profile.js','assets/js/text-speed.js','assets/js/task-management-model.js','assets/js/task-management.js','assets/js/app.js']) {
      vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel})
    }
    await tick()
    vm.runInContext(`Remote.on=true;Remote.token='manager-session';Remote.user={role:'manager',name:'Manager'};
      Remote.req=async (url,opts={})=>{
        window.__calls.push({url,body:opts.body});
        if(window.__fail) throw Error('offline');
        if(url==='/task-management/snapshot') return JSON.parse(JSON.stringify(window.__snapshot));
        if(url.includes('/parent')) { const childId=url.split('/')[3]; window.__snapshot.links=window.__snapshot.links.filter(x=>x.childId!==childId); if(opts.body.parentId)window.__snapshot.links.push({childId,parentId:opts.body.parentId}); return {ok:true}; }
        if(url==='/task-management/issues') {window.__snapshot.issues.push({id:'ti2',...opts.body,status:'open',revision:1,createdBy:'Manager',createdAt:'2026-10-10 10:00:00',events:[]});return {ok:true,id:'ti2'};}
        if(url==='/task-management/issues/ti2/updates') {const i=window.__snapshot.issues.find(x=>x.id==='ti2');i.events.push({type:opts.body.action,note:opts.body.note,actor:'Manager',at:'2026-10-10 10:05:00'});i.revision++;i.status=opts.body.action==='resolve'?'resolved':'open';return {ok:true};}
        return {ok:true};
      };
      location.hash='#/task-management';App.route();`,ctx)
    await tick(); await tick()
  })
  afterAll(() => { vm.runInContext('TaskManagement.destroy(); App.stopClock(); TextSpeed.destroy()',ctx); dom.window.close() })

  it('has a separate menu, real project hierarchy and task lines with the correct team without injecting HTML', () => {
    expect(el('#rail').textContent).toContain('ไทม์ไลน์')
    expect(el('#view').textContent).toContain('โปรเจกต์หลัก')
    expect(el('#view').textContent).toContain('โปรเจกต์ย่อย')
    expect(el('#view').textContent).toContain('MAIN')
    expect(el('#view').textContent).toContain('SUB-102')
    expect(el('[data-tm-task="t2"].tm-task-bar .tm-avatar').getAttribute('title')).toBe('นุ่น ทีมพัฒนา')
    expect(el('#view').textContent).toContain('เสี่ยงไม่ทัน')
    expect(el('#view').textContent).toContain('ไม่มีวันที่')
    expect(el('#view .tm-undated').textContent).toContain('ไม่ระบุวันที่')
    expect(el('#view img')).toBeNull()
    expect(win.__xss).toBe(0)
    expect(el('#view').textContent).toContain('<img src=x onerror=window.__xss=1>')
    expect(el('#view').textContent).toContain('<img src=x onerror=window.__xss=3>')
  })

  it('filters by code, assigned person and forecast without hiding a matching child’s parent', () => {
    val('#tmSearch','SUB-102')
    expect(el('#tmTimeline').textContent).toContain('SUB-102')
    expect(el('#tmTimeline').textContent).toContain('MAIN')
    expect(el('#tmTimeline').textContent).not.toContain('EMPTY-103')
    val('#tmSearch','')
    val('#tmTeam','u2','change')
    expect(el('#tmTimeline').textContent).toContain('SUB-102')
    expect(el('#tmTimeline').textContent).not.toContain('MAIN-101')
    val('#tmTeam','','change')
    val('#tmForecast','unknown','change')
    expect(el('#tmTimeline').textContent).toContain('EMPTY')
    expect(el('#tmTimeline').textContent).not.toContain('SUB-102')
    val('#tmForecast','','change')
  })

  it('navigates the time window and expands and collapses without inventing dates', () => {
    const before=el('#tmPeriod').textContent
    click('[data-tm-action="next"]')
    expect(el('#tmPeriod').textContent).not.toBe(before)
    click('[data-tm-action="today"]')
    expect(el('#tmPeriod').textContent).toBe(before)
    click('[data-tm-fold="p1"]')
    expect(el('#tmTimeline').textContent).not.toContain('SUB-102')
    click('[data-tm-fold="p1"]')
    expect(el('#tmTimeline').textContent).toContain('SUB-102')
  })

  it('lets managers organize projects without offering the current project or descendants as a parent', async () => {
    click('[data-tm-link="p1"]')
    expect(el('#tmParentSelect option[value="p1"]')).toBeNull()
    expect(el('#tmParentSelect option[value="p2"]')).toBeNull()
    val('#tmParentSelect','p3','change'); click('#tmSaveParent'); await tick(); await tick()
    expect(win.__snapshot.links).toContainEqual({childId:'p1',parentId:'p3'})
    expect(win.__calls.some((c:any)=>c.url==='/task-management/projects/p1/parent' && c.body.parentId==='p3')).toBe(true)
    click('[data-tm-link="p1"]'); val('#tmParentSelect','','change'); click('#tmSaveParent'); await tick(); await tick()
  })

  it('records an issue and appends a resolution with a revision, showing history and the updated snapshot', async () => {
    click('[data-tm-task="t2"]')
    expect(el('#modalRoot').textContent).toContain('นุ่น ทีมพัฒนา')
    expect(el('#modalRoot img')).toBeNull()
    val('#tmNewIssue','รอสิทธิ์ระบบ'); click('#tmAddIssue'); await tick(); await tick()
    expect(win.__snapshot.issues.find((i:any)=>i.id==='ti2').description).toBe('รอสิทธิ์ระบบ')
    val('[data-tm-note="ti2"]','ได้รับสิทธิ์และทดสอบแล้ว')
    val('[data-tm-update-action="ti2"]','resolve','change')
    click('[data-tm-save-update="ti2"]'); await tick(); await tick()
    expect(win.__calls.some((c:any)=>c.url==='/task-management/issues/ti2/updates' && c.body.revision===1 && c.body.action==='resolve')).toBe(true)
    expect(el('#modalRoot').textContent).toContain('ได้รับสิทธิ์และทดสอบแล้ว')
    expect(el('#modalRoot').textContent).toContain('แก้ไขแล้ว')
    expect(win.__xss).toBe(0)
    vm.runInContext('closeModal()',ctx)
  })

  it('shows a stale warning and disables editing on failure, never replacing real data with demo', async () => {
    vm.runInContext(`window.__fail=true;TaskManagement.load()`,ctx); await tick()
    expect(el('.tm-alert').textContent).toContain('อาจไม่เป็นปัจจุบัน')
    expect(el('[data-tm-link="p1"]')).toBeNull()
    click('[data-tm-task="t2"]')
    expect(el('#tmAddIssue')).toBeNull()
    expect(el('#modalRoot').textContent).toContain('กรุณาอัปเดตก่อนแก้ไข')
    vm.runInContext('closeModal(); TaskManagement.destroy(); renderTaskManagement()',ctx); await tick()
    expect(el('.tm-loading').textContent).toContain('ยังโหลด Task Management ไม่ได้')
    expect(el('#view').textContent).not.toContain('Worapot')
    vm.runInContext('window.__fail=false;TaskManagement.load()',ctx); await tick()
  })

  it('makes Viewer read-only, discards pending responses when navigating away, and labels offline data', async () => {
    vm.runInContext(`Remote.user.role='viewer';App.route()`,ctx); await tick()
    expect(el('[data-tm-link="p1"]')).toBeNull()
    click('[data-tm-task="t2"]'); expect(el('#tmAddIssue')).toBeNull(); expect(el('#modalRoot').textContent).toContain('Viewer')
    vm.runInContext(`closeModal();Remote.req=()=>new Promise(resolve=>window.__finish=resolve);TaskManagement.load()`,ctx); await tick()
    vm.runInContext(`location.hash='#/dashboard';App.route()`,ctx); await tick()
    win.__finish(win.__snapshot); await tick()
    expect(vm.runInContext('TaskManagement.active',ctx)).toBe(false)
    expect(el('#tmTimeline')).toBeNull()
    vm.runInContext(`Remote.on=false;location.hash='#/task-management';App.route()`,ctx); await tick()
    expect(el('.tm-demo-note').textContent).toContain('เฉพาะในเบราว์เซอร์')
  })
})
