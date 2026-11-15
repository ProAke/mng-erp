import { describe, expect, it } from 'vitest'

const model = require('../assets/js/task-management-model')
const copy = (v: any) => JSON.parse(JSON.stringify(v))
const today = '2026-10-10'
const base = () => ({
  projects:[
    {id:'p1',code:'MAIN',name:'โครงการหลัก',start:'2026-10-01',end:'2026-10-30',status:'doing'},
    {id:'p2',code:'SUB',name:'โครงการย่อย',start:'2026-10-01',end:'2026-10-25',status:'doing'},
  ],
  links:[{childId:'p2',parentId:'p1'}],
  tasks:[
    {id:'t1',project:'p1',code:'MAIN-1',start:'2026-10-01',due:'2026-10-20',status:'doing',progress:50,assignee:'u1'},
    {id:'t2',project:'p2',code:'SUB-2',start:'2026-10-01',due:'2026-10-22',status:'doing',progress:50,assignee:'u2'},
  ],
  issues:[],
})
const forecast = (data: any, id='p1') => model.build(data, today).nodes.get(id).forecast

describe('Task Management — calendar, project tree and cautious forecasting', () => {
  it('uses civil dates without timezone drift, rejects invalid dates, clips bars and keeps missing dates missing', () => {
    expect(model.day('2026-02-30')).toBeNull()
    expect(model.day('')).toBeNull()
    expect(model.move('2024-02-28',2)).toBe('2024-03-01')
    expect(model.monday('2026-10-11')).toBe('2026-10-05')
    expect(model.span(null,null,'2026-10-01',56)).toEqual({kind:'missing'})
    expect(model.span('2026-10-03',null,'2026-10-01',56)).toMatchObject({kind:'point',point:'start',left:2})
    expect(model.span(null,'2026-10-04','2026-10-01',56)).toMatchObject({kind:'point',point:'due',left:3})
    expect(model.span('2026-10-06','2026-10-02','2026-10-01',56)).toEqual({kind:'invalid'})
    expect(model.span('2026-09-28','2026-10-04','2026-10-01',56)).toMatchObject({kind:'bar',left:0,width:4,clippedBefore:true})
    expect(model.span('2027-01-01','2027-01-03','2026-10-01',56)).toEqual({kind:'outside',side:'after'})
  })

  it('rolls up direct and nested tasks with equal weight, not guessed project percentages', () => {
    const data=base(), tree=model.build(data,today)
    expect(tree.roots.map((n: any)=>n.project.id)).toEqual(['p1'])
    expect(tree.roots[0].children[0].project.id).toBe('p2')
    expect(forecast(data)).toMatchObject({kind:'ontrack',taskCount:2,openCount:2,progress:50,predictedDate:'2026-10-20'})
    data.tasks[1].progress=0
    expect(forecast(data)).toMatchObject({kind:'risk',progress:25,predictedDate:'2026-11-09'})
  })

  it('reports open issues, old blockers, overdue work, missing owners and child deadlines as risks', () => {
    const data=base()
    data.issues.push({id:'ti1',taskId:'t2',status:'open'} as never)
    expect(forecast(data)).toMatchObject({kind:'risk',openIssues:1})
    data.issues[0].status='resolved'
    expect(forecast(data).kind).toBe('ontrack')
    ;(data.tasks[1] as any).legacyBlocked=true
    expect(forecast(data)).toMatchObject({kind:'risk',legacyBlocks:1})
    delete (data.tasks[1] as any).legacyBlocked
    data.tasks[1].due='2026-10-09'
    expect(forecast(data)).toMatchObject({kind:'risk',lateTasks:1})
    data.tasks[1].due='2026-10-22'; data.tasks[1].assignee=''
    expect(forecast(data)).toMatchObject({kind:'risk',unassigned:1})
    data.tasks[1].assignee='u2'; data.projects[1].end='2026-11-05'
    expect(forecast(data)).toMatchObject({kind:'risk',reason:expect.stringContaining('โปรเจกต์ย่อย')})
    data.projects[0].end='2026-10-09'
    expect(forecast(data).kind).toBe('late')
  })

  it('does not pretend unknown dates or zero progress imply an on-time prediction', () => {
    const data=base()
    data.projects[0].end=''
    data.issues.push({id:'ti1',taskId:'t1',status:'open'} as never)
    expect(forecast(data)).toMatchObject({kind:'unknown',openIssues:1,predictedDate:null})
    data.projects[0].end='2026-10-30'; data.issues=[]
    data.tasks[0].start=''
    expect(forecast(data)).toMatchObject({kind:'unknown',predictedDate:null})
    data.tasks[0].start='2026-10-01'; data.tasks.forEach(t=>t.progress=0)
    expect(forecast(data)).toMatchObject({kind:'unknown',predictedDate:null})
    data.tasks[0].progress=100; data.tasks[1].progress=100
    expect(forecast(data)).toMatchObject({kind:'unknown',reason:expect.stringContaining('100%')})
    data.tasks=[]
    expect(forecast(data)).toMatchObject({kind:'unknown',taskCount:0})
  })

  it('never calls completed tasks on-time without actual completion dates and does not hide unresolved issues', () => {
    const data=base(); data.tasks.forEach(t=>{t.status='done';t.progress=100})
    expect(forecast(data)).toMatchObject({kind:'completed',predictedDate:null,reason:expect.stringContaining('ไม่มีวันที่ส่งจริง')})
    data.issues.push({id:'ti1',taskId:'t1',status:'open'} as never)
    expect(forecast(data)).toMatchObject({kind:'risk',openIssues:1})
    data.issues=[]; data.tasks[1].status='cancelled'
    expect(forecast(data)).toMatchObject({kind:'unknown',missingLeaf:true})
  })

  it('keeps orphaned projects visible and safely detaches corrupted cycles instead of losing projects', () => {
    const missing=base(); missing.links[0].parentId='p999'
    expect(model.build(missing,today).roots.find((n:any)=>n.project.id==='p2').orphan).toBe(true)
    const cyclic=copy(base()); cyclic.links.push({childId:'p1',parentId:'p2'})
    const tree=model.build(cyclic,today)
    expect(tree.roots).toHaveLength(2)
    expect([...tree.nodes.values()].every((n:any)=>n.cycle)).toBe(true)
  })
})
