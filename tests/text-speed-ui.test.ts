import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'

const root=path.resolve(__dirname,'..')
const scripts=['bangkok-time','data','ui','views','agency-os','project-plan','project-flow','flow-operations','profile','text-speed','app']
const pause=(ms=40)=>new Promise(resolve=>setTimeout(resolve,ms))

describe('Text Speed และแมนนี่บน Vanilla SPA', () => {
  let dom:JSDOM, win:any, ctx:any, speech:any, requests:any[] = [], settings:any, assistantMode='ok', releaseAssist:any
  beforeAll(async () => {
    dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost:8080/#/dashboard',runScripts:'outside-only',pretendToBeVisual:true})
    win=dom.window;ctx=dom.getInternalVMContext();win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{}
    Object.defineProperty(win,'isSecureContext',{value:true,configurable:true})
    win.speechSynthesis={speak:(u:any)=>{win.lastSpoken=u.text},cancel:()=>{}}
    win.SpeechSynthesisUtterance=class {text:string;lang='';constructor(text:string){this.text=text}}
    win.SpeechRecognition=class {
      lang='';continuous=false;interimResults=false;onresult:any;onerror:any;onend:any;started=false
      constructor(){speech=this}
      start(){this.started=true}
      abort(){this.started=false;this.onend?.()}
      emit(text:string,final=true){const r:any=[{transcript:text}];r.isFinal=final;this.onresult?.({resultIndex:0,results:[r]})}
    }
    win.fetch=async(url:string,options:any={})=>{
      const item={url:String(url),method:options.method || 'GET',body:options.body ? JSON.parse(options.body) : undefined};requests.push(item)
      let status=200,data:any={ok:true}
      if(item.url==='/api/health') data={auth:false,work:false,demo:true}
      else if(item.url==='/api/oauth/providers') data={google:{enabled:false},line:{enabled:false}}
      else if(item.url==='/api/manny/settings') data=settings
      else if(item.url==='/api/manny/personal' && item.method==='PUT') {settings={...settings,personal:{provider:item.body.provider,model:item.body.model,endpoint:item.body.endpoint,usable:true}}}
      else if(item.url==='/api/manny/shared' && item.method==='POST') {settings={...settings,shared:[...settings.shared,{id:'a'.repeat(32),label:item.body.label,provider:item.body.provider,model:item.body.model,enabled:true,usable:true}]}}
      else if(item.url==='/api/manny/assist') {
        if(assistantMode==='hold') await new Promise<void>(resolve=>{releaseAssist=resolve})
        if(assistantMode==='fail') { status=502;data={error:'บริการ AI ไม่พร้อม'} }
        else data={text:assistantMode==='same' ? item.body.text : 'ข้อความที่จัดเรียงแล้ว',provider:'openai',model:'test-model',source:'personal'}
      }
      return {ok:status<400,status,json:async()=>data}
    }
    settings={encryptionReady:true,personal:null,sharedCount:1,sharedProviders:[{provider:'openai',model:'test-model'}]}
    for(const script of scripts) vm.runInContext(fs.readFileSync(path.join(root,`assets/js/${script}.js`),'utf8'),ctx,{filename:script+'.js'})
    await pause(100)
  })
  beforeEach(() => {
    requests=[];assistantMode='ok';settings={encryptionReady:true,personal:null,sharedCount:1,sharedProviders:[{provider:'openai',model:'test-model'}]}
    vm.runInContext(`Remote.on=true;Remote.token='web-token';Remote.user={authId:2,name:'สมาชิก',role:'user'};Store.data.user={name:'สมาชิก',role:'user'};
      Store.data._dbAudit={ok:true,modules:[],latencyMs:1};Store.data._hermesPool={activeCount:0,poolTarget:20,totalUses:0,slots:[]};Store.data.archProjects=[];
      closeModal();TextSpeed.destroy();TextSpeed.init();`,ctx)
  })
  afterAll(()=>{vm.runInContext('TextSpeed.destroy();App.stopClock()',ctx);win.close()})
  const el=(id:string)=>win.document.getElementById(id)
  const openVoice=()=>{el('tsLauncher').click();el('tsMic').click()}
  const modal=()=>vm.runInContext(`openModal('<div class="modal-body"><label for="voiceText">รายละเอียด</label><textarea id="voiceText"></textarea><input id="voiceSecret" type="password"><input id="apiKey" type="text"><input id="challenge" type="text" autocomplete="one-time-code"><input id="privateKey" type="text"><input id="voiceNumber" type="number"></div>')`,ctx)

  it('is available across routes and inserts Thai/English at the caret in modal text fields', async () => {
    openVoice(); expect(speech.lang).toBe('th-TH'); expect(speech.continuous).toBe(true)
    vm.runInContext("location.hash='#/tasks';App.route();openTaskForm(null)",ctx); expect(el('textSpeedRoot')).toBeTruthy()
    expect(win.document.querySelector('.modal code')).toBeNull()
    expect(win.document.querySelector('.modal-head h3').textContent).toContain('<CODE>-10xx')
    modal();const text=el('voiceText');text.value='ก่อนหลัง';text.focus();text.setSelectionRange(4,8)
    let events=0;text.addEventListener('input',()=>events++)
    speech.emit('ข้อความ');expect(text.value).toBe('ก่อนข้อความ');expect(events).toBe(1)
    speech.emit('ลบทั้งหมด');expect(text.value).toBe('')
    speech.emit('ย้อนกลับ');expect(text.value).toBe('ก่อนข้อความ')
    el('tsMic').click();el('tsLang').value='en-US';el('tsLang').dispatchEvent(new win.Event('change'))
    el('tsMic').click();expect(speech.lang).toBe('en-US')
    text.focus();text.value='hello';text.setSelectionRange(5,5);speech.emit('world');expect(text.value).toBe('hello world')
    speech.emit('delete last word');expect(text.value).toBe('hello ')
    speech.emit('undo');expect(text.value).toBe('hello world')
  })

  it('does not type into passwords or API key fields and rejects non-numeric number input', () => {
    openVoice();modal();const text=el('voiceText');text.focus();speech.emit('ปลอดภัย');expect(text.value).toBe('ปลอดภัย')
    el('voiceSecret').focus();speech.emit('ไม่ควรเข้า');expect(el('voiceSecret').value).toBe('');expect(text.value).toBe('ปลอดภัย')
    el('apiKey').focus();speech.emit('ไม่ควรเข้า');expect(el('apiKey').value).toBe('')
    el('challenge').focus();speech.emit('ไม่ควรเข้า');expect(el('challenge').value).toBe('')
    el('privateKey').focus();speech.emit('ไม่ควรเข้า');expect(el('privateKey').value).toBe('')
    const number=el('voiceNumber');number.focus();speech.emit('สวัสดี');expect(number.value).toBe('')
    speech.emit('123');expect(number.value).toBe('123')
  })

  it('asks where to help, accepts the selected field and sends only that value plus the spoken instruction', async () => {
    openVoice();modal();const text=el('voiceText');text.value='ประโยคก่อนแก้';const secret=el('voiceSecret');secret.value='do-not-send'
    speech.emit('แมนนี่มานี่');expect(el('tsStatus').textContent).toContain('ให้ช่วยตรงไหน')
    expect(win.lastSpoken).toContain('ให้ช่วยตรงไหน')
    secret.focus();expect(el('tsStatus').textContent).toContain('ข้อมูลลับ');expect(requests.some(x=>x.url==='/api/manny/assist')).toBe(false)
    text.focus();text.click();expect(el('tsStatus').textContent).toContain('เลือกช่องแล้ว')
    await pause(650);speech.emit('จัดเรียงให้อ่านง่ายและแก้คำผิด');await pause(1450)
    const sent=requests.find(x=>x.url==='/api/manny/assist')
    expect(sent.body).toEqual({text:'ประโยคก่อนแก้',instruction:'จัดเรียงให้อ่านง่ายและแก้คำผิด',confirm:true})
    expect(JSON.stringify(sent.body)).not.toContain('do-not-send')
    expect(text.value).toBe('ข้อความที่จัดเรียงแล้ว');expect(el('tsStatus').textContent).toContain('ย้อนกลับได้')
    el('tsUndo').click();expect(text.value).toBe('ประโยคก่อนแก้')
  },10000)

  it('pauses recognition while prompting and waiting for AI, then resumes without losing the result status', async () => {
    openVoice();modal();const text=el('voiceText');text.value='ต้นฉบับ';text.focus()
    const first=speech;first.emit('แมนนี่มานี่');expect(first.started).toBe(false)
    first.emit('เสียงตอบของแมนนี่');expect(text.value).toBe('ต้นฉบับ')
    el('tsCancel').click();await pause(400);expect(speech).not.toBe(first);expect(speech.started).toBe(true)
    speech.emit('แมนนี่มานี่');text.click();await pause(400)
    const commandSpeech=speech;expect(commandSpeech.started).toBe(true)
    assistantMode='hold';el('tsInstruction').value='จัดเรียง';el('tsSend').click();await pause()
    expect(commandSpeech.started).toBe(false);expect(el('tsLauncherText').textContent).toContain('กำลังช่วย')
    commandSpeech.emit('ข้อความระหว่างรอ');expect(text.value).toBe('ต้นฉบับ')
    releaseAssist();await pause(420);expect(speech).not.toBe(commandSpeech);expect(speech.started).toBe(true)
    expect(text.value).toBe('ข้อความที่จัดเรียงแล้ว');expect(el('tsStatus').textContent).toContain('ย้อนกลับได้')
  })

  it('leaves the field and undo history unchanged when AI returns the original text', async () => {
    openVoice();modal();const text=el('voiceText');text.value='เหมือนเดิม';el('tsWake').click();text.focus();text.click()
    assistantMode='same';el('tsInstruction').value='ตรวจข้อความ';el('tsSend').click();await pause()
    expect(text.value).toBe('เหมือนเดิม');expect(el('tsStatus').textContent).toContain('ไม่ได้เปลี่ยนข้อความ')
    expect(el('tsStatus').textContent).not.toContain('ย้อนกลับได้');expect(el('tsUndo').disabled).toBe(true)
  })

  it('keeps the error visible when recognition resumes after an AI failure', async () => {
    openVoice();modal();const text=el('voiceText');text.value='ต้นฉบับ';el('tsWake').click();text.focus();text.click()
    assistantMode='fail';el('tsInstruction').value='จัดเรียง';el('tsSend').click();await pause(450)
    expect(text.value).toBe('ต้นฉบับ');expect(el('tsStatus').textContent).toContain('บริการ AI ไม่พร้อม')
    expect(el('tsInstruction').value).toBe('จัดเรียง');expect(speech.started).toBe(true)
  })

  it('preserves the side search input, focus and undo when its results rerender', async () => {
    vm.runInContext("Store.ui.q.tasks='';location.hash='#/tasks';App.route()",ctx);await pause(80)
    openVoice();const search=el('sideQ');search.focus();speech.emit('ค้นหา');await pause(420)
    expect(el('sideQ')).toBe(search);expect(win.document.activeElement).toBe(search);expect(search.value).toBe('ค้นหา')
    speech.emit('เพิ่มเติม');await pause(420);expect(el('sideQ')).toBe(search);expect(search.value).toBe('ค้นหาเพิ่มเติม')
    el('tsUndo').click();expect(search.value).toBe('ค้นหา');await pause(420);expect(el('sideQ')).toBe(search)
    el('tsWake').click();search.click();el('tsInstruction').value='จัดข้อความ';el('tsSend').click();await pause(420)
    expect(el('sideQ')).toBe(search);expect(search.value).toBe('ข้อความที่จัดเรียงแล้ว')
    el('tsUndo').click();expect(search.value).toBe('ค้นหา')
  },10000)

  it('does not rerender another active input or a new page from a pending side search', async () => {
    vm.runInContext("Store.ui.q.tasks='';location.hash='#/tasks';App.route()",ctx);await pause(80)
    openVoice();const search=el('sideQ');search.focus();speech.emit('ค้นหา')
    const global=el('globalQ');global.focus();global.value='กำลังพิมพ์';await pause(420)
    expect(el('globalQ')).toBe(global);expect(global.value).toBe('กำลังพิมพ์')
    search.focus();await pause(80);expect(el('globalQ')).not.toBe(global);expect(el('sideQ')).toBe(search)
    search.focus();speech.emit('ต่อ');vm.runInContext("location.hash='#/settings';App.route()",ctx);await pause(100)
    const card=el('mannySettings');await pause(400);expect(el('mannySettings')).toBe(card)
  },10000)

  it('discards a late AI response after the user cancels', async () => {
    openVoice();modal();const text=el('voiceText');text.value='ต้นฉบับ';el('tsWake').click();text.focus();text.click()
    assistantMode='hold';el('tsInstruction').value='จัดเรียง';el('tsSend').click();await pause()
    el('tsCancel').click();releaseAssist();await pause(420)
    expect(text.value).toBe('ต้นฉบับ');expect(el('tsStatus').textContent).toContain('ยกเลิกคำสั่งแล้ว')
    expect(el('tsUndo').disabled).toBe(true);expect(speech.started).toBe(true)
  })

  it('does not overwrite a field edited or replaced while AI is in flight', async () => {
    openVoice();modal();const text=el('voiceText');text.value='ต้นฉบับ';el('tsWake').click();text.focus();text.click()
    assistantMode='hold';el('tsInstruction').value='จัดเรียง';el('tsSend').click();await pause()
    text.value='ผู้ใช้แก้ระหว่างรอ';text.dispatchEvent(new win.Event('input',{bubbles:true}));releaseAssist();await pause()
    expect(text.value).toBe('ผู้ใช้แก้ระหว่างรอ');expect(el('tsStatus').textContent).toContain('ไม่เขียนทับ')
    el('tsWake').click();text.focus();text.click();el('tsInstruction').value='จัดใหม่';el('tsSend').click();await pause()
    el('voiceNumber').focus();releaseAssist();await pause();expect(text.value).toBe('ผู้ใช้แก้ระหว่างรอ');expect(el('tsStatus').textContent).toContain('ไม่เขียนทับ')
    el('tsWake').click();text.focus();text.click();el('tsInstruction').value='จัดใหม่';el('tsSend').click();await pause()
    vm.runInContext('closeModal()',ctx);releaseAssist();await pause();expect(el('tsStatus').textContent).toContain('ไม่เขียนทับ')
  })

  it('isolates settings from localStorage and shows the admin key pool only to an admin', async () => {
    vm.runInContext("location.hash='#/settings';App.route()",ctx);await pause(100)
    let card=el('mannySettings');expect(card.textContent).toContain('key ส่วนกลางแบบสุ่ม');expect(el('msSharedForm')).toBeNull()
    el('msOwnModel').value='gpt-test';el('msOwnKey').value='user-private-test-key';el('msOwnPassword').value='current-password'
    el('msOwnForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause(100)
    const saved=requests.find(x=>x.url==='/api/manny/personal' && x.method==='PUT')
    expect(saved.body).toMatchObject({apiKey:'user-private-test-key',password:'current-password',provider:'openai'})
    expect(win.localStorage.getItem('mng_erp_v2') || '').not.toContain('user-private-test-key')
    expect(el('mannySettings').textContent).toContain('ใช้ key ส่วนตัว')
    settings={...settings,shared:[]};vm.runInContext("Remote.user.role='admin';Store.data.user.role='admin';App.route()",ctx);await pause(100)
    expect(el('msSharedForm')).toBeTruthy();el('msSharedLabel').value='ทีมทดสอบ';el('msSharedModel').value='shared-test';el('msSharedKey').value='admin-test-key';el('msAdminPassword').value='admin-password'
    el('msSharedForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause(100)
    expect(requests.some(x=>x.url==='/api/manny/shared' && x.body.apiKey==='admin-test-key')).toBe(true)
    expect(el('mannySettings').textContent).toContain('ทีมทดสอบ');expect(el('mannySettings').textContent).not.toContain('admin-test-key')
  })

  it('reports unsupported browsers and stops recording when login is forced', () => {
    const Recognition=win.SpeechRecognition;delete win.SpeechRecognition
    el('tsLauncher').click();el('tsMic').click();expect(el('tsStatus').textContent).toContain('ไม่มี Speech Recognition')
    win.SpeechRecognition=Recognition;el('tsMic').click();expect(speech.started).toBe(true)
    vm.runInContext("App.forceLogin('กรุณาเข้าสู่ระบบ')",ctx)
    expect(speech.started).toBe(false);expect(el('textSpeedRoot')).toBeNull()
  })
})
