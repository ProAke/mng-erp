/* ============================================================
   MNG ERP — Views (dashboard, calendar, tasks, projects, finance,
   team, clients, reports, settings) — render into #view / #side
   ============================================================ */
'use strict';

/* ---------- shared side-panel builders ---------- */
function sideSearch(placeholder, key){
  return `<div class="side-block"><div class="side-search">${IC.search}
    <input type="text" id="sideQ" data-key="${key}" placeholder="${placeholder}" value="${esc(Store.ui.q[key]||'')}"></div></div>`;
}
function sideChips(title, items, selected, group){
  // items: [{id,label,color,count}]
  return `<div class="side-block"><h3>${title}</h3><div class="chips">
    ${items.map(it=>`<span class="chip ${selected.has(it.id)?'on':''}" data-act="chip" data-group="${group}" data-id="${it.id}">
      ${it.color?`<span class="dot" style="background:${it.color}"></span>`:''}${it.label}
      ${it.count!=null?`<span class="cnt">${it.count}</span>`:''}
      ${selected.has(it.id)?'<span class="x">✕</span>':''}</span>`).join('')}
  </div></div>`;
}
function promoCard(title, text, btn, act){
  return `<div class="promo"><h4>${title}</h4><p>${text}</p>
    <button class="promo-btn" data-act="${act}">${btn}</button></div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard(){
  const view = $('#view'), side = $('#side');
  const ui = Store.ui;
  const q = (ui.q.dash||'').toLowerCase();

  /* ----- side ----- */
  const openTasks = Store.data.tasks.filter(t=>t.status!=='done');
  side.innerHTML =
    sideSearch('ค้นหางาน หรือโปรเจกต์…','dash') +
    sideChips('โปรเจกต์', Store.data.projects.map(p=>({id:p.id,label:p.short,color:p.color,count:Store.data.tasks.filter(t=>t.project===p.id&&t.status!=='done').length})),
      ui.f.dashProjects,'dashProjects') +
    sideChips('สถานะงาน', Object.entries(STATUS_META).map(([k,v])=>({id:k,label:v.label,color:v.color,count:Store.data.tasks.filter(t=>t.status===k).length})),
      ui.f.dashStatus,'dashStatus') +
    `<div class="side-block range-wrap"><h3>งบประมาณขั้นต่ำ</h3>
      <div class="range-labels"><span>฿0</span><span id="budgetVal">${moneyK(ui.f.dashBudget)}</span></div>
      <input type="range" id="budgetRange" min="0" max="250000" step="10000" value="${ui.f.dashBudget}">
    </div>` +
    promoCard('สรุปประจำสัปดาห์','ดูผลงานทีมแบบรวมศูนย์ พร้อมส่งออกรายงานให้ผู้บริหาร','ดูรายงาน','nav:reports');
  wireSideCommon(view);
  const br = $('#budgetRange');
  if(br){ br.style.setProperty('--p', br.value/250000*100+'%');
    br.addEventListener('input', ()=>{ ui.f.dashBudget=+br.value; $('#budgetVal').textContent=moneyK(br.value); br.style.setProperty('--p', br.value/250000*100+'%'); renderDashboardMain(); });
  }

  renderDashboardMain();

  function renderDashboardMain(){
    const fProj = ui.f.dashProjects, fStat = ui.f.dashStatus;
    const match = t => (!fProj.size || fProj.has(t.project)) && (!fStat.size || fStat.has(t.status)) &&
      (!q || (t.title+t.code).toLowerCase().includes(q));

    /* KPIs */
    const doing = Store.data.projects.filter(p=>p.status==='doing').length;
    const overdue = openTasks.filter(t=>daysLeft(t.due)<0).length;
    const dueSoon = openTasks.filter(t=>{const d=daysLeft(t.due); return d>=0&&d<=3;}).length;
    const receivable = Store.data.invoices.filter(i=>['pending','overdue'].includes(i.status)).reduce((s,i)=>s+i.amount+i.vat,0);
    const completedWk = Store.data.tasks.filter(t=>t.status==='done' && daysLeft(t.due)>-7).length;

    /* featured: top open projects */
    const feats = Store.data.projects
      .filter(p=>p.status!=='done' && p.budget>=ui.f.dashBudget)
      .sort((a,b)=>b.progress-a.progress).slice(0,3);

    /* hot list */
    const hot = Store.data.tasks.filter(t=>match(t)&&t.status!=='done')
      .sort((a,b)=>({urgent:0,high:1,med:2,low:3}[a.priority]-{urgent:0,high:1,med:2,low:3}[b.priority]) || a.due.localeCompare(b.due)).slice(0,5);

    const stCount = Object.keys(STATUS_META).map(k=>Store.data.tasks.filter(t=>t.status===k).length);

    view.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard(IC.proj,'g-blue','linear-gradient(135deg,#3BA7FF,#2F6BF0)', doing, 'โปรเจกต์ที่กำลังทำ', '+2 เดือนนี้')}
        ${kpiCard(IC.task,'','linear-gradient(135deg,#A06BF5,#6C5CE7)', openTasks.length, `งานคงค้าง ${overdue?`<small style="color:var(--red)">(${overdue} ล่าช้า)</small>`:''}`, completedWk+' ปิดในสัปดาห์')}
        ${kpiCard(IC.alarm,'','linear-gradient(135deg,#FF9A5A,#FF6B5C)', dueSoon, 'ใกล้เดดไลน์ (≤ 3 วัน)', dueSoon?'ต้องเร่ง':'โล่งแล้ว')}
        ${kpiCard(IC.money,'','linear-gradient(135deg,#FF6B9D,#B950F0)', money(receivable), 'ยอดรอเก็บ (รวม VAT)', Store.data.invoices.filter(i=>i.status==='overdue').length+' ใบเกินกำหนด')}
      </div>

      <div class="section-ttl">${IC.flame} โปรเจกต์เด่น <span class="right">เหมือน Featured Jobs ใน reference — คลิกเพื่อดูรายละเอียด</span></div>
      <div class="feat-row">
        ${feats.map(p=>{const c=Store.clientOf(p); return `
          <div class="feat-card ${p.grad}" data-act="open-project" data-id="${p.id}">
            <div class="fc-top"><div class="fc-logo">${initials(p.short)}</div>
              <div><b>${esc(p.name)}</b><small>${esc(c?c.name:'')}</small></div></div>
            <div class="fc-tags"><span>${STATUS_META[p.status].label}</span><span>${p.members.length} คน</span><span>${Store.data.tasks.filter(t=>t.project===p.id&&t.status!=='done').length} งานคงค้าง</span></div>
            <div class="fc-bottom"><b>${p.budget?moneyK(p.budget):'In-house'}</b><span>ส่ง ${fmtD(p.end,{short:true})}</span></div>
            <div class="fc-prog"><div style="width:${p.progress}%"></div></div>
          </div>`;}).join('')}
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div class="card-title">${IC.flame} งานเร่งด่วน</div>
            <button class="link-btn" data-act="nav:tasks">ดูทั้งหมด</button></div>
          <div>${hot.length? hot.map(t=>{const p=Store.projectOf(t),u=Store.userOf(t.assignee);
            return `<div class="trow" data-act="open-task" data-id="${t.id}">
              <div class="tr-ico" style="background:${p.color}">${initials(p.short)}</div>
              <div class="tr-main"><b>${esc(t.title)}</b><small>${p.short} · ${prioBadge(t.priority)} · ${t.code}</small></div>
              <div class="tr-right"><b style="color:${daysLeft(t.due)<0?'var(--red)':'var(--ink)'}">${relDay(t.due)}</b>
                <small>${statusBadge(t.status)} ${avatar(u)}</small></div></div>`;}).join('')
            : `<div class="empty-state">${IC.task}<p>ไม่มีงานตามตัวกรอง</p></div>`}
          </div>
        </div>
        <div class="card chart-card">
          <div class="card-head" style="padding:0 0 12px"><div class="card-title">แนวโน้มงาน & รายได้</div>
            <div class="chart-tabs" id="dashTabs">
              <button class="${ui.dashTab==='work'?'on':''}" data-tab="work">งาน</button>
              <button class="${ui.dashTab==='revenue'?'on':''}" data-tab="revenue" style="${ui.dashTab==='revenue'?'background:var(--purple)':''}">รายได้</button>
            </div></div>
          <div id="dashChart"></div>
          <div class="legend" id="dashLegend"></div>
        </div>
      </div>

      <div class="dash-grid" style="margin-top:18px">
        <div class="card">
          <div class="card-head"><div class="card-title">${IC.cal} ปฏิทินสัปดาห์นี้</div>
            <button class="link-btn" data-act="nav:calendar">เปิดปฏิทินเต็มจอ</button></div>
          <div id="miniWeek"></div>
        </div>
        <div class="dash-grid" style="grid-template-columns:.9fr 1.1fr">
          <div class="card chart-card" style="text-align:center">
            <div class="card-title" style="justify-content:flex-start;margin-bottom:10px">สถานะงานทั้งหมด</div>
            <div id="dashDonut" style="display:flex;justify-content:center"></div>
            <div class="legend" style="justify-content:center;flex-wrap:wrap">
              ${Object.entries(STATUS_META).map(([k,v])=>`<span><i style="background:${v.color}"></i>${v.label}</span>`).join('')}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${IC.clock} กิจกรรมล่าสุด</div></div>
            <div style="max-height:260px;overflow:auto">
              ${Store.data.activity.slice(0,7).map(a=>{const u=Store.userOf(a.u);return `
                <div class="trow" style="cursor:default"><div class="tr-ico" style="background:${u.color};border-radius:50%">${initials(u.name)}</div>
                <div class="tr-main"><b style="font-weight:500;font-size:12.5px">${a.text}</b><small>${a.at}</small></div></div>`;}).join('')}
            </div>
          </div>
        </div>
      </div>`;

    // charts
    const tr = Store.data.trend;
    if(ui.dashTab==='work'){
      $('#dashChart').appendChild(lineChart({series:[tr.created,tr.completed],labels:tr.months,legend:['สร้างใหม่','ปิดงาน'],yFmt:v=>Math.round(v)+' งาน'}));
      $('#dashLegend').innerHTML = `<span><i style="background:#8E7CF3"></i>สร้างใหม่</span><span><i style="background:#22C793"></i>ปิดงานแล้ว</span>`;
    } else {
      $('#dashChart').appendChild(barChart({data:tr.revenue,labels:tr.months,highlight:9,yFmt:v=>'฿'+v+'k'}));
      $('#dashLegend').innerHTML = `<span><i style="background:#6C5CE7"></i>รายได้ต่อเดือน (พันบาท) — ปี 2569</span>`;
    }
    $$('#dashTabs button').forEach(b=>b.onclick=()=>{ui.dashTab=b.dataset.tab; renderDashboardMain();});
    $('#dashDonut').appendChild(donutChart({items:[
        {label:'รอดำเนินการ',value:stCount[0],color:'#c9cde4'},{label:'กำลังทำ',value:stCount[1],color:'#3BA7FF'},
        {label:'ตรวจแก้',value:stCount[2],color:'#FFB020'},{label:'เสร็จแล้ว',value:stCount[3],color:'#22C793'}],
      centerTop:Store.data.tasks.length, centerBottom:'งานทั้งหมด'}));
    renderMiniWeek($('#miniWeek'));
  }

  function kpiCard(icon, _g, grad, num, label, trend){
    return `<div class="kpi"><div class="k-ico" style="background:${grad};color:#fff">${icon}</div>
      <div><div class="k-num">${num}</div><div class="k-lbl">${label}</div></div>
      <span class="k-trend k-up">${trend}</span></div>`;
  }
}

function renderMiniWeek(root){
  const t = s2d(todayS());
  const monday = addDays(t, -(t.getDay()+6)%7);
  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:14px 16px 18px">`;
  for(let i=0;i<7;i++){
    const d=addDays(monday,i), ds=d2s(d), evs=Store.eventsOn(ds).slice(0,3);
    html += `<div style="background:${ds===todayS()?'var(--purple-soft)':'#f8f9fd'};border-radius:12px;padding:9px 6px;text-align:center;min-height:98px;cursor:pointer" data-act="cal-day" data-id="${ds}">
      <div style="font-size:10px;color:var(--muted);font-weight:600">${TH_DOW_S[d.getDay()]}</div>
      <div style="font-size:15px;font-weight:700;margin:2px 0 6px;${ds===todayS()?'color:var(--purple)':''}">${d.getDate()}</div>
      <div style="display:flex;flex-direction:column;gap:3px">${evs.map(e=>`<span style="height:5px;border-radius:4px;background:${Store.catColor(e.cat)}" title="${esc(e.title)}"></span>`).join('')||'<span style="font-size:9px;color:#c3c7dd">ว่าง</span>'}</div>
    </div>`;
  }
  root.innerHTML = html + '</div>';
}

/* ============================================================
   CALENDAR — big full screen
   ============================================================ */
function renderCalendar(){
  const view = $('#view'), side = $('#side');
  const ui = Store.ui;
  view.classList.add('no-scroll');

  /* ----- side: mini cal + categories + upcoming ----- */
  renderCalSide();
  function renderCalSide(){
    const cur = ui.calCursor;
    const mCount = monthEventsCount(cur);
    side.innerHTML =
      `<div class="side-block"><div class="mini-cal">
        <div class="mc-head"><b>${TH_MONTHS[cur.getMonth()]} ${cur.getFullYear()+543}</b>
          <span><button data-act="cal-mini-prev">‹</button> <button data-act="cal-mini-next">›</button></span></div>
        <div class="mc-grid">${TH_DOW_S.map(d=>`<span class="dow">${d}</span>`).join('')}
        ${miniCalDays(cur)}</div>
      </div></div>` +
      sideChips('หมวดหมู่อีเวนต์', Object.entries(Store.data.eventCats).map(([k,v])=>({id:k,label:v.label,color:v.color,count:mCount[k]||0})), ui.calCats, 'calCats') +
      `<div class="side-block"><div class="side-title-row"><h3>กำลังจะมาถึง</h3>
        <button class="link-btn" data-act="cal-view-btn" data-id="agenda">ทั้งหมด</button></div>
        ${Store.upcoming(5).map(e=>{const d=s2d(e.date);return `
        <div class="up-item" data-act="open-event" data-id="${e.kind}:${e.id}">
          <div class="up-date"><b>${d.getDate()}</b><i>${TH_MONTHS_S[d.getMonth()]}</i></div>
          <div class="up-info"><b>${esc(e.title)}</b><span>${relDay(e.date)}${e.start&&e.start!=='00:00'?' · '+e.start:''}</span></div>
          <span class="up-tag" style="background:${Store.catColor(e.cat)}"></span></div>`;}).join('')}
      </div>` +
      promoCard('ปฏิทินเต็มจอ','กดปุ่มขยายเต็มจอ หรือ F11 เพื่อโฟกัสกับตารางงานทั้งเดือน','ขยายเต็มจอ','cal-fullscreen');
  }
  function miniCalDays(cur){
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const start = addDays(first, -((first.getDay()+6)%7));
    let out = '';
    for(let i=0;i<42;i++){
      const d=addDays(start,i), ds=d2s(d);
      const dim = d.getMonth()!==cur.getMonth();
      out += `<span class="d ${dim?'dim':''} ${ds===todayS()?'today':''} ${ds===ui.calSel?'sel':''} ${Store.eventsOn(ds).length?'has':''}"
        data-act="cal-mini-day" data-id="${ds}">${d.getDate()}</span>`;
    }
    return out;
  }
  function monthEventsCount(cur){
    const m = cur.getMonth(), y = cur.getFullYear(), c = {};
    const s = d2s(new Date(y,m,1)), e = d2s(new Date(y,m+1,0));
    let d = s2d(s);
    while(d2s(d) <= e){ Store.eventsOn(d2s(d)).forEach(ev=>{c[ev.cat]=(c[ev.cat]||0)+1;}); d=addDays(d,1); }
    return c;
  }

  /* ----- main toolbar ----- */
  const cur = ui.calCursor;
  const titleTxt = ui.calView==='day'
    ? `${fmtD(ui.calSel)} <span class="be">${TH_DOW[s2d(ui.calSel).getDay()]}</span>`
    : `${TH_MONTHS[cur.getMonth()]} <span class="be">${cur.getFullYear()+543}</span>`;
  $('#topbarViewSlot');
  const viewEl = $('#view');
  viewEl.innerHTML = `<div class="cal-wrap">
    <div class="cal-toolbar">
      <h2>${titleTxt}</h2>
      <div class="cal-nav">
        <button class="icon-btn" data-act="cal-prev">${IC.chevL}</button>
        <button class="btn btn-ghost btn-sm" data-act="cal-today">วันนี้</button>
        <button class="icon-btn" data-act="cal-next">${IC.chevR}</button>
      </div>
      <div class="cal-legend">
        ${Object.entries(Store.data.eventCats).filter(([k])=>ui.calCats.has(k)).slice(0,6).map(([k,v])=>`<span class="lg"><i style="background:${v.color}"></i>${v.label}</span>`).join('')}
      </div>
      <div class="cal-view-sw">
        ${[['month','เดือน'],['week','สัปดาห์'],['day','วัน'],['agenda','กำหนดการ']].map(([k,l])=>
          `<button class="${ui.calView===k?'on':''}" data-act="cal-view" data-id="${k}">${l}</button>`).join('')}
      </div>
      <button class="icon-btn" title="เต็มจอ" data-act="cal-fullscreen">${IC.fullscreen}</button>
      <button class="btn btn-primary" data-act="new-event">${IC.plus} เพิ่มกิจกรรม</button>
    </div>
    <div class="cal-body" style="flex:1;min-height:0;display:flex;flex-direction:column" id="calBody"></div>
  </div>`;

  const body = $('#calBody');
  if(ui.calView==='month') renderMonth(body);
  else if(ui.calView==='week') renderWeek(body, false);
  else if(ui.calView==='day') renderWeek(body, true);
  else renderAgenda(body);

  Store._refreshCalSide = renderCalSide;

  /* ---------------- month view ---------------- */
  function renderMonth(root){
    const y=cur.getFullYear(), m=cur.getMonth();
    const first=new Date(y,m,1);
    const start=addDays(first,-((first.getDay()+6)%7));
    const weeks = Math.ceil((((first.getDay()+6)%7)+new Date(y,m+1,0).getDate())/7);
    let cells='';
    for(let w=0;w<weeks;w++){
      cells+='<div class="cal-wk">';
      for(let i=0;i<7;i++){
        const d=addDays(start,w*7+i), ds=d2s(d);
        const evs=Store.eventsOn(ds).filter(e=>ui.calCats.has(e.cat));
        const dim=d.getMonth()!==m, wkend=[0,6].includes(d.getDay());
        const shown=evs.slice(0,3), more=evs.length-3;
        cells+=`<div class="cal-cell ${dim?'dim':''} ${ds===todayS()?'today':''} ${wkend?'wkend':''}" data-date="${ds}">
          <span class="cal-dnum" data-act="cal-day" data-id="${ds}">${d.getDate()}</span>
          <button class="cal-add" data-act="cal-add" data-id="${ds}" title="เพิ่มกิจกรรม">+</button>
          ${shown.map(evPill).join('')}
          ${more>0?`<span class="cal-ev more" data-act="cal-more" data-id="${ds}">+${more} เพิ่มเติม</span>`:''}
        </div>`;
      }
      cells+='</div>';
    }
    root.innerHTML = `<div class="cal-grid" style="--rows:${weeks}">
      <div class="cal-dow">${TH_DOW.map(d=>`<div>${d}</div>`).join('')}</div>
      <div class="cal-days">${cells}</div></div>`;
    bindDnD(root);
  }
  function evPill(e){
    const cls = Store.data.eventCats[e.cat].cls;
    return `<span class="cal-ev ${cls}" draggable="true" data-drag="${e.kind}:${e.id}"
      data-act="open-event" data-id="${e.kind}:${e.id}" title="${esc(e.title)}">${e.start&&e.start!=='00:00'&&!e.allday?`<b>${e.start}</b> `:''}${esc(e.title)}</span>`;
  }

  /* ---------------- week / day view ---------------- */
  function renderWeek(root, single){
    const base = single ? s2d(ui.calSel) : (()=>{const t=new Date(cur); return addDays(t,-((t.getDay()+6)%7));})();
    const days = single ? [base] : Array.from({length:7},(_,i)=>addDays(base,i));
    const H0=7, H1=21, pxH=52;
    const hourLbls = Array.from({length:H1-H0},(_,i)=>`<div>${String(H0+i).padStart(2,'0')}:00</div>`).join('');
    const cols = days.map(d=>{
      const ds=d2s(d), evs=Store.eventsOn(ds).filter(e=>ui.calCats.has(e.cat));
      const allday = evs.filter(e=>e.allday||!e.start||e.start==='00:00');
      const timed  = evs.filter(e=>!(e.allday||!e.start||e.start==='00:00'));
      return `<div class="wk-col ${ds===todayS()?'today-col':''}" data-date="${ds}">
        ${ds===todayS()? `<div class="wk-now" style="top:${((new Date().getHours()*60+new Date().getMinutes())-H0*60)/60*pxH}px"></div>`:''}
        ${allday.map((e,i)=>`<div class="wk-ev ${Store.data.eventCats[e.cat].cls}" style="top:${i*26+2}px;height:24px;${allday.length>1?'z-index:4;':''}"
            data-act="open-event" data-id="${e.kind}:${e.id}">${esc(e.title)}</div>`).join('')}
        ${timed.map(e=>{
          const [sh,sm]=e.start.split(':').map(Number);
          const [eh,em]=(e.end||e.start).split(':').map(Number);
          const top=((sh*60+sm)-H0*60)/60*pxH;
          const h=Math.max(26,((eh*60+em)-(sh*60+sm))/60*pxH);
          return `<div class="wk-ev ${Store.data.eventCats[e.cat].cls}" style="top:${top}px;height:${h}px"
            data-act="open-event" data-id="${e.kind}:${e.id}"><small>${e.start}–${e.end||''}</small>${esc(e.title)}</div>`;
        }).join('')}
      </div>`;
    }).join('');
    root.innerHTML = `<div class="wk-grid" style="--cols:${days.length}">
      <div class="wk-head"><div class="wh-cell" style="border-left:none"></div>
        ${days.map(d=>{const ds=d2s(d);return `<div class="wh-cell ${ds===todayS()?'today':''}"><span>${TH_DOW_S[d.getDay()]}</span><b>${d.getDate()}</b></div>`;}).join('')}</div>
      <div class="wk-body"><div class="wk-times">${hourLbls}</div>${cols}</div></div>`;
    // keep all-day row height: add spacer offset via padding
    $$('.wk-col', root).forEach(c=>{
      const ds=c.dataset.date;
      const n=Store.eventsOn(ds).filter(e=>ui.calCats.has(e.cat)&&(e.allday||!e.start||e.start==='00:00')).length;
      if(n) c.style.paddingTop=(n*26+4)+'px';
    });
    $('.wk-body',root).scrollTop = (8-H0)*pxH - 20;
    bindDnD(root);
  }

  /* ---------------- agenda ---------------- */
  function renderAgenda(root){
    const y=cur.getFullYear(), m=cur.getMonth();
    const start=d2s(new Date(y,m,1)), end=d2s(new Date(y,m+1,0));
    let d=s2d(start), html='';
    while(d2s(d)<=end){
      const ds=d2s(d), evs=Store.eventsOn(ds).filter(e=>ui.calCats.has(e.cat));
      if(evs.length){
        html+=`<div class="ag-day">${fmtD(ds)} — ${TH_DOW[d.getDay()]} <span class="cnt">${evs.length} รายการ</span></div>`;
        html+=evs.sort((a,b)=>(a.start||'').localeCompare(b.start||'')).map(e=>`
          <div class="ag-row" data-act="open-event" data-id="${e.kind}:${e.id}">
            <span class="ag-time">${e.allday||!e.start||e.start==='00:00'?'ตลอดวัน':e.start+' – '+(e.end||'')}</span>
            <span class="ag-bar" style="background:${Store.catColor(e.cat)}"></span>
            <div class="ag-main"><b>${esc(e.title)}</b><small>${Store.data.eventCats[e.cat].label}${e.loc?' · '+esc(e.loc):''}</small></div>
            ${e.kind==='task'?`<span class="badge b-blue">งาน ${e.refCode||''}</span>`:''}
            <span class="badge b-grey">${Store.data.eventCats[e.cat].label}</span>
          </div>`).join('');
      }
      d=addDays(d,1);
    }
    root.innerHTML = `<div class="agenda">${html||`<div class="empty-state">${IC.cal}<p>ไม่มีกิจกรรมในเดือนนี้</p></div>`}</div>`;
  }

  /* ---------------- drag & drop ---------------- */
  function bindDnD(root){
    $$('[data-drag]', root).forEach(elm=>{
      elm.addEventListener('dragstart', ev=>{
        ev.dataTransfer.setData('text/plain', elm.dataset.drag);
        ev.dataTransfer.effectAllowed='move';
      });
    });
    $$('.cal-cell, .wk-col', root).forEach(cell=>{
      cell.addEventListener('dragover', ev=>{ev.preventDefault(); cell.classList.add('drop-ok');});
      cell.addEventListener('dragleave', ()=>cell.classList.remove('drop-ok'));
      cell.addEventListener('drop', ev=>{
        ev.preventDefault(); cell.classList.remove('drop-ok');
        const payload = ev.dataTransfer.getData('text/plain');
        const [kind,id]=payload.split(':');
        Store.moveToDate(kind, id, cell.dataset.date);
        toast('ย้ายกำหนดการแล้ว');
        renderCalendar();
      });
    });
  }
}

/* ============================================================
   TASKS — kanban + table
   ============================================================ */
function renderTasks(){
  const view = $('#view'), side = $('#side');
  const ui = Store.ui;
  const q = (ui.q.tasks||'').toLowerCase();

  side.innerHTML =
    sideSearch('ค้นหางาน (ชื่อ / รหัส)…','tasks') +
    sideChips('สถานะ', Object.entries(STATUS_META).map(([k,v])=>({id:k,label:v.label,color:v.color,count:Store.data.tasks.filter(t=>t.status===k).length})), ui.f.taskStatus,'taskStatus') +
    sideChips('ความสำคัญ', Object.entries(PRIO_META).map(([k,v])=>({id:k,label:v.label,count:Store.data.tasks.filter(t=>t.priority===k&&t.status!=='done').length})), ui.f.taskPrio,'taskPrio') +
    sideChips('โปรเจกต์', Store.data.projects.map(p=>({id:p.id,label:p.short,color:p.color})), ui.f.taskProj,'taskProj') +
    `<div class="side-block"><h3>มุมมอง</h3>
      <div class="chips">
        <span class="chip ${ui.taskMode==='board'?'on':''}" data-act="task-mode" data-id="board">${IC.gridview} บอร์ด</span>
        <span class="chip ${ui.taskMode==='table'?'on':''}" data-act="task-mode" data-id="table">${IC.list} ตาราง</span>
      </div></div>` +
    promoCard('ลากการ์ดได้เลย','ลากงานข้ามคอลัมน์เพื่อเปลี่ยนสถานะ — บันทึกอัตโนมัติ','เพิ่มงานใหม่','new-task');
  wireSideCommon(view);

  const match = t => (!ui.f.taskStatus.size||ui.f.taskStatus.has(t.status)) &&
    (!ui.f.taskPrio.size||ui.f.taskPrio.has(t.priority)) &&
    (!ui.f.taskProj.size||ui.f.taskProj.has(t.project)) &&
    (!q||(t.title+t.code+(Store.userOf(t.assignee)||{name:''}).name).toLowerCase().includes(q));
  const list = Store.data.tasks.filter(match);

  if(ui.taskMode==='board') renderBoard(list); else renderTable(list);

  function renderBoard(items){
    const cols = ['todo','doing','review','done'];
    view.innerHTML = `<div class="kb-wrap">` + cols.map(st=>{
      const cards = items.filter(t=>t.status===st)
        .sort((a,b)=>({urgent:0,high:1,med:2,low:3}[a.priority]-{urgent:0,high:1,med:2,low:3}[b.priority])||a.due.localeCompare(b.due));
      return `<div class="kb-col" data-status="${st}">
        <div class="kb-head"><span class="k-dot" style="background:${STATUS_META[st].color}"></span>${STATUS_META[st].label}
          <span class="kb-cnt">${cards.length}</span>
          <button class="kb-add" data-act="new-task" data-id="${st}" title="เพิ่มงาน">+</button></div>
        <div class="kb-cards">${cards.map(kbCard).join('')||`<div style="text-align:center;font-size:11.5px;color:var(--muted);padding:18px 0">ยังไม่มีงานในขั้นตอนนี้</div>`}</div>
      </div>`;
    }).join('') + `</div>`;

    $$('.kb-card', view).forEach(card=>{
      card.addEventListener('dragstart', ev=>{
        card.classList.add('dragging');
        ev.dataTransfer.setData('text/plain', card.dataset.id);
        ev.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
    });
    $$('.kb-col', view).forEach(col=>{
      col.addEventListener('dragover', ev=>{ev.preventDefault(); col.classList.add('drop-ok');});
      col.addEventListener('dragleave', ()=>col.classList.remove('drop-ok'));
      col.addEventListener('drop', ev=>{
        ev.preventDefault(); col.classList.remove('drop-ok');
        const id = ev.dataTransfer.getData('text/plain');
        const t = Store.getTask(id); if(!t) return;
        t.status = col.dataset.status;
        if(t.status==='done') t.progress=100;
        Store.logActivity(`ย้าย <b>${t.code}</b> ไปยัง "${STATUS_META[t.status].label}"`);
        Store.save();
        Remote.push('/tasks/'+t.id, 'PATCH', {status: t.status, progress: t.progress});
        toast(`ย้าย ${t.code} → ${STATUS_META[t.status].label}`);
        renderTasks();
      });
    });
  }
  function kbCard(t){
    const p=Store.projectOf(t), u=Store.userOf(t.assignee);
    const dl=daysLeft(t.due);
    return `<div class="kb-card ${dl<0&&t.status!=='done'?'overdue':''}" draggable="true" data-id="${t.id}" data-act="open-task">
      <div class="kc-top"><span class="kc-code">${t.code}</span>${prioBadge(t.priority)}</div>
      <div class="kc-title">${esc(t.title)}</div>
      <div class="kc-tags"><span class="badge" style="background:${p.color}18;color:${p.color}">${p.short}</span>
        ${t.tags.slice(0,2).map(tg=>`<span class="badge b-grey">${esc(tg)}</span>`).join('')}</div>
      <div class="progress"><div style="width:${t.progress}%;background:${STATUS_META[t.status].color}"></div></div>
      <div class="kc-meta">
        <span class="m due">${IC.clock} ${relDay(t.due)}</span>
        ${t.subtasks.length?`<span class="m">${IC.check} ${t.subtasks.filter(s=>s.d).length}/${t.subtasks.length}</span>`:''}
        ${t.comments.length?`<span class="m">${IC.comment} ${t.comments.length}</span>`:''}
        ${avatar(u)}
      </div></div>`;
  }
  function renderTable(items){
    items.sort((a,b)=>a.due.localeCompare(b.due));
    view.innerHTML = `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>รหัส</th><th>งาน</th><th>โปรเจกต์</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th>ความสำคัญ</th><th>คืบหน้า</th><th>กำหนดส่ง</th><th>ชม.ประเมิน</th></tr></thead>
      <tbody>${items.map(t=>{const p=Store.projectOf(t),u=Store.userOf(t.assignee);return `<tr data-act="open-task" data-id="${t.id}">
        <td class="t-code">${t.code}</td>
        <td><div class="t-title">${esc(t.title)}</div>${t.subtasks.length?`<div class="t-sub">งานย่อย ${t.subtasks.filter(s=>s.d).length}/${t.subtasks.length}</div>`:''}</td>
        <td><span class="badge" style="background:${p.color}18;color:${p.color}">${p.short}</span></td>
        <td>${avatar(u)} ${esc(u.name)}</td>
        <td>${statusBadge(t.status)}</td><td>${prioBadge(t.priority)}</td>
        <td style="min-width:110px"><div class="progress"><div style="width:${t.progress}%;background:${STATUS_META[t.status].color}"></div></div></td>
        <td><b style="color:${daysLeft(t.due)<0&&t.status!=='done'?'var(--red)':'inherit'}">${fmtD(t.due,{short:true})}</b> <span class="t-sub">${relDay(t.due)}</span></td>
        <td>${t.est||'—'} ชม.</td></tr>`;}).join('')}</tbody></table></div>
      ${items.length===0?`<div class="empty-state">${IC.task}<p>ไม่พบงานตามตัวกรอง</p></div>`:''}`;
  }
}

/* ============================================================
   PROJECTS
   ============================================================ */
function renderProjects(){
  const view = $('#view'), side = $('#side');
  const ui = Store.ui;
  side.innerHTML =
    sideChips('สถานะโปรเจกต์', [
      {id:'doing',label:'กำลังทำ',color:'#3BA7FF',count:Store.data.projects.filter(p=>p.status==='doing').length},
      {id:'review',label:'รอตรวจสอบ',color:'#FFB020',count:Store.data.projects.filter(p=>p.status==='review').length},
      {id:'todo',label:'ยังไม่เริ่ม',color:'#8a8fb1',count:Store.data.projects.filter(p=>p.status==='todo').length},
      {id:'done',label:'เสร็จแล้ว',color:'#22C793',count:Store.data.projects.filter(p=>p.status==='done').length},
    ], ui.f.projStatus,'projStatus') +
    promoCard('Websites & Apps','ทุกโปรเจกต์ของ MNG Groups ในที่เดียว พร้อมงบและความคืบหน้า','เพิ่มโปรเจกต์','new-project');

  const list = Store.data.projects.filter(p=>!ui.f.projStatus.size||ui.f.projStatus.has(p.status));
  view.innerHTML = `<div class="proj-grid">${list.map(p=>{
    const c=Store.clientOf(p);
    const ts=Store.data.tasks.filter(t=>t.project===p.id);
    const open=ts.filter(t=>t.status!=='done').length;
    const budgetPct = p.budget?Math.round(p.spent/p.budget*100):0;
    return `<div class="proj-card" data-act="open-project" data-id="${p.id}">
      <div class="pc-band ${p.grad}"><div><b>${esc(p.name)}</b><small>${esc(c?c.name:'')} · เริ่ม ${fmtD(p.start,{short:true})}</small></div>
        <div class="pc-logo">${initials(p.short)}</div></div>
      <div class="pc-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
          <b style="font-size:12.5px">ความคืบหน้า ${p.progress}%</b>${statusBadge(p.status)}</div>
        <div class="progress"><div style="width:${p.progress}%;background:${p.color}"></div></div>
        <div class="pc-stats">
          <div><b>${ts.length}</b><small>งานทั้งหมด</small></div>
          <div><b style="color:${open?'var(--ink)':'#0da678'}">${open}</b><small>คงค้าง</small></div>
          <div><b>${p.budget?moneyK(p.budget):'—'}</b><small>งบประมาณ</small></div>
          <div><b style="${budgetPct>90?'color:var(--red)':''}">${p.budget?budgetPct+'%':'—'}</b><small>ใช้งบไป</small></div>
        </div>
        <div class="pc-foot"><span>${IC.clock} ส่ง ${fmtD(p.end)}</span>${avatarStack(p.members.map(id=>Store.userOf(id)))}</div>
      </div></div>`;
  }).join('')}</div>`;
}

/* ============================================================
   FINANCE
   ============================================================ */
function renderFinance(){
  const view = $('#view'), side = $('#side');
  const ui = Store.ui;
  side.innerHTML =
    sideChips('สถานะใบแจ้งหนี้', Object.entries(INV_META).map(([k,v])=>({id:k,label:v.label,count:Store.data.invoices.filter(i=>i.status===k).length})), ui.f.invStatus,'invStatus') +
    promoCard('ออกใบแจ้งหนี้','สร้างใบแจ้งหนี้พร้อม VAT 7% และติดตามการชำระอัตโนมัติ','สร้างใบแจ้งหนี้','new-invoice');

  const list = Store.data.invoices.filter(i=>!ui.f.invStatus.size||ui.f.invStatus.has(i.status));
  const tot = st => Store.data.invoices.filter(i=>i.status===st).reduce((s,i)=>s+i.amount+i.vat,0);
  const paidYear = Store.data.invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+i.amount,0);

  view.innerHTML = `
    <div class="fin-summary">
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#3BA7FF,#2F6BF0);color:#fff">${IC.money}</div>
        <div><div class="k-num">${moneyK(paidYear)}</div><div class="k-lbl">เก็บแล้วปีนี้ (ก่อน VAT)</div></div><span class="k-trend k-up">+14%</span></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#FFD66B,#FFB020);color:#fff">${IC.clock}</div>
        <div><div class="k-num">${moneyK(tot('pending'))}</div><div class="k-lbl">รอชำระ (รวม VAT)</div></div></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#FF8AA5,#FF5C7A);color:#fff">${IC.alarm}</div>
        <div><div class="k-num">${moneyK(tot('overdue'))}</div><div class="k-lbl">เกินกำหนดชำระ</div></div><span class="k-trend k-down">${Store.data.invoices.filter(i=>i.status==='overdue').length} ใบ</span></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#8E9BB5,#5A6280);color:#fff">${IC.doc}</div>
        <div><div class="k-num">${Store.data.invoices.filter(i=>i.status==='draft').length}</div><div class="k-lbl">ฉบับร่างรอออก</div></div></div>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>เลขที่</th><th>รายการ</th><th>ลูกค้า</th><th>ยอดก่อน VAT</th><th>VAT 7%</th><th>รวมสุทธิ</th><th>ครบกำหนด</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${list.map(i=>{const c=Store.clientOf({client:i.client} );
        const cl = Store.data.clients.find(x=>x.id===i.client);
        return `<tr data-act="open-invoice" data-id="${i.id}">
        <td class="t-code">${i.no}</td>
        <td><div class="t-title">${esc(i.title)}</div><div class="t-sub">ออก ${fmtD(i.issue)}</div></td>
        <td><span class="badge" style="background:${cl.color}18;color:${cl.color}">${cl.short}</span></td>
        <td class="money">${money(i.amount)}</td><td>${money(i.vat)}</td>
        <td class="money" style="color:var(--purple)">${money(i.amount+i.vat)}</td>
        <td><b style="color:${i.status==='overdue'?'var(--red)':'inherit'}">${fmtD(i.due,{short:true})}</b></td>
        <td>${invBadge(i.status)}</td>
        <td>${i.status!=='paid'?`<button class="btn btn-ghost btn-sm" data-act="mark-paid" data-id="${i.id}">รับชำระ</button>`:'—'}</td></tr>`;}).join('')}</tbody></table></div>
    <div class="card chart-card" style="margin-top:18px">
      <div class="card-title" style="margin-bottom:14px">รายได้รายเดือน ปี 2569 (พันบาท)</div>
      <div id="finChart"></div>
    </div>`;
  $('#finChart').appendChild(barChart({data:Store.data.trend.revenue,labels:Store.data.trend.months,color:'#FFB020',highlight:9,yFmt:v=>'฿'+v+'k'}));
}

/* ============================================================
   TEAM
   ============================================================ */
function renderTeam(){
  const view=$('#view'), side=$('#side');
  side.innerHTML = sideSearch('ค้นหาสมาชิก…','team') +
    `<div class="side-block"><h3>ภาระงาน</h3>
      <div class="legend" style="flex-direction:column;gap:8px">
        <span><i style="background:#22C793"></i>โหลดปกติ (&lt; 30 ชม./สัปดาห์)</span>
        <span><i style="background:#FFB020"></i>ค่อนข้างหนัก (30–40 ชม.)</span>
        <span><i style="background:#FF5C7A"></i>หนักเกิน (&gt; 40 ชม.)</span>
      </div></div>` +
    promoCard('MNG Groups Team','ทีมเล็ก ไฟแรง — 6 คน ครบทุกสาย: ออกแบบ พัฒนา และทดสอบ','เชิญสมาชิก','invite');
  wireSideCommon(view);

  const q=(Store.ui.q.team||'').toLowerCase();
  const list = Store.data.team.filter(u=>!q||u.name.toLowerCase().includes(q)||u.role.toLowerCase().includes(q));
  view.innerHTML = `<div class="team-grid">${list.map(u=>{
    const open=Store.data.tasks.filter(t=>t.assignee===u.id&&t.status!=='done');
    const hrs=open.reduce((s,t)=>s+(t.est||0)*(1-t.progress/100),0);
    const done=Store.data.tasks.filter(t=>t.assignee===u.id&&t.status==='done').length;
    const pct=Math.min(100, Math.round(hrs/45*100));
    const col = hrs>40?'#FF5C7A':hrs>25?'#FFB020':'#22C793';
    return `<div class="team-card"><div class="av av-xl" style="background:${u.color};display:flex;align-items:center;justify-content:center;color:#fff">${initials(u.name)}${u.me?' <span style="font-size:9px"></span>':''}</div>
      <b class="name">${esc(u.name)}${u.me?' <span class="badge b-purple" style="font-size:9px">คุณ</span>':''}</b>
      <div class="role">${esc(u.role)}</div>
      <div class="t-stats"><div><b>${open.length}</b><small>งานคงค้าง</small></div><div><b>${done}</b><small>ปิดแล้ว</small></div><div><b>${Math.round(hrs)}</b><small>ชม.เหลือ</small></div></div>
      <div style="text-align:left;font-size:11px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between"><span>ภาระงานสัปดาห์นี้</span><b style="color:${col}">${pct}%</b></div>
      <div class="wkbar"><div style="width:${pct}%;background:${col}"></div></div>
      <div style="margin-top:12px;display:flex;gap:7px;justify-content:center">
        <button class="btn btn-ghost btn-sm" data-act="open-member" data-id="${u.id}">${IC.eye} งานของ${esc(u.name.split(' ')[0])}</button>
      </div></div>`;
  }).join('')}</div>`;
}

/* ============================================================
   CLIENTS
   ============================================================ */
function renderClients(){
  const view=$('#view'), side=$('#side');
  side.innerHTML = sideSearch('ค้นหาลูกค้า…','clients') +
    promoCard('ฐานลูกค้า MNG','ดูแลลูกค้า 6 ราย พร้อมยอดขายสะสมและโปรเจกต์ที่กำลังทำ','เพิ่มลูกค้า','invite');
  wireSideCommon(view);
  const q=(Store.ui.q.clients||'').toLowerCase();
  const list = Store.data.clients.filter(c=>!q||c.name.toLowerCase().includes(q)||c.contact.toLowerCase().includes(q));
  view.innerHTML = `<div class="client-grid">${list.map(c=>{
    const projs=Store.data.projects.filter(p=>p.client===c.name|| (Store.clientOf(p)||{}).id===c.id);
    const active=projs.filter(p=>p.status==='doing'||p.status==='review').length;
    const rev=Store.data.invoices.filter(i=>i.client===c.id&&i.status==='paid').reduce((s,i)=>s+i.amount,0);
    return `<div class="client-card">
      <div class="cc-top"><div class="cc-logo" style="background:linear-gradient(135deg,${c.color},${c.color}bb)">${initials(c.short)}</div>
        <div><b>${esc(c.name)}</b><small>ลูกค้าตั้งแต่ ${fmtD(c.since)}</small></div></div>
      <div class="cc-row">${IC.user} ${esc(c.contact)}</div>
      <div class="cc-row">${IC.phone} ${esc(c.phone)}</div>
      <div class="cc-row">${IC.mail} ${esc(c.email)}</div>
      <div class="cc-row">${IC.pin} ${esc(c.addr)}</div>
      <div class="cc-foot"><span>โปรเจกต์ที่กำลังทำ <b>${active}</b></span><span>ยอดเก็บแล้ว <b style="color:var(--purple)">${moneyK(rev)}</b></span></div>
    </div>`;}).join('')}</div>`;
}

/* ============================================================
   REPORTS
   ============================================================ */
function renderReports(){
  const view=$('#view'), side=$('#side');
  side.innerHTML = `<div class="side-block"><h3>ตัวเลือกรายงาน</h3>
      <div class="side-row"><label>ปีงบประมาณ</label><select class="mini-select"><option>2569 (2026)</option><option>2568 (2025)</option></select></div>
      <div class="side-row"><label>หน่วยเงิน</label><select class="mini-select"><option>บาท (฿)</option><option>พันบาท (k)</option></select></div>
      <div class="side-row"><label>เปรียบเทียบปีก่อน</label><button class="switch on" data-act="dummy-switch"></button></div>
    </div>
    <div class="side-block"><h3>ส่งออก</h3>
      <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-bottom:8px" data-act="export-csv">${IC.export} Export CSV — งานทั้งหมด</button>
      <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" data-act="export-json">${IC.export} Export JSON — ข้อมูลทั้งระบบ</button>
    </div>` +
    promoCard('สรุปผู้บริหาร','รายงานฉบับนี้พร้อมส่งให้ผู้บริหาร — ปรับช่วงเวลาได้จากตัวเลือก','พิมพ์รายงาน','print');

  const tr = Store.data.trend;
  const st = Object.keys(STATUS_META).map(k=>Store.data.tasks.filter(t=>t.status===k).length);
  view.innerHTML = `
    <div class="rep-grid">
      <div class="card chart-card span2">
        <div class="card-head" style="padding:0 0 12px"><div class="card-title">สร้างงาน vs ปิดงาน — รายเดือนปี 2569</div>
          <span class="badge b-purple">คงค้างสะสม ${Store.data.tasks.filter(t=>t.status!=='done').length} งาน</span></div>
        <div id="repLine"></div>
        <div class="legend"><span><i style="background:#8E7CF3"></i>สร้างใหม่</span><span><i style="background:#22C793"></i>ปิดงาน</span></div>
      </div>
      <div class="card chart-card">
        <div class="card-title" style="margin-bottom:14px">ชั่วโมงงานคงเหลือแยกตามโปรเจกต์</div>
        <div id="repHbar"></div>
      </div>
      <div class="card chart-card" style="text-align:center">
        <div class="card-title" style="text-align:left;margin-bottom:10px">สัดส่วนสถานะงาน</div>
        <div id="repDonut" style="display:flex;justify-content:center"></div>
        <div class="legend" style="justify-content:center;flex-wrap:wrap">
          ${Object.entries(STATUS_META).map(([k,v])=>`<span><i style="background:${v.color}"></i>${v.label} (${Store.data.tasks.filter(t=>t.status===k).length})</span>`).join('')}
        </div>
      </div>
      <div class="card chart-card span2">
        <div class="card-title" style="margin-bottom:14px">รายได้รายเดือน (พันบาท) + เส้นเป้าหมาย 350k</div>
        <div id="repBar"></div>
      </div>
    </div>`;
  $('#repLine').appendChild(lineChart({series:[tr.created,tr.completed],labels:tr.months,legend:['สร้างใหม่','ปิดงาน'],yFmt:v=>Math.round(v)+' งาน'}));
  $('#repHbar').appendChild(hbarChart({items:tr.workload.map(([n,v,c])=>[n,v,c]),vFmt:v=>v+' ชม.'}));
  $('#repDonut').appendChild(donutChart({items:[
    {label:'รอดำเนินการ',value:st[0],color:'#c9cde4'},{label:'กำลังทำ',value:st[1],color:'#3BA7FF'},
    {label:'ตรวจแก้',value:st[2],color:'#FFB020'},{label:'เสร็จแล้ว',value:st[3],color:'#22C793'}],
    centerTop:Store.data.tasks.length,centerBottom:'งานทั้งหมด'}));
  $('#repBar').appendChild(barChart({data:tr.revenue,labels:tr.months,color:'#FF6B9D',highlight:9,yFmt:v=>'฿'+v+'k'}));
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings(){
  const view=$('#view'), side=$('#side');
  side.innerHTML = `<div class="side-block"><h3>ตั้งค่า</h3>
      <div class="side-row"><label>โปรไฟล์ & องค์กร</label></div>
      <div class="side-row"><label>การแจ้งเตือน</label></div>
      <div class="side-row"><label>ธีมสี</label></div>
      <div class="side-row"><label>ข้อมูล & สำรอง</label></div>
    </div>` +
    promoCard('MNG ERP v2','ออกแบบตาม reference ที่ส่งมา — ปฏิทินใหญ่เต็มจอ ครบทุกโมดูล','กลับแดชบอร์ด','nav:dashboard');

  const st = Store.data.settings;
  const me = (Remote.on && Remote.user) ? Remote.user : { name:'ผู้ใช้สาธิต', email:'demo', role:'viewer', authId:0 };
  const isAdm = Remote.on && ['super_admin','admin'].includes(me.role);
  const ROLE_TH = { super_admin:'Super Admin', admin:'Admin', manager:'Manager', user:'User', viewer:'Viewer' };
  const ST_TH = { active:'ใช้งาน', inactive:'ปิดไว้', suspended:'ระงับ', pending:'รอยืนยัน' };
  const users = Store.data.authUsers;

  const userRows = (users||[]).map(u=>`
    <tr>
      <td><div style="display:flex;gap:9px;align-items:center">
        <div class="av" style="width:30px;height:30px;font-size:10px;background:${u.role==='super_admin'?'linear-gradient(135deg,#FFB26B,#FF6B9D)':'linear-gradient(135deg,#6C5CE7,#8E7CF3)'}">${esc(initials(u.name))}</div>
        <div><b>${esc(u.name)}</b>${u.authId===me.authId?' <small style="color:var(--purple)">(คุณ)</small>':''}${u.phone?`<br><small style="color:var(--muted)">${esc(u.phone)}</small>`:''}</div>
      </div></td>
      <td style="font-size:12px">${esc(u.email)}</td>
      <td><span class="urole ur-${u.role}">${ROLE_TH[u.role]||u.role}</span></td>
      <td><span class="ust ul-${u.status}">${ST_TH[u.status]||u.status}</span></td>
      <td style="font-size:11.5px;color:var(--muted)">${u.lastLogin ? esc(String(u.lastLogin).replace('T',' ').slice(0,16)) : 'ยังไม่เคย'}</td>
      <td><div style="display:flex;gap:2px;justify-content:flex-end">
        <button class="icon-btn" title="แก้ไขผู้ใช้" data-act="user-edit" data-id="${u.authId}">✏️</button>
        <button class="icon-btn" title="รีเซ็ตรหัสผ่าน" data-act="user-pass" data-id="${u.authId}">🔑</button>
        ${u.authId!==me.authId?`<button class="icon-btn" title="${u.status==='active'?'ระงับการใช้งาน':'เปิดใช้งาน'}" data-act="user-toggle" data-id="${u.authId}">${u.status==='active'?'⏸':'▶️'}</button>`:''}
      </div></td>
    </tr>`).join('');

  const adminSection = (Remote.on && isAdm) ? `
    <div class="card card-pad" style="grid-column:1/-1">
      <div class="card-head" style="margin-bottom:10px">
        <div class="card-title">🛡 ผู้ใช้และสิทธิ์ (Admin เท่านั้น)</div>
        <button class="btn btn-primary btn-sm" data-act="user-new">${IC.plus} เพิ่มผู้ใช้</button>
      </div>
      ${users===undefined
        ? '<div class="empty-state" style="padding:22px">กำลังโหลดรายชื่อผู้ใช้…</div>'
        : users.length ? `<div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>ผู้ใช้</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th style="text-align:right">จัดการ</th></tr></thead>
            <tbody>${userRows}</tbody></table></div>
            <p style="font-size:11px;color:var(--muted);margin-top:10px">ผู้ใช้ถูกเก็บในฐาน <b>pacific_mng.users</b> — ใช้ login ร่วมกับ MNG Hub ทุกระบบ · การเปลี่ยนสิทธิ์/ระงับมีผลทันที (session ถูกตรวจสดทุก request)</p>`
          : '<div class="empty-state" style="padding:22px">ยังไม่มีรายชื่อ</div>'}
    </div>` : '';

  view.innerHTML = `<div class="set-grid">
    ${adminSection}
    <div class="card card-pad">
      <div class="card-title" style="margin-bottom:8px">${IC.user} โปรไฟล์ & องค์กร</div>
      <div style="display:flex;gap:14px;align-items:center;margin:14px 0 18px">
        <div class="av av-xl" style="background:linear-gradient(135deg,#ffb26b,#ff6b9d)">${esc(initials(me.name||'W'))}</div>
        <div><b style="font-size:15px">${esc(me.name)} — ${ROLE_TH[me.role]||'ผู้ใช้'}</b><div style="font-size:12px;color:var(--muted)">${esc(me.email)} · MNG Groups</div></div>
      </div>
      <div class="form-grid">
        <div class="f-group"><label>ชื่อองค์กร</label><input value="MNG Groups" id="setOrg"></div>
        <div class="f-group"><label>โดเมน</label><input value="mng.uarea.in" disabled></div>
        <div class="f-group full"><label>คำอธิบาย</label><input value="Smart Dashboard & Work Tracking System" id="setDesc"></div>
      </div>
      <div class="card-title" style="margin:22px 0 4px">${IC.bell} การแจ้งเตือน</div>
      <div class="set-row"><div class="sr-info"><b>แจ้งเตือนงานใกล้เดดไลน์</b><small>ล่วงหน้า 3 วัน</small></div><button class="switch ${st.n1?'on':''}" data-set="n1"></button></div>
      <div class="set-row"><div class="sr-info"><b>แจ้งเตือนใบแจ้งหนี้เกินกำหนด</b><small>ทุกเช้น 09:00</small></div><button class="switch ${st.n2?'on':''}" data-set="n2"></button></div>
      <div class="set-row"><div class="sr-info"><b>สรุปรายวันทางอีเมล</b><small>ส่ง 08:00 ทุกวันจันทร์</small></div><button class="switch ${st.n3?'on':''}" data-set="n3"></button></div>
      <button class="btn btn-primary" style="margin-top:16px" data-act="save-settings">บันทึกการตั้งค่า</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card card-pad">
        <div class="card-title" style="margin-bottom:12px">${IC.gear} ธีมสีหลัก</div>
        <div class="theme-dots" id="themeDots">
          ${[['#6C5CE7','ม่วง MNG'],['#3BA7FF','น้ำเงิน'],['#FF6B9D','ชมพู'],['#14B890','เขียว'],['#FF8A3B','ส้ม'],['#4B5ED9','คราม']].map(([c,n])=>
            `<span class="theme-dot ${st.theme===c?'sel':''}" style="background:${c}" title="${n}" data-theme="${c}"></span>`).join('')}
        </div>
        <p style="font-size:11.5px;color:var(--muted);margin-top:12px">สีหลักใช้กับปุ่ม ไอคอน และปฏิทิน "วันนี้"</p>
      </div>
      ${Remote.on ? `<div class="card card-pad">
        <div class="card-title" style="margin-bottom:12px">🔑 เปลี่ยนรหัสผ่านของฉัน</div>
        <div class="f-group"><label>รหัสผ่านปัจจุบัน</label><input type="password" id="pwCur" autocomplete="current-password"></div>
        <div class="f-group"><label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label><input type="password" id="pwNew" autocomplete="new-password"></div>
        <div class="f-group"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="pwNew2" autocomplete="new-password"></div>
        <button class="btn btn-primary" data-act="self-pass">บันทึกรหัสผ่านใหม่</button>
      </div>` : ''}
      <div class="card card-pad">
        <div class="card-title" style="margin-bottom:10px">${IC.export} ข้อมูล & สำรอง</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <button class="btn btn-ghost" data-act="export-json">${IC.export} ส่งออกข้อมูลทั้งหมด (JSON)</button>
          <button class="btn btn-ghost" data-act="export-csv">${IC.export} ส่งออกงาน (CSV)</button>
          <button class="btn btn-danger" data-act="reset-data">${IC.trash} รีเซ็ตข้อมูลตัวอย่าง</button>
        </div>
      </div>
      <div class="card card-pad" style="font-size:12px;color:var(--muted);line-height:1.8">
        <b style="color:var(--ink)">เกี่ยวกับระบบ</b><br>
        MNG ERP — Work Tracking Management<br>
        Version 2.0.0 · สร้างสำหรับ MNG Groups<br>
        เชื่อมข้อมูลเดิมจาก MNG Workspace (17 โปรเจกต์ · Hub import)
      </div>
    </div>
  </div>`;
  $$('#themeDots .theme-dot').forEach(d=>d.onclick=()=>{st.theme=d.dataset.theme; Store.save(); Remote.push('/settings','PUT',st); App.applyTheme(); renderSettings(); toast('เปลี่ยนธีมสีแล้ว');});
  $$('[data-set]', view).forEach(sw=>sw.onclick=()=>{st[sw.dataset.set]=!st[sw.dataset.set]; sw.classList.toggle('on'); Store.save(); Remote.push('/settings','PUT',st);});
  // lazy-load รายชื่อผู้ใช้ (admin เท่านั้น) — ครั้งแรกที่เปิดหน้า settings
  if(isAdm && Store.data.authUsers===undefined) loadAuthUsers().catch(()=>{ Store.data.authUsers=[]; });
}

/* ---------- side search wiring ---------- */
function wireSideCommon(view){
  const inp = $('#sideQ');
  if(inp){ inp.addEventListener('input', ()=>{ Store.ui.q[inp.dataset.key]=inp.value; }); 
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') App.refresh(); });
    inp.addEventListener('input', debounce(()=>App.refresh(),350));
  }
}
function debounce(fn,ms){ let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);}; }
