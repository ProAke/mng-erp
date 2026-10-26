/* ============================================================
   MNG ERP — Agency OS Views & Interactive Tools
   (AI Workforce, Team Chat, HR Check-in/Leave, Rooms & Studio,
    Command Palette Ctrl+K, Pomodoro Focus Timer, Live Presence)
   ============================================================ */
'use strict';

/* ---------- Agency OS State & Defaults ---------- */
function ensureAgencyData() {
  const d = Store.data;
  if (!Array.isArray(d.aiAgents) || !d.aiAgents.length) d.aiAgents = JSON.parse(JSON.stringify(SEED.aiAgents || []));
  if (!Array.isArray(d.aiRuns))   d.aiRuns   = JSON.parse(JSON.stringify(SEED.aiRuns || []));
  if (!Array.isArray(d.channels) || !d.channels.length) d.channels = JSON.parse(JSON.stringify(SEED.channels || []));
  if (!Array.isArray(d.messages)) d.messages = JSON.parse(JSON.stringify(SEED.messages || []));
  if (!Array.isArray(d.files))    d.files    = JSON.parse(JSON.stringify(SEED.files || []));
  if (!Array.isArray(d.rooms) || !d.rooms.length) d.rooms = JSON.parse(JSON.stringify(SEED.rooms || []));
  if (!Array.isArray(d.bookings)) d.bookings = JSON.parse(JSON.stringify(SEED.bookings || []));
  if (!Array.isArray(d.checkins)) d.checkins = JSON.parse(JSON.stringify(SEED.checkins || []));
  if (!Array.isArray(d.leaves))   d.leaves   = JSON.parse(JSON.stringify(SEED.leaves || []));
  if (!d.settings) d.settings = {};
  if (!d.settings.driveFolder) d.settings.driveFolder = 'https://drive.google.com/drive/u/0/my-drive';
  if (!d.settings.orgName) d.settings.orgName = 'MNG Groups';
  if (!d.settings.orgDesc) d.settings.orgDesc = 'Smart Dashboard & Work Tracking System';

  const allMemberIds = [...(d.team || []).map(u => u.id), ...(d.aiAgents || []).map(a => a.id)];
  d.channels.forEach(c => {
    if (!c.type) c.type = String(c.slug || '').startsWith('dm-') ? 'dm' : 'group';
    if (!Array.isArray(c.members) || !c.members.length) c.members = allMemberIds;
  });

  if (!Store.ui.activeChannel || !d.channels.some(c => c.id === Store.ui.activeChannel)) {
    const defChan = d.channels.find(c => c.slug === 'team-all') || d.channels.find(c => c.type !== 'dm') || d.channels[0];
    Store.ui.activeChannel = defChan?.id || 'ch0';
  }
  if (!Store.ui.roomDate) Store.ui.roomDate = todayS();
  if (!Store.ui.roomKind) Store.ui.roomKind = 'all';
  if (!Store.ui.aiFilter) Store.ui.aiFilter = 'all';
  if (!Store.ui.hrFilter) Store.ui.hrFilter = 'all';
  if (!Store.ui.teamTab)  Store.ui.teamTab  = 'all';
}

function aiAgentOf(id) {
  if (!id) return null;
  ensureAgencyData();
  return Store.data.aiAgents.find(a => a.id === id || a.code === id) || null;
}

function nowHM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function meMember() {
  return Store.data.team.find(u => u.me) || Store.data.team[0] || { id: 'u1', name: 'Worapot', presence: 'online', color: '#FF8A5C' };
}

/* ============================================================
   1. POMODORO FOCUS TIMER & LIVE PRESENCE (Topbar)
   ============================================================ */
const Pomo = {
  sec: 25 * 60,
  mode: 'focus', // 'focus' (25m) | 'break' (5m)
  running: false,
  _iv: null,
  fmt() {
    const m = Math.floor(this.sec / 60), s = this.sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },
  toggle() {
    if (this.running) {
      this.running = false;
      clearInterval(this._iv);
      toast('พักจับเวลาโฟกัสชั่วคราว', 'warn');
    } else {
      this.running = true;
      const me = meMember();
      if (this.mode === 'focus' && me.presence !== 'focus') {
        setMemberPresence(me.id, 'focus', true);
      }
      this._iv = setInterval(() => {
        if (this.sec > 0) {
          this.sec--;
          this.paint();
        } else {
          clearInterval(this._iv);
          this.running = false;
          if (this.mode === 'focus') {
            this.mode = 'break';
            this.sec = 5 * 60;
            toast('🎉 โฟกัสครบ 25 นาทีแล้ว! พักสายตา 5 นาทีได้เลย');
          } else {
            this.mode = 'focus';
            this.sec = 25 * 60;
            toast('⚡ หมดเวลาพัก พร้อมลุยโฟกัสรอบใหม่!');
          }
          this.paint();
        }
      }, 1000);
      toast(this.mode === 'focus' ? '🎧 เริ่มโหมดโฟกัส 25 นาที' : '☕ เริ่มพักเบรก 5 นาที');
    }
    this.paint();
  },
  reset() {
    clearInterval(this._iv);
    this.running = false;
    this.mode = 'focus';
    this.sec = 25 * 60;
    this.paint();
    toast('รีเซ็ตนาฬิกาโฟกัสเป็น 25:00');
  },
  paint() {
    const el = $('#pomoBtn');
    if (!el) return;
    el.className = `pomo-pill ${this.running ? 'running' : ''}`;
    el.innerHTML = `<span>${this.running ? '🎧' : '⏱'}</span><span class="pomo-time">${this.fmt()}</span>`;
  },
};

function setMemberPresence(memberId, presence, silent = false) {
  const u = Store.data.team.find(x => x.id === memberId);
  if (!u) return;
  u.presence = presence;
  Store.save();
  Remote.push('/teams/presence', 'POST', { memberId, presence });
  App.renderTopbar();
  if (Store.ui.route === 'team') App.refresh();
  if (!silent) {
    const pm = PRESENCE_META[presence] || PRESENCE_META.online;
    toast(`สถานะของคุณ: ${pm.dot} ${pm.label}`);
  }
}

function openPresencePicker() {
  const me = meMember();
  const cur = me.presence || 'online';
  openModal(`
    ${modalHead('ตั้งค่าสถานะการทำงาน (Live Presence)', `${esc(me.name)} — แสดงผลแบบเรียลไทม์ให้ทีมเห็น`)}
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${Object.entries(PRESENCE_META).map(([k, m]) => `
          <button class="btn ${cur === k ? 'btn-primary' : 'btn-ghost'}" style="justify-content:flex-start;padding:12px 14px"
            onclick="setMemberPresence('${me.id}','${k}');closeModal()">
            <span style="font-size:16px">${m.dot}</span>
            <span>${m.label}</span>
          </button>
        `).join('')}
      </div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="font-size:12.5px;color:var(--muted)">⏱ นาฬิกาโฟกัส Pomodoro (<b>${Pomo.fmt()}</b>)</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="Pomo.reset();closeModal()">รีเซ็ต 25:00</button>
          <button class="btn btn-primary btn-sm" onclick="Pomo.toggle();closeModal()">${Pomo.running ? 'หยุดชั่วคราว' : 'เริ่มจับเวลาโฟกัส'}</button>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================
   2. COMMAND PALETTE (Ctrl+K / Cmd+K)
   ============================================================ */
function openCommandPalette(initialQ = '') {
  ensureAgencyData();
  openModal(`
    <div class="modal-body" style="padding-top:18px">
      <div class="cmd-search-wrap">
        ${IC.search}
        <input id="cmdInput" placeholder="ค้นหาหน้า, งาน (<CODE>-10xx), โปรเจกต์, สั่ง AI, ห้องแชต หรือคำสั่งด่วน…" value="${esc(initialQ)}" autocomplete="off"/>
        <span class="badge b-grey" style="font-size:10.5px">ESC ปิด</span>
      </div>
      <div class="cmd-list" id="cmdResults"></div>
    </div>
  `);

  const inp = $('#cmdInput');
  const box = $('#cmdResults');

  const buildItems = (q) => {
    const s = q.trim().toLowerCase();
    const items = [];

    [
      { ico: '➕', title: 'สร้างงานใหม่ (New Task)', tag: 'คำสั่งด่วน', run: () => openTaskForm(null) },
      { ico: '📅', title: 'นัดหมายใหม่ในปฏิทิน (New Event)', tag: 'คำสั่งด่วน', run: () => openEventForm() },
      { ico: '✨', title: 'สั่งงาน AI Workforce ทันที (Dispatch AI)', tag: 'AI Agent', run: () => openAiDispatchModal() },
      { ico: '🏢', title: 'เช็กอินเข้างานวันนี้ / ยื่นใบลา', tag: 'HR & ใบลา', run: () => App.go('hr') },
      { ico: '🚪', title: 'จองห้องประชุม / สตูดิโอ / อุปกรณ์', tag: 'จองห้อง', run: () => openBookingForm() },
      { ico: '🎧', title: `${Pomo.running ? 'หยุด' : 'เริ่ม'}โหมดโฟกัส Pomodoro 25 นาที`, tag: 'Focus', run: () => Pomo.toggle() },
    ].forEach(a => {
      if (!s || a.title.toLowerCase().includes(s) || a.tag.toLowerCase().includes(s)) items.push(a);
    });

    [
      ['dashboard', '📊 แดชบอร์ดภาพรวม (Dashboard)'],
      ['calendar',  '📆 ปฏิทินกลางเต็มจอ (Calendar)'],
      ['tasks',     '✅ งาน & บอร์ด Kanban (Tasks)'],
      ['projects',  '📁 โปรเจกต์ทั้งหมด (Projects)'],
      ['ai',        '🤖 ศูนย์ควบคุม AI Workforce (AI Hub)'],
      ['chat',      '💬 แชตทีม & #ai-feed (Team Chat)'],
      ['hr',        '🌿 เช็กอินเข้างาน & ใบลา (HR & Leave)'],
      ['rooms',     '🚪 จองห้องประชุม & สตูดิโอ (Rooms)'],
      ['finance',   '💳 การเงิน & ใบแจ้งหนี้ (Finance)'],
      ['team',      '👥 ทีมงาน Human + AI & ภาระงาน'],
      ['clients',   '🤝 ลูกค้า (Clients)'],
      ['reports',   '📈 รายงานผู้บริหาร (Reports)'],
    ].forEach(([r, label]) => {
      if (!s || label.toLowerCase().includes(s) || r.includes(s)) {
        items.push({ ico: '🧭', title: label, tag: 'เปลี่ยนหน้า', run: () => App.go(r) });
      }
    });

    Store.data.tasks.forEach(t => {
      if (!s ? items.length < 18 : (`${t.code} ${t.title} ${(t.tags || []).join(' ')}`.toLowerCase().includes(s))) {
        items.push({
          ico: '📌',
          title: `<b>${esc(t.code)}</b> — ${esc(t.title)}`,
          tag: STATUS_META[t.status]?.label || 'งาน',
          run: () => openTaskModal(t.id),
        });
      }
    });

    Store.data.aiAgents.forEach(a => {
      if (s && (`${a.code} ${a.name} ${a.role} ${a.model}`.toLowerCase().includes(s))) {
        items.push({
          ico: '🤖',
          title: `สั่งงาน <b>${esc(a.code)}</b> — ${esc(a.role)}`,
          tag: a.model,
          run: () => openAiDispatchModal(a.id),
        });
      }
    });

    Store.data.projects.forEach(p => {
      if (s && (`${p.code || ''} ${p.name} ${p.client}`.toLowerCase().includes(s))) {
        items.push({
          ico: '📁',
          title: `<b>[${esc(p.code || 'PRJ')}]</b> ${esc(p.name)}`,
          tag: 'โปรเจกต์',
          run: () => openProjectModal(p.id),
        });
      }
    });

    return items.slice(0, 16);
  };

  let curList = [];
  let selIdx = 0;

  const renderList = () => {
    curList = buildItems(inp.value);
    if (selIdx >= curList.length) selIdx = 0;
    box.innerHTML = curList.length ? curList.map((it, idx) => `
      <div class="cmd-item ${idx === selIdx ? 'sel' : ''}" data-cidx="${idx}">
        <span style="font-size:16px;width:24px;text-align:center">${it.ico}</span>
        <span style="font-size:13px;color:var(--ink)">${it.title}</span>
        <span class="cmd-tag">${esc(it.tag)}</span>
      </div>
    `).join('') : `<div class="empty-state" style="padding:20px"><p>ไม่พบผลลัพธ์ที่ตรงกับ "${esc(inp.value)}"</p></div>`;

    $$('[data-cidx]', box).forEach(el => {
      el.onclick = () => {
        const item = curList[+el.dataset.cidx];
        closeModal();
        if (item) item.run();
      };
    });
  };

  inp.oninput = () => { selIdx = 0; renderList(); };
  inp.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(curList.length - 1, selIdx + 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(0, selIdx - 1); renderList(); }
    else if (e.key === 'Enter' && curList[selIdx]) { e.preventDefault(); const it = curList[selIdx]; closeModal(); it.run(); }
  };

  renderList();
  setTimeout(() => inp.focus(), 20);
}

/* ============================================================
   3. AI WORKFORCE HUB (#/ai) + LIVE EXECUTION LOG + KILL SWITCH
   ============================================================ */
function renderAI() {
  ensureAgencyData();
  const view = $('#view'), side = $('#side');
  const agents = Store.data.aiAgents;
  const runs = Store.data.aiRuns;
  const q = (Store.ui.q.ai || '').toLowerCase();
  const flt = Store.ui.aiFilter || 'all';
  const allPaused = agents.length > 0 && agents.every(a => a.paused);

  const activeCnt = agents.filter(a => !a.paused).length;
  const totalRuns = agents.reduce((s, a) => s + (+a.runs || 0), 0);
  const totalTok = agents.reduce((s, a) => s + (+a.tokensToday || 0), 0);
  const avgSucc = agents.length ? (agents.reduce((s, a) => s + (+a.successRate || 99), 0) / agents.length).toFixed(1) : '99.0';

  side.innerHTML =
    sideSearch('ค้นหา AI Agent, โมเดล, ทักษะ…', 'ai') +
    `<div class="side-block">
      <div class="kill-switch-card ${allPaused ? 'all-paused' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
          <b style="font-size:13px;color:var(--ink)">${allPaused ? '⏸ พัก AI ทั้งทีมอยู่' : '🛡 Master Kill-Switch'}</b>
          <span class="badge ${allPaused ? 'b-yellow' : 'b-green'}">${allPaused ? 'PAUSED' : 'ONLINE'}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);line-height:1.45;margin-bottom:10px">
          ${allPaused ? 'ระบบหยุดการทำงานอัตโนมัติของ AI ทุกตัวชั่วคราว' : 'หยุดการทำงานอัตโนมัติของ AI ทุกตัวทันทีในคลิกเดียว'}
        </div>
        <button class="btn ${allPaused ? 'btn-primary' : 'btn-danger'} btn-sm" style="width:100%;justify-content:center"
          onclick="toggleAllAiAgents(${allPaused ? 'false' : 'true'})">
          ${allPaused ? '▶ เปิดการทำงาน AI ทั้งทีม' : '⏸ หยุดพัก AI ทั้งทีมทันที'}
        </button>
      </div>
    </div>
    <div class="side-block"><h3>สถานะการทำงาน</h3>
      <div class="chips">
        ${[
          ['all', 'ทั้งหมด'],
          ['active', 'ทำงานอยู่'],
          ['paused', 'พักชั่วคราว'],
        ].map(([k, l]) => `<span class="chip ${flt === k ? 'on' : ''}" data-aiflt="${k}">${l}</span>`).join('')}
      </div>
    </div>
    <div class="side-block"><h3>โควตา Token วันนี้</h3>
      <div style="background:#f6f7fc;border-radius:14px;padding:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
          <span style="color:var(--muted)">ใช้ไปวันนี้</span>
          <b>${totalTok.toLocaleString('en-US')} tok</b>
        </div>
        <div class="progress"><div style="width:${Math.min(100, Math.round(totalTok / 1500))}%;background:linear-gradient(90deg,#6C5CE7,#3BA7FF)"></div></div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">โควตา 150,000 tok/วัน · ประหยัดเวลาทีม ~14 ชม./สัปดาห์</div>
      </div>
    </div>` +
    promoCard('สั่ง AI ช่วยเคลียร์งาน!', 'กดปุ่มเพื่อสั่งวิเคราะห์ความเสี่ยง ร่าง Copy หรือตรวจ QA แล้วส่งผลเข้าห้อง #ai-feed ทันที', '⚡ สั่งงาน AI ทันที', 'ai-dispatch');

  wireSideCommon(view);
  $$('[data-aiflt]', side).forEach(el => el.onclick = () => { Store.ui.aiFilter = el.dataset.aiflt; App.refresh(); });

  const shown = agents.filter(a => {
    if (flt === 'active' && a.paused) return false;
    if (flt === 'paused' && !a.paused) return false;
    if (q && !`${a.code} ${a.name} ${a.role} ${a.model} ${(a.skills || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });

  view.innerHTML = `
    <div class="sec-head">
      <div>
        <h2>ศูนย์ควบคุมทีม AI (AI Workforce Hub)</h2>
        <div class="sub">บริหารจัดการ AI Co-pilot ทั้ง ${agents.length} ตัว ปรับระดับ Autonomy และดูบันทึกการทำงานสด</div>
      </div>
      <div class="sec-actions">
        <button class="btn btn-ghost" onclick="Store.ui.activeChannel=(Store.data.channels.find(c=>c.slug==='ai-feed')||{id:'ch5'}).id;App.go('chat')">✨ ดูห้อง #ai-feed</button>
        <button class="btn btn-primary" onclick="openAiDispatchModal()">${IC.bolt} สั่งงาน AI ทันที</button>
      </div>
    </div>

    <div class="kpi-grid">
      ${pdKpi({ icon: IC.bot, grad: 'var(--grad-violet)', num: `${activeCnt}/${agents.length}`, label: 'AI พร้อมทำงาน', pill: 'ออนไลน์', pillCls: 'k-up' })}
      ${pdKpi({ icon: IC.bolt, grad: 'var(--grad-cyan)', num: totalRuns, label: 'ภารกิจสำเร็จสะสม', pill: `+${runs.length} ล่าสุด`, pillCls: 'k-violet' })}
      ${pdKpi({ icon: IC.check, grad: 'var(--grad-mint)', num: `${avgSucc}%`, label: 'ความแม่นยำเฉลี่ย', pill: 'เสถียร', pillCls: 'k-up' })}
      ${pdKpi({ icon: IC.flame, grad: 'var(--grad-amber)', num: `${(totalTok / 1000).toFixed(1)}k`, label: 'Tokens วันนี้', pill: 'จาก 150k', pillCls: 'k-neutral' })}
    </div>

    <div class="ai-grid">
      ${shown.map(a => {
        const assignedCnt = Store.data.tasks.filter(t => t.aiAgentId === a.id && t.status !== 'done').length;
        return `
        <div class="ai-card ${a.paused ? 'paused' : ''}">
          <div class="ai-head">
            <div class="ai-orb" style="background:${a.color}">${esc(a.code.slice(0, 4))}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <b style="font-size:15px;color:var(--ink)">${esc(a.name)}</b>
                <span class="ai-model">${esc(a.model)}</span>
                <span class="badge ${a.paused ? 'b-yellow' : 'b-green'}" style="margin-left:auto">${a.paused ? 'พักอยู่' : 'ทำงานอยู่'}</span>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(a.role)}</div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--ink-2);line-height:1.45">${esc(a.prompt || '')}</div>

          <div class="skill-row">
            ${(a.skills || []).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('')}
            ${assignedCnt ? `<span class="ai-copilot-tag">✨ ดูแล ${assignedCnt} งาน</span>` : ''}
          </div>

          <div class="ai-stats">
            <div><b>${a.runs}</b><span>ภารกิจ</span></div>
            <div><b>${a.successRate}%</b><span>สำเร็จ</span></div>
            <div><b>${((a.tokensToday || 0) / 1000).toFixed(1)}k</b><span>Tokens</span></div>
          </div>

          <div class="ai-auto-row">
            <span>Autonomy</span>
            <input type="range" min="10" max="100" step="5" value="${a.autonomy}"
              onchange="updateAiAgent('${a.id}', {autonomy: +this.value})"/>
            <b style="min-width:34px;text-align:right;color:var(--purple)">${a.autonomy}%</b>
          </div>

          <div style="display:flex;gap:8px;margin-top:auto">
            <button class="btn btn-ghost btn-sm" style="flex:1;justify-content:center"
              onclick="updateAiAgent('${a.id}', {paused: ${!a.paused}})">
              ${a.paused ? '▶ เปิดใช้งาน' : '⏸ พักชั่วคราว'}
            </button>
            <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center"
              ${a.paused ? 'disabled' : ''} onclick="openAiDispatchModal('${a.id}')">
              ⚡ สั่งงาน ${esc(a.code)}
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">${IC.bolt} บันทึกการทำงานสดของ AI (Live Execution Logs)</div>
        <span class="badge b-purple">${runs.length} รายการล่าสุด</span>
      </div>
      <div class="tbl-wrap" style="border:0;box-shadow:none">
        <table class="tbl">
          <thead><tr><th>เวลา</th><th>AI Agent</th><th>ภารกิจ / คำสั่ง</th><th>ผลลัพธ์</th><th>เวลาที่ใช้</th><th>Tokens</th><th>สถานะ</th></tr></thead>
          <tbody>
            ${runs.slice(0, 15).map(r => {
              const ag = aiAgentOf(r.agentId) || { code: 'AI', color: '#6C5CE7' };
              const tk = r.taskId ? Store.getTask(r.taskId) : null;
              return `<tr>
                <td style="white-space:nowrap;color:var(--muted);font-size:12px">${esc(r.at || 'เมื่อสักครู่')}</td>
                <td><span class="badge" style="background:${ag.color}18;color:${ag.color}">🤖 ${esc(ag.code)}</span></td>
                <td><b>${esc(r.action)}</b>${tk ? ` <span class="t-code" style="cursor:pointer;color:var(--purple)" onclick="openTaskModal('${tk.id}')">${esc(tk.code)}</span>` : ''}</td>
                <td style="max-width:340px;color:var(--ink-2);font-size:12.5px">${esc(r.detail)}</td>
                <td>${r.durationSec || 3}s</td>
                <td>${Number(r.tokens || 0).toLocaleString('en-US')}</td>
                <td><span class="badge b-green">สำเร็จ</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function updateAiAgent(agentId, patch) {
  const a = aiAgentOf(agentId);
  if (!a) return;
  Object.assign(a, patch);
  Store.save();
  Remote.push('/ai/agents/' + agentId, 'PATCH', patch);
  App.refresh();
  toast(`อัปเดต ${a.code} เรียบร้อย`);
}

function toggleAllAiAgents(paused) {
  ensureAgencyData();
  Store.data.aiAgents.forEach(a => { a.paused = !!paused; });
  Store.logActivity(paused ? '⏸ เปิดโหมด <b>Master Kill-Switch</b> หยุดพัก AI ทั้งทีม' : '▶ เปิดการทำงาน <b>AI Workforce</b> ทั้งทีมอีกครั้ง');
  Store.save();
  Remote.push('/ai/toggle-all', 'POST', { paused: !!paused });
  App.refresh();
  toast(paused ? 'หยุดพัก AI ทั้งทีมชั่วคราวแล้ว' : 'เปิดการทำงาน AI ทั้งทีมเรียบร้อย');
}

function openAiDispatchModal(preAgentId = '', preTaskId = '') {
  ensureAgencyData();
  const activeAgents = Store.data.aiAgents.filter(a => !a.paused);
  if (!activeAgents.length) {
    toast('AI ทุกตัวถูกพักไว้ชั่วคราว กรุณาเปิดใช้งานก่อนสั่งงาน', 'warn');
    return;
  }
  const selId = preAgentId || activeAgents[0].id;
  const openTasks = Store.data.tasks.filter(t => t.status !== 'done');
  const preTask = preTaskId ? Store.getTask(preTaskId) : null;

  openModal(`
    ${modalHead('⚡ สั่งงาน AI Workforce ทันที', 'เลือกผู้ช่วย AI และงานที่ต้องการให้ช่วยวิเคราะห์ ร่างเนื้อหา หรือตรวจ QA')}
    <form id="aiDispForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group">
            <label>เลือก AI Agent *</label>
            <select name="agentId">
              ${activeAgents.map(a => `<option value="${a.id}" ${a.id === selId ? 'selected' : ''}>🤖 ${esc(a.code)} — ${esc(a.role)}</option>`).join('')}
            </select>
          </div>
          <div class="f-group">
            <label>ผูกกับงานในระบบ</label>
            <select name="taskId">
              <option value="">— คำสั่งทั่วไป / ไม่ผูกงาน —</option>
              ${openTasks.map(t => `<option value="${t.id}" ${t.id === preTaskId ? 'selected' : ''}>${esc(t.code)} · ${esc(t.title.slice(0, 38))}</option>`).join('')}
            </select>
          </div>
          <div class="f-group full">
            <label>คำสั่งหรือโจทย์ที่ต้องการให้ AI ทำ *</label>
            <input name="action" required value="${preTask ? esc(`วิเคราะห์แนวทางและ Checklist สำหรับ ${preTask.code}: ${preTask.title}`) : ''}"
              placeholder="เช่น สรุปแผนแก้คอขวด Sprint นี้, ร่าง UX Copy 3 แบบ, สร้าง Checklist QA 10 ข้อ"/>
          </div>
          <div class="f-group full">
            <label>บริบทเพิ่มเติม (ไม่บังคับ)</label>
            <textarea name="detail" placeholder="รายละเอียดเพิ่มเติม กลุ่มเป้าหมาย หรือข้อจำกัดทางเทคนิค…"></textarea>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">🚀 เริ่มประมวลผล & ส่งเข้า #ai-feed</button>
      </div>
    </form>
  `);

  $('#aiDispForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const agentId = fd.get('agentId');
    const taskId = fd.get('taskId') || null;
    const action = fd.get('action').trim();
    const extra = fd.get('detail').trim();
    if (!action) return;

    const ag = aiAgentOf(agentId);
    const tk = taskId ? Store.getTask(taskId) : null;
    const tokens = 680 + Math.floor(Math.random() * 520);
    const dur = 2 + Math.floor(Math.random() * 4);
    const summary = extra
      ? `${extra} — ดำเนินการโดย ${ag.code} เสร็จสมบูรณ์ พร้อมคำแนะนำปฏิบัติการสำหรับทีม`
      : `วิเคราะห์โจทย์ "${action}"${tk ? ` (${tk.code})` : ''} เรียบร้อย สรุปแนวทางปฏิบัติและจุดตรวจเช็กครบถ้วน`;

    if (Remote.on) {
      try {
        await Remote.req('/ai/dispatch', { method: 'POST', body: { agentId, taskId, action, detail: summary } });
        await Remote.refreshAll();
      } catch (e) {
        toast('สั่งงานไม่สำเร็จ: ' + e.message, 'err');
        return;
      }
    } else {
      const nowAt = `${todayS()} ${nowHM()}`;
      Store.data.aiRuns.unshift({
        id: uid('run'), agentId, taskId, action, detail: summary, durationSec: dur, tokens, status: 'ok', at: nowAt,
      });
      ag.runs = (+ag.runs || 0) + 1;
      ag.tokensToday = (+ag.tokensToday || 0) + tokens;
      if (tk && !tk.aiAgentId) tk.aiAgentId = agentId;

      const aiChan = Store.data.channels.find(c => c.slug === 'ai-feed') || Store.data.channels[0];
      if (aiChan) {
        Store.data.messages.push({
          id: uid('m'), channelId: aiChan.id, senderId: ag.id, senderName: `${ag.name} (AI)`, kind: 'ai',
          body: `✨ <b>${esc(ag.name)}</b> ดำเนินการเสร็จสิ้น: <b>${esc(action)}</b>${tk ? ` (${esc(tk.code)})` : ''} — ${esc(summary)}`,
          pinned: false, reactions: { '⚡': ['u1'] }, at: nowAt,
        });
      }
      Store.logActivity(`🤖 <b>${esc(ag.code)}</b> ประมวลผล "${esc(action)}" เสร็จใน ${dur}s`);
      Store.save();
    }

    closeModal();
    App.refresh();
    toast(`🤖 ${ag.code} ดำเนินการเสร็จสิ้น และโพสต์ผลใน #ai-feed แล้ว!`);
  };
}

/* ============================================================
   4. TEAM CHAT (#/chat) — PlayDigital Parity (i.playdigital.co.th)
      Group Channels · 1-on-1 Human & AI DMs · Google Drive & File Upload ·
      System Banners · Replies · Task Links · Pins · Reactions · Live MariaDB Sync
   ============================================================ */
const ChatSync = {
  _timer: null,
  _busy: false,
  sig(chans, msgs, files, folder) {
    const lastM = msgs[msgs.length - 1];
    const pinCnt = msgs.filter(m => m.pinned).length;
    const rxCnt = msgs.reduce((s, m) => s + Object.keys(m.reactions || {}).length, 0);
    return `${chans.length}|${msgs.length}|${lastM?.id || ''}|${lastM?.editedAt || ''}|${pinCnt}|${rxCnt}|${files.length}|${folder || ''}`;
  },
  ensure() {
    if (this._timer) return;
    this._timer = setInterval(() => this.tick(), 4000);
  },
  async tick() {
    if (!Remote.on || Store.ui?.route !== 'chat' || document.hidden || this._busy) return;
    if ($('#modalRoot')?.classList.contains('open')) return;
    this._busy = true;
    try {
      const prevSig = this.sig(Store.data.channels || [], Store.data.messages || [], Store.data.files || [], Store.data.settings?.driveFolder);
      const d = await Remote.req('/chat/sync');
      const nextSig = this.sig(d.channels || [], d.messages || [], d.files || [], d.driveFolder);
      if (nextSig !== prevSig) {
        const inp = $('#chatMsgInput');
        const draft = inp ? inp.value : '';
        const focused = document.activeElement === inp;
        const selStart = inp ? inp.selectionStart : null;
        Store.data.channels = d.channels || Store.data.channels;
        Store.data.messages = d.messages || Store.data.messages;
        Store.data.files = d.files || Store.data.files;
        if (d.driveFolder) Store.data.settings.driveFolder = d.driveFolder;
        Store.save();
        renderChat();
        const nextInp = $('#chatMsgInput');
        if (nextInp) {
          nextInp.value = draft;
          if (focused) {
            nextInp.focus();
            if (selStart != null) try { nextInp.setSelectionRange(selStart, selStart); } catch {}
          }
        }
      }
    } catch {} finally {
      this._busy = false;
    }
  },
};

function fmtBytes(bytes) {
  const n = +bytes || 0;
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function resolveChatMember(id) {
  if (!id) return { id: '?', name: 'สมาชิก', color: '#8a8fb1', kind: 'human', role: '' };
  if (String(id).startsWith('ai')) {
    const ag = aiAgentOf(id);
    if (ag) return { id: ag.id, name: ag.name, code: ag.code, color: ag.color, kind: 'ai', role: ag.role, model: ag.model, paused: ag.paused };
  }
  const u = Store.data.team.find(x => x.id === id);
  if (u) return { ...u, kind: 'human' };
  return { id, name: 'สมาชิก', color: '#8a8fb1', kind: 'human', role: '' };
}

function dmPartnerOf(chan, meId) {
  const mems = Array.isArray(chan?.members) ? chan.members : [];
  const otherId = mems.find(x => x !== meId) || mems[0] || meId;
  return resolveChatMember(otherId);
}

function formatChatBody(rawText, isAi) {
  let html = isAi ? String(rawText || '') : esc(String(rawText || ''));
  html = html.replace(/@([A-Za-z0-9ก-๙_-]{2,24})/g, '<span class="chat-mention">@$1</span>');
  const taskByCode = new Map((Store.data.tasks || []).map(t => [String(t.code || '').toUpperCase(), t.id]));
  html = html.replace(/\b([A-Z]{2,5}-\d{3,5})\b/g, (full, code) => {
    const tid = taskByCode.get(code.toUpperCase());
    if (!tid) return full;
    return `<span class="chat-task-ref" onclick="openTaskModal('${tid}')" title="คลิกเพื่อเปิดรายละเอียดงาน ${code}">📋 ${code}</span>`;
  });
  return html;
}

function renderMessageAttachment(m) {
  const url = m.attachmentUrl;
  if (!url) return '';
  const name = m.attachmentName || 'ไฟล์แนบ';
  const type = String(m.attachmentType || '').toLowerCase();
  const isImg = type.startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
  if (isImg) {
    return `<div class="msg-attach">
      <a class="msg-img-preview" href="${esc(url)}" target="_blank" rel="noopener" title="คลิกเพื่อดูภาพขนาดเต็ม (${esc(name)})">
        <img src="${esc(url)}" alt="${esc(name)}" loading="lazy"/>
      </a>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">🖼 ${esc(name)}${m.attachmentSize ? ` · ${fmtBytes(m.attachmentSize)}` : ''}</div>
    </div>`;
  }
  const isDrive = type === 'drive' || /drive\.google\.com|docs\.google\.com/i.test(url);
  return `<div class="msg-attach">
    <a class="msg-file-card ${isDrive ? 'is-drive' : ''}" href="${esc(url)}" target="_blank" rel="noopener">
      <div class="msg-file-ico">${isDrive ? '🗂' : '📄'}</div>
      <div class="msg-file-meta">
        <b>${esc(name)}</b>
        <small>${isDrive ? 'Google Drive · เปิดไฟล์ร่วมกัน ↗' : `ไฟล์แนบ${m.attachmentSize ? ' · ' + fmtBytes(m.attachmentSize) : ''} · ดาวน์โหลด ↗`}</small>
      </div>
    </a>
  </div>`;
}

function renderChat() {
  ensureAgencyData();
  ChatSync.ensure();

  const view = $('#view'), side = $('#side');
  view.classList.add('no-scroll');

  const me = meMember();
  const chans = Store.data.channels || [];
  const msgs = Store.data.messages || [];
  const files = Store.data.files || [];
  const q = (Store.ui.q.chat || '').toLowerCase().trim();
  const drawerMode = Store.ui.chatDrawer || null;
  const pinnedOnly = !!Store.ui.chatPinnedOnly;

  const groupChans = chans
    .filter(c => (c.type || 'group') !== 'dm')
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const activeId = Store.ui.activeChannel || groupChans[0]?.id || chans[0]?.id;
  const curChan = chans.find(c => c.id === activeId) || groupChans[0] || chans[0];
  if (curChan && Store.ui.activeChannel !== curChan.id) Store.ui.activeChannel = curChan.id;

  const isDm = curChan?.type === 'dm';
  const dmPartner = isDm ? dmPartnerOf(curChan, me.id) : null;
  const chanMsgs = msgs.filter(m => m.channelId === curChan?.id);
  const pinnedMsgs = chanMsgs.filter(m => m.pinned);
  const chanFiles = files.filter(f => !f.channelId || f.channelId === curChan?.id);
  const exactChanFiles = files.filter(f => f.channelId === curChan?.id);
  const driveFolder = Store.data.settings?.driveFolder || 'https://drive.google.com/drive/u/0/my-drive';

  const dmByPartner = {};
  chans.filter(c => c.type === 'dm').forEach(c => {
    const p = dmPartnerOf(c, me.id);
    if (p?.id) dmByPartner[p.id] = c;
  });

  const teammates = Store.data.team.filter(u => !q || `${u.name} ${u.nickname || ''} ${u.role}`.toLowerCase().includes(q));
  const aiList = Store.data.aiAgents.filter(a => !q || `${a.code} ${a.name} ${a.role} ${a.model}`.toLowerCase().includes(q));
  const filteredGroups = groupChans.filter(c => !q || `${c.name} ${c.topic || ''}`.toLowerCase().includes(q) || msgs.some(m => m.channelId === c.id && String(m.body || '').toLowerCase().includes(q)));

  side.innerHTML =
    sideSearch('ค้นหาห้อง ข้อความ หรือไฟล์…', 'chat') +
    `<div class="side-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">ห้องกลุ่ม # (${filteredGroups.length})</h3>
        <button class="btn btn-ghost btn-sm" style="padding:3px 9px;font-size:11.5px" onclick="openChannelForm()">+ สร้างกลุ่ม</button>
      </div>
      <div class="chan-list">
        ${filteredGroups.map(c => {
          const cnt = msgs.filter(m => m.channelId === c.id && m.kind !== 'system').length;
          const proj = c.projectId ? Store.data.projects.find(p => p.id === c.projectId) : null;
          return `<div class="chan-item ${c.id === curChan?.id ? 'active' : ''}" data-chan="${c.id}">
            <span style="font-size:15px">${c.emoji || '💬'}</span>
            <span class="ch-name">#${esc(c.name)}${proj ? ` <small style="font-family:var(--font-mono);font-size:9.5px;opacity:.75">[${esc(proj.code)}]</small>` : ''}</span>
            ${c.pinned ? '<span title="ปักหมุดห้อง" style="font-size:10px;opacity:.7">📌</span>' : ''}
            <span class="ch-cnt">${cnt}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="side-block">
      <h3 style="margin-bottom:8px">ข้อความส่วนตัว · ทีมงาน (${teammates.length})</h3>
      <div class="chan-list">
        ${teammates.map(u => {
          const dmChan = dmByPartner[u.id];
          const cnt = dmChan ? msgs.filter(m => m.channelId === dmChan.id && m.kind !== 'system').length : 0;
          const pm = PRESENCE_META[u.presence || 'online'] || PRESENCE_META.online;
          const isSelf = u.id === me.id;
          const active = dmChan && dmChan.id === curChan?.id;
          return `<div class="chan-item ${active ? 'active' : ''}" onclick="openDirectChat('${u.id}')">
            <span class="dm-av-wrap">
              <span class="av" style="width:24px;height:24px;font-size:9.5px;background:${u.color}">${esc(initials(u.name))}</span>
              <span class="dm-pres-dot" style="background:${pm.color}" title="${pm.label}"></span>
            </span>
            <span class="ch-name">${esc(u.nickname ? `${u.name.split(' ')[0]} (${u.nickname})` : u.name)}${isSelf ? ' <small style="opacity:.65">(โน้ตส่วนตัว)</small>' : ''}</span>
            ${cnt ? `<span class="ch-cnt">${cnt}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="side-block">
      <h3 style="margin-bottom:8px">คุยกับ AI Workforce (${aiList.length})</h3>
      <div class="chan-list">
        ${aiList.map(a => {
          const dmChan = dmByPartner[a.id];
          const cnt = dmChan ? msgs.filter(m => m.channelId === dmChan.id && m.kind !== 'system').length : 0;
          const active = dmChan && dmChan.id === curChan?.id;
          return `<div class="chan-item ${active ? 'active' : ''}" onclick="openDirectChat('${a.id}')">
            <span class="ai-orb" style="width:24px;height:24px;border-radius:7px;font-size:8.5px;background:${a.color}">${esc(a.code.slice(0, 3))}</span>
            <span class="ch-name">${esc(a.code)} <small style="color:var(--muted);font-weight:400">· ${esc(a.role.replace(/^AI\s+/i, '').slice(0, 16))}</small></span>
            <span class="ai-live-tag ${a.paused ? 'paused' : ''}" style="font-size:9.5px;padding:1px 6px">${a.paused ? 'พัก' : 'live'}</span>
            ${cnt ? `<span class="ch-cnt">${cnt}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="side-block">
      <div class="drive-side-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <b style="font-size:12.5px;color:var(--ink)">🗂 Google Drive ทีม</b>
          <button class="link-btn" style="font-size:11px" onclick="openDriveFolderModal()">ตั้งค่า</button>
        </div>
        <div style="font-size:11px;color:var(--muted);line-height:1.4">คลังไฟล์กลางของทีม (${files.length} รายการในระบบ)</div>
        <div style="display:flex;gap:6px">
          <a class="btn btn-ghost btn-sm" style="flex:1;justify-content:center;text-decoration:none;font-size:11.5px" href="${esc(driveFolder)}" target="_blank" rel="noopener">เปิด Drive ↗</a>
          <button class="btn btn-primary btn-sm" style="font-size:11.5px;padding:5px 10px" onclick="openShareDriveModal('${curChan?.id || ''}')">+ แชร์ไฟล์</button>
        </div>
      </div>
    </div>`;

  wireSideCommon(view);
  $$('[data-chan]', side).forEach(el => el.onclick = () => {
    Store.ui.activeChannel = el.dataset.chan;
    Store.ui.chatPinnedOnly = false;
    Store.ui.chatReplyTo = null;
    App.refresh();
  });

  const shownMsgs = chanMsgs.filter(m => {
    if (pinnedOnly && !m.pinned) return false;
    if (q && !`${m.senderName || ''} ${m.body || ''} ${m.attachmentName || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const roomMembers = (curChan?.members?.length ? curChan.members : Store.data.team.map(u => u.id)).map(resolveChatMember);
  const humanRoomMembers = roomMembers.filter(m => m.kind === 'human');
  const linkedProj = curChan?.projectId ? Store.data.projects.find(p => p.id === curChan.projectId) : null;
  const EMOJIS = ['👍', '❤️', '🔥', '🎉', '✅', '👀'];
  const isLead = !Remote.on || ['super_admin', 'admin', 'manager'].includes(Remote.user?.role);

  const replyTarget = Store.ui.chatReplyTo ? chanMsgs.find(m => m.id === Store.ui.chatReplyTo) : null;
  const pendingAttach = Store.ui.chatPendingAttach || null;

  let lastDateKey = '';
  const streamHtml = shownMsgs.length ? shownMsgs.map(m => {
    const datePart = String(m.at || '').slice(0, 10);
    let sep = '';
    if (datePart && datePart !== lastDateKey && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      lastDateKey = datePart;
      const lbl = datePart === todayS() ? `วันนี้ · ${fmtD(datePart)}` : fmtD(datePart, { full: true });
      sep = `<div class="chat-date-sep"><span>${lbl}</span></div>`;
    }
    if (m.kind === 'system') {
      return `${sep}<div class="msg-system">💬 ${esc(m.body)}</div>`;
    }

    const isAi = m.kind === 'ai' || String(m.senderId).startsWith('ai');
    const ag = isAi ? aiAgentOf(m.senderId) : null;
    const u = !isAi ? Store.userOf(m.senderId) : null;
    const isMine = !isAi && m.senderId === me.id;
    const reacts = m.reactions || {};
    const quoted = m.replyTo ? msgs.find(x => x.id === m.replyTo) : null;

    return `${sep}
      <div class="msg-card ${isAi ? 'is-ai' : ''} ${isMine ? 'is-mine' : ''} ${m.pinned ? 'is-pinned' : ''}" id="msg-${m.id}">
        ${isAi
          ? `<div class="ai-orb" style="width:36px;height:36px;border-radius:11px;font-size:10.5px;background:${ag?.color || '#6C5CE7'}">${esc((ag?.code || 'AI').slice(0, 4))}</div>`
          : avatar(u, 'av-lg')}
        <div class="msg-body">
          <div class="msg-meta">
            <b>${esc(m.senderName || u?.name || 'สมาชิก')}</b>
            ${isAi ? `<span class="ai-copilot-tag">✨ AI · ${esc(ag?.model || 'Co-pilot')}</span>` : ''}
            ${isMine ? '<span class="badge b-purple" style="font-size:9.5px;padding:1px 6px">คุณ</span>' : ''}
            ${m.pinned ? '<span class="badge b-yellow" style="font-size:10px">📌 ปักหมุด</span>' : ''}
            <span class="msg-time">${esc(String(m.at || '').slice(11, 16) || m.at || '')}</span>
            ${m.editedAt ? '<span style="font-size:10.5px;color:var(--muted)">(แก้ไขแล้ว)</span>' : ''}
          </div>
          ${quoted ? `<div class="msg-reply-quote" onclick="document.getElementById('msg-${quoted.id}')?.scrollIntoView({behavior:'smooth',block:'center'})">
            <span>↩</span> <b>${esc(quoted.senderName || 'ข้อความ')}</b>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(String(quoted.body || '').replace(/<[^>]+>/g, '').slice(0, 75))}</span>
          </div>` : ''}
          <div class="msg-text">${formatChatBody(m.body, isAi)}</div>
          ${renderMessageAttachment(m)}
          <div class="msg-actions">
            ${EMOJIS.map(em => {
              const arr = Array.isArray(reacts[em]) ? reacts[em] : [];
              const mine = arr.includes(me.id);
              const names = arr.map(uid => resolveChatMember(uid).name).join(', ');
              return `<button type="button" class="react-btn ${mine ? 'mine' : ''}" title="${esc(names || 'กดแสดงความรู้สึก')}" onclick="toggleChatReaction('${m.id}','${em}')">${em}${arr.length ? ` <b>${arr.length}</b>` : ''}</button>`;
            }).join('')}
            <div class="msg-act-right">
              <button type="button" class="react-btn" onclick="setChatReply('${m.id}')" title="ตอบกลับข้อความนี้">↩ ตอบกลับ</button>
              <button type="button" class="react-btn" onclick="toggleChatPin('${m.id}')" title="ปักหมุดในห้องนี้">${m.pinned ? 'เลิกปักหมุด' : '📌'}</button>
              <button type="button" class="react-btn" onclick="createTaskFromMessage('${m.id}')" title="แปลงข้อความนี้เป็นงานใหม่ในบอร์ด Kanban">➕ สร้างงาน</button>
              ${(isMine || isLead) && !isAi ? `<button type="button" class="react-btn" onclick="editChatMessage('${m.id}')" title="แก้ไขข้อความ">✏️</button>` : ''}
              ${(isMine || isLead) ? `<button type="button" class="react-btn" onclick="deleteChatMessage('${m.id}')" title="ลบข้อความ">🗑</button>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }).join('') : `<div class="empty-state" style="margin:auto">
      <div style="font-size:32px;margin-bottom:6px">${isDm ? (dmPartner?.kind === 'ai' ? '🤖' : '👋') : (curChan?.emoji || '💬')}</div>
      <b style="color:var(--ink)">${q ? 'ไม่พบข้อความที่ตรงกับคำค้นหา' : (isDm ? `เริ่มสนทนาส่วนตัวกับ ${esc(dmPartner?.name || '')}` : `ยินดีต้อนรับสู่ #${esc(curChan?.name || 'chat')}`)}</b>
      <p style="margin-top:4px">${isDm && dmPartner?.kind === 'ai' ? 'พิมพ์ถามเรื่องงาน เดดไลน์ โปรเจกต์ หรือให้ช่วยร่างข้อความได้ทันที' : 'ส่งข้อความ แนบรูปภาพ หรือแชร์ไฟล์ผ่าน Google Drive ด้านล่างได้เลย'}</p>
    </div>`;

  let drawerBodyHtml = '';
  if (drawerMode === 'files') {
    const shownFiles = exactChanFiles.length ? exactChanFiles : chanFiles;
    drawerBodyHtml = `
      <div class="drive-side-card" style="margin-bottom:4px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <b style="font-size:12.5px;color:var(--ink)">🗂 Google Drive ของห้อง</b>
          <a href="${esc(driveFolder)}" target="_blank" rel="noopener" style="font-size:11.5px;color:var(--violet);font-weight:600;text-decoration:none">เปิดโฟลเดอร์ ↗</a>
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center" onclick="openShareDriveModal('${curChan?.id || ''}')">+ แชร์ลิงก์ Drive</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('chatFileInput')?.click()">📎 อัปโหลด</button>
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--muted);font-weight:600;margin-top:4px">ไฟล์และลิงก์ที่แชร์ (${shownFiles.length})</div>
      ${shownFiles.length ? shownFiles.map(f => {
        const isDrv = f.source === 'drive' || /drive\.google\.com/i.test(f.url);
        return `<div style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:11px;border:1px solid var(--line);background:var(--panel)">
          <span style="font-size:18px">${isDrv ? '🗂' : '📄'}</span>
          <div style="flex:1;min-width:0">
            <a href="${esc(f.url)}" target="_blank" rel="noopener" style="font-size:12.5px;font-weight:600;color:var(--ink);text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</a>
            <div style="font-size:10.5px;color:var(--muted)">${esc(f.uploaderName || 'สมาชิก')}${f.size ? ' · ' + fmtBytes(f.size) : ''} · ${esc(String(f.at || '').slice(5, 16))}</div>
          </div>
          <button class="icon-btn" style="width:28px;height:28px" title="ลบไฟล์" onclick="deleteSharedFile('${f.id}')">🗑</button>
        </div>`;
      }).join('') : '<div style="font-size:12px;color:var(--muted);text-align:center;padding:22px 8px">ยังไม่มีไฟล์ในห้องนี้ — กด 📎 หรือแชร์ลิงก์ Google Drive ได้เลย</div>'}`;
  } else if (drawerMode === 'pins') {
    drawerBodyHtml = pinnedMsgs.length ? pinnedMsgs.map(pm => `
      <div style="padding:10px 12px;border-radius:12px;background:var(--yellow-soft);border:1px solid #ffe4ad;font-size:12.5px;line-height:1.45">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <b style="color:var(--ink)">📌 ${esc(pm.senderName)}</b>
          <button class="link-btn" style="font-size:11px" onclick="toggleChatPin('${pm.id}')">เลิกปัก</button>
        </div>
        <div style="color:var(--ink-2)">${pm.kind === 'ai' ? pm.body : esc(pm.body)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:4px">${esc(pm.at || '')}</div>
      </div>
    `).join('') : '<div style="font-size:12px;color:var(--muted);text-align:center;padding:24px 8px">ยังไม่มีข้อความปักหมุดในห้องนี้</div>';
  } else if (drawerMode === 'members') {
    drawerBodyHtml = `
      ${!isDm ? `<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-bottom:4px" onclick="openChannelForm('${curChan?.id}')">⚙️ จัดการสมาชิก & ตั้งค่าห้อง</button>` : ''}
      <div style="font-size:11px;color:var(--muted);font-weight:600">สมาชิกในห้องนี้ (${roomMembers.length})</div>
      ${roomMembers.map(rm => {
        if (rm.kind === 'ai') {
          return `<div style="display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:10px;background:var(--panel)">
            <span class="ai-orb" style="width:30px;height:30px;border-radius:9px;font-size:9.5px;background:${rm.color}">${esc((rm.code || rm.name).slice(0, 3))}</span>
            <div style="flex:1;min-width:0">
              <b style="font-size:12.5px;display:block;color:var(--ink)">${esc(rm.name)} <span class="ai-model">${esc(rm.model || 'AI')}</span></b>
              <small style="font-size:11px;color:var(--muted)">${esc(rm.role)}</small>
            </div>
            <button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="openDirectChat('${rm.id}')">ทักแชต</button>
          </div>`;
        }
        const pm = PRESENCE_META[rm.presence || 'online'] || PRESENCE_META.online;
        return `<div style="display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:10px;background:#fff;border:1px solid var(--line)">
          <span class="dm-av-wrap">
            <span class="av" style="width:30px;height:30px;font-size:10.5px;background:${rm.color}">${esc(initials(rm.name))}</span>
            <span class="dm-pres-dot" style="background:${pm.color}"></span>
          </span>
          <div style="flex:1;min-width:0">
            <b style="font-size:12.5px;display:block;color:var(--ink)">${esc(rm.name)}${rm.nickname ? ` (${esc(rm.nickname)})` : ''}</b>
            <small style="font-size:11px;color:var(--muted)">${esc(rm.role)} · ${pm.label}</small>
          </div>
          ${rm.id !== me.id ? `<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="openDirectChat('${rm.id}')">DM</button>` : ''}
        </div>`;
      }).join('')}`;
  }

  view.innerHTML = `
    <div class="chat-workspace ${drawerMode ? 'has-drawer' : ''}">
      <div class="chat-shell">
        <div class="chat-header">
          <div class="chat-head-left">
            ${isDm
              ? (dmPartner?.kind === 'ai'
                  ? `<div class="ai-orb" style="width:40px;height:40px;border-radius:12px;font-size:12px;background:${dmPartner.color || '#6C5CE7'}">${esc((dmPartner.code || 'AI').slice(0, 4))}</div>`
                  : avatar(dmPartner, 'av-lg'))
              : `<div class="chat-room-ico">${curChan?.emoji || '💬'}</div>`}
            <div class="chat-head-info">
              <div class="chat-head-title">
                <b>${isDm ? esc(dmPartner?.name || curChan?.name) : `#${esc(curChan?.name || 'ทีมทั้งหมด')}`}</b>
                ${isDm && dmPartner?.kind === 'ai'
                  ? `<span class="ai-copilot-tag">🤖 ${esc(dmPartner.model || 'AI Co-pilot')}</span>`
                  : isDm
                    ? presenceBadge(dmPartner?.presence || 'online')
                    : `<span class="badge b-grey">${roomMembers.length} สมาชิก</span>`}
                ${linkedProj ? `<span class="badge b-purple" style="cursor:pointer" onclick="App.go('projects')">📁 ${esc(linkedProj.code)} · ${esc(linkedProj.short)}</span>` : ''}
                ${Remote.on ? '<span class="chat-sync-dot" title="เชื่อมต่อและซิงก์ข้อความสดกับฐานข้อมูล MariaDB"><i></i>MariaDB Live</span>' : ''}
              </div>
              <div class="chat-head-sub">${esc(curChan?.topic || (isDm ? dmPartner?.role || 'สนทนาส่วนตัวแบบ 1-ต่อ-1' : 'แชร์งาน ไฟล์ และสั่งงาน AI ในห้องนี้'))}</div>
            </div>
          </div>

          <div class="chat-head-tools">
            ${!isDm && humanRoomMembers.length ? `<div style="margin-right:4px;cursor:pointer" onclick="toggleChatDrawer('members')" title="ดูสมาชิกในห้อง">${avatarStack(humanRoomMembers, 4)}</div>` : ''}
            <button class="btn ${drawerMode === 'pins' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleChatDrawer('pins')">
              📌 ปักหมุด (${pinnedMsgs.length})
            </button>
            <button class="btn ${drawerMode === 'files' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleChatDrawer('files')">
              📁 ไฟล์ & Drive (${exactChanFiles.length})
            </button>
            <button class="btn ${drawerMode === 'members' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleChatDrawer('members')">
              👥 สมาชิก (${roomMembers.length})
            </button>
            <button class="btn btn-ghost btn-sm" onclick="askAiInChannel('${curChan?.id}')">✨ ให้ AI สรุป</button>
            ${!isDm ? `<button class="icon-btn" style="width:34px;height:34px" title="ตั้งค่าห้อง / ปักหมุด / ลบห้อง" onclick="openChannelForm('${curChan?.id}')">⚙️</button>` : ''}
          </div>
        </div>

        <div class="chat-stream" id="chatStream">${streamHtml}</div>

        <div class="chat-composer-wrap">
          <div class="chat-quick-bar">
            <span style="font-size:11px;color:var(--muted);font-weight:500;flex:none">ด่วน:</span>
            <button type="button" class="chat-quick-chip" onclick="insertChatMention('@NOVA ช่วยสรุปงานด่วนและเดดไลน์วันนี้')">✨ @NOVA สรุปงานด่วน</button>
            <button type="button" class="chat-quick-chip" onclick="insertChatMention('@BYTE ช่วยตรวจสถานะงาน Backend/QA ที่ค้างอยู่')">💻 @BYTE ตรวจงานค้าง</button>
            <button type="button" class="chat-quick-chip" onclick="insertChatMention('@PIXEL ช่วยร่างข้อความอัปเดตแคมเปญให้ลูกค้า')">🎨 @PIXEL ร่างข้อความ</button>
            <button type="button" class="chat-quick-chip" onclick="insertChatMention('@ORBIT สรุปใบแจ้งหนี้รอเก็บและเกินกำหนด')">💰 @ORBIT เช็กบิลค้าง</button>
            <button type="button" class="chat-quick-chip" onclick="openPickTaskToChatModal()">📋 แนบรหัสงาน</button>
          </div>

          ${replyTarget ? `
            <div class="chat-pending-bar">
              <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ↩ กำลังตอบกลับ <b>${esc(replyTarget.senderName)}</b>: "${esc(String(replyTarget.body || '').replace(/<[^>]+>/g, '').slice(0, 70))}"
              </div>
              <button type="button" class="link-btn" onclick="Store.ui.chatReplyTo=null;renderChat()">ยกเลิก ✕</button>
            </div>` : ''}

          ${pendingAttach ? `
            <div class="chat-pending-bar">
              <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${pendingAttach.type === 'drive' ? '🗂 ลิงก์ Google Drive พร้อมส่ง:' : '📎 ไฟล์พร้อมส่ง:'}
                <b>${esc(pendingAttach.name)}</b> ${pendingAttach.size ? `(${fmtBytes(pendingAttach.size)})` : ''}
              </div>
              <button type="button" class="link-btn" onclick="Store.ui.chatPendingAttach=null;renderChat()">เอาออก ✕</button>
            </div>` : ''}

          <form class="chat-composer" id="chatComposeForm">
            <input type="file" id="chatFileInput" style="display:none" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.mp4,.mp3"/>
            <button type="button" class="chat-tool-btn" title="อัปโหลดรูปภาพหรือไฟล์แนบเข้าห้องแชต" onclick="document.getElementById('chatFileInput')?.click()">📎</button>
            <button type="button" class="chat-tool-btn" title="แชร์ไฟล์หรือโฟลเดอร์จาก Google Drive" onclick="openShareDriveModal('${curChan?.id || ''}')">🗂</button>
            <input type="text" id="chatMsgInput"
              placeholder="${isDm
                ? (dmPartner?.kind === 'ai' ? `ถามหรือสั่งงาน ${esc(dmPartner.code)} ได้เลย (เชื่อมข้อมูลจริง MariaDB)…` : `ส่งข้อความส่วนตัวถึง ${esc(dmPartner?.name || '')}…`)
                : `พิมพ์ข้อความใน #${esc(curChan?.name || 'ทีมทั้งหมด')}… (@NOVA, @BYTE หรือแนบรหัสงาน เช่น CAL-1031)`}"
              autocomplete="off"/>
            <button type="submit" class="btn btn-primary">${IC.send} ส่ง</button>
          </form>
        </div>
      </div>

      ${drawerMode ? `
        <aside class="chat-drawer">
          <div class="chat-drawer-head">
            <b style="font-size:13.5px;color:var(--ink)">ข้อมูลห้องสนทนา</b>
            <button class="icon-btn" style="width:28px;height:28px" onclick="Store.ui.chatDrawer=null;renderChat()">✕</button>
          </div>
          <div class="chat-drawer-tabs">
            <button class="chat-drawer-tab ${drawerMode === 'files' ? 'on' : ''}" onclick="toggleChatDrawer('files', true)">📁 ไฟล์ (${exactChanFiles.length})</button>
            <button class="chat-drawer-tab ${drawerMode === 'pins' ? 'on' : ''}" onclick="toggleChatDrawer('pins', true)">📌 ปักหมุด (${pinnedMsgs.length})</button>
            <button class="chat-drawer-tab ${drawerMode === 'members' ? 'on' : ''}" onclick="toggleChatDrawer('members', true)">👥 สมาชิก (${roomMembers.length})</button>
          </div>
          <div class="chat-drawer-body">${drawerBodyHtml}</div>
        </aside>` : ''}
    </div>
  `;

  const stream = $('#chatStream', view);
  if (stream) stream.scrollTop = stream.scrollHeight;

  const fileInp = $('#chatFileInput', view);
  if (fileInp) {
    fileInp.onchange = (ev) => {
      const f = ev.target.files?.[0];
      ev.target.value = '';
      if (f && curChan) handleChatFileUpload(curChan.id, f);
    };
  }

  $('#chatComposeForm', view).onsubmit = async (e) => {
    e.preventDefault();
    const inp = $('#chatMsgInput', view);
    const body = inp.value.trim();
    if ((!body && !Store.ui.chatPendingAttach) || !curChan) return;
    inp.value = '';
    await postChatMessage(curChan.id, body);
  };
}

function toggleChatDrawer(mode, forceOpen = false) {
  Store.ui.chatDrawer = (!forceOpen && Store.ui.chatDrawer === mode) ? null : mode;
  renderChat();
}

function setChatReply(msgId) {
  Store.ui.chatReplyTo = msgId;
  renderChat();
  setTimeout(() => $('#chatMsgInput')?.focus(), 30);
}

function insertChatMention(text) {
  const inp = $('#chatMsgInput');
  if (!inp) return;
  inp.value = inp.value ? `${inp.value.trim()} ${text} ` : `${text} `;
  inp.focus();
}

function openPickTaskToChatModal() {
  const openTasks = (Store.data.tasks || []).filter(t => t.status !== 'done').slice(0, 20);
  openModal(`
    ${modalHead('📋 แนบรหัสงานเข้าห้องแชต', 'คลิกเลือกงานเพื่อแทรกลิงก์รหัสงานลงในกล่องข้อความ')}
    <div class="modal-body" style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
      ${openTasks.map(t => {
        const p = Store.projectOf(t);
        return `<div class="cmd-item" onclick="insertChatMention('${esc(t.code)} (${esc(t.title.slice(0, 40))})');closeModal()">
          <span class="t-code" style="font-family:var(--font-mono);font-weight:700;color:var(--violet)">${esc(t.code)}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
          <span class="badge" style="background:${p.color}18;color:${p.color}">${esc(p.short)}</span>
        </div>`;
      }).join('')}
    </div>
  `);
}

function createTaskFromMessage(msgId) {
  const m = (Store.data.messages || []).find(x => x.id === msgId);
  if (!m) return;
  const chan = (Store.data.channels || []).find(c => c.id === m.channelId);
  const cleanTxt = String(m.body || '').replace(/<[^>]+>/g, '').trim();
  if (typeof openTaskForm === 'function') {
    openTaskForm(null, 'todo');
    if ($('#fTitle')) $('#fTitle').value = cleanTxt.slice(0, 90);
    if ($('#fDesc')) $('#fDesc').value = `สร้างจากข้อความแชตใน #${chan?.name || 'chat'} โดย ${m.senderName || 'สมาชิก'}:\n"${cleanTxt}"`;
    if (chan?.projectId && $('#fProj')) $('#fProj').value = chan.projectId;
    if ($('#fDue')) $('#fDue').value = d2s(addDays(new Date(), 3));
  }
}

async function openDirectChat(targetId) {
  ensureAgencyData();
  const me = meMember();
  const partner = resolveChatMember(targetId);
  const pair = [me.id, targetId].sort();
  const slug = `dm-${pair[0]}-${pair[1]}`;

  let existing = Store.data.channels.find(c => c.slug === slug);
  if (!existing && Remote.on) {
    try {
      const res = await Remote.req('/channels/dm', {
        method: 'POST',
        body: { meId: me.id, targetId, targetName: partner.name },
      });
      await Remote.refreshAll();
      existing = Store.data.channels.find(c => c.id === res.id || c.slug === slug);
    } catch (e) {
      toast('เปิดห้องแชตส่วนตัวไม่สำเร็จ: ' + e.message, 'err');
      return;
    }
  } else if (!existing) {
    const id = uid('ch');
    existing = {
      id,
      slug,
      name: partner.name,
      emoji: partner.kind === 'ai' ? '🤖' : '💬',
      type: 'dm',
      pinned: false,
      members: pair,
      topic: partner.kind === 'ai' ? `สนทนาส่วนตัวกับ AI Co-pilot (${partner.name})` : 'ข้อความส่วนตัว (Direct Message)',
    };
    Store.data.channels.push(existing);
    if (partner.kind === 'ai') {
      Store.data.messages.push({
        id: uid('m'), channelId: id, senderId: partner.id, senderName: `${partner.code || partner.name} (AI)`, kind: 'ai',
        body: `✨ สวัสดีครับ! ผมคือ <b>${esc(partner.name)}</b> พร้อมช่วยสรุปงาน ตรวจเดดไลน์ ร่างข้อความ และวิเคราะห์ข้อมูลจริง พิมพ์ถามได้เลยครับ`,
        pinned: false, reactions: {}, at: `${todayS()} ${nowHM()}`,
      });
    }
    Store.save();
  }

  Store.ui.activeChannel = existing.id;
  Store.ui.chatPinnedOnly = false;
  Store.ui.chatReplyTo = null;
  if (Store.ui.route !== 'chat') App.go('chat');
  else renderChat();
  setTimeout(() => $('#chatMsgInput')?.focus(), 40);
}

function buildSmartAiReply(agent, promptText, chan) {
  const tasks = Store.data.tasks || [];
  const openTasks = tasks.filter(t => t.status !== 'done');
  const overdue = openTasks.filter(t => daysLeft(t.due) < 0);
  const urgent = openTasks.filter(t => t.priority === 'urgent' || daysLeft(t.due) <= 2);
  const unpaidInvs = (Store.data.invoices || []).filter(i => i.status === 'pending' || i.status === 'overdue');
  const unpaidSum = unpaidInvs.reduce((s, i) => s + (+i.amount || 0) + (+i.vat || 0), 0);
  const code = (agent.code || agent.name || 'NOVA').toUpperCase();

  if (code === 'ORBIT' || /ใบแจ้งหนี้|บิล|เงิน|งบ|invoice/i.test(promptText)) {
    const ov = unpaidInvs.filter(i => i.status === 'overdue');
    return `✨ <b>${esc(code)}</b> ตรวจสอบฐานข้อมูลการเงินล่าสุด: มีใบแจ้งหนี้รอเก็บ <b>${unpaidInvs.length} ใบ</b> รวมสุทธิ <b>${money(unpaidSum)}</b>${ov.length ? ` (เกินกำหนด <b>${ov.length} ใบ</b> ได้แก่ ${ov.map(x => esc(x.no)).join(', ')})` : ''} — แนะนำส่งแจ้งเตือนติดตามก่อน 15:00 วันนี้ครับ`;
  }
  if (code === 'BYTE' || /code|api|bug|qa|เทสต์|ตรวจ/i.test(promptText)) {
    const revTasks = openTasks.filter(t => t.status === 'review' || t.status === 'doing').slice(0, 3);
    const refs = revTasks.map(t => t.code).join(', ') || 'ไม่มีงานติดคอขวด';
    return `✨ <b>${esc(code)}</b> ตรวจสอบคิวพัฒนา & QA ในฐานข้อมูลจริง: งานที่กำลังทำ/รอรีวิวสำคัญคือ <b>${esc(refs)}</b> (คงค้างทั้งหมด ${openTasks.length} งาน) — แนะนำรันเช็กลิสต์ย่อยให้ครบก่อนเปลี่ยนสถานะเป็นเสร็จสิ้นครับ`;
  }
  if (code === 'PIXEL' || /copy|ร่าง|แคปชัน|ดีไซน์|ข้อความ/i.test(promptText)) {
    return `✨ <b>${esc(code)}</b> ร่างแนวทางข้อความสำหรับ "${esc(promptText.slice(0, 48))}": <i>"อัปเดตความคืบหน้าโครงการประจำสัปดาห์ — ทีมดำเนินการตามแผน พร้อมส่งมอบดราฟต์ให้ตรวจสอบภายในกำหนดครับ"</i> สามารถกด ➕ สร้างงาน เพื่อส่งต่อให้ทีมดีไซน์ได้ทันทีครับ`;
  }
  const topRefs = (urgent.length ? urgent : openTasks).slice(0, 3).map(t => t.code).join(', ');
  return `✨ <b>${esc(code)}</b> วิเคราะห์ข้อมูลสดจากระบบ (#${esc(chan?.name || 'workspace')}): งานคงค้าง <b>${openTasks.length} ชิ้น</b>${overdue.length ? ` · เกินกำหนด <b>${overdue.length} ชิ้น</b>` : ''} · งานที่ควรโฟกัสก่อน: <b>${esc(topRefs || 'ทุกงานตามแผน')}</b>`;
}

async function postChatMessage(channelId, body) {
  const me = meMember();
  const chan = Store.data.channels.find(c => c.id === channelId);
  const senderName = me.nickname ? `${me.name} (${me.nickname})` : me.name;
  const nowAt = `${todayS()} ${nowHM()}`;
  const replyTo = Store.ui.chatReplyTo || null;
  const att = Store.ui.chatPendingAttach || null;

  Store.ui.chatReplyTo = null;
  Store.ui.chatPendingAttach = null;

  const payload = {
    senderId: me.id,
    senderName,
    kind: 'text',
    body: body || (att ? `แชร์ไฟล์: ${att.name}` : ''),
    replyTo,
    attachmentUrl: att?.url || null,
    attachmentName: att?.name || null,
    attachmentType: att?.type || null,
    attachmentSize: att?.size || 0,
  };

  if (Remote.on) {
    try {
      await Remote.req(`/channels/${channelId}/messages`, { method: 'POST', body: payload });
      const sync = await Remote.req('/chat/sync');
      Store.data.channels = sync.channels || Store.data.channels;
      Store.data.messages = sync.messages || Store.data.messages;
      Store.data.files = sync.files || Store.data.files;
    } catch (e) {
      toast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'err');
      return;
    }
  } else {
    Store.data.messages.push({ id: uid('m'), channelId, ...payload, pinned: false, reactions: {}, at: nowAt });
    Store.save();
  }

  let targetAi = null;
  if (chan?.type === 'dm') {
    const p = dmPartnerOf(chan, me.id);
    if (p?.kind === 'ai') targetAi = aiAgentOf(p.id);
  }
  if (!targetAi && body) {
    targetAi = Store.data.aiAgents.find(a => body.toUpperCase().includes('@' + a.code.toUpperCase()))
      || (body.toLowerCase().includes('@ai') ? Store.data.aiAgents[0] : null);
  }

  if (targetAi && !targetAi.paused) {
    const reply = buildSmartAiReply(targetAi, body || att?.name || '', chan);
    if (Remote.on) {
      await Remote.req(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: { senderId: targetAi.id, senderName: `${targetAi.code} (AI)`, kind: 'ai', body: reply },
      }).catch(() => {});
      const sync2 = await Remote.req('/chat/sync').catch(() => null);
      if (sync2) Store.data.messages = sync2.messages || Store.data.messages;
    } else {
      Store.data.messages.push({
        id: uid('m'), channelId, senderId: targetAi.id, senderName: `${targetAi.code} (AI)`, kind: 'ai',
        body: reply, pinned: false, reactions: { '⚡': [me.id] }, at: `${todayS()} ${nowHM()}`,
      });
      Store.save();
    }
  }

  renderChat();
}

async function handleChatFileUpload(channelId, file) {
  if (file.size > 8 * 1024 * 1024) {
    toast('ไฟล์มีขนาดใหญ่เกิน 8 MB — กรุณาแชร์ผ่านลิงก์ Google Drive แทน', 'warn');
    return;
  }
  const me = meMember();
  const chan = Store.data.channels.find(c => c.id === channelId);
  toast(`กำลังอัปโหลด "${file.name}"…`);

  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    fr.readAsDataURL(file);
  });

  if (Remote.on) {
    try {
      const up = await Remote.req('/files/upload', {
        method: 'POST',
        body: {
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
          channelId,
          projectId: chan?.projectId || null,
          uploaderId: me.id,
          uploaderName: me.nickname ? `${me.name} (${me.nickname})` : me.name,
        },
      });
      Store.ui.chatPendingAttach = {
        id: up.id,
        name: up.name,
        url: up.url,
        type: up.mime || file.type || 'file',
        size: up.size || file.size,
      };
      const sync = await Remote.req('/chat/sync').catch(() => null);
      if (sync?.files) Store.data.files = sync.files;
      renderChat();
      $('#chatMsgInput')?.focus();
      toast(`แนบไฟล์ "${file.name}" พร้อมส่งแล้ว (กดส่งข้อความได้เลย)`);
    } catch (e) {
      toast('อัปโหลดไฟล์ไม่สำเร็จ: ' + e.message, 'err');
    }
  } else {
    const fid = uid('f');
    const item = {
      id: fid, channelId, projectId: chan?.projectId || null,
      uploaderId: me.id, uploaderName: me.name, name: file.name,
      mime: file.type || 'application/octet-stream', size: file.size,
      url: dataUrl, source: 'upload', at: `${todayS()} ${nowHM()}`,
    };
    Store.data.files.unshift(item);
    Store.ui.chatPendingAttach = { id: fid, name: file.name, url: dataUrl, type: item.mime, size: file.size };
    Store.save();
    renderChat();
    $('#chatMsgInput')?.focus();
  }
}

function openShareDriveModal(channelId) {
  const folder = Store.data.settings?.driveFolder || 'https://drive.google.com/drive/u/0/my-drive';
  openModal(`
    ${modalHead('🗂 แชร์ไฟล์หรือโฟลเดอร์จาก Google Drive', 'แนบลิงก์งาน Figma, Google Docs, Sheets หรือ Drive ลงในห้องสนทนาและคลังไฟล์')}
    <form id="drvShareForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group full">
            <label>ชื่อไฟล์ / เอกสาร *</label>
            <input name="name" required placeholder="เช่น Sprint-7-Deck.pptx หรือ UI-Kit-v2 (Google Drive)"/>
          </div>
          <div class="f-group full">
            <label>ลิงก์ Google Drive / เอกสารออนไลน์ *</label>
            <input name="url" type="url" required value="${esc(folder)}" placeholder="https://drive.google.com/..."/>
          </div>
          <div class="f-group full">
            <label>ข้อความประกอบ (ส่งเข้าห้องแชตทันที)</label>
            <input name="note" placeholder="เช่น ฝากทีมช่วยรีวิวดราฟต์ล่าสุดใน Drive ด้วยครับ"/>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <a class="btn btn-ghost" href="${esc(folder)}" target="_blank" rel="noopener" style="margin-right:auto;text-decoration:none">เปิด Google Drive ↗</a>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">แชร์เข้าห้องแชต</button>
      </div>
    </form>
  `);
  $('#drvShareForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim();
    const url = fd.get('url').trim();
    const note = fd.get('note').trim();
    if (!name || !url) return;
    const me = meMember();
    const cid = channelId || Store.ui.activeChannel;
    const chan = Store.data.channels.find(c => c.id === cid);

    if (Remote.on) {
      try {
        await Remote.req('/files/drive-link', {
          method: 'POST',
          body: {
            name, url, channelId: cid, projectId: chan?.projectId || null,
            uploaderId: me.id, uploaderName: me.nickname ? `${me.name} (${me.nickname})` : me.name,
          },
        });
      } catch (err) { toast(err.message, 'err'); return; }
    } else {
      Store.data.files.unshift({
        id: uid('f'), channelId: cid, projectId: chan?.projectId || null,
        uploaderId: me.id, uploaderName: me.name, name, mime: 'application/vnd.google-apps.file',
        size: 0, url, source: 'drive', at: `${todayS()} ${nowHM()}`,
      });
    }
    Store.ui.chatPendingAttach = { name, url, type: 'drive', size: 0 };
    closeModal();
    await postChatMessage(cid, note || `แชร์ไฟล์ผ่าน Google Drive: ${name}`);
    toast('🗂 แชร์ลิงก์ Google Drive ลงห้องแชตแล้ว');
  };
}

function openDriveFolderModal() {
  const cur = Store.data.settings?.driveFolder || 'https://drive.google.com/drive/u/0/my-drive';
  openModal(`
    ${modalHead('🗂 ตั้งค่าโฟลเดอร์ Google Drive กลางของทีม', 'บันทึกลงฐานข้อมูล MariaDB (erp_settings) ให้ทุกคนในทีมเข้าถึงลิงก์เดียวกัน')}
    <form id="drvCfgForm">
      <div class="modal-body">
        <div class="f-group">
          <label>URL โฟลเดอร์ Google Drive หลัก *</label>
          <input name="folder" type="url" required value="${esc(cur)}" placeholder="https://drive.google.com/drive/folders/..."/>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึกลิงก์ Drive</button>
      </div>
    </form>
  `);
  $('#drvCfgForm').onsubmit = async (e) => {
    e.preventDefault();
    const folder = new FormData(e.target).get('folder').trim();
    if (!folder) return;
    Store.data.settings.driveFolder = folder;
    Store.save();
    if (Remote.on) {
      try { await Remote.req('/drive/folder', { method: 'PUT', body: { folder } }); }
      catch (err) { toast(err.message, 'err'); return; }
    }
    closeModal();
    App.refresh();
    toast('บันทึกโฟลเดอร์ Google Drive ลงฐานข้อมูลแล้ว ✓');
  };
}

function deleteSharedFile(fileId) {
  confirmDlg('ลบไฟล์ออกจากรายการแชร์?', 'ไฟล์นี้จะถูกนำออกจากคลังไฟล์ของห้องสนทนา', async () => {
    if (Remote.on) {
      try {
        await Remote.req(`/files/${fileId}`, { method: 'DELETE' });
        const sync = await Remote.req('/chat/sync').catch(() => null);
        if (sync?.files) Store.data.files = sync.files;
      } catch (e) { toast(e.message, 'err'); return; }
    } else {
      Store.data.files = (Store.data.files || []).filter(f => f.id !== fileId);
      Store.save();
    }
    renderChat();
    toast('ลบไฟล์เรียบร้อยแล้ว');
  }, 'ลบไฟล์');
}

function editChatMessage(msgId) {
  const m = (Store.data.messages || []).find(x => x.id === msgId);
  if (!m) return;
  openModal(`
    ${modalHead('✏️ แก้ไขข้อความ', 'การแก้ไขจะซิงก์เข้าฐานข้อมูล MariaDB ทันที')}
    <form id="editMsgForm">
      <div class="modal-body">
        <div class="f-group">
          <label>ข้อความ</label>
          <textarea name="body" rows="3" required>${esc(m.body || '')}</textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึกข้อความ</button>
      </div>
    </form>
  `);
  $('#editMsgForm').onsubmit = async (e) => {
    e.preventDefault();
    const txt = new FormData(e.target).get('body').trim();
    if (!txt) return;
    if (Remote.on) {
      try {
        await Remote.req(`/messages/${msgId}`, { method: 'PATCH', body: { body: txt } });
      } catch (err) { toast(err.message, 'err'); return; }
    }
    m.body = txt;
    m.editedAt = `${todayS()} ${nowHM()}`;
    Store.save();
    closeModal();
    renderChat();
    toast('แก้ไขข้อความเรียบร้อย');
  };
}

function deleteChatMessage(msgId) {
  confirmDlg('ลบข้อความนี้?', 'ข้อความจะถูกลบออกจากห้องสนทนาและฐานข้อมูลทันที', async () => {
    if (Remote.on) {
      try { await Remote.req(`/messages/${msgId}`, { method: 'DELETE' }); }
      catch (e) { toast(e.message, 'err'); return; }
    }
    Store.data.messages = (Store.data.messages || []).filter(x => x.id !== msgId);
    Store.save();
    renderChat();
    toast('ลบข้อความแล้ว');
  }, 'ลบข้อความ');
}

async function askAiInChannel(channelId) {
  ensureAgencyData();
  const chan = Store.data.channels.find(c => c.id === channelId);
  const chanMsgs = Store.data.messages.filter(m => m.channelId === channelId && m.kind !== 'system');
  const echo = aiAgentOf('ai4') || Store.data.aiAgents[0];
  if (!chan || !echo) return;

  const openCnt = (Store.data.tasks || []).filter(t => t.status !== 'done').length;
  const lastTopics = chanMsgs.slice(-3).map(m => `${m.senderName}: "${String(m.body || '').replace(/<[^>]+>/g, '').slice(0, 36)}"`).join(' · ');
  const summary = `✨ <b>สรุปห้อง #${esc(chan.name)}</b> (${chanMsgs.length} ข้อความ · งานคงค้างในระบบ ${openCnt} ชิ้น)${lastTopics ? ` — ประเด็นล่าสุด: ${esc(lastTopics)}` : ' — พร้อมเริ่มต้นพูดคุยและแชร์ไฟล์ในห้องนี้ครับ'}`;

  if (Remote.on) {
    await Remote.req(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: { senderId: echo.id, senderName: `${echo.code} (AI)`, kind: 'ai', body: summary },
    }).catch(() => {});
    const sync = await Remote.req('/chat/sync').catch(() => null);
    if (sync?.messages) Store.data.messages = sync.messages;
    renderChat();
  } else {
    Store.data.messages.push({
      id: uid('m'), channelId, senderId: echo.id, senderName: `${echo.code} (AI)`, kind: 'ai',
      body: summary, pinned: false, reactions: { '👍': ['u1'] }, at: `${todayS()} ${nowHM()}`,
    });
    Store.save();
    renderChat();
  }
  toast(`🤖 ${echo.code} สรุปบทสนทนาใน #${chan.name} แล้ว`);
}

function toggleChatReaction(msgId, emoji) {
  const me = meMember();
  const m = Store.data.messages.find(x => x.id === msgId);
  if (!m) return;
  if (!m.reactions) m.reactions = {};
  const arr = new Set(m.reactions[emoji] || []);
  if (arr.has(me.id)) arr.delete(me.id); else arr.add(me.id);
  if (arr.size) m.reactions[emoji] = [...arr]; else delete m.reactions[emoji];
  Store.save();
  Remote.push(`/messages/${msgId}/react`, 'POST', { emoji, userId: me.id });
  renderChat();
}

function toggleChatPin(msgId) {
  const m = Store.data.messages.find(x => x.id === msgId);
  if (!m) return;
  m.pinned = !m.pinned;
  Store.save();
  Remote.push(`/messages/${msgId}/pin`, 'POST', {});
  renderChat();
  toast(m.pinned ? '📌 ปักหมุดข้อความแล้ว' : 'เลิกปักหมุดข้อความแล้ว');
}

function openChannelForm(chanId = '') {
  ensureAgencyData();
  const existing = chanId ? Store.data.channels.find(c => c.id === chanId) : null;
  const selMembers = new Set(existing?.members || [...Store.data.team.map(u => u.id), 'ai1', 'ai4']);

  openModal(`
    ${modalHead(existing ? `⚙️ ตั้งค่าห้อง #${esc(existing.name)}` : '💬 สร้างกลุ่มแชตใหม่ (New Channel)', 'เลือกสมาชิกทีม + AI Workforce ที่ต้องการเชิญเข้าห้องสนทนา')}
    <form id="chanForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group"><label>ชื่อห้องกลุ่ม *</label><input name="name" required value="${esc(existing?.name || '')}" placeholder="เช่น ทีมโปรดักชัน หรือ campaign-q4"/></div>
          <div class="f-group"><label>ไอคอน Emoji</label><input name="emoji" value="${esc(existing?.emoji || '💬')}" maxlength="4"/></div>
          <div class="f-group full"><label>หัวข้อประจำห้อง (Topic)</label><input name="topic" value="${esc(existing?.topic || '')}" placeholder="จุดประสงค์ของห้องสนทนานี้…"/></div>
          <div class="f-group">
            <label>ผูกกับโปรเจกต์ (ถ้ามี)</label>
            <select name="projectId">
              <option value="">— ไม่ผูกโปรเจกต์ —</option>
              ${Store.data.projects.map(p => `<option value="${p.id}" ${existing?.projectId === p.id ? 'selected' : ''}>[${esc(p.code)}] ${esc(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="f-group" style="display:flex;align-items:flex-end">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--ink);padding-bottom:9px">
              <input type="checkbox" name="pinned" ${existing?.pinned ? 'checked' : ''} style="width:16px;height:16px"/>
              📌 ปักหมุดห้องนี้ไว้ด้านบนสุด
            </label>
          </div>
          <div class="f-group full">
            <label>สมาชิกในห้อง (ทีมมนุษย์ + AI Workforce)</label>
            <div class="chips" id="chanMemberPicker" style="margin-top:4px">
              ${Store.data.team.map(u => `<span class="chip ${selMembers.has(u.id) ? 'on' : ''}" data-mid="${u.id}">👤 ${esc(u.nickname ? `${u.name.split(' ')[0]} (${u.nickname})` : u.name)}</span>`).join('')}
              ${Store.data.aiAgents.map(a => `<span class="chip ${selMembers.has(a.id) ? 'on' : ''}" data-mid="${a.id}">🤖 ${esc(a.code)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        ${existing && existing.slug !== 'team-all' ? `<button type="button" class="btn btn-danger" style="margin-right:auto" id="delChanBtn">🗑 ลบห้องนี้</button>` : ''}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${existing ? 'บันทึกการตั้งค่า' : 'สร้างกลุ่มแชต'}</button>
      </div>
    </form>
  `);

  $$('#chanMemberPicker [data-mid]').forEach(ch => {
    ch.onclick = () => ch.classList.toggle('on');
  });

  const delBtn = $('#delChanBtn');
  if (delBtn && existing) {
    delBtn.onclick = () => {
      confirmDlg(`ลบห้อง #${existing.name}?`, 'ข้อความทั้งหมดในห้องนี้จะถูกลบออกจากฐานข้อมูลอย่างถาวร', async () => {
        if (Remote.on) {
          try {
            await Remote.req(`/channels/${existing.id}`, { method: 'DELETE' });
            await Remote.refreshAll();
          } catch (err) { toast(err.message, 'err'); return; }
        } else {
          Store.data.messages = Store.data.messages.filter(m => m.channelId !== existing.id);
          Store.data.channels = Store.data.channels.filter(c => c.id !== existing.id);
          Store.save();
        }
        Store.ui.activeChannel = Store.data.channels[0]?.id || null;
        closeModal();
        App.refresh();
        toast(`ลบห้อง #${existing.name} เรียบร้อย`);
      });
    };
  }

  $('#chanForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim().replace(/^#+/, '');
    const emoji = fd.get('emoji').trim() || '💬';
    const topic = fd.get('topic').trim();
    const projectId = fd.get('projectId') || null;
    const pinned = fd.has('pinned');
    const members = $$('#chanMemberPicker .chip.on').map(el => el.dataset.mid);
    if (!name) return;

    if (existing) {
      if (Remote.on) {
        try {
          await Remote.req(`/channels/${existing.id}`, { method: 'PATCH', body: { name, emoji, topic, projectId, pinned, members } });
          await Remote.refreshAll();
        } catch (err) { toast(err.message, 'err'); return; }
      } else {
        Object.assign(existing, { name, emoji, topic, projectId, pinned, members });
        Store.save();
      }
      closeModal();
      App.refresh();
      toast(`บันทึกการตั้งค่า #${name} แล้ว`);
      return;
    }

    if (Remote.on) {
      try {
        const res = await Remote.req('/channels', { method: 'POST', body: { name, emoji, topic, type: 'group', projectId, pinned, members } });
        await Remote.refreshAll();
        Store.ui.activeChannel = res.id;
      } catch (err) { toast(err.message, 'err'); return; }
    } else {
      const id = uid('ch');
      const me = meMember();
      Store.data.channels.push({ id, slug: name.toLowerCase().replace(/\s+/g, '-'), name, emoji, topic, type: 'group', projectId, pinned, members });
      Store.data.messages.push({
        id: uid('m'), channelId: id, senderId: me.id, senderName: me.name, kind: 'system',
        body: `สร้างกลุ่ม #${name} แล้ว — เชิญทุกคนแชร์งานและไฟล์ผ่าน Google Drive ที่นี่`,
        pinned: false, reactions: {}, at: `${todayS()} ${nowHM()}`,
      });
      Store.ui.activeChannel = id;
      Store.save();
    }
    closeModal();
    App.refresh();
    toast(`สร้างกลุ่ม #${name} เรียบร้อย`);
  };
}

/* ============================================================
   5. HR, DAILY CHECK-IN / STREAK & LEAVE MANAGEMENT (#/hr)
   ============================================================ */
const LEAVE_META = {
  annual:   { label: 'ลาพักร้อน', badge: 'b-blue',   quota: 10 },
  sick:     { label: 'ลาป่วย',    badge: 'b-red',    quota: 30 },
  personal: { label: 'ลากิจ',     badge: 'b-purple', quota: 6 },
  wfh:      { label: 'ขอ WFH',    badge: 'b-green',  quota: 52 },
};

function renderHR() {
  ensureAgencyData();
  const view = $('#view'), side = $('#side');
  const td = todayS();
  const me = meMember();
  const checkins = Store.data.checkins;
  const leaves = Store.data.leaves;
  const flt = Store.ui.hrFilter || 'all';

  const todayCheckins = checkins.filter(c => c.date === td);
  const myToday = todayCheckins.find(c => c.memberId === me.id);
  const myStreak = Math.max(1, checkins.filter(c => c.memberId === me.id).length);

  const myApproved = leaves.filter(l => l.memberId === me.id && l.status === 'approved');
  const usedByKind = k => myApproved.filter(l => l.kind === k).reduce((s, l) => s + (+l.days || 1), 0);

  side.innerHTML = `
    <div class="side-block">
      <div class="checkin-widget">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <b style="font-size:13px;color:var(--ink)">⏱ ลงเวลา (${esc(me.nickname || me.name)})</b>
          <span class="streak-badge">🔥 ${myStreak} วันติด</span>
        </div>
        ${myToday ? `
          <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:10px">
            เข้างานเวลา <b>${esc(myToday.clockIn)}</b> (${myToday.mode === 'wfh' ? '🏠 WFH' : '🏢 ออฟฟิศ'})
            ${myToday.clockOut ? ` · ออก <b>${esc(myToday.clockOut)}</b>` : ''}
          </div>
          ${!myToday.clockOut ? `
            <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" onclick="doClockOut()">👋 ลงเวลาเลิกงานวันนี้</button>
          ` : `<span class="badge b-green">บันทึกเวลาครบแล้ววันนี้ ✅</span>`}
        ` : `
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">ยังไม่ได้เช็กอินวันนี้ เลือกรูปแบบเข้างาน:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button class="btn btn-primary btn-sm" style="justify-content:center" onclick="doClockIn('office')">🏢 ออฟฟิศ</button>
            <button class="btn btn-ghost btn-sm" style="justify-content:center" onclick="doClockIn('wfh')">🏠 WFH</button>
          </div>
        `}
      </div>
    </div>

    <div class="side-block"><h3>กรองรายการใบลา</h3>
      <div class="chips">
        ${[
          ['all', 'ทั้งหมด'],
          ['pending', 'รออนุมัติ'],
          ['approved', 'อนุมัติแล้ว'],
          ['wfh', 'เฉพาะ WFH'],
        ].map(([k, l]) => `<span class="chip ${flt === k ? 'on' : ''}" data-hrflt="${k}">${l}</span>`).join('')}
      </div>
    </div>

    <div class="side-block"><h3>โควตาวันลาของฉัน</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${['annual', 'sick', 'personal'].map(k => {
          const m = LEAVE_META[k];
          const used = usedByKind(k);
          const pct = Math.min(100, Math.round((used / m.quota) * 100));
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span>${m.label}</span><b>ใช้ไป ${used}/${m.quota} วัน</b>
            </div>
            <div class="progress"><div style="width:${pct}%;background:var(--purple)"></div></div>
          </div>`;
        }).join('')}
      </div>
    </div>` +
    promoCard('วันลา & WFH โปร่งใส', 'ยื่นขอลาพักร้อน ลากิจ หรือขอทำงาน WFH ล่วงหน้าเพื่อให้ทีมจัดตารางงานได้ราบรื่น', '+ ยื่นใบลา / WFH', 'new-leave');

  $$('[data-hrflt]', side).forEach(el => el.onclick = () => { Store.ui.hrFilter = el.dataset.hrflt; App.refresh(); });

  const officeCnt = todayCheckins.filter(c => c.mode === 'office').length;
  const wfhCnt = todayCheckins.filter(c => c.mode === 'wfh').length;
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;

  const shownLeaves = leaves.filter(l => {
    if (flt === 'pending' && l.status !== 'pending') return false;
    if (flt === 'approved' && l.status !== 'approved') return false;
    if (flt === 'wfh' && l.kind !== 'wfh') return false;
    return true;
  });

  view.innerHTML = `
    <div class="sec-head">
      <div>
        <h2>เช็กอินเข้างาน & บริหารใบลา (HR & Attendance)</h2>
        <div class="sub">${fmtD(td, { full: true })} · ติดตามการเข้างานรายวัน WFH และอนุมัติคำขอลาของทีม</div>
      </div>
      <div class="sec-actions">
        ${!myToday ? `<button class="btn btn-ghost" onclick="doClockIn('office')">🏢 เช็กอินเข้างาน</button>` : ''}
        <button class="btn btn-primary" onclick="openLeaveForm()">${IC.plus} ยื่นใบลา / ขอ WFH</button>
      </div>
    </div>

    <div class="kpi-grid">
      ${pdKpi({ icon: IC.users, grad: 'var(--grad-mint)', num: `${todayCheckins.length}/${Store.data.team.length}`, label: 'เช็กอินเข้างานวันนี้', pill: `ออฟฟิศ ${officeCnt}`, pillCls: 'k-up' })}
      ${pdKpi({ icon: IC.dash, grad: 'var(--grad-cyan)', num: wfhCnt, label: 'ปฏิบัติงาน WFH วันนี้', pill: 'Hybrid', pillCls: 'k-violet' })}
      ${pdKpi({ icon: IC.clock, grad: 'var(--grad-amber)', num: pendingLeaves, label: 'ใบลารออนุมัติ', pill: pendingLeaves ? 'รออนุมัติ' : 'ครบแล้ว', pillCls: pendingLeaves ? 'k-down' : 'k-up' })}
      ${pdKpi({ icon: IC.flame, grad: 'var(--grad-violet)', num: `${myStreak} วัน`, label: 'สถิติเช็กอินต่อเนื่อง', pill: 'ต่อเนื่อง', pillCls: 'k-violet' })}
    </div>

    <div class="card" style="margin-bottom:18px;padding:18px">
      <div class="card-head" style="padding:0 0 12px">
        <div class="card-title">${IC.users} กระดานเข้างานวันนี้ (${fmtD(td)})</div>
      </div>
      <div class="checkin-grid" style="margin-bottom:0">
        ${Store.data.team.map(u => {
          const ck = todayCheckins.find(c => c.memberId === u.id);
          return `<div class="checkin-card">
            ${avatar(u, 'av-lg')}
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;font-size:13px;color:var(--ink)">${esc(u.name)}${u.nickname ? ` (${esc(u.nickname)})` : ''}</div>
              ${ck ? `
                <div style="font-size:11.5px;color:var(--ink-2);margin-top:3px">
                  <span class="badge ${ck.mode === 'wfh' ? 'b-blue' : 'b-green'}">${ck.mode === 'wfh' ? '🏠 WFH' : '🏢 ออฟฟิศ'}</span>
                  เข้า ${esc(ck.clockIn)}${ck.clockOut ? ` · ออก ${esc(ck.clockOut)}` : ''}
                </div>
              ` : `<div style="font-size:11.5px;color:var(--muted);margin-top:3px">ยังไม่เช็กอินวันนี้</div>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">${IC.doc} ทะเบียนคำขอลา & ขอปฏิบัติงาน WFH</div>
      </div>
      <div class="tbl-wrap" style="border:0;box-shadow:none">
        <table class="tbl">
          <thead><tr><th>พนักงาน</th><th>ประเภท</th><th>ช่วงวันที่</th><th>จำนวน</th><th>เหตุผล</th><th>สถานะ</th><th>การจัดการ</th></tr></thead>
          <tbody>
            ${shownLeaves.length ? shownLeaves.map(l => {
              const u = Store.userOf(l.memberId);
              const lm = LEAVE_META[l.kind] || LEAVE_META.annual;
              const stBadge = l.status === 'approved'
                ? '<span class="badge b-green">อนุมัติแล้ว</span>'
                : l.status === 'rejected'
                  ? '<span class="badge b-red">ไม่อนุมัติ</span>'
                  : '<span class="badge b-yellow">รออนุมัติ</span>';
              return `<tr>
                <td><div style="display:flex;align-items:center;gap:8px">${avatar(u)}<b>${esc(u.name)}</b></div></td>
                <td><span class="badge ${lm.badge}">${lm.label}</span></td>
                <td>${fmtD(l.startDate)}${l.endDate && l.endDate !== l.startDate ? ` – ${fmtD(l.endDate)}` : ''}</td>
                <td><b>${l.days}</b> วัน</td>
                <td style="max-width:260px;color:var(--ink-2)">${esc(l.reason || '—')}</td>
                <td>${stBadge}${l.approvedBy ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px">โดย ${esc(l.approvedBy)}</div>` : ''}</td>
                <td>
                  ${l.status === 'pending' && (!Remote.on || (typeof canLead === 'function' && canLead())) ? `
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-primary btn-sm" onclick="decideLeave('${l.id}','approved')">อนุมัติ</button>
                      <button class="btn btn-ghost btn-sm" onclick="decideLeave('${l.id}','rejected')">ปฏิเสธ</button>
                    </div>
                  ` : `<span style="font-size:12px;color:var(--muted)">${l.status === 'pending' ? 'รอหัวหน้าอนุมัติ' : 'ดำเนินการแล้ว'}</span>`}
                </td>
              </tr>`;
            }).join('') : '<tr><td colspan="7" class="empty-state">ไม่มีรายการคำขอลาในหมวดนี้</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function doClockIn(mode = 'office') {
  ensureAgencyData();
  const me = meMember();
  const td = todayS();
  const t = nowHM();

  if (Remote.on) {
    try {
      await Remote.req('/checkins/clock', { method: 'POST', body: { memberId: me.id, mode, note: mode === 'wfh' ? 'ปฏิบัติงาน WFH' : 'เข้าออฟฟิศ' } });
      await Remote.refreshAll();
    } catch (e) { toast(e.message, 'err'); return; }
  } else {
    const ex = Store.data.checkins.find(c => c.memberId === me.id && c.date === td);
    if (ex) { ex.mode = mode; ex.clockIn = ex.clockIn || t; }
    else Store.data.checkins.unshift({ id: uid('ck'), memberId: me.id, date: td, clockIn: t, clockOut: '', mode, note: '' });
    me.presence = 'working';
    Store.logActivity(`⏱ <b>${esc(me.name)}</b> เช็กอินเข้างาน (${mode === 'wfh' ? 'WFH' : 'ออฟฟิศ'}) เวลา ${t}`);
    Store.save();
  }
  App.renderTopbar();
  App.refresh();
  toast(`✅ เช็กอินเข้างาน (${mode === 'wfh' ? 'WFH' : 'ออฟฟิศ'}) เวลา ${t} เรียบร้อย!`);
}

async function doClockOut() {
  ensureAgencyData();
  const me = meMember();
  const td = todayS();
  const t = nowHM();

  if (Remote.on) {
    try {
      await Remote.req('/checkins/clock-out', { method: 'POST', body: { memberId: me.id } });
      await Remote.refreshAll();
    } catch (e) { toast(e.message, 'err'); return; }
  } else {
    const ex = Store.data.checkins.find(c => c.memberId === me.id && c.date === td);
    if (ex) ex.clockOut = t;
    me.presence = 'away';
    Store.save();
  }
  App.renderTopbar();
  App.refresh();
  toast(`👋 บันทึกเวลาเลิกงาน ${t} เรียบร้อย พักผ่อนให้เต็มที่ครับ!`);
}

function openLeaveForm() {
  const me = meMember();
  const td = todayS();
  openModal(`
    ${modalHead('🌿 ยื่นใบลา / ขอปฏิบัติงาน WFH', 'ส่งคำขอเพื่อให้หัวหน้าทีมอนุมัติในระบบ')}
    <form id="leaveForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group">
            <label>ผู้ยื่นคำขอ</label>
            <select name="memberId">
              ${Store.data.team.map(u => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="f-group">
            <label>ประเภทการลา *</label>
            <select name="kind">
              ${Object.entries(LEAVE_META).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}
            </select>
          </div>
          <div class="f-group"><label>ตั้งแต่วันที่ *</label><input type="date" name="startDate" value="${td}" required/></div>
          <div class="f-group"><label>ถึงวันที่ *</label><input type="date" name="endDate" value="${td}" required/></div>
          <div class="f-group full"><label>จำนวนวัน *</label><input type="number" name="days" value="1" min="0.5" step="0.5" required/></div>
          <div class="f-group full"><label>เหตุผลประกอบ</label><textarea name="reason" placeholder="ระบุรายละเอียดงานที่ฝากทีมดูแลต่อ หรือเหตุผลการลา…"></textarea></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ส่งคำขออนุมัติ</button>
      </div>
    </form>
  `);

  $('#leaveForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      memberId: fd.get('memberId'),
      kind: fd.get('kind'),
      startDate: fd.get('startDate'),
      endDate: fd.get('endDate'),
      days: +fd.get('days') || 1,
      reason: fd.get('reason').trim(),
    };
    if (Remote.on) {
      try {
        await Remote.req('/leaves', { method: 'POST', body: payload });
        await Remote.refreshAll();
      } catch (err) { toast(err.message, 'err'); return; }
    } else {
      Store.data.leaves.unshift({ id: uid('lv'), ...payload, status: 'pending', approvedBy: '' });
      Store.logActivity(`🌿 ยื่นคำขอ <b>${LEAVE_META[payload.kind]?.label || 'ลา'}</b> (${payload.days} วัน)`);
      Store.save();
    }
    closeModal();
    App.refresh();
    toast('ส่งคำขอใบลาเรียบร้อยแล้ว');
  };
}

async function decideLeave(leaveId, status) {
  const l = Store.data.leaves.find(x => x.id === leaveId);
  if (!l) return;
  if (Remote.on) {
    try {
      await Remote.req(`/leaves/${leaveId}`, { method: 'PATCH', body: { status } });
      await Remote.refreshAll();
    } catch (e) {
      toast(e.message, 'err');
      return;
    }
  } else {
    const me = meMember();
    l.status = status;
    l.approvedBy = me.name;
    Store.save();
    App.refresh();
  }
  toast(status === 'approved' ? '✅ อนุมัติคำขอเรียบร้อย' : 'ปฏิเสธคำขอแล้ว');
}

/* ============================================================
   6. ROOMS, STUDIO & EQUIPMENT BOOKING (#/rooms)
   ============================================================ */
const ROOM_KINDS = {
  all:    'ทั้งหมด',
  room:   'ห้องประชุม',
  studio: 'สตูดิโอถ่ายทำ',
  gear:   'อุปกรณ์ออกกอง',
};

function renderRooms() {
  ensureAgencyData();
  const view = $('#view'), side = $('#side');
  const rooms = Store.data.rooms;
  const bookings = Store.data.bookings;
  const selDate = Store.ui.roomDate || todayS();
  const kindFlt = Store.ui.roomKind || 'all';

  const dayBookings = bookings
    .filter(b => b.date === selDate)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  side.innerHTML = `
    <div class="side-block"><h3>เลือกวันที่ตรวจสอบคิว</h3>
      <div style="display:flex;gap:6px">
        <input type="date" id="roomDateInp" value="${selDate}" style="flex:1;padding:8px 10px;border-radius:11px;border:1px solid var(--line);font-family:inherit"/>
        <button class="btn btn-ghost btn-sm" onclick="Store.ui.roomDate=todayS();App.refresh()">วันนี้</button>
      </div>
    </div>

    <div class="side-block"><h3>หมวดหมู่ทรัพยากร</h3>
      <div class="chips">
        ${Object.entries(ROOM_KINDS).map(([k, l]) => `<span class="chip ${kindFlt === k ? 'on' : ''}" data-rmkind="${k}">${l}</span>`).join('')}
      </div>
    </div>

    <div class="side-block"><h3>คิวจองวันที่เลือก (${dayBookings.length})</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${dayBookings.length ? dayBookings.map(b => {
          const rm = rooms.find(r => r.id === b.roomId) || { name: 'ห้องประชุม', color: '#6C5CE7' };
          return `<div style="padding:9px 11px;border-radius:12px;background:#f7f8fc;border-left:3px solid ${rm.color};font-size:12px">
            <div style="font-weight:700;color:var(--ink)">${esc(b.start)}–${esc(b.end)} · ${esc(b.title)}</div>
            <div style="color:var(--muted);margin-top:2px">${esc(rm.name)}</div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--muted)">ยังไม่มีคิวจองในวันนี้ ว่างทุกห้อง!</div>'}
      </div>
    </div>` +
    promoCard('ระบบป้องกันคิวชนอัตโนมัติ', 'จองห้องประชุม สตูดิโอถ่ายภาพ หรือชุดกล้องออกกองได้โดยไม่ซ้อนทับเวลาทีมอื่น', '+ จองคิวใหม่', 'new-booking');

  $('#roomDateInp', side).onchange = (e) => { Store.ui.roomDate = e.target.value || todayS(); App.refresh(); };
  $$('[data-rmkind]', side).forEach(el => el.onclick = () => { Store.ui.roomKind = el.dataset.rmkind; App.refresh(); });

  const shownRooms = rooms.filter(r => kindFlt === 'all' || r.kind === kindFlt);
  const HOURS = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

  view.innerHTML = `
    <div class="sec-head">
      <div>
        <h2>จองห้องประชุม สตูดิโอ & อุปกรณ์ออกกอง</h2>
        <div class="sub">ตารางคิว${fmtD(selDate, { full: true })} · ตรวจสอบช่วงเวลาว่าง 09:00–19:00 แบบเรียลไทม์</div>
      </div>
      <div class="sec-actions">
        <button class="btn btn-ghost" onclick="openRoomForm()">+ เพิ่มห้อง / อุปกรณ์</button>
        <button class="btn btn-primary" onclick="openBookingForm('', '${selDate}')">${IC.plus} จองห้อง / อุปกรณ์</button>
      </div>
    </div>

    <div class="room-grid">
      ${shownRooms.map(rm => {
        const rBks = dayBookings.filter(b => b.roomId === rm.id);
        return `
          <div class="room-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div>
                <span class="badge" style="background:${rm.color}18;color:${rm.color};margin-bottom:5px">
                  ${rm.kind === 'studio' ? '🎬 สตูดิโอ' : rm.kind === 'gear' ? '📷 อุปกรณ์' : '🚪 ห้องประชุม'}
                </span>
                <div style="font-weight:700;font-size:14.5px;color:var(--ink)">${esc(rm.name)}</div>
                <div style="font-size:11.5px;color:var(--muted)">${esc(rm.zone)} · รองรับ ${rm.capacity} คน</div>
              </div>
              <div style="display:flex;gap:5px">
                <button class="btn btn-ghost btn-sm" style="padding:5px 8px" title="แก้ไขห้อง/อุปกรณ์" onclick="openRoomForm('${rm.id}')">✏️</button>
                <button class="btn btn-ghost btn-sm" onclick="openBookingForm('${rm.id}', '${selDate}')">+ จอง</button>
              </div>
            </div>

            <div class="skill-row">
              ${(rm.equip || []).map(eq => `<span class="skill-chip">${esc(eq)}</span>`).join('')}
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px">
                <span>ตารางว่าง 09:00 – 19:00</span>
                <span>${rBks.length ? `จองแล้ว ${rBks.length} ช่วง` : 'ว่างทั้งวัน'}</span>
              </div>
              <div class="slot-strip">
                ${HOURS.map(h => {
                  const slotStart = `${h}:00`, slotEnd = `${String(+h + 1).padStart(2, '0')}:00`;
                  const busy = rBks.some(b => b.start < slotEnd && b.end > slotStart);
                  return `<div class="slot-cell ${busy ? 'busy' : ''}" title="${h}:00-${+h + 1}:00 ${busy ? '(ไม่ว่าง)' : '(ว่าง)'}">${h}</div>`;
                }).join('')}
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">${IC.cal} รายการจองวันที่ ${fmtD(selDate)}</div>
      </div>
      <div class="tbl-wrap" style="border:0;box-shadow:none">
        <table class="tbl">
          <thead><tr><th>เวลา</th><th>ห้อง / อุปกรณ์</th><th>หัวข้อการใช้งาน</th><th>ผู้จอง</th><th>ผู้เข้าร่วม</th><th>การจัดการ</th></tr></thead>
          <tbody>
            ${dayBookings.length ? dayBookings.map(b => {
              const rm = rooms.find(r => r.id === b.roomId) || { name: '—', color: '#6C5CE7' };
              const host = Store.userOf(b.hostId);
              return `<tr>
                <td><b>${esc(b.start)} – ${esc(b.end)}</b></td>
                <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${rm.color};margin-right:6px"></span><b>${esc(rm.name)}</b></td>
                <td><b>${esc(b.title)}</b>${b.note ? `<div style="font-size:11.5px;color:var(--muted)">${esc(b.note)}</div>` : ''}</td>
                <td><div style="display:flex;align-items:center;gap:6px">${avatar(host)}<span>${esc(host.name)}</span></div></td>
                <td>${avatarStack((b.members || []).map(id => Store.userOf(id)), 4)}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="cancelRoomBooking('${b.id}')">ยกเลิกคิว</button></td>
              </tr>`;
            }).join('') : '<tr><td colspan="6" class="empty-state">ไม่มีรายการจองในวันที่เลือก</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openBookingForm(preRoomId = '', preDate = '') {
  ensureAgencyData();
  const rooms = Store.data.rooms;
  const selRoom = preRoomId || rooms[0]?.id || 'rm1';
  const selDate = preDate || Store.ui.roomDate || todayS();
  const me = meMember();

  openModal(`
    ${modalHead('🚪 จองห้องประชุม สตูดิโอ หรืออุปกรณ์', 'ระบบตรวจสอบและป้องกันการจองเวลาซ้อนทับให้อัตโนมัติ')}
    <form id="bkForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group full">
            <label>เลือกห้อง / สตูดิโอ / อุปกรณ์ *</label>
            <select name="roomId">
              ${rooms.map(r => `<option value="${r.id}" ${r.id === selRoom ? 'selected' : ''}>${esc(r.name)} (${esc(r.zone)})</option>`).join('')}
            </select>
          </div>
          <div class="f-group full"><label>หัวข้อการใช้งาน / โปรเจกต์ *</label><input name="title" required placeholder="เช่น ประชุม Sprint Review, ถ่ายสินค้าเซ็ตใหม่"/></div>
          <div class="f-group"><label>วันที่ *</label><input type="date" name="date" value="${selDate}" required/></div>
          <div class="f-group"><label>หมายเหตุอุปกรณ์เสริม</label><input name="note" placeholder="เช่น ขอสาย HDMI เพิ่ม"/></div>
          <div class="f-group"><label>เวลาเริ่ม *</label><input type="time" name="start" value="10:00" required/></div>
          <div class="f-group"><label>เวลาสิ้นสุด *</label><input type="time" name="end" value="11:30" required/></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ยืนยันการจองคิว</button>
      </div>
    </form>
  `);

  $('#bkForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const roomId = fd.get('roomId');
    const title = fd.get('title').trim();
    const date = fd.get('date');
    const start = fd.get('start');
    const end = fd.get('end');
    const note = fd.get('note').trim();

    if (end <= start) {
      toast('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น', 'warn');
      return;
    }

    const clash = Store.data.bookings.find(b => b.roomId === roomId && b.date === date && b.start < end && b.end > start);
    if (clash) {
      toast(`คิวชนกับ "${clash.title}" (${clash.start}–${clash.end}) กรุณาเลือกเวลาอื่น`, 'err');
      return;
    }

    if (Remote.on) {
      try {
        await Remote.req('/bookings', {
          method: 'POST',
          body: { roomId, title, date, start, end, hostId: me.id, members: [me.id], note },
        });
        await Remote.refreshAll();
      } catch (err) { toast(err.message, 'err'); return; }
    } else {
      Store.data.bookings.push({ id: uid('bk'), roomId, title, date, start, end, hostId: me.id, members: [me.id], note });
      const rm = Store.data.rooms.find(r => r.id === roomId);
      Store.logActivity(`🚪 จอง <b>${esc(rm?.name || 'ห้อง')}</b> (${start}–${end}) — ${esc(title)}`);
      Store.save();
    }

    Store.ui.roomDate = date;
    closeModal();
    App.refresh();
    toast('✅ จองคิวสำเร็จเรียบร้อย!');
  };
}

function cancelRoomBooking(bkId) {
  confirmDlg('ยกเลิกคิวจองนี้?', 'ช่วงเวลาดังกล่าวจะถูกเปิดว่างให้สมาชิกคนอื่นจองต่อได้ทันที', async () => {
    if (Remote.on) {
      try {
        await Remote.req(`/bookings/${bkId}`, { method: 'DELETE' });
        await Remote.refreshAll();
      } catch (e) { toast(e.message, 'err'); return; }
    } else {
      Store.data.bookings = Store.data.bookings.filter(b => b.id !== bkId);
      Store.save();
    }
    App.refresh();
    toast('ยกเลิกคิวจองเรียบร้อยแล้ว');
  }, 'ยกเลิกคิวจอง');
}

function openRoomForm(roomId = '') {
  ensureAgencyData();
  const rm = roomId ? Store.data.rooms.find(r => r.id === roomId) : null;
  const COLORS = ['#6C5CE7', '#FF6B9D', '#3BA7FF', '#22C793', '#FFB020', '#4B5ED9'];
  openModal(`
    ${modalHead(rm ? '✏️ แก้ไขห้อง / สตูดิโอ / อุปกรณ์' : '🚪 เพิ่มห้องประชุม / สตูดิโอ / อุปกรณ์ใหม่', 'บันทึกเข้าฐานข้อมูลจริง erp_rooms สำหรับให้ทีมจองคิวร่วมกัน')}
    <form id="roomResForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group full"><label>ชื่อห้อง / สตูดิโอ / อุปกรณ์ *</label><input name="name" required value="${esc(rm?.name || '')}" placeholder="เช่น ห้องประชุม Creative ชั้น 3 หรือ ชุดไฟ Aputure"/></div>
          <div class="f-group"><label>ประเภท</label>
            <select name="kind">
              <option value="room" ${rm?.kind === 'room' ? 'selected' : ''}>🚪 ห้องประชุม</option>
              <option value="studio" ${rm?.kind === 'studio' ? 'selected' : ''}>🎬 สตูดิโอ</option>
              <option value="gear" ${rm?.kind === 'gear' ? 'selected' : ''}>📷 อุปกรณ์ออกกอง</option>
            </select>
          </div>
          <div class="f-group"><label>โซน / สถานที่</label><input name="zone" value="${esc(rm?.zone || 'ชั้น 3')}" placeholder="เช่น ชั้น 3 · โซนหน้า"/></div>
          <div class="f-group"><label>ความจุ (คน/ชุด)</label><input type="number" name="capacity" min="1" max="200" value="${rm?.capacity || 8}"/></div>
          <div class="f-group"><label>สีประจำรายการ</label>
            <select name="color">
              ${COLORS.map(c => `<option value="${c}" ${rm?.color === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="f-group full"><label>อุปกรณ์ประจำห้อง (คั่นด้วยจุลภาค ,)</label><input name="equip" value="${esc((rm?.equip || []).join(', '))}" placeholder="เช่น จอ 4K, ไมค์ไร้สาย, Whiteboard"/></div>
        </div>
      </div>
      <div class="modal-foot">
        ${rm ? `<button type="button" class="btn btn-danger" style="margin-right:auto" id="delRoomBtn">🗑 ลบรายการ</button>` : ''}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
  const delBtn = $('#delRoomBtn');
  if (delBtn && rm) {
    delBtn.onclick = () => {
      confirmDlg(`ลบ "${rm.name}"?`, 'รายการห้อง/อุปกรณ์และคิวจองที่ผูกอยู่จะถูกลบออกจากฐานข้อมูล', async () => {
        if (Remote.on) {
          try {
            await Remote.req(`/rooms/${rm.id}`, { method: 'DELETE' });
            await Remote.refreshAll();
          } catch (err) { toast(err.message, 'err'); return; }
        } else {
          Store.data.bookings = Store.data.bookings.filter(b => b.roomId !== rm.id);
          Store.data.rooms = Store.data.rooms.filter(r => r.id !== rm.id);
          Store.save();
        }
        closeModal();
        App.refresh();
        toast('ลบห้อง/อุปกรณ์เรียบร้อย');
      });
    };
  }
  $('#roomResForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('name').trim(),
      kind: fd.get('kind'),
      zone: fd.get('zone').trim() || 'ชั้น 3',
      capacity: +fd.get('capacity') || 6,
      color: fd.get('color') || '#6C5CE7',
      equip: fd.get('equip').split(',').map(s => s.trim()).filter(Boolean),
    };
    if (!body.name) return;
    if (Remote.on) {
      try {
        if (rm) await Remote.req(`/rooms/${rm.id}`, { method: 'PATCH', body });
        else await Remote.req('/rooms', { method: 'POST', body });
        await Remote.refreshAll();
      } catch (err) { toast(err.message, 'err'); return; }
    } else {
      if (rm) Object.assign(rm, body);
      else Store.data.rooms.push({ id: uid('rm'), ...body });
      Store.save();
    }
    closeModal();
    App.refresh();
    toast(rm ? 'อัปเดตข้อมูลห้อง/อุปกรณ์แล้ว ✓' : 'เพิ่มห้อง/อุปกรณ์ใหม่แล้ว ✓');
  };
}
