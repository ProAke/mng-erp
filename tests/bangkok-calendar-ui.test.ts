import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const tick = () => new Promise(resolve => setTimeout(resolve, 30))

describe('ปฏิทินและลงเวลา — วันเวลาไทย', () => {
  let dom: JSDOM, win: any, ctx: any
  const run = (js: string) => vm.runInContext(js, ctx)
  const el = (selector: string) => win.document.querySelector(selector) as any
  const setClock = (iso: string) => run(`BangkokTime.synchronize(${JSON.stringify(iso)}, Date.now(), Date.now())`)

  beforeAll(async () => {
    dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
      url:'http://localhost:8080/#/calendar', runScripts:'outside-only', pretendToBeVisual:true,
    })
    win = dom.window
    win.fetch = async () => ({ok:true,status:200,json:async()=>({ok:true,auth:false,work:false,demo:true})})
    win.scrollTo = () => {}
    win.HTMLElement.prototype.scrollIntoView = () => {}
    ctx = dom.getInternalVMContext()
    for (const rel of ['assets/js/bangkok-time.js','assets/js/data.js','assets/js/ui.js','assets/js/views.js',
      'assets/js/agency-os.js','assets/js/project-plan.js','assets/js/project-flow.js','assets/js/flow-operations.js','assets/js/office.js','assets/js/app.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, {filename:rel})
    }
    await tick()
    run('App.stopClock(); Remote.on=false; Store.data.tasks=[]; Store.data.events=[]; Store.data.checkins=[]')
  })
  afterAll(() => { run('App.stopClock(); Office3D.destroy()'); dom.window.close() })

  it('aligns month and mini-calendar headers with the actual weekday and follows Bangkok across New Year', async () => {
    setClock('2026-12-31T16:58:00.000Z') // 31 ธ.ค. 23:58 ไทย
    run(`Store.ui.calSel=todayS(); Store.ui.calCursor=s2d(todayS()); Store.ui.calView='month'; location.hash='#/calendar'; App.route(); App.startClock()`)
    expect(el('.cal-cell.today').dataset.date).toBe('2026-12-31')
    expect(el('.cal-toolbar').textContent).toContain('เวลาไทย · UTC+7')
    expect([...win.document.querySelectorAll('.cal-dow div')].map((e:any)=>e.textContent))
      .toEqual(['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'])
    expect([...win.document.querySelectorAll('.mc-grid .dow')].map((e:any)=>e.textContent))
      .toEqual(['จ','อ','พ','พฤ','ศ','ส','อา'])
    const firstWeek = [...win.document.querySelectorAll('.cal-wk:first-child .cal-cell')].map((e:any)=>e.dataset.date)
    expect(firstWeek).toEqual(['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-05','2026-12-06'])

    setClock('2026-12-31T17:00:00.000Z') // 1 ม.ค. 00:00 ไทย
    await run('App.tickClock()')
    expect(run('todayS()')).toBe('2027-01-01')
    expect(el('.cal-cell.today').dataset.date).toBe('2027-01-01')
    expect(el('.cal-toolbar h2').textContent).toContain('มกราคม')
    expect(run('Store.ui.calSel')).toBe('2027-01-01')
    expect(run('d2s(Store.ui.calCursor)')).toBe('2027-01-01')
    run('App.stopClock()')
  })

  it('shows timed midnight events as timed, all-day events separately, and an accurate moving now line', async () => {
    setClock('2026-12-31T17:00:00.000Z')
    run(`
      Store.data.events=[
        {id:'e-mid', title:'นัดเที่ยงคืน', cat:'meeting', date:'2027-01-01', start:'00:00', end:'00:30', allday:false, members:[]},
        {id:'e-all', title:'วันหยุด', cat:'holiday', date:'2027-01-01', start:'00:00', end:'23:59', allday:true, members:[]},
        {id:'e-late', title:'ก่อนเที่ยงคืน', cat:'meeting', date:'2027-01-01', start:'23:58', end:'23:59', allday:false, members:[]}
      ];
      Store.ui.calView='week'; Store.ui.calSel='2027-01-01'; Store.ui.calCursor=s2d('2027-01-01'); App.route(); App.startClock();
    `)
    expect(win.document.querySelectorAll('.wk-times div')).toHaveLength(24)
    expect(el('.wk-times div:first-child').textContent).toBe('00:00')
    expect(el('.wk-times div:last-child').textContent).toBe('23:00')
    expect(el('.wk-col[data-date="2027-01-01"] [data-id="event:e-mid"]').textContent).toContain('00:00–00:30')
    expect(el('.wk-col[data-date="2027-01-01"] [data-id="event:e-mid"]').style.top).toBe('0px')
    expect(parseFloat(el('.wk-col [data-id="event:e-late"]').style.top)).toBeCloseTo((23 * 60 + 58) / 60 * 52)
    expect(el('.wk-col [data-id="event:e-late"]').style.height).toBe('40px')
    expect(el('.wk-allday [data-id="event:e-all"]').textContent).toContain('วันหยุด')
    expect(el('.wk-now').style.top).toBe('0px')
    setClock('2026-12-31T17:01:00.000Z')
    await run('App.tickClock()')
    expect(parseFloat(el('.wk-now').style.top)).toBeCloseTo(52 / 60)
    expect(el('.wk-now').title).toBe('เวลาไทย 00:01')
    run(`Store.ui.calView='agenda'; App.route()`)
    expect(el('[data-id="event:e-mid"] .ag-time').textContent).toContain('00:00')
    expect(el('[data-id="event:e-all"] .ag-time').textContent).toBe('ตลอดวัน')
    run('App.stopClock()')
  })

  it('updates upcoming events as they finish without waiting for midnight', async () => {
    setClock('2026-12-31T17:05:00.000Z') // 00:05 ไทย
    run(`Store.data.events=[
      {id:'ended',title:'จบแล้ว',cat:'meeting',date:'2027-01-01',start:'00:00',end:'00:05',members:[]},
      {id:'running',title:'กำลังประชุม',cat:'meeting',date:'2027-01-01',start:'00:00',end:'00:06',members:[]},
      {id:'future',title:'นัดถัดไป',cat:'meeting',date:'2027-01-01',start:'00:30',end:'01:00',members:[]},
      {id:'all',title:'ตลอดวัน',cat:'holiday',date:'2027-01-01',allday:true,members:[]}
    ]; Store.ui.calSel=todayS(); Store.ui.calCursor=s2d(todayS()); Store.ui.calView='week'; App.route(); App.startClock()`)
    expect(JSON.parse(run('JSON.stringify(Store.upcoming().map(e=>e.id))'))).toEqual(['all','running','future'])
    expect(el('#side').textContent).toContain('กำลังประชุม')
    setClock('2026-12-31T17:06:00.000Z')
    await run('App.tickClock()')
    expect(el('#side').textContent).not.toContain('กำลังประชุม')
    expect(el('#side').textContent).toContain('นัดถัดไป')
    run('App.stopClock()')
  })

  it('allows dragging an all-day event to another day in the dedicated all-day row', async () => {
    setClock('2026-12-31T17:00:00.000Z')
    run(`Store.data.events=[{id:'move',title:'วันหยุด',cat:'holiday',date:'2027-01-01',allday:true,members:[]}];
      Store.ui.calCursor=s2d('2027-01-01'); Store.ui.calView='week'; App.route()`)
    const target = el('.wk-allday-col[data-date="2027-01-02"]')
    const drop = new win.Event('drop', {bubbles:true, cancelable:true})
    Object.defineProperty(drop, 'dataTransfer', {value:{getData:()=> 'event:move'}})
    target.dispatchEvent(drop)
    await tick()
    expect(run("Store.getEvent('move').date")).toBe('2027-01-02')
    expect(el('.wk-allday-col[data-date="2027-01-02"] [data-id="event:move"]')).toBeTruthy()
  })

  it('supports Today navigation and validates Bangkok event times in the form', async () => {
    setClock('2026-12-31T17:00:00.000Z')
    run(`Store.ui.calCursor=s2d('2026-11-01'); Store.ui.calSel='2026-11-01'; Store.ui.calView='month'; App.route()`)
    el('[data-act="cal-today"]').click()
    expect(run('Store.ui.calSel')).toBe('2027-01-01')
    expect(run('d2s(Store.ui.calCursor)')).toBe('2027-01-01')
    run("openEventForm(null, '2027-02-01')")
    expect(el('.modal-head').textContent).toContain('Asia/Bangkok')
    el('#eTitle').value = 'ทดสอบเที่ยงคืน'
    el('#eStart').value = '23:00'; el('#eEnd').value = '00:30'
    el('#eSave').click(); await tick()
    expect(el('#modalRoot .modal')).toBeTruthy()
    expect(el('#toastRoot').textContent).toContain('เวลาสิ้นสุดต้องหลังเวลาเริ่ม')
    el('#eStart').value = '00:00'; el('#eEnd').value = '00:30'
    el('#eSave').click(); await tick()
    expect(run("Store.data.events.some(e=>e.title==='ทดสอบเที่ยงคืน' && e.start==='00:00' && e.date==='2027-02-01')")).toBe(true)
    expect(run('Store.ui.calSel')).toBe('2027-02-01')
    expect(run('d2s(Store.ui.calCursor)')).toBe('2027-02-01')
  })

  it('does not pretend an online calendar edit or drag was saved when the API fails', async () => {
    run(`Store.data.events=[{id:'e77',title:'เดิม',cat:'meeting',date:'2027-01-01',start:'09:00',end:'10:00',allday:false,members:[]}];
      Remote.on=true; Remote.clockSynced=true; window.__calendarReq=Remote.req;
      Remote.req=async()=>{throw new Error('database unavailable')}; openEventForm('e77')`)
    try {
      el('#eTitle').value = 'แก้ไขแต่ยังไม่บันทึก'
      el('#eDate').value = '2027-01-02'
      el('#eSave').click(); await tick()
      expect(el('#modalRoot .modal')).toBeTruthy()
      expect(run("Store.getEvent('e77').title")).toBe('เดิม')
      expect(run("Store.getEvent('e77').date")).toBe('2027-01-01')
      expect(await run("Store.moveToDate('event','e77','2027-01-03')")).toBe(false)
      expect(run("Store.getEvent('e77').date")).toBe('2027-01-01')
      expect(el('#toastRoot').textContent).toContain('database unavailable')
    } finally { run('Remote.req=window.__calendarReq; Remote.on=false; closeModal()') }
  })

  it('keeps mobile calendar filters reachable without covering the calendar permanently', () => {
    run(`location.hash='#/calendar'; Store.ui.calView='month'; App.route()`)
    const toggle = el('.cal-mobile-side-btn')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.click()
    expect(el('#appShell').classList.contains('cal-side-open')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    el('.cal-mobile-side-close').click()
    expect(el('#appShell').classList.contains('cal-side-open')).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps a deliberately selected historical date when today changes', async () => {
    setClock('2026-12-31T16:59:00.000Z')
    run(`Store.ui.calSel='2026-12-10'; Store.ui.calCursor=s2d('2026-12-10'); Store.ui.calView='day'; App.route(); App.startClock()`)
    setClock('2026-12-31T17:00:00.000Z')
    await run('App.tickClock()')
    expect(run('Store.ui.calSel')).toBe('2026-12-10')
    expect(run('d2s(Store.ui.calCursor)')).toBe('2026-12-10')
    run('App.stopClock()')
  })

  it('records the Bangkok day/time for check-in, repeated check-in, clock-out, re-entry and the next day', async () => {
    setClock('2026-12-31T16:58:00.000Z')
    run(`Remote.on=false; Store.data.checkins=[]; location.hash='#/hr'; App.route()`)
    await run("doClockIn('office')")
    expect(JSON.parse(run('JSON.stringify(Store.data.checkins[0])'))).toMatchObject({date:'2026-12-31',clockIn:'23:58',clockOut:'',mode:'office'})
    setClock('2026-12-31T16:59:00.000Z')
    await run("doClockIn('wfh')")
    expect(JSON.parse(run('JSON.stringify(Store.data.checkins[0])'))).toMatchObject({date:'2026-12-31',clockIn:'23:58',mode:'wfh'})
    expect(el('#toastRoot').textContent).toContain('เวลา 23:58')
    await run('doClockOut()')
    expect(run('Store.data.checkins[0].clockOut')).toBe('23:59')
    await run("doClockIn('office')")
    expect(JSON.parse(run('JSON.stringify(Store.data.checkins.map(c=>[c.date,c.clockIn,c.clockOut,c.mode]))')))
      .toEqual([['2026-12-31','23:59','','office'],['2026-12-31','23:58','23:59','wfh']])
    await run('doClockOut()')
    setClock('2026-12-31T17:01:00.000Z')
    await run("doClockIn('wfh')")
    expect(JSON.parse(run('JSON.stringify(Store.data.checkins[0])'))).toMatchObject({date:'2027-01-01',clockIn:'00:01',mode:'wfh'})
    expect(el('#view').textContent).toContain('เวลาไทย (UTC+7)')
  })

  it('warns about an open previous-day shift instead of recording an out time on the wrong day', async () => {
    setClock('2026-12-31T17:01:00.000Z')
    run(`Store.data.checkins=[{id:'old',memberId:meMember().id,date:'2026-12-31',clockIn:'23:59',clockOut:'',mode:'office'}]; App.refresh()`)
    expect(el('.checkin-widget').textContent).toContain('ยังไม่รองรับการลงเวลาออกข้ามวัน')
    await run('doClockOut()')
    expect(run('Store.data.checkins[0].clockOut')).toBe('')
    expect(el('#toastRoot').textContent).toContain('ยังไม่มีรายการเช็กอินสำหรับวันนี้')
  })

  it('uses the authoritative server result for online attendance without sending device time', async () => {
    setClock('2026-12-31T17:01:00.000Z')
    run(`
      window.__requests=[]; window.__oldReq=Remote.req; window.__oldRefresh=Remote.refreshAll;
      Remote.on=true; Remote.clockSynced=true; Store.data.featureAvailability={attendance:true}; Store.data.attendanceDate=todayS();
      Remote.req=async (path,opts)=>{window.__requests.push({path,body:opts.body});return {ok:true,date:'2027-01-01',clockIn:'08:45',timezone:'Asia/Bangkok'}};
      Remote.refreshAll=async()=>true;
    `)
    try {
      await run("doClockIn('wfh')")
      const sent = JSON.parse(run('JSON.stringify(window.__requests[0])'))
      expect(sent.path).toBe('/checkins/clock')
      expect(sent.body).toMatchObject({mode:'wfh'})
      expect(sent.body.date).toBeUndefined()
      expect(sent.body.time).toBeUndefined()
      expect(el('#toastRoot').textContent).toContain('เวลา 08:45')
    } finally { run('Remote.req=window.__oldReq; Remote.refreshAll=window.__oldRefresh; Remote.on=false') }
  })

  it('does not show false attendance counts or allow clocking when the database data is unavailable', async () => {
    run(`Remote.on=true; Remote.clockSynced=true; Store.data.featureAvailability={attendance:false}; location.hash='#/hr'; App.route()`)
    expect(el('#view').textContent).toContain('ไม่สามารถอ่านรายการลงเวลาจากฐานข้อมูล')
    expect(el('#view').textContent).not.toContain('ยังไม่ได้เช็กอินวันนี้')
    expect(el('#view [onclick*="doClockIn"]')).toBeNull()
    run('location.hash="#/dashboard"; App.route()')
    expect(el('#side').textContent).toContain('ข้อมูลไม่พร้อม')
    run(`location.hash='#/hr'; App.route(); window.__originalRefresh=Remote.refreshAll;
      Remote.refreshAll=async()=>{Store.data.featureAvailability.attendance=true; Store.data.attendanceDate=todayS(); App.refresh(); return true}`)
    try {
      await run('App.retryAttendance()')
      expect(el('.checkin-widget')).toBeTruthy()
    } finally { run('Remote.refreshAll=window.__originalRefresh; Remote.on=false; delete Store.data.featureAvailability') }
  })

  it('hides stale attendance across midnight and reloads it when returning from the calendar', async () => {
    setClock('2026-12-31T16:59:00.000Z')
    run(`window.__oldReq=Remote.req; window.__oldSync=Remote.syncClock;
      Remote.on=true; Remote.clockSynced=true; Remote.syncClock=async()=>false;
      Store.data.featureAvailability={attendance:true}; Store.data.attendanceDate='2026-12-31';
      Store.data.checkins=[{id:'old',memberId:meMember().id,date:'2026-12-31',clockIn:'23:59',clockOut:'',mode:'office'}];
      location.hash='#/calendar'; App.route(); App.startClock();
      window.__bootstrapCalls=0; window.__finishBootstrap=null;
      Remote.req=async()=>{window.__bootstrapCalls++; return await new Promise(resolve=>{window.__finishBootstrap=resolve})};`)
    try {
      setClock('2026-12-31T17:00:00.000Z')
      await run('App.tickClock()')
      expect(run('attendanceAvailable()')).toBe(false)
      run(`location.hash='#/hr'; App.route()`)
      expect(el('#view').textContent).toContain('รายการลงเวลาของวันใหม่ยังไม่พร้อม')
      expect(el('#view').textContent).not.toContain('ยังไม่ได้เช็กอินวันนี้')
      expect(run('window.__bootstrapCalls')).toBe(1)
      run(`window.__fresh=JSON.parse(JSON.stringify(Store.data));
        window.__fresh.attendanceDate='2027-01-01';
        window.__fresh.checkins.unshift({id:'new',memberId:meMember().id,date:'2027-01-01',clockIn:'00:00',clockOut:'',mode:'wfh'});
        window.__finishBootstrap(window.__fresh)`)
      await tick()
      expect(el('.checkin-widget').textContent).toContain('เข้างานเวลา 00:00')
      expect(run('attendanceAvailable()')).toBe(true)
    } finally { run('App.stopClock(); Remote.req=window.__oldReq; Remote.syncClock=window.__oldSync; Remote.on=false') }
  })

  it('does not show stale controls if refreshing attendance fails after a successful clock-in', async () => {
    setClock('2026-12-31T17:00:00.000Z')
    run(`window.__oldReq=Remote.req; Remote.on=true; Remote.clockSynced=true;
      Store.data.featureAvailability={attendance:true}; Store.data.attendanceDate=todayS(); Store.data.checkins=[];
      location.hash='#/hr'; App.route();
      Remote.req=async path=>{if(path==='/checkins/clock') return {ok:true,date:'2027-01-01',clockIn:'00:00'}; throw Error('offline')}`)
    try {
      await run("doClockIn('office')")
      expect(run('attendanceAvailable()')).toBe(false)
      expect(el('#view').textContent).toContain('ไม่สามารถอ่านรายการลงเวลาจากฐานข้อมูล')
      expect(el('#view [onclick*="doClockIn"]')).toBeNull()
      expect(el('#toastRoot').textContent).toContain('บันทึกเวลาเข้าแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ')
    } finally { run('Remote.req=window.__oldReq; Remote.on=false') }
  })

  it('warns about an unsynchronized online clock, then removes the warning when server time is recovered', async () => {
    const originalFetch = win.fetch
    run(`Remote.on=true; Remote.clockSynced=false; Store.data.featureAvailability={attendance:true}; Store.data.attendanceDate='2027-01-01'; location.hash='#/calendar'; App.route(); App.startClock()`)
    expect(el('.cal-clock-warning').textContent).toContain('ตรวจสอบนาฬิกาอุปกรณ์')
    run(`location.hash='#/hr'; App.route()`)
    expect(el('#view').textContent).toContain('ยังเทียบเวลาเซิร์ฟเวอร์ไม่ได้')
    expect(el('#view').textContent).not.toContain('ยังไม่ได้เช็กอินวันนี้')
    expect(el('[data-act="hr-retry-clock"]')).toBeTruthy()
    win.fetch = async () => ({ok:true,status:200,json:async()=>({timezone:'Asia/Bangkok',serverTime:'2026-12-31T17:00:00.000Z'})})
    try {
      await run('App.tickClock()')
      expect(run('Remote.clockSynced')).toBe(true)
      expect(run('todayS()')).toBe('2027-01-01')
      expect(run('nowHM()')).toBe('00:00')
      expect(el('.checkin-widget').textContent).toContain('Asia/Bangkok')
      // คำขอครั้งต่อมาขัดข้องยังคงใช้การเทียบเวลาที่สำเร็จครั้งล่าสุด
      win.fetch = async () => { throw new Error('offline') }
      expect(await run('Remote.syncClock()')).toBe(false)
      expect(run('Remote.clockSynced')).toBe(true)
    } finally { win.fetch = originalFetch; run('App.stopClock(); Remote.on=false') }
  })
})
