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
   DASHBOARD — PlayDigital Layout (matched to i.playdigital.co.th)
   ============================================================ */
function renderDashboard(){
  ensureAgencyData();
  const view = $('#view'), side = $('#side');
  const ui = Store.ui;
  const q = (ui.q.dash||'').toLowerCase();
  const td = todayS();

  /* ----- side ----- */
  const openTasks = Store.data.tasks.filter(t=>t.status!=='done');
  const ckToday = Store.data.checkins.filter(c=>c.date===td).length;
  const bkToday = Store.data.bookings.filter(b=>b.date===td).length;

  side.innerHTML =
    sideSearch('ค้นหางาน หรือโปรเจกต์…','dash') +
    `<div class="side-block"><h3>ทางลัดระบบงาน</h3>
      <div class="side-quick-grid">
        <button class="side-quick-btn" data-act="nav:hr">🌿 เช็กอิน (${ckToday}/${Store.data.team.length})</button>
        <button class="side-quick-btn" data-act="nav:chat">💬 แชตทีม</button>
        <button class="side-quick-btn" data-act="nav:rooms">🚪 จองห้อง (${bkToday})</button>
        <button class="side-quick-btn" data-act="nav:finance">💳 การเงิน</button>
      </div>
    </div>` +
    sideChips('โปรเจกต์', Store.data.projects.map(p=>({id:p.id,label:p.code||p.short,color:p.color,count:Store.data.tasks.filter(t=>t.project===p.id&&t.status!=='done').length})),
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

    /* KPIs (exact 4 PlayDigital cards) */
    const doing = Store.data.projects.filter(p=>p.status==='doing').length;
    const overdue = openTasks.filter(t=>daysLeft(t.due)<0).length;
    const dueSoon = openTasks.filter(t=>{const d=daysLeft(t.due); return d>=0&&d<=3;}).length;
    const completedWk = Store.data.tasks.filter(t=>t.status==='done' && daysLeft(t.due)>=-7).length;

    const agents = [...(Store.data.aiAgents||[])].sort((a,b)=>String(a.code).localeCompare(String(b.code)));
    const aiActive = agents.filter(a=>!a.paused).length;
    const aiRunsToday = Math.max((Store.data.aiRuns||[]).length, agents.reduce((s,a)=>s+Math.min(5, +a.runs||0), 0));
    const aiDoneCnt = Store.data.tasks.filter(t=>t.aiAgentId && t.status==='done').length;

    /* featured: top open projects */
    const feats = Store.data.projects
      .filter(p=>p.status!=='done' && p.budget>=ui.f.dashBudget)
      .sort((a,b)=>b.progress-a.progress).slice(0,3);

    /* urgent / hot list */
    const hot = Store.data.tasks.filter(t=>match(t)&&t.status!=='done')
      .sort((a,b)=>({urgent:0,high:1,med:2,low:3}[a.priority]-{urgent:0,high:1,med:2,low:3}[b.priority]) || (a.due||'9999-12-31').localeCompare(b.due||'9999-12-31')).slice(0,5);

    const stCount = Object.keys(STATUS_META).map(k=>Store.data.tasks.filter(t=>t.status===k).length);
    const todayEvCnt = Store.data.events.filter(e=>e.date===td).length;
    const urgentCnt = openTasks.filter(t=>t.priority==='urgent'||daysLeft(t.due)<=0).length;
    const nowD = s2d(td);

    view.innerHTML = `
      <!-- Row 1: 4 PlayDigital KPI Cards -->
      <div class="kpi-grid">
        ${pdKpi({
          icon: IC.proj, grad: 'var(--grad-cyan)',
          num: doing, label: 'โปรเจกต์ที่กำลังทำ',
          pill: `+${Store.data.projects.length} ทั้งหมด`, pillCls: 'k-violet', act: 'nav:projects'
        })}
        ${pdKpi({
          icon: IC.task, grad: 'var(--grad-violet)',
          num: openTasks.length,
          label: `งานคงค้าง${overdue ? ` · <span style="color:var(--red);font-weight:600">${overdue} เลยกำหนด</span>` : ''}`,
          pill: `${completedWk} ปิดแล้ว`, pillCls: 'k-neutral', act: 'nav:tasks'
        })}
        ${pdKpi({
          icon: IC.alarm, grad: 'var(--grad-amber)',
          num: dueSoon, label: 'ใกล้เดดไลน์ (≤ 3 วัน)',
          pill: dueSoon ? 'ต้องเร่ง' : 'โล่ง', pillCls: dueSoon ? 'k-warn' : 'k-up', act: 'nav:tasks'
        })}
        ${pdKpi({
          icon: IC.bot, grad: 'var(--grad-mint)',
          num: agents.length,
          label: `AI agents · <span style="color:#0f9d6e;font-weight:600">${aiActive} กำลังทำงาน</span>`,
          pill: `${aiRunsToday} runs วันนี้`, pillCls: 'k-violet', act: 'nav:ai'
        })}
      </div>

      <!-- Row 2: AI กำลังทำงาน Live Strip -->
      <div class="ai-live-banner">
        <div class="ai-live-head">
          <div class="ai-live-title">
            <span class="ai-live-dot" style="${aiActive?'':'background:var(--amber);box-shadow:0 0 0 3px var(--yellow-soft)'}"></span>
            <b>AI กำลังทำงาน</b>
            <span>เอเจนต์ลงมือทำงานเหมือนคน — มีงาน มี log มี token</span>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="nav:ai">เปิด AI Workforce</button>
        </div>
        <div class="ai-strip-grid">
          ${agents.map(a => {
            const curTask = Store.data.tasks.find(t => t.aiAgentId === a.id && t.status !== 'done');
            const isLive = !a.paused;
            return `<div class="ai-strip-item ${isLive && curTask ? 'is-live' : ''}" onclick="${curTask ? `openTaskModal('${curTask.id}')` : `openAiDispatchModal('${a.id}')`}">
              <div class="ai-strip-top">
                <b>${esc(a.code)}</b>
                <span class="ai-state-pill ${isLive ? 'live' : 'idle'}">${isLive ? 'live' : 'พัก'}</span>
              </div>
              <div class="ai-strip-sub">
                ${!isLive ? 'พักการทำงาน'
                  : curTask ? `กำลังทำงาน <span class="code-pill">${esc(curTask.code)}</span>`
                  : `พร้อมรับงาน · ${esc(a.role.split(' ')[0])}`}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Row 3: งานเร่งด่วน + แนวโน้มงาน & รายได้ -->
      <div class="dash-grid">
        <div class="card">
          <div class="card-head">
            <div class="card-title">งานเร่งด่วน</div>
            <button class="link-btn" data-act="nav:tasks">ดูทั้งหมด</button>
          </div>
          <div>${hot.length ? hot.map(t => {
            const p = Store.projectOf(t), u = Store.userOf(t.assignee);
            const pCode = (p.code || initials(p.short)).slice(0, 3).toUpperCase();
            const dl = daysLeft(t.due);
            const dueLbl = dl < 0 ? `เลย ${-dl} วัน` : relDay(t.due);
            return `<div class="trow" data-act="open-task" data-id="${t.id}">
              <div class="tr-ico" style="background:${p.color}">${esc(pCode)}</div>
              <div class="tr-main">
                <b>${esc(t.title)}</b>
                <small><span class="mono-code" style="color:var(--violet)">${esc(t.code)}</span> · ${prioBadge(t.priority)} · ${esc(p.name)}</small>
              </div>
              <div class="tr-right">
                <b style="color:${dl<0?'var(--red)':dl===0?'#c27d00':'var(--ink)'}">${dueLbl}</b>
                <small>${avatar(u)}</small>
              </div>
            </div>`;
          }).join('') : `<div class="empty-state">${IC.task}<p>ไม่มีงานเร่งด่วนตามตัวกรอง</p></div>`}</div>
        </div>

        <div class="card chart-card">
          <div class="card-head" style="padding:0 0 12px">
            <div class="card-title">แนวโน้มงาน & รายได้</div>
            <div class="chart-tabs" id="dashTabs">
              <button class="${ui.dashTab==='work'?'on':''}" data-tab="work">งาน</button>
              <button class="${ui.dashTab==='revenue'?'on':''}" data-tab="revenue">รายได้</button>
            </div>
          </div>
          <div id="dashChart"></div>
          <div class="legend" id="dashLegend"></div>
        </div>
      </div>

      <!-- Row 4: โปรเจกต์เด่น -->
      <div class="section-ttl">
        โปรเจกต์เด่น <span class="sub-inline">คลิกเพื่อดูงานในโปรเจกต์</span>
        <button class="right" data-act="nav:tasks">ไปที่บอร์ดงาน</button>
      </div>
      <div class="feat-row">
        ${feats.map(p => {
          const c = Store.clientOf(p);
          const pCode = (p.code || initials(p.short)).slice(0, 3).toUpperCase();
          const openCnt = Store.data.tasks.filter(t=>t.project===p.id&&t.status!=='done').length;
          const dLeft = daysLeft(p.end);
          return `<div class="feat-card ${p.grad}" data-act="open-project" data-id="${p.id}">
            <div class="fc-top">
              <div class="fc-logo">${esc(pCode)}</div>
              <div><b>${esc(p.name)}</b><small>${esc(c ? c.name : (p.client || 'MNG Internal'))}</small></div>
            </div>
            <div class="fc-tags">
              <span>${STATUS_META[p.status]?.label || 'กำลังทำ'}</span>
              <span>${p.members.length} คน</span>
              <span>${openCnt} งานคงค้าง</span>
            </div>
            <div class="fc-bottom">
              <b>${p.budget ? money(p.budget) : 'In-house'}</b>
              <span>ส่ง ${fmtD(p.end, {short:true})} · ${dLeft >= 0 ? `${dLeft} วัน` : `เลย ${-dLeft} วัน`}</span>
            </div>
            <div class="fc-prog"><div style="width:${p.progress}%"></div></div>
          </div>`;
        }).join('')}
      </div>

      <!-- Row 5: ปฏิทินสัปดาห์นี้ + สถานะงานทั้งหมด -->
      <div class="dash-grid">
        <div class="card">
          <div class="card-head">
            <div class="card-title">ปฏิทินสัปดาห์นี้</div>
            <button class="link-btn" data-act="nav:calendar">เปิดปฏิทินเต็มจอ</button>
          </div>
          <div id="miniWeek"></div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between">
          <div class="card-head">
            <div class="card-title">สถานะงานทั้งหมด</div>
            <span class="badge b-grey">${Store.data.tasks.length} งาน</span>
          </div>
          <div class="status-split">
            <div id="dashDonut" style="display:flex;justify-content:center"></div>
            <div class="status-rows">
              ${[
                ['รอดำเนินการ', stCount[0], '#c9cde4'],
                ['กำลังทำ',     stCount[1], '#3ba7ff'],
                ['ตรวจแก้',     stCount[2], '#ffb020'],
                ['เสร็จแล้ว',   stCount[3], '#22c793'],
              ].map(([lbl, cnt, col]) => `
                <div class="status-row">
                  <span class="sr-left"><span class="sr-dot" style="background:${col}"></span>${lbl}</span>
                  <b>${cnt}</b>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="card-foot-note">
            <span>งานเลยกำหนด <b style="color:${overdue?'var(--red)':'var(--ink)'}">${overdue}</b> · วันนี้ <b>${todayEvCnt}</b> นัด</span>
            <button class="link-btn" data-act="nav:tasks">จัดการงาน →</button>
          </div>
        </div>
      </div>

      <!-- Row 6: 3-Column Bottom Grid (ภาระงานทีม · AI utilization · กิจกรรมล่าสุด) -->
      <div class="dash-tri-grid">
        <div class="card" style="display:flex;flex-direction:column">
          <div class="card-head">
            <div class="card-title">ภาระงานทีม</div>
            <span style="font-size:11.5px;color:var(--muted)">ชม./สัปดาห์</span>
          </div>
          <div class="util-list">
            ${Store.data.team.map(u => {
              const hrs = Store.data.tasks.filter(t=>t.assignee===u.id&&t.status!=='done')
                .reduce((s,t)=>s+(t.est||6)*(1-(t.progress||0)/100), 0);
              const pct = Math.min(100, Math.max(12, Math.round(hrs/40*100)));
              const col = pct > 85 ? 'var(--red)' : pct > 68 ? 'var(--amber)' : 'var(--violet)';
              return `<div class="util-row">
                ${avatar(u)}
                <div class="util-main">
                  <div class="util-top"><span>${esc(u.name)}</span><b>${pct}%</b></div>
                  <div class="progress"><div style="width:${pct}%;background:${col}"></div></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div class="card-head">
              <div class="card-title">AI utilization</div>
              <span style="font-size:11.5px;color:var(--muted)">tokens วันนี้</span>
            </div>
            <div class="util-list">
              ${agents.map(a => {
                const pct = Math.min(100, Math.max(4, Math.round(((+a.tokensToday || 1200) / 30000) * 100)));
                return `<div class="util-row" style="cursor:pointer" onclick="openAiDispatchModal('${a.id}')">
                  <span class="util-ai-badge">AI</span>
                  <div class="util-main">
                    <div class="util-top"><span style="font-family:var(--font-mono);font-weight:600">${esc(a.code)}</span><b>${pct}%</b></div>
                    <div class="progress"><div style="width:${pct}%;background:${a.color || 'var(--violet)'}"></div></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="card-foot-note">
            <span>งานที่ AI ปิดแล้ว <b>${aiDoneCnt}</b> · run วันนี้ <b>${aiRunsToday}</b></span>
            <button class="link-btn" data-act="nav:ai">AI Hub</button>
          </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column">
          <div class="card-head">
            <div class="card-title">กิจกรรมล่าสุด</div>
          </div>
          <div style="max-height:286px;overflow-y:auto">
            ${Store.data.activity.slice(0, 7).map(a => {
              const isAi = String(a.text||'').includes('🤖') || String(a.u||'').startsWith('ai');
              const u = Store.userOf(a.u);
              return `<div class="trow" style="padding:10px 18px;cursor:default">
                ${isAi
                  ? `<span class="util-ai-badge">AI</span>`
                  : `<div class="av" style="background:${u.color}">${initials(u.name)}</div>`}
                <div class="tr-main">
                  <b style="font-weight:500;font-size:12.5px;white-space:normal;line-height:1.4">${a.text}</b>
                  <small>${esc(isAi ? 'AI Workforce' : u.name.split(' ')[0])} · ${esc(a.at)}</small>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Row 7: Bottom Today Dock (matches i.playdigital.co.th) -->
      <div class="today-dock">
        <div class="today-dock-left">
          <div class="today-dock-ico">📅</div>
          <div>
            <b>วันนี้ · ${TH_DOW[nowD.getDay()]} ${nowD.getDate()} ${TH_MONTHS[nowD.getMonth()]} ${nowD.getFullYear()+543}</b>
            <span>นัดหมาย ${todayEvCnt} รายการ · งานด่วน ${urgentCnt} · AI กำลังทำงาน ${aiActive} ตัว</span>
          </div>
        </div>
        <div class="today-dock-actions">
          <button class="btn btn-ghost btn-sm" data-act="new-event">${IC.plus} เพิ่มนัด</button>
          <button class="btn btn-primary btn-sm" data-act="nav:calendar">เปิดปฏิทิน</button>
        </div>
      </div>`;

    // charts
    const tr = Store.data.trend;
    if(ui.dashTab==='work'){
      $('#dashChart').appendChild(lineChart({series:[tr.created,tr.completed],labels:tr.months,colors:['#8e7cf3','#22c793'],legend:['งานสร้างใหม่','ปิดงานแล้ว'],yFmt:v=>Math.round(v)}));
      $('#dashLegend').innerHTML = `<span><i style="background:#8e7cf3"></i>งานสร้างใหม่</span><span><i style="background:#22c793"></i>ปิดงานแล้ว</span>`;
    } else {
      $('#dashChart').appendChild(barChart({data:tr.revenue,labels:tr.months,color:'#6c5ce7',highlight:9,yFmt:v=>'฿'+v+'k'}));
      $('#dashLegend').innerHTML = `<span><i style="background:#6c5ce7"></i>รายได้ต่อเดือน (พันบาท) — ปี 2569</span>`;
    }
    $$('#dashTabs button').forEach(b=>b.onclick=()=>{ui.dashTab=b.dataset.tab; renderDashboardMain();});
    $('#dashDonut').appendChild(donutChart({
      size: 148,
      items:[
        {label:'รอดำเนินการ',value:stCount[0],color:'#c9cde4'},
        {label:'กำลังทำ',value:stCount[1],color:'#3ba7ff'},
        {label:'ตรวจแก้',value:stCount[2],color:'#ffb020'},
        {label:'เสร็จแล้ว',value:stCount[3],color:'#22c793'},
      ],
      centerTop: Store.data.tasks.length,
      centerBottom: 'งานในระบบ'
    }));
    renderMiniWeek($('#miniWeek'));
  }
}

function renderMiniWeek(root){
  const t = s2d(todayS());
  const monday = addDays(t, -(t.getDay()+6)%7);
  let html = `<div class="pd-week-grid">`;
  for(let i=0;i<7;i++){
    const d=addDays(monday,i), ds=d2s(d), evs=Store.eventsOn(ds).slice(0,2);
    const isToday = ds===todayS();
    html += `<div class="pd-day-col ${isToday?'is-today':''}" data-act="cal-day" data-id="${ds}">
      <div class="pd-day-dow">${TH_DOW_S[d.getDay()]}.</div>
      <div class="pd-day-num">${d.getDate()}</div>
      ${evs.length
        ? evs.map(e => {
            const cls = Store.data.eventCats[e.cat]?.cls || 'ev-task';
            return `<div class="pd-day-ev ${cls}" title="${esc(e.title)}">${esc(e.title)}</div>`;
          }).join('')
        : `<div class="pd-day-empty">ว่าง</div>`}
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
    const p=Store.projectOf(t), u=Store.userOf(t.assignee), ag=t.aiAgentId?aiAgentOf(t.aiAgentId):null;
    const dl=daysLeft(t.due);
    return `<div class="kb-card ${dl<0&&t.status!=='done'?'overdue':''}" draggable="true" data-id="${t.id}" data-act="open-task">
      <div class="kc-top"><span class="kc-code">${t.code}</span>${prioBadge(t.priority)}</div>
      <div class="kc-title">${esc(t.title)}</div>
      <div class="kc-tags"><span class="badge" style="background:${p.color}18;color:${p.color}">${p.short}</span>
        ${ag?`<span class="ai-copilot-tag">✨ ${esc(ag.code)}</span>`:''}
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
    items.sort((a,b)=>(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31'));
    view.innerHTML = `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>รหัส</th><th>งาน</th><th>โปรเจกต์</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th>ความสำคัญ</th><th>คืบหน้า</th><th>กำหนดส่ง</th><th>ชม.ประเมิน</th></tr></thead>
      <tbody>${items.map(t=>{const p=Store.projectOf(t),u=Store.userOf(t.assignee),ag=t.aiAgentId?aiAgentOf(t.aiAgentId):null;return `<tr data-act="open-task" data-id="${t.id}">
        <td class="t-code">${t.code}</td>
        <td><div class="t-title">${esc(t.title)} ${ag?`<span class="ai-copilot-tag">✨ ${esc(ag.code)}</span>`:''}</div>${t.subtasks.length?`<div class="t-sub">งานย่อย ${t.subtasks.filter(s=>s.d).length}/${t.subtasks.length}</div>`:''}</td>
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
    const pCode = p.code || initials(p.short);
    return `<div class="proj-card" data-act="open-project" data-id="${p.id}">
      <div class="pc-band ${p.grad}"><div><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span class="proj-code-pill">${esc(pCode)}</span></div><b>${esc(p.name)}</b><small>${esc(c?c.name:'')} · เริ่ม ${fmtD(p.start,{short:true})}</small></div>
        <div class="pc-logo">${esc(pCode.slice(0,3))}</div></div>
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
      ${pdKpi({ icon: IC.money, grad: 'var(--grad-cyan)', num: moneyK(paidYear), label: 'เก็บแล้วปีนี้ (ก่อน VAT)', pill: '+14%', pillCls: 'k-up' })}
      ${pdKpi({ icon: IC.clock, grad: 'var(--grad-amber)', num: moneyK(tot('pending')), label: 'รอชำระ (รวม VAT)', pill: 'รอดำเนินการ', pillCls: 'k-warn' })}
      ${pdKpi({ icon: IC.alarm, grad: 'linear-gradient(135deg,#ff8aa5,#ff5c7a)', num: moneyK(tot('overdue')), label: 'เกินกำหนดชำระ', pill: `${Store.data.invoices.filter(i=>i.status==='overdue').length} ใบ`, pillCls: 'k-down' })}
      ${pdKpi({ icon: IC.doc, grad: 'linear-gradient(135deg,#8e9bb5,#5a6280)', num: Store.data.invoices.filter(i=>i.status==='draft').length, label: 'ฉบับร่างรอออก', pill: 'ฉบับร่าง', pillCls: 'k-neutral' })}
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>เลขที่</th><th>รายการ</th><th>ลูกค้า</th><th>ยอดก่อน VAT</th><th>VAT 7%</th><th>รวมสุทธิ</th><th>ครบกำหนด</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${list.map(i=>{
        const cl = Store.data.clients.find(x=>x.id===i.client) || { id:'', name:'ไม่ระบุลูกค้า', short:'—', color:'#8a8fb1' };
        return `<tr data-act="open-invoice" data-id="${i.id}">
        <td class="t-code">${i.no}</td>
        <td><div class="t-title">${esc(i.title)}</div><div class="t-sub">ออก ${fmtD(i.issue)}</div></td>
        <td><span class="badge" style="background:${cl.color}18;color:${cl.color}">${esc(cl.short)}</span></td>
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
   TEAM (Unified Human + AI Workforce Roster & Capacity)
   ============================================================ */
function renderTeam(){
  ensureAgencyData();
  const view=$('#view'), side=$('#side');
  const tab = Store.ui.teamTab || 'all';
  side.innerHTML = sideSearch('ค้นหาสมาชิก หรือทักษะ…','team') +
    `<div class="side-block"><h3>ประเภททีมงาน</h3>
      <div class="chips">
        ${[
          ['all', `ทั้งหมด (${Store.data.team.length + Store.data.aiAgents.length})`],
          ['human', `มนุษย์ (${Store.data.team.length})`],
          ['ai', `AI Workforce (${Store.data.aiAgents.length})`],
        ].map(([k,l])=>`<span class="chip ${tab===k?'on':''}" data-ttab="${k}">${l}</span>`).join('')}
      </div>
    </div>
    <div class="side-block"><h3>ภาระงาน (Capacity)</h3>
      <div class="legend" style="flex-direction:column;gap:8px">
        <span><i style="background:#22C793"></i>โหลดปกติ (&lt; 30 ชม./สัปดาห์)</span>
        <span><i style="background:#FFB020"></i>ค่อนข้างหนัก (30–40 ชม.)</span>
        <span><i style="background:#FF5C7A"></i>หนักเกิน (&gt; 40 ชม.)</span>
      </div></div>` +
    promoCard('MNG Hybrid Team','ผสานทีมงานมนุษย์ 6 คน + AI Co-pilot 5 ตัว กระจายโหลดงานอย่างสมดุล','จัดการ AI Hub','nav:ai');
  wireSideCommon(view);
  $$('[data-ttab]', side).forEach(el => el.onclick = () => { Store.ui.teamTab = el.dataset.ttab; App.refresh(); });

  const q=(Store.ui.q.team||'').toLowerCase();
  const _lead = Remote.on && ['super_admin','admin','manager'].includes(Remote.user?.role);
  const ROLE_TH_T = { super_admin:'Super Admin', admin:'Admin', manager:'Manager', user:'User', viewer:'Viewer' };
  const humanList = tab==='ai' ? [] : Store.data.team.filter(u=>!q||`${u.name} ${u.nickname||''} ${u.role} ${(u.skills||[]).join(' ')}`.toLowerCase().includes(q));
  const aiList = tab==='human' ? [] : Store.data.aiAgents.filter(a=>!q||`${a.code} ${a.name} ${a.role} ${a.model} ${(a.skills||[]).join(' ')}`.toLowerCase().includes(q));

  view.innerHTML = `<div class="team-grid">${humanList.map(u=>{
    const open=Store.data.tasks.filter(t=>t.assignee===u.id&&t.status!=='done');
    const hrs=open.reduce((s,t)=>s+(t.est||0)*(1-t.progress/100),0);
    const done=Store.data.tasks.filter(t=>t.assignee===u.id&&t.status==='done').length;
    const pct=Math.min(100, Math.round(hrs/40*100));
    const col = hrs>40?'#FF5C7A':hrs>28?'#FFB020':'#22C793';
    return `<div class="team-card">
      <div style="display:flex;justify-content:flex-end;margin-bottom:-10px">${presenceBadge(u.presence||'online')}</div>
      <div class="av av-xl" style="background:${u.color};display:flex;align-items:center;justify-content:center;color:#fff">${initials(u.name)}</div>
      <b class="name">${esc(u.name)}${u.nickname?` <small style="color:var(--muted);font-weight:500">(${esc(u.nickname)})</small>`:''}${u.me?' <span class="badge b-purple" style="font-size:9px">คุณ</span>':''}</b>
      <div class="role">${esc(u.role)}</div>
      ${(u.skills&&u.skills.length)?`<div class="skill-row" style="justify-content:center;margin:6px 0">${u.skills.map(s=>`<span class="skill-chip">${esc(s)}</span>`).join('')}</div>`:''}
      <div class="t-stats"><div><b>${open.length}</b><small>งานคงค้าง</small></div><div><b>${done}</b><small>ปิดแล้ว</small></div><div><b>${Math.round(hrs)}</b><small>ชม.เหลือ</small></div></div>
      <div style="text-align:left;font-size:11px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between"><span>ภาระงาน (${Math.round(hrs)}/40 ชม.)</span><b style="color:${col}">${pct}%</b></div>
      <div class="wkbar"><div style="width:${pct}%;background:${col}"></div></div>
      <div style="margin-top:12px;display:flex;gap:7px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-act="open-member" data-id="${u.id}">${IC.eye} งานของ${esc(u.name.split(' ')[0])}</button>
        ${_lead ? `<button class="btn btn-ghost btn-sm" data-act="team-edit" data-id="${u.id}">✏️</button>
        <button class="btn btn-ghost btn-sm" data-act="team-del" data-id="${u.id}">🗑</button>` : ''}
      </div>
      ${u.authRole?`<div style="margin-top:8px;font-size:10px;color:var(--muted)">บัญชี: <span class="urole ur-${u.authRole}">${ROLE_TH_T[u.authRole]||u.authRole}</span></div>`:(_lead?`<div style="margin-top:8px;font-size:10px;color:var(--muted)">ยังไม่มีบัญชี login</div>`:'')}
    </div>`;
  }).join('')}
  ${aiList.map(a=>{
    const coTasks = Store.data.tasks.filter(t=>t.aiAgentId===a.id&&t.status!=='done').length;
    return `<div class="team-card" style="background:linear-gradient(180deg,#faf8ff 0%,#ffffff 100%);border-color:#e4ddff">
      <div style="display:flex;justify-content:flex-end;margin-bottom:-10px"><span class="badge ${a.paused?'b-yellow':'b-purple'}">${a.paused?'⏸ พักชั่วคราว':'🤖 AI Online'}</span></div>
      <div class="av av-xl" style="background:${a.color};display:flex;align-items:center;justify-content:center;color:#fff;border-radius:18px">${esc(a.code.slice(0,3))}</div>
      <b class="name">${esc(a.name)} <span class="ai-model">${esc(a.model)}</span></b>
      <div class="role">${esc(a.role)}</div>
      <div class="skill-row" style="justify-content:center;margin:6px 0">${(a.skills||[]).map(s=>`<span class="skill-chip">${esc(s)}</span>`).join('')}</div>
      <div class="t-stats"><div><b>${coTasks}</b><small>งาน Co-pilot</small></div><div><b>${a.runs}</b><small>รันสำเร็จ</small></div><div><b>${a.autonomy}%</b><small>Autonomy</small></div></div>
      <div style="margin-top:12px;display:flex;gap:7px;justify-content:center">
        <button class="btn btn-primary btn-sm" onclick="openAiDispatchModal('${a.id}')">⚡ สั่งงาน ${esc(a.code)}</button>
        <button class="btn btn-ghost btn-sm" data-act="nav:ai">ตั้งค่า</button>
      </div>
    </div>`;
  }).join('')}
  ${(_lead && tab!=='ai') ? `<div class="team-card add-team" data-act="team-new" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;border:2.5px dashed var(--line);min-height:230px;color:var(--muted)">
    <span style="font-size:34px">${IC.plus}</span><b>เพิ่มสมาชิกทีม</b><small style="font-size:11px">ผูกอีเมล → ใช้สิทธิ์ login ร่วม MNG Hub ได้</small>
  </div>` : ''}</div>`;
}

/* ============================================================
   CLIENTS (CRM — Connected to MariaDB erp_clients)
   ============================================================ */
function renderClients(){
  const view=$('#view'), side=$('#side');
  side.innerHTML = sideSearch('ค้นหาลูกค้า / ผู้ติดต่อ / อีเมล…','clients') +
    promoCard('ฐานลูกค้า MNG','ดูแลลูกค้าทั้งหมดในฐานข้อมูล erp_clients พร้อมยอดขายสะสมและโปรเจกต์ที่กำลังทำ','+ เพิ่มลูกค้าใหม่','new-client');
  wireSideCommon(view);
  const q=(Store.ui.q.clients||'').toLowerCase();
  const list = Store.data.clients.filter(c=>!q||`${c.name} ${c.short||''} ${c.contact||''} ${c.email||''} ${c.phone||''}`.toLowerCase().includes(q));
  view.innerHTML = `
    <div class="sec-head">
      <div>
        <h2>ฐานลูกค้า (CRM)</h2>
        <div class="sub">ลูกค้าทั้งหมด ${Store.data.clients.length} ราย · คลิกการ์ดเพื่อดูรายละเอียด แก้ไข หรือออกใบแจ้งหนี้</div>
      </div>
      <div class="sec-actions">
        <button class="btn btn-primary" data-act="new-client">${IC.plus} เพิ่มลูกค้าใหม่</button>
      </div>
    </div>
    <div class="client-grid">${list.length ? list.map(c=>{
    const projs=Store.data.projects.filter(p=>p.client===c.name|| (Store.clientOf(p)||{}).id===c.id);
    const active=projs.filter(p=>p.status==='doing'||p.status==='review').length;
    const rev=Store.data.invoices.filter(i=>i.client===c.id&&i.status==='paid').reduce((s,i)=>s+i.amount,0);
    return `<div class="client-card" style="cursor:pointer" data-act="open-client" data-id="${c.id}">
      <div class="cc-top"><div class="cc-logo" style="background:linear-gradient(135deg,${c.color},${c.color}bb)">${initials(c.short||c.name)}</div>
        <div style="flex:1;min-width:0"><b>${esc(c.name)}</b><small>ลูกค้าตั้งแต่ ${fmtD(c.since)}</small></div>
        <button class="icon-btn" style="width:30px;height:30px" title="แก้ไขข้อมูลลูกค้า" data-act="edit-client" data-id="${c.id}">✏️</button>
      </div>
      <div class="cc-row">${IC.user} ${esc(c.contact||'—')}</div>
      <div class="cc-row">${IC.phone} ${esc(c.phone||'—')}</div>
      <div class="cc-row">${IC.mail} ${esc(c.email||'—')}</div>
      <div class="cc-row">${IC.pin} ${esc(c.addr||'—')}</div>
      <div class="cc-foot"><span>โปรเจกต์ที่กำลังทำ <b>${active}</b></span><span>ยอดเก็บแล้ว <b style="color:var(--purple)">${moneyK(rev)}</b></span></div>
    </div>`;}).join('') : `<div class="empty-state" style="grid-column:1/-1"><p>ไม่พบข้อมูลลูกค้า</p></div>`}</div>`;
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

  const arch = Store.data.archProjects;
  const archRows = (arch||[]).map(p=>`
    <tr><td><div style="display:flex;gap:9px;align-items:center"><span class="pdot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b>${p.client?`<br><small style="color:var(--muted)">${esc(p.client)}</small>`:''}</div></td>
      <td style="font-size:12px;color:var(--muted)">งานที่ถูกซ่อน ${p.tasks} ชิ้น</td>
      <td style="text-align:right"><button class="btn btn-ghost btn-sm" data-act="proj-restore" data-id="${p.id}">↩ กู้คืน</button></td></tr>`).join('');

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
    </div>
    <div class="card card-pad" style="grid-column:1/-1">
      <div class="card-title" style="margin-bottom:8px">🗄 คลังโปรเจกต์ (เก็บถาวรแล้ว — ไม่มีข้อมูลถูกลบจริง)</div>
      ${arch===undefined ? '<div class="empty-state" style="padding:16px">กำลังโหลดคลัง…</div>'
        : arch.length ? `<div style="overflow-x:auto"><table class="tbl"><tbody>${archRows}</tbody></table></div>`
        : '<p style="font-size:12px;color:var(--muted)">คลังว่าง — โปรเจกต์ที่ "เก็บเข้าคลัง" จากหน้าโปรเจกต์จะมาอยู่ที่นี่พร้อมปุ่มกู้คืน</p>'}
    </div>` : '';

  const dbAudit = Store.data._dbAudit;
  const dbAuditSection = `
    <div class="card card-pad" style="grid-column:1/-1">
      <div class="card-head" style="padding:0 0 8px">
        <div class="card-title">🗄 สถานะการเชื่อมต่อฐานข้อมูลจริง (MariaDB Live Audit)
          <span class="badge ${Remote.on ? 'b-green' : 'b-yellow'}">${Remote.on ? 'เชื่อมต่อ MariaDB จริง' : 'โหมดสาธิต (localStorage)'}</span>
        </div>
        ${Remote.on ? `<button class="btn btn-ghost btn-sm" data-act="run-db-audit">🔄 ตรวจสอบตารางฐานข้อมูลสด</button>` : ''}
      </div>
      <p style="font-size:12px;color:var(--muted)">ตรวจสอบการเชื่อมต่อทั้ง 2 ฐานข้อมูลจริง (<b>pacific_mng</b> สำหรับบัญชีผู้ใช้ + <b>pacific_mngworks</b> สำหรับงาน โปรเจกต์ การเงิน แชต AI และ HR ครบทุกตาราง)</p>
      ${!Remote.on
        ? `<div style="margin-top:10px;font-size:12.5px;color:var(--ink-2)">ขณะนี้อยู่ในโหมดสาธิต — เข้าสู่ระบบด้วยบัญชีจริงเพื่อซิงก์กับ MariaDB อัตโนมัติ</div>`
        : dbAudit
          ? `<div style="margin-top:8px;font-size:12px;color:var(--mint);font-weight:600">✓ ตรวจสอบสำเร็จทั้ง ${dbAudit.modules.length} ตาราง · Latency ${dbAudit.latencyMs} ms</div>
             <div class="db-audit-grid">
               ${dbAudit.modules.map(m => `<div class="db-audit-item">
                 <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.ok ? '🟢' : '🔴'} ${esc(m.label)}</span>
                 <b>${m.rows}</b>
               </div>`).join('')}
             </div>`
          : `<div style="margin-top:10px;font-size:12px;color:var(--muted)">กำลังดึงจำนวนแถวจริงจากตาราง MariaDB…</div>`}
    </div>`;

  const hPool = Store.data._hermesPool;
  const hRevealed = Store.ui._revealedHermesTokens;
  const hermesSection = `
    <div class="card card-pad" style="grid-column:1/-1">
      <div class="card-head" style="padding:0 0 8px;flex-wrap:wrap;gap:8px">
        <div class="card-title">🤖 เชื่อมต่อ Hermes & AI Agent ภายนอก (20-Token Rotating Pool)
          <span class="badge b-purple">บังคับ User/Password + 20 Tokens หมุนเวียน</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="/api/hermes/manual.md" target="_blank" rel="noopener">📖 คู่มือ API (.md)</a>
          <a class="btn btn-ghost btn-sm" href="/api/hermes/skill.md" target="_blank" rel="noopener">🧠 Hermes SKILL.md</a>
          <a class="btn btn-ghost btn-sm" href="/api/hermes/client.py" target="_blank" rel="noopener">🐍 Python Client</a>
        </div>
      </div>
      <p style="font-size:12px;color:var(--muted);line-height:1.65">
        เปิดให้ <b>Hermes Agent</b> หรือ AI ภายนอกล็อกอินด้วยบัญชีตัวเองผ่าน <code>POST /api/hermes/login</code> (ต้องมี <code>email</code> + <code>password</code> ใน <b>pacific_mng.users</b>) เพื่อรับชุด <b>API Token 20 ตัว (Slot #01–#20)</b> ไปวนใช้งานแบบ Round-Robin ลดคอขวดเมื่อรันหลาย Sub-agent พร้อมกัน
      </p>
      ${!Remote.on
        ? `<div style="margin-top:10px;font-size:12.5px;color:var(--ink-2)">กรุณาเข้าสู่ระบบด้วยบัญชีจริงเพื่อจัดการชุด 20 API Tokens ของบัญชีนี้</div>`
        : `
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:10px 12px;background:var(--panel-2);border-radius:12px;border:1px solid var(--line)">
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px">
              <span>สถานะชุดโทเคน: <b style="color:var(--violet)">${hPool ? `${hPool.activeCount} / ${hPool.poolTarget} Slots พร้อมใช้` : 'กำลังตรวจสอบ…'}</b></span>
              <span>เรียกใช้งานสะสม: <b>${hPool ? hPool.totalUses : 0} ครั้ง</b></span>
              <span>โหมดความปลอดภัย: <b>${hPool?.strictDualAuth ? '🔒 Strict Dual-Auth (Token + Password ทุกครั้ง)' : '🔑 Login รับ 20 Tokens หมุนเวียน'}</b></span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" data-act="hermes-reveal">🔑 สร้าง / ดู 20 Tokens</button>
              <button class="btn btn-ghost btn-sm" data-act="hermes-rotate">🔄 หมุนเปลี่ยนใหม่ทั้ง 20 ตัว</button>
              <button class="btn btn-ghost btn-sm" data-act="hermes-strict">${hPool?.strictDualAuth ? '🔓 ปิด Strict Dual-Auth' : '🔒 เปิด Strict Dual-Auth'}</button>
              ${hPool?.activeCount ? `<button class="btn btn-danger btn-sm" data-act="hermes-revoke">🚫 เพิกถอนทั้งหมด</button>` : ''}
            </div>
          </div>
          ${hRevealed?.length ? `
            <div style="margin-top:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <b style="font-size:12.5px;color:var(--mint)">✓ ปลดล็อกชุด 20 Rotating API Tokens ของบัญชี ${esc(me.email)} แล้ว (คัดลอกไปใส่ Hermes ได้ทันที)</b>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" data-act="hermes-copy:json">📋 คัดลอก JSON (20 ตัว)</button>
                  <button class="btn btn-ghost btn-sm" data-act="hermes-copy:env">📋 คัดลอก .env สำหรับ Hermes</button>
                </div>
              </div>
              <pre class="hermes-code-box">${esc(hRevealed.map(t => `Slot #${String(t.slot).padStart(2,'0')} : ${t.token}`).join('\n'))}</pre>
            </div>` : ''}
          ${hPool?.slots?.length ? `
            <div class="hermes-slot-grid">
              ${hPool.slots.map(s => `
                <div class="hermes-slot-chip ${!s.revoked ? 'active' : ''}">
                  <div class="slot-hd">
                    <span>#${String(s.slot).padStart(2, '0')} · ${s.revoked ? '🔴 เพิกถอน' : '🟢 พร้อมใช้'}</span>
                    <span style="color:var(--muted);font-weight:500">${s.useCount} ครั้ง</span>
                  </div>
                  <code>${esc(s.preview)}</code>
                </div>`).join('')}
            </div>` : `<div style="margin-top:10px;font-size:12px;color:var(--muted)">ยังไม่ได้ออกชุด 20 Tokens สำหรับบัญชีนี้ — กดปุ่ม <b>"🔑 สร้าง / ดู 20 Tokens"</b> หรือสั่งให้ Hermes เรียก <code>POST /api/hermes/login</code> ด้วยอีเมลและรหัสผ่านของบัญชี AI ได้ทันที</div>`}
        `}
    </div>`;

  view.innerHTML = `<div class="set-grid">
    ${dbAuditSection}
    ${hermesSection}
    ${adminSection}
    <div class="card card-pad">
      <div class="card-title" style="margin-bottom:8px">${IC.user} โปรไฟล์ & องค์กร</div>
      <div style="display:flex;gap:14px;align-items:center;margin:14px 0 18px">
        <div class="av av-xl" style="background:linear-gradient(135deg,#ffb26b,#ff6b9d)">${esc(initials(me.name||'W'))}</div>
        <div><b style="font-size:15px">${esc(me.name)} — ${ROLE_TH[me.role]||'ผู้ใช้'}</b><div style="font-size:12px;color:var(--muted)">${esc(me.email)} · ${esc(st.orgName||'MNG Groups')}</div></div>
      </div>
      <div class="form-grid">
        <div class="f-group"><label>ชื่อองค์กร</label><input value="${esc(st.orgName||'MNG Groups')}" id="setOrg"></div>
        <div class="f-group"><label>โดเมน</label><input value="mng.uarea.in" disabled></div>
        <div class="f-group full"><label>คำอธิบายระบบ</label><input value="${esc(st.orgDesc||'Smart Dashboard & Work Tracking System')}" id="setDesc"></div>
        <div class="f-group full"><label>🗂 ลิงก์โฟลเดอร์ Google Drive กลางของทีม (ใช้ในหน้าแชตทีม)</label><input type="url" value="${esc(st.driveFolder||'https://drive.google.com/drive/u/0/my-drive')}" id="setDriveFolder"></div>
      </div>
      <div class="card-title" style="margin:22px 0 4px">${IC.bell} การแจ้งเตือน</div>
      <div class="set-row"><div class="sr-info"><b>แจ้งเตือนงานใกล้เดดไลน์</b><small>ล่วงหน้า 3 วัน</small></div><button class="switch ${st.n1?'on':''}" data-set="n1"></button></div>
      <div class="set-row"><div class="sr-info"><b>แจ้งเตือนใบแจ้งหนี้เกินกำหนด</b><small>ทุกเช้า 09:00</small></div><button class="switch ${st.n2?'on':''}" data-set="n2"></button></div>
      <div class="set-row"><div class="sr-info"><b>สรุปรายวันทางอีเมล</b><small>ส่ง 08:00 ทุกวันจันทร์</small></div><button class="switch ${st.n3?'on':''}" data-set="n3"></button></div>
      <button class="btn btn-primary" style="margin-top:16px" data-act="save-settings">บันทึกการตั้งค่าลงฐานข้อมูล</button>
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
  // lazy-load รายชื่อผู้ใช้ + คลังโปรเจกต์ + DB Audit + Hermes 20-Token Pool
  if(Remote.on && Store.data._dbAudit===undefined && typeof runDbAudit==='function') runDbAudit(true);
  if(Remote.on && Store.data._hermesPool===undefined && typeof loadHermesTokens==='function') loadHermesTokens(true);
  if(isAdm && Store.data.authUsers===undefined) loadAuthUsers().catch(()=>{ Store.data.authUsers=[]; });
  if(isAdm && Store.data.archProjects===undefined) loadArchivedProjects().catch(()=>{ Store.data.archProjects=[]; });
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
