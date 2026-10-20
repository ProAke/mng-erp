/* ============================================================
   MNG ERP — Store, Router, Topbar, Modals, Delegation, Init
   ============================================================ */
'use strict';

/* ============================================================
   STORE
   ============================================================ */
const Store = {
  KEY: 'mng_erp_v2',
  data: null,
  ui: null,

  load(){
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.KEY)); } catch(e){}
    this.data = saved && saved.tasks ? saved : JSON.parse(JSON.stringify(SEED));
    if(!this.data.settings) this.data.settings = {n1:true,n2:true,n3:false,theme:'#6C5CE7'};
    const catKeys = Object.keys(this.data.eventCats);
    this.ui = {
      route: null,
      q: {},                                  // search strings per view
      f: {                                    // filter sets per view
        dashProjects:new Set(), dashStatus:new Set(), dashBudget:0,
        taskStatus:new Set(), taskPrio:new Set(), taskProj:new Set(),
        projStatus:new Set(), invStatus:new Set(),
      },
      calCats: new Set(catKeys),
      calCursor: new Date(),                  // month/week anchor
      calSel: todayS(),                       // selected day
      calView: this.data.settings.calView || 'month',
      taskMode: 'board',
      dashTab: 'work',
    };
  },
  save(){
    this.data.settings.calView = this.ui.calView;
    localStorage.setItem(this.KEY, JSON.stringify(this.data));
  },

  /* lookups */
  getTask(id){ return this.data.tasks.find(t=>t.id===id); },
  getEvent(id){ return this.data.events.find(e=>e.id===id); },
  userOf(id){ return this.data.team.find(u=>u.id===id) || {id:'?',name:'ไม่ระบุ',color:'#c3c7dd',role:''}; },
  projectOf(t){ return this.data.projects.find(p=>p.id===t.project) || {id:'',name:'—',short:'—',color:'#8a8fb1',grad:'g-slate',members:[]}; },
  clientOf(p){ if(!p) return null;
    return this.data.clients.find(c=>c.id===p.client) || this.data.clients.find(c=>c.name===p.client) || null; },
  catColor(cat){ return (this.data.eventCats[cat]||{color:'#8a8fb1'}).color; },

  /* calendar aggregation: events + task-dues on a date */
  eventsOn(ds){
    const out = this.data.events
      .filter(e=>e.date===ds)
      .map(e=>({kind:'event', ...e}));
    this.data.tasks
      .filter(t=>t.due===ds && t.status!=='done')
      .forEach(t=>out.push({kind:'task', id:t.id, title:t.title, cat:'task', allday:true, date:t.due, refCode:t.code}));
    out.sort((a,b)=>((a.allday?'0':'1')+(a.start||'')).localeCompare((b.allday?'0':'1')+(b.start||'')));
    return out;
  },
  upcoming(n=5){
    const t = todayS(), out = [];
    for(let i=0;i<45;i++){
      const ds = d2s(addDays(new Date(), i));
      this.eventsOn(ds).forEach(e=>{ if(ds>=t || (ds===t && (e.start||'00:00')>='00:00')) out.push(e); });
      if(out.length>=n) break;
    }
    out.sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
    return out.slice(0,n);
  },
  moveToDate(kind, id, ds){
    if(kind==='event'){ const e=this.getEvent(id); if(e) e.date=ds; }
    else { const t=this.getTask(id); if(t) t.due=ds; }
    this.save();
  },
  logActivity(text){
    const now = new Date();
    const at = `${todayS()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    this.data.activity.unshift({at, u:'u1', text});
    this.data.activity = this.data.activity.slice(0,30);
  },

  /* notifications (computed) */
  notifs(){
    const n = [];
    this.data.tasks.filter(t=>t.status!=='done').forEach(t=>{
      const d = daysLeft(t.due);
      if(d<0)  n.push({color:'#FF5C7A', html:`<b>${t.code}</b> เกินกำหนดมา ${-d} วัน — ${esc(t.title)}`, sub:'งานคงค้าง', act:`open-task:${t.id}`});
      else if(d===0) n.push({color:'#FFB020', html:`<b>${t.code}</b> ครบกำหนด<b>วันนี้</b> — ${esc(t.title)}`, sub:'เดดไลน์', act:`open-task:${t.id}`});
    });
    this.data.invoices.filter(i=>i.status==='overdue').forEach(i=>{
      n.push({color:'#FF5C7A', html:`ใบแจ้งหนี้ <b>${i.no}</b> เกินกำหนดชำระ ${money(i.amount+i.vat)}`, sub:'การเงิน', act:`open-invoice:${i.id}`});
    });
    const todayEvts = this.data.events.filter(e=>e.date===todayS() && e.cat==='meeting');
    if(todayEvts.length) n.push({color:'#8E7CF3', html:`วันนี้มีประชุม <b>${todayEvts.length}</b> รอบ — ${esc(todayEvts[0].title)}`, sub:'ปฏิทิน', act:'nav:calendar'});
    return n;
  },
};

/* ============================================================
   APP / ROUTER
   ============================================================ */
const App = {
  routes: {
    dashboard:{ title:'ภาพรวมวันนี้ 🔥',   sub:'ยินดีต้อนรับสู่ MNG ERP',            icon:IC.dash,   label:'แดชบอร์ด', render:renderDashboard },
    calendar: { title:'ปฏิทินงานเต็มจอ 🔥', sub:'MNG Groups / Work Tracking',        icon:IC.cal,    label:'ปฏิทิน',   render:renderCalendar,  badge:()=>Store.data.events.filter(e=>e.date===todayS()).length },
    tasks:    { title:'บอร์ดงาน (Kanban)',  sub:'MNG Groups / Work Everyday',        icon:IC.task,   label:'งาน',      render:renderTasks,     badge:()=>Store.data.tasks.filter(t=>t.status!=='done').length },
    projects: { title:'โปรเจกต์ทั้งหมด',    sub:'ทุกโปรเจกต์ของ MNG Groups',         icon:IC.proj,   label:'โปรเจกต์', render:renderProjects },
    finance:  { title:'การเงิน & ใบแจ้งหนี้',sub:'รายรับ · รอเก็บ · VAT 7%',          icon:IC.money,  label:'การเงิน',  render:renderFinance },
    team:     { title:'ทีมงาน & ภาระงาน',   sub:'HR — โหลดงานรายบุคคล',              icon:IC.team,   label:'ทีม',      render:renderTeam },
    clients:  { title:'ลูกค้า (CRM)',       sub:'ฐานลูกค้าและยอดขายสะสม',            icon:IC.client, label:'ลูกค้า',   render:renderClients },
    reports:  { title:'รายงานผู้บริหาร',    sub:'สรุปผลงาน · รายได้ · โหลดงาน',      icon:IC.report, label:'รายงาน',   render:renderReports },
    settings: { title:'ตั้งค่าระบบ',        sub:'โปรไฟล์ · ธีม · ข้อมูลสำรอง',       icon:IC.gear,   label:'ตั้งค่า',  render:renderSettings },
  },

  init(){
    Store.load();
    this.applyTheme();
    this.renderRail();
    this.bindGlobal();
    window.addEventListener('hashchange', ()=>this.route());
    if(!location.hash) location.hash = '#/calendar';
    this.route();
  },

  applyTheme(){
    const t = Store.data.settings.theme || '#6C5CE7';
    document.documentElement.style.setProperty('--purple', t);
  },

  go(name){ location.hash = '#/'+name; },
  refresh(){ this.renderRail(); this.route(); },

  route(){
    const name = (location.hash.replace('#/','')||'calendar').split('?')[0];
    const r = this.routes[name] || this.routes.calendar;
    Store.ui.route = name;
    // reset view scroll mode
    const view = $('#view');
    view.classList.remove('no-scroll');
    view.scrollTop = 0;
    this.renderRail();
    this.renderTopbar(r);
    r.render();
    document.title = `MNG ERP — ${r.label}`;
  },

  renderRail(){
    const rail = $('#rail');
    const cur = Store.ui.route;
    const order = ['dashboard','calendar','tasks','projects','finance','team','clients','reports'];
    rail.innerHTML = `<div class="logo" data-act="nav:dashboard" title="MNG ERP">M</div>` +
      order.map(k=>{
        const r = this.routes[k];
        const b = r.badge ? r.badge() : 0;
        return `<button class="rail-btn ${cur===k?'active':''}" data-act="nav:${k}" title="${r.label}">
          ${r.icon}<span>${r.label}</span>${b?`<span class="rail-badge">${b}</span>`:''}</button>`;
      }).join('') +
      `<div class="spacer"></div>
       <button class="rail-btn ${cur==='settings'?'active':''}" data-act="nav:settings" title="ตั้งค่า">${IC.gear}<span>ตั้งค่า</span></button>
       <div class="rail-avatar" data-act="user-menu" title="Worapot — Admin">WP</div>`;
  },

  renderTopbar(r){
    const tb = $('#topbar');
    const notifs = Store.notifs();
    tb.innerHTML = `
      <div class="tb-title"><small>${r.sub}</small><h1>${r.title}</h1></div>
      <div class="tb-search">${IC.search}
        <input type="text" id="globalQ" placeholder="ค้นหาอะไรก็ได้ในระบบ… (งาน / อีเวนต์ / โปรเจกต์)">
        <div class="search-pop" id="searchPop"></div>
      </div>
      <div class="tb-actions">
        <div style="position:relative">
          <button class="icon-btn" id="bellBtn">${IC.bell}${notifs.length?'<span class="ping"></span>':''}</button>
          <div class="notif-pop" id="notifPop">
            <header>การแจ้งเตือน <span class="badge ${notifs.length?'b-red':'b-grey'}">${notifs.length}</span></header>
            <div style="max-height:330px;overflow:auto">
              ${notifs.length? notifs.map(n=>`
                <div class="notif-item" data-act="${n.act}"><span class="n-dot" style="background:${n.color}"></span>
                  <p>${n.html}<br><small>${n.sub}</small></p></div>`).join('')
                : `<div class="empty-state" style="padding:26px">${IC.bell}<p>ไม่มีแจ้งเตือน — เยี่ยม!</p></div>`}
            </div>
          </div>
        </div>
        <div class="user-chip" id="userChip">
          <span class="uc-av">WP</span>
          <span class="uc-name">Worapot<small>Administrator</small></span>
          ${IC.chevD}
          <div class="user-menu" id="userMenu">
            <a data-act="nav:settings">${IC.user} โปรไฟล์ของฉัน</a>
            <a data-act="nav:settings">${IC.gear} ตั้งค่าระบบ</a>
            <a href="https://mng.uarea.in/workspace" target="_blank" rel="noopener">${IC.link} กลับสู่ MNG Hub</a>
            <a data-act="logout">${IC.logout} ออกจากระบบ</a>
          </div>
        </div>
      </div>`;

    // bell dropdown
    $('#bellBtn').addEventListener('click', e=>{ e.stopPropagation(); $('#notifPop').classList.toggle('open'); $('#userMenu').classList.remove('open'); });
    // user menu
    $('#userChip').addEventListener('click', e=>{ e.stopPropagation(); $('#userMenu').classList.toggle('open'); $('#notifPop').classList.remove('open'); });
    // global search
    const gq = $('#globalQ'), pop = $('#searchPop');
    const doSearch = ()=>{
      const q = gq.value.trim().toLowerCase();
      if(q.length<2){ pop.classList.remove('open'); return; }
      const hits = [];
      Store.data.tasks.forEach(t=>{ if((t.title+t.code).toLowerCase().includes(q)) hits.push({type:'งาน',color:'#3BA7FF',title:t.title,sub:t.code+' · '+STATUS_META[t.status].label,act:`open-task:${t.id}`}); });
      Store.data.events.forEach(e=>{ if(e.title.toLowerCase().includes(q)) hits.push({type:'อีเวนต์',color:'#8E7CF3',title:e.title,sub:fmtD(e.date),act:`open-event:event:${e.id}`}); });
      Store.data.projects.forEach(p=>{ if(p.name.toLowerCase().includes(q)) hits.push({type:'โปรเจกต์',color:p.color,title:p.name,sub:p.client,act:`open-project:${p.id}`}); });
      pop.innerHTML = hits.slice(0,8).map(h=>`
        <div class="search-hit" data-act="${h.act}">
          <span class="sh-ico" style="background:${h.color}1c;color:${h.color}">${h.type==='งาน'?IC.task:h.type==='อีเวนต์'?IC.cal:IC.proj}</span>
          <span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.title)}</b></span>
          <small>${esc(h.sub)}</small>
        </div>`).join('') || `<div class="empty-state" style="padding:18px"><p>ไม่พบ “${esc(gq.value)}”</p></div>`;
      pop.classList.add('open');
    };
    gq.addEventListener('input', debounce(doSearch,200));
    gq.addEventListener('focus', doSearch);
  },

  /* ---------- global delegation ---------- */
  bindGlobal(){
    document.addEventListener('click', e=>{
      // close popovers
      if(!e.target.closest('.notif-pop') && !e.target.closest('#bellBtn')) $('#notifPop')?.classList.remove('open');
      if(!e.target.closest('#userChip')) $('#userMenu')?.classList.remove('open');
      if(!e.target.closest('.tb-search')) $('#searchPop')?.classList.remove('open');
      if(!e.target.closest('.day-pop') && !e.target.closest('[data-act="cal-more"]')) $('.day-pop')?.remove();

      const elAct = e.target.closest('[data-act]');
      if(!elAct) return;
      const raw = elAct.dataset.act;
      const [act, arg] = raw.includes(':') ? [raw.slice(0,raw.indexOf(':')), raw.slice(raw.indexOf(':')+1)] : [raw, null];
      const id = elAct.dataset.id;

      switch(act){
        case 'nav': this.go(arg||id); break;
        case 'open-task': openTaskModal(arg||id); break;
        case 'open-event': { const [k,i]=(arg||id).split(':'); if(k==='task') openTaskModal(i); else openEventModal(i); break; }
        case 'open-project': openProjectModal(arg||id); break;
        case 'open-invoice': openInvoiceModal(arg||id); break;
        case 'open-member': Store.ui.q.tasks = Store.userOf(id).name.split(' ')[0]; Store.ui.f.taskProj.clear(); this.go('tasks'); break;
        case 'chip': {
          const g = elAct.dataset.group;
          const set = g==='calCats' ? Store.ui.calCats : Store.ui.f[g];
          set.has(id) ? set.delete(id) : set.add(id);
          this.refresh(); break;
        }
        case 'task-mode': Store.ui.taskMode = id; this.refresh(); break;
        case 'new-task': openTaskForm(null, id); break;
        case 'new-event': openEventForm(); break;
        case 'new-project': openProjectForm(); break;
        case 'new-invoice': openInvoiceForm(); break;
        case 'mark-paid': markInvoicePaid(id); e.stopPropagation(); break;
        case 'cal-prev': shiftCal(-1); this.refresh(); break;
        case 'cal-next': shiftCal(1); this.refresh(); break;
        case 'cal-today': Store.ui.calCursor=new Date(); Store.ui.calSel=todayS(); this.refresh(); break;
        case 'cal-view': Store.ui.calView=id; if(id==='day') Store.ui.calCursor=s2d(Store.ui.calSel); Store.save(); this.refresh(); break;
        case 'cal-view-btn': Store.ui.calView=id; this.refresh(); break;
        case 'cal-day': Store.ui.calSel=id; Store.ui.calCursor=s2d(id); Store.ui.calView='day'; this.refresh(); break;
        case 'cal-add': openEventForm(null, id); e.stopPropagation(); break;
        case 'cal-more': showDayPopover(id, e.clientX, e.clientY); break;
        case 'cal-mini-day': Store.ui.calSel=id; Store.ui.calCursor=s2d(id); this.refresh(); break;
        case 'cal-mini-prev': Store.ui.calCursor=new Date(Store.ui.calCursor.getFullYear(),Store.ui.calCursor.getMonth()-1,1); this.refresh(); break;
        case 'cal-mini-next': Store.ui.calCursor=new Date(Store.ui.calCursor.getFullYear(),Store.ui.calCursor.getMonth()+1,1); this.refresh(); break;
        case 'cal-fullscreen': toggleFullscreen(); break;
        case 'dummy-switch': elAct.classList.toggle('on'); break;
        case 'export-csv': exportCSV(); break;
        case 'export-json': exportJSON(); break;
        case 'print': window.print(); break;
        case 'invite': toast('คัดลอกลิงก์เชิญแล้ว (โหมดสาธิต)','ok'); break;
        case 'save-settings': Store.save(); toast('บันทึกการตั้งค่าแล้ว'); break;
        case 'reset-data': confirmDlg('รีเซ็ตข้อมูลตัวอย่าง','ข้อมูลทั้งหมดที่แก้ไขจะหายและกลับเป็นชุดตัวอย่างเริ่มต้น ยืนยัน?', ()=>{ localStorage.removeItem(Store.KEY); location.reload(); }, 'รีเซ็ต'); break;
        case 'logout': toast('โหมดสาธิต — ยังเข้าสู่ระบบอยู่','warn'); break;
      }
    });
  },
};

/* ---------- calendar nav helpers ---------- */
function shiftCal(dir){
  const ui = Store.ui;
  if(ui.calView==='month'||ui.calView==='agenda') ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth()+dir, 1);
  else if(ui.calView==='week') ui.calCursor = addDays(ui.calCursor, dir*7);
  else { ui.calSel = d2s(addDays(s2d(ui.calSel), dir)); ui.calCursor = s2d(ui.calSel); }
}
function toggleFullscreen(){
  const shell = $('#appShell');
  if(!document.fullscreenElement){ shell.requestFullscreen?.().catch(()=>{}); shell.style.maxWidth='none'; toast('โหมดเต็มจอ — กด Esc เพื่อออก'); }
  else document.exitFullscreen();
}
function showDayPopover(ds, x, y){
  $('.day-pop')?.remove();
  const evs = Store.eventsOn(ds).filter(e=>Store.ui.calCats.has(e.cat));
  const pop = document.createElement('div');
  pop.className = 'day-pop';
  pop.innerHTML = `<header>${fmtD(ds)} <span class="badge b-purple">${evs.length} รายการ</span></header>
    <div class="dp-list">${evs.map(e=>`
      <div class="dp-item" data-act="open-event" data-id="${e.kind}:${e.id}">
        <span class="dp-bar" style="background:${Store.catColor(e.cat)}"></span>
        <div style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</b>
        <small style="color:var(--muted)">${e.allday||!e.start||e.start==='00:00'?'ตลอดวัน':e.start+'–'+(e.end||'')} · ${Store.data.eventCats[e.cat].label}</small></div>
      </div>`).join('')}</div>
    <div style="padding:10px 14px;border-top:1px solid var(--line)">
      <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" data-act="cal-add" data-id="${ds}">${IC.plus} เพิ่มกิจกรรมวันนี้</button></div>`;
  document.body.appendChild(pop);
  const w=300, h=Math.min(420, pop.offsetHeight||300);
  pop.style.left = Math.min(x, innerWidth - w - 18) + 'px';
  pop.style.top  = Math.min(y, innerHeight - h - 18) + 'px';
}

/* ============================================================
   MODALS — task detail / form
   ============================================================ */
function openTaskModal(id){
  const t = Store.getTask(id); if(!t) return;
  const p = Store.projectOf(t), u = Store.userOf(t.assignee);
  const dl = daysLeft(t.due);
  openModal(`
    <div class="td-head-band ${p.grad}">
      <div class="code">${t.code} · ${esc(p.name)}</div>
      <h3>${esc(t.title)}</h3>
    </div>
    <div class="modal-body" style="padding-top:0">
      <div class="td-meta">
        <div class="m"><small>ผู้รับผิดชอบ</small><b>${avatar(u)} ${esc(u.name)}</b></div>
        <div class="m"><small>สถานะ</small><b>${statusBadge(t.status)}</b></div>
        <div class="m"><small>ความสำคัญ</small><b>${prioBadge(t.priority)}</b></div>
        <div class="m"><small>เริ่ม</small><b>${fmtD(t.start)}</b></div>
        <div class="m"><small>ครบกำหนด</small><b style="color:${dl<0&&t.status!=='done'?'var(--red)':'inherit'}">${fmtD(t.due)} (${relDay(t.due)})</b></div>
        <div class="m"><small>ประเมินเวลา</small><b>${t.est||'—'} ชม.</b></div>
      </div>
      <div class="td-sec"><h4>ความคืบหน้า — ${t.progress}%</h4>
        <div class="progress" style="height:9px"><div style="width:${t.progress}%;background:${STATUS_META[t.status].color}"></div></div></div>
      ${t.desc?`<div class="td-sec"><h4>รายละเอียด</h4><p style="font-size:13px;color:var(--ink-2);line-height:1.7">${esc(t.desc)}</p></div>`:''}
      ${t.subtasks.length?`<div class="td-sec"><h4>งานย่อย (${t.subtasks.filter(s=>s.d).length}/${t.subtasks.length})</h4>
        <div class="sub-list">${t.subtasks.map((s,i)=>`
          <div class="sub-item ${s.d?'done':''}"><input type="checkbox" data-sub="${i}" ${s.d?'checked':''}><label>${esc(s.t)}</label></div>`).join('')}
        </div></div>`:''}
      <div class="td-sec"><h4>แท็ก</h4><div class="chips">${t.tags.map(tg=>`<span class="chip">${esc(tg)}</span>`).join('')||'<span style="color:var(--muted);font-size:12px">—</span>'}
        <span class="chip" style="background:${p.color}1c;color:${p.color}">${p.short}</span></div></div>
      <div class="td-sec"><h4>ความคิดเห็น (${t.comments.length})</h4>
        ${t.comments.map(c=>{const cu=Store.userOf(c.u);return `
          <div class="comment">${avatar(cu,'av-lg')}<div class="cb"><b style="font-size:11.5px">${esc(cu.name)}</b> — ${esc(c.text)}<small>${c.at}</small></div></div>`;}).join('')}
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="cmtInput" placeholder="เพิ่มความคิดเห็น…" style="flex:1;padding:9px 13px;border:1.5px solid var(--line-2);border-radius:11px;outline:none">
          <button class="btn btn-primary btn-sm" id="cmtBtn">ส่ง</button></div></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" id="tdDel">${IC.trash} ลบงาน</button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
      <button class="btn btn-primary" id="tdEdit">${IC.edit} แก้ไขงาน</button>
    </div>`, {wide:true});

  $$('#modalRoot [data-sub]').forEach(cb=>cb.addEventListener('change',()=>{
    t.subtasks[+cb.dataset.sub].d = cb.checked; Store.save();
    cb.closest('.sub-item').classList.toggle('done', cb.checked);
  }));
  $('#cmtBtn').onclick = ()=>{
    const v = $('#cmtInput').value.trim(); if(!v) return;
    const now = new Date();
    t.comments.push({u:'u1', at:`${todayS()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`, text:v});
    Store.logActivity(`คอมเมนต์ใน <b>${t.code}</b>: ${esc(v.slice(0,40))}`);
    Store.save(); closeModal(); openTaskModal(id); toast('เพิ่มความคิดเห็นแล้ว');
  };
  $('#tdEdit').onclick = ()=>openTaskForm(id);
  $('#tdDel').onclick = ()=>confirmDlg('ลบงานนี้?',`ต้องการลบ <b>${t.code} — ${esc(t.title)}</b> ใช่ไหม`,()=>{
    Store.data.tasks = Store.data.tasks.filter(x=>x.id!==id);
    Store.logActivity(`ลบงาน <b>${t.code}</b>`); Store.save(); App.refresh(); toast('ลบงานแล้ว','warn');
  });
}

function openTaskForm(id, presetStatus){
  const t = id ? Store.getTask(id) : {
    id:uid('t'), code:'MNG-'+(1040+Store.data.tasks.length), project:Store.data.projects[0].id,
    title:'', status:presetStatus||'todo', priority:'med', assignee:'u1',
    start:todayS(), due:todayS(), progress:0, est:8, tags:[], subtasks:[], comments:[], desc:''
  };
  openModal(`${modalHead(id?`แก้ไขงาน — ${t.code}`:'เพิ่มงานใหม่', id?'':'สร้างงานพร้อมกำหนดส่ง จะขึ้นปฏิทินอัตโนมัติ')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group full"><label>ชื่องาน *</label><input id="fTitle" value="${esc(t.title)}" placeholder="เช่น พัฒนาหน้า checkout"></div>
      <div class="f-group"><label>โปรเจกต์</label><select id="fProj">${Store.data.projects.map(p=>`<option value="${p.id}" ${p.id===t.project?'selected':''}>${esc(p.short)}</option>`).join('')}</select></div>
      <div class="f-group"><label>ผู้รับผิดชอบ</label><select id="fUser">${Store.data.team.map(u=>`<option value="${u.id}" ${u.id===t.assignee?'selected':''}>${esc(u.name)} — ${esc(u.role)}</option>`).join('')}</select></div>
      <div class="f-group"><label>สถานะ</label><select id="fStatus">${Object.entries(STATUS_META).map(([k,v])=>`<option value="${k}" ${k===t.status?'selected':''}>${v.label}</option>`).join('')}</select></div>
      <div class="f-group"><label>ความสำคัญ</label><select id="fPrio">${Object.entries(PRIO_META).map(([k,v])=>`<option value="${k}" ${k===t.priority?'selected':''}>${v.label}</option>`).join('')}</select></div>
      <div class="f-group"><label>วันเริ่ม</label><input type="date" id="fStart" value="${t.start}"></div>
      <div class="f-group"><label>กำหนดส่ง *</label><input type="date" id="fDue" value="${t.due}"></div>
      <div class="f-group"><label>ความคืบหน้า — <b id="progLbl">${t.progress}%</b></label><input type="range" id="fProg" min="0" max="100" value="${t.progress}" style="--p:${t.progress}%"></div>
      <div class="f-group"><label>ชั่วโมงประเมิน</label><input type="number" id="fEst" min="0" value="${t.est}"></div>
      <div class="f-group full"><label>แท็ก (คั่นด้วยจุลภาค)</label><input id="fTags" value="${esc(t.tags.join(', '))}" placeholder="Frontend, API"></div>
      <div class="f-group full"><label>รายละเอียด</label><textarea id="fDesc" placeholder="อธิบายขอบเขตงาน…">${esc(t.desc)}</textarea></div>
    </div></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" id="fSave">${id?'บันทึกการแก้ไข':'สร้างงาน'}</button>
    </div>`);
  const pr = $('#fProg');
  pr.addEventListener('input',()=>{ $('#progLbl').textContent = pr.value+'%'; pr.style.setProperty('--p', pr.value+'%'); });
  $('#fSave').onclick = ()=>{
    const title = $('#fTitle').value.trim();
    if(!title) return toast('กรุณาใส่ชื่องาน','err');
    Object.assign(t, {
      title, project:$('#fProj').value, assignee:$('#fUser').value,
      status:$('#fStatus').value, priority:$('#fPrio').value,
      start:$('#fStart').value||todayS(), due:$('#fDue').value||todayS(),
      progress:+pr.value, est:+$('#fEst').value||0,
      tags:$('#fTags').value.split(',').map(s=>s.trim()).filter(Boolean),
      desc:$('#fDesc').value.trim(),
    });
    if(t.status==='done') t.progress=100;
    if(!id){ Store.data.tasks.push(t); Store.logActivity(`สร้างงาน <b>${t.code}</b> — ${esc(title)}`); }
    else Store.logActivity(`แก้ไขงาน <b>${t.code}</b>`);
    Store.save(); closeModal(); App.refresh();
    toast(id?'บันทึกงานแล้ว':`สร้าง ${t.code} แล้ว — เดดไลน์ขึ้นปฏิทินอัตโนมัติ`);
  };
}

/* ============================================================
   MODALS — event detail / form
   ============================================================ */
function openEventModal(id){
  const e = Store.getEvent(id); if(!e) return;
  const cat = Store.data.eventCats[e.cat];
  const p = e.project ? Store.data.projects.find(x=>x.id===e.project) : null;
  openModal(`
    <div class="td-head-band" style="background:linear-gradient(120deg,${cat.color},${cat.color}cc)">
      <div class="code">${cat.label}${e.allday?' · ตลอดวัน':''}</div>
      <h3>${esc(e.title)}</h3>
    </div>
    <div class="modal-body" style="padding-top:0">
      <div class="td-meta">
        <div class="m"><small>วันที่</small><b>${fmtD(e.date)}<br><span style="font-weight:400;color:var(--muted);font-size:11px">${relDay(e.date)}</span></b></div>
        <div class="m"><small>เวลา</small><b>${e.allday?'ตลอดวัน':(e.start||'—')+' – '+(e.end||'—')}</b></div>
        <div class="m"><small>สถานที่</small><b>${esc(e.loc||'—')}</b></div>
        <div class="m"><small>ผู้เข้าร่วม</small><b>${avatarStack((e.members||[]).map(id=>Store.userOf(id)),5)} ${(e.members||[]).length} คน</b></div>
        <div class="m"><small>โปรเจกต์</small><b>${p?`<span class="badge" style="background:${p.color}1c;color:${p.color}">${p.short}</span>`:'—'}</b></div>
        <div class="m"><small>หมวด</small><b><span class="badge" style="background:${cat.color}1c;color:${cat.color}">${cat.label}</span></b></div>
      </div>
      ${e.desc?`<div class="td-sec"><h4>รายละเอียด</h4><p style="font-size:13px;color:var(--ink-2);line-height:1.7">${esc(e.desc)}</p></div>`:''}
      ${e.task?`<div class="td-sec"><button class="btn btn-ghost btn-sm" data-act="open-task" data-id="${e.task}">${IC.task} เปิดงานที่เกี่ยวข้อง</button></div>`:''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" id="evDel">${IC.trash} ลบ</button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
      <button class="btn btn-primary" id="evEdit">${IC.edit} แก้ไข</button>
    </div>`);
  $('#evEdit').onclick = ()=>openEventForm(id);
  $('#evDel').onclick = ()=>confirmDlg('ลบกิจกรรม?',`ต้องการลบ “${esc(e.title)}” ใช่ไหม`,()=>{
    Store.data.events = Store.data.events.filter(x=>x.id!==id);
    Store.save(); App.refresh(); toast('ลบกิจกรรมแล้ว','warn');
  });
}

function openEventForm(id, presetDate){
  const cats = Store.data.eventCats;
  const e = id ? Store.getEvent(id) : {
    id:uid('e'), title:'', cat:'meeting', date:presetDate||Store.ui.calSel||todayS(),
    start:'10:00', end:'11:00', allday:false, loc:'', members:['u1'], desc:''
  };
  openModal(`${modalHead(id?'แก้ไขกิจกรรม':'เพิ่มกิจกรรมในปฏิทิน','รองรับประชุม เดดไลน์ การเงิน วันหยุด และนัดส่วนตัว')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group full"><label>ชื่อกิจกรรม *</label><input id="eTitle" value="${esc(e.title)}" placeholder="เช่น ประชุมรีวิว sprint"></div>
      <div class="f-group full"><label>หมวดหมู่</label>
        <div class="cat-pick" id="eCat">${Object.entries(cats).map(([k,v])=>`
          <span class="chip ${k===e.cat?'on':''}" data-cat="${k}"><span class="dot" style="background:${v.color}"></span>${v.label}</span>`).join('')}</div></div>
      <div class="f-group"><label>วันที่ *</label><input type="date" id="eDate" value="${e.date}"></div>
      <div class="f-group"><label>&nbsp;</label><label style="display:flex;align-items:center;gap:8px;font-weight:500;cursor:pointer"><input type="checkbox" id="eAllDay" ${e.allday?'checked':''} style="width:16px;height:16px;accent-color:var(--purple)"> ตลอดทั้งวัน</label></div>
      <div class="f-group"><label>เวลาเริ่ม</label><input type="time" id="eStart" value="${e.start||'10:00'}"></div>
      <div class="f-group"><label>เวลาสิ้นสุด</label><input type="time" id="eEnd" value="${e.end||'11:00'}"></div>
      <div class="f-group"><label>สถานที่ / ลิงก์</label><input id="eLoc" value="${esc(e.loc||'')}" placeholder="Google Meet / ห้องประชุม 1"></div>
      <div class="f-group"><label>โปรเจกต์ (ถ้ามี)</label><select id="eProj"><option value="">— ไม่ระบุ —</option>${Store.data.projects.map(p=>`<option value="${p.id}" ${p.id===e.project?'selected':''}>${esc(p.short)}</option>`).join('')}</select></div>
      <div class="f-group full"><label>ผู้เข้าร่วม</label><div class="chips" id="eMembers">
        ${Store.data.team.map(u=>`<span class="chip ${e.members.includes(u.id)?'on':''}" data-m="${u.id}">${avatar(u)} ${esc(u.name)}</span>`).join('')}</div></div>
      <div class="f-group full"><label>รายละเอียด</label><textarea id="eDesc" placeholder="วาระ / หมายเหตุ…">${esc(e.desc||'')}</textarea></div>
    </div></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" id="eSave">${id?'บันทึก':'เพิ่มกิจกรรม'}</button>
    </div>`);
  let cat = e.cat;
  $$('#eCat .chip').forEach(c=>c.onclick=()=>{ cat=c.dataset.cat; $$('#eCat .chip').forEach(x=>x.classList.toggle('on', x===c)); });
  $$('#eMembers .chip').forEach(c=>c.onclick=()=>c.classList.toggle('on'));
  $('#eSave').onclick = ()=>{
    const title = $('#eTitle').value.trim();
    if(!title) return toast('กรุณาใส่ชื่อกิจกรรม','err');
    if(!$('#eDate').value) return toast('กรุณาเลือกวันที่','err');
    Object.assign(e,{
      title, cat, date:$('#eDate').value, allday:$('#eAllDay').checked,
      start:$('#eStart').value||'10:00', end:$('#eEnd').value||'11:00',
      loc:$('#eLoc').value.trim(), project:$('#eProj').value||undefined,
      members:$$('#eMembers .chip.on').map(c=>c.dataset.m),
      desc:$('#eDesc').value.trim(),
    });
    if(e.allday){ e.start='00:00'; e.end='23:59'; }
    if(!id){ Store.data.events.push(e); Store.logActivity(`สร้างกิจกรรม <b>${esc(title)}</b> วันที่ ${fmtD(e.date)}`); }
    Store.ui.calSel = e.date;
    Store.save(); closeModal(); App.refresh(); toast(id?'บันทึกกิจกรรมแล้ว':'เพิ่มกิจกรรมลงปฏิทินแล้ว');
  };
}

/* ============================================================
   MODALS — project / invoice / quick forms
   ============================================================ */
function openProjectModal(pid){
  const p = Store.data.projects.find(x=>x.id===pid); if(!p) return;
  const c = Store.clientOf(p);
  const ts = Store.data.tasks.filter(t=>t.project===pid);
  const openT = ts.filter(t=>t.status!=='done');
  openModal(`
    <div class="td-head-band ${p.grad}">
      <div class="code">${esc(c?c.name:'')} · ${fmtD(p.start,{short:true})} – ${fmtD(p.end,{short:true})}</div>
      <h3>${esc(p.name)}</h3>
    </div>
    <div class="modal-body" style="padding-top:0">
      <div class="td-meta">
        <div class="m"><small>สถานะ</small><b>${statusBadge(p.status)}</b></div>
        <div class="m"><small>ความคืบหน้า</small><b>${p.progress}%</b></div>
        <div class="m"><small>ทีม</small><b>${avatarStack(p.members.map(id=>Store.userOf(id)),5)}</b></div>
        <div class="m"><small>งบประมาณ</small><b>${p.budget?money(p.budget):'In-house'}</b></div>
        <div class="m"><small>ใช้ไป</small><b style="color:${p.budget&&p.spent/p.budget>.9?'var(--red)':'inherit'}">${p.budget?money(p.spent)+' ('+Math.round(p.spent/p.budget*100)+'%)':'—'}</b></div>
        <div class="m"><small>ส่งมอบ</small><b>${fmtD(p.end)} (${relDay(p.end)})</b></div>
      </div>
      ${p.desc?`<div class="td-sec"><h4>ขอบเขตงาน</h4><p style="font-size:13px;color:var(--ink-2);line-height:1.7">${esc(p.desc)}</p></div>`:''}
      <div class="td-sec"><h4>งานคงค้างในโปรเจกต์ (${openT.length})</h4>
        ${openT.slice(0,6).map(t=>`<div class="trow" style="padding-left:4px" data-act="open-task" data-id="${t.id}">
          <div class="tr-ico" style="background:${STATUS_META[t.status].color};border-radius:10px;font-size:9.5px">${STATUS_META[t.status].label.slice(0,2)}</div>
          <div class="tr-main"><b>${esc(t.title)}</b><small>${t.code} · ${Store.userOf(t.assignee).name}</small></div>
          <div class="tr-right"><b>${relDay(t.due)}</b><small>${prioBadge(t.priority)}</small></div></div>`).join('')||'<p style="color:var(--muted);font-size:12.5px">ปิดงานครบแล้ว 🎉</p>'}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
      <button class="btn btn-primary" id="pjGo">${IC.task} ดูงานทั้งหมดของโปรเจกต์</button>
    </div>`, {wide:true});
  $('#pjGo').onclick = ()=>{ Store.ui.f.taskProj = new Set([pid]); closeModal(); App.go('tasks'); };
}

function openProjectForm(){
  openModal(`${modalHead('เพิ่มโปรเจกต์ใหม่','ใส่เฉพาะข้อมูลหลัก — แก้ไขเพิ่มได้ภายหลัง')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group full"><label>ชื่อโปรเจกต์ *</label><input id="pName" placeholder="เช่น เว็บ e-commerce ร้าน X"></div>
      <div class="f-group"><label>ลูกค้า</label><select id="pClient">${Store.data.clients.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}<option value="Internal — MNG Groups">Internal</option></select></div>
      <div class="f-group"><label>งบประมาณ (บาท)</label><input type="number" id="pBudget" value="100000" min="0" step="1000"></div>
      <div class="f-group"><label>เริ่ม</label><input type="date" id="pStart" value="${todayS()}"></div>
      <div class="f-group"><label>ส่งมอบ</label><input type="date" id="pEnd" value="${d2s(addDays(new Date(),30))}"></div>
      <div class="f-group full"><label>สีการ์ด</label><div class="chips" id="pGrad">
        ${['g-blue','g-purple','g-pink','g-green','g-orange','g-teal','g-indigo','g-slate'].map((g,i)=>`<span class="chip ${i===0?'on':''}" data-g="${g}"><span class="dot" style="background:var(--${'blue,purple,pink,green,yellow,teal,indigo,muted'.split(',')[i]},#8a8fb1})"></span>${g}</span>`).join('')}</div></div>
    </div></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" id="pSave">สร้างโปรเจกต์</button></div>`);
  let grad='g-blue';
  $$('#pGrad .chip').forEach(c=>c.onclick=()=>{grad=c.dataset.g; $$('#pGrad .chip').forEach(x=>x.classList.toggle('on',x===c));});
  $('#pSave').onclick=()=>{
    const name=$('#pName').value.trim(); if(!name) return toast('กรุณาใส่ชื่อโปรเจกต์','err');
    const colors={'g-blue':'#2F6BF0','g-purple':'#6C5CE7','g-pink':'#F25C8B','g-green':'#14B890','g-orange':'#F2762E','g-teal':'#17A2B8','g-indigo':'#4B5ED9','g-slate':'#5A6280'};
    Store.data.projects.push({id:uid('p'), name, short:name.slice(0,14), client:$('#pClient').value, grad, color:colors[grad],
      status:'todo', progress:0, budget:+$('#pBudget').value||0, spent:0, start:$('#pStart').value, end:$('#pEnd').value, owner:'u1', members:['u1'], desc:''});
    Store.logActivity(`สร้างโปรเจกต์ <b>${esc(name)}</b>`); Store.save(); closeModal(); App.refresh(); toast('สร้างโปรเจกต์แล้ว');
  };
}

function openInvoiceModal(id){
  const i = Store.data.invoices.find(x=>x.id===id); if(!i) return;
  const cl = Store.data.clients.find(c=>c.id===i.client);
  openModal(`${modalHead(`ใบแจ้งหนี้ ${i.no}`, `${i.title} · ออก ${fmtD(i.issue)}`)}
    <div class="modal-body">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="display:flex;gap:11px;align-items:center">
          <div class="cc-logo" style="width:42px;height:42px;border-radius:12px;background:${cl.color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${initials(cl.short)}</div>
          <div><b>${esc(cl.name)}</b><div style="font-size:11.5px;color:var(--muted)">${esc(cl.contact)}</div></div>
        </div>${invBadge(i.status)}</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา</th></tr></thead>
        <tbody>${i.items.map(it=>`<tr><td>${esc(it.d)}</td><td style="text-align:right">${it.q}</td><td style="text-align:right" class="money">${money(it.p)}</td></tr>`).join('')}</tbody></table></div>
      <div style="text-align:right;margin-top:14px;line-height:2;font-size:13px">
        ยอดก่อน VAT <b class="money">${money(i.amount)}</b><br>
        VAT 7% <b class="money">${money(i.vat)}</b><br>
        <span style="font-size:16px">รวมสุทธิ <b class="money" style="color:var(--purple)">${money(i.amount+i.vat)}</b></span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">ครบกำหนดชำระ ${fmtD(i.due)} ${i.paid?`· ชำระเมื่อ ${fmtD(i.paid)}`:''}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-act="print">${IC.export} พิมพ์ / PDF</button>
      <div style="flex:1"></div>
      ${i.status!=='paid'?`<button class="btn btn-primary" data-act="mark-paid" data-id="${i.id}">${IC.check} บันทึกรับชำระ</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
    </div>`);
}

function markInvoicePaid(id){
  const i = Store.data.invoices.find(x=>x.id===id); if(!i) return;
  i.status='paid'; i.paid=todayS();
  Store.logActivity(`รับชำระใบแจ้งหนี้ <b>${i.no}</b> ${money(i.amount+i.vat)}`);
  Store.save(); closeModal(); App.refresh(); toast(`รับชำระ ${i.no} แล้ว ✓`);
}

function openInvoiceForm(){
  openModal(`${modalHead('สร้างใบแจ้งหนี้','ระบบคำนวณ VAT 7% ให้อัตโนมัติ')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group"><label>ลูกค้า</label><select id="iClient">${Store.data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="f-group"><label>ครบกำหนดชำระ</label><input type="date" id="iDue" value="${d2s(addDays(new Date(),7))}"></div>
      <div class="f-group full"><label>รายการ</label><input id="iTitle" placeholder="เช่น ค่าพัฒนางวด 2"></div>
      <div class="f-group"><label>ยอดก่อน VAT (บาท)</label><input type="number" id="iAmount" value="50000" min="0" step="1000"></div>
      <div class="f-group"><label>สถานะ</label><select id="iStatus"><option value="draft">ฉบับร่าง</option><option value="pending">รอชำระ (ออกเลย)</option></select></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:10px">VAT 7% จะถูกบวกอัตโนมัติตอนออกบิล</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" id="iSave">สร้างใบแจ้งหนี้</button></div>`);
  $('#iSave').onclick=()=>{
    const amt=+$('#iAmount').value||0, title=$('#iTitle').value.trim()||'ค่าบริการ';
    const no='INV-2026-0'+(46+Store.data.invoices.length);
    Store.data.invoices.push({id:uid('i'), no, client:$('#iClient').value, title, amount:amt, vat:Math.round(amt*.07),
      issue:todayS(), due:$('#iDue').value, status:$('#iStatus').value, items:[{d:title,q:1,p:amt}]});
    Store.logActivity(`สร้างใบแจ้งหนี้ <b>${no}</b> ${money(amt)}`); Store.save(); closeModal(); App.refresh(); toast(`สร้าง ${no} แล้ว`);
  };
}

/* ============================================================
   EXPORTS
   ============================================================ */
function download(name, content, type){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 800);
}
function exportCSV(){
  const rows = [['รหัส','ชื่องาน','โปรเจกต์','สถานะ','ความสำคัญ','ผู้รับผิดชอบ','เริ่ม','กำหนดส่ง','คืบหน้า %','ชม.ประเมิน']];
  Store.data.tasks.forEach(t=>rows.push([t.code, t.title, Store.projectOf(t).short, STATUS_META[t.status].label,
    PRIO_META[t.priority].label, Store.userOf(t.assignee).name, t.start, t.due, t.progress, t.est]));
  const csv = '\ufeff' + rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  download(`mng-tasks-${todayS()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('ส่งออก CSV แล้ว');
}
function exportJSON(){
  download(`mng-erp-backup-${todayS()}.json`, JSON.stringify(Store.data, null, 2), 'application/json');
  toast('ส่งออกข้อมูลสำรองแล้ว');
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', ()=>App.init());
