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
  if (!Array.isArray(d.rooms) || !d.rooms.length) d.rooms = JSON.parse(JSON.stringify(SEED.rooms || []));
  if (!Array.isArray(d.bookings)) d.bookings = JSON.parse(JSON.stringify(SEED.bookings || []));
  if (!Array.isArray(d.checkins)) d.checkins = JSON.parse(JSON.stringify(SEED.checkins || []));
  if (!Array.isArray(d.leaves))   d.leaves   = JSON.parse(JSON.stringify(SEED.leaves || []));
  if (!Store.ui.activeChannel) Store.ui.activeChannel = d.channels[0]?.id || 'ch1';
  if (!Store.ui.roomDate)      Store.ui.roomDate = todayS();
  if (!Store.ui.roomKind)      Store.ui.roomKind = 'all';
  if (!Store.ui.aiFilter)      Store.ui.aiFilter = 'all';
  if (!Store.ui.hrFilter)      Store.ui.hrFilter = 'all';
  if (!Store.ui.teamTab)       Store.ui.teamTab  = 'all';
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
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#8E7CF3,#6C5CE7);color:#fff">${IC.bot}</div>
        <div><div class="k-num">${activeCnt}/${agents.length}</div><div class="k-lbl">AI พร้อมทำงาน</div></div><span class="k-trend k-up">ออนไลน์</span></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#3BA7FF,#2F6BF0);color:#fff">${IC.bolt}</div>
        <div><div class="k-num">${totalRuns}</div><div class="k-lbl">ภารกิจสำเร็จสะสม</div></div><span class="k-trend k-up">+${runs.length} ล่าสุด</span></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#36D6A8,#14B890);color:#fff">${IC.check}</div>
        <div><div class="k-num">${avgSucc}%</div><div class="k-lbl">ความแม่นยำเฉลี่ย</div></div></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#FFD66B,#FFB020);color:#fff">${IC.flame}</div>
        <div><div class="k-num">${(totalTok / 1000).toFixed(1)}k</div><div class="k-lbl">Tokens วันนี้</div></div></div>
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
   4. TEAM CHAT (#/chat) — Channels, Pins, Reactions & @AI Reply
   ============================================================ */
function renderChat() {
  ensureAgencyData();
  const view = $('#view'), side = $('#side');
  const chans = Store.data.channels;
  const msgs = Store.data.messages;
  const q = (Store.ui.q.chat || '').toLowerCase();
  const activeId = Store.ui.activeChannel || chans[0]?.id;
  const curChan = chans.find(c => c.id === activeId) || chans[0];
  const pinnedOnly = !!Store.ui.chatPinnedOnly;

  const chanMsgs = msgs.filter(m => m.channelId === curChan?.id);
  const pinnedMsgs = chanMsgs.filter(m => m.pinned);

  side.innerHTML =
    sideSearch('ค้นหาข้อความในห้องนี้…', 'chat') +
    `<div class="side-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">ห้องสนทนา (${chans.length})</h3>
        <button class="btn btn-ghost btn-sm" style="padding:3px 9px" onclick="openChannelForm()">+ ห้องใหม่</button>
      </div>
      <div class="chan-list">
        ${chans.map(c => {
          const cnt = msgs.filter(m => m.channelId === c.id).length;
          return `<div class="chan-item ${c.id === curChan?.id ? 'active' : ''}" data-chan="${c.id}">
            <span>${c.emoji || '💬'}</span>
            <span>#${esc(c.name)}</span>
            <span class="ch-cnt">${cnt}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="side-block"><h3>ข้อความปักหมุด (${pinnedMsgs.length})</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${pinnedMsgs.length ? pinnedMsgs.slice(0, 3).map(pm => `
          <div style="padding:9px 11px;border-radius:12px;background:#fffaf0;border:1px solid #ffe4ad;font-size:12px;line-height:1.4">
            <b style="color:var(--ink)">📌 ${esc(pm.senderName)}</b>
            <div style="color:var(--ink-2);margin-top:3px">${pm.kind === 'ai' ? pm.body : esc(pm.body)}</div>
          </div>
        `).join('') : '<div style="font-size:12px;color:var(--muted)">ยังไม่มีข้อความปักหมุดในห้องนี้</div>'}
      </div>
    </div>`;

  wireSideCommon(view);
  $$('[data-chan]', side).forEach(el => el.onclick = () => {
    Store.ui.activeChannel = el.dataset.chan;
    Store.ui.chatPinnedOnly = false;
    App.refresh();
  });

  const shownMsgs = chanMsgs.filter(m => {
    if (pinnedOnly && !m.pinned) return false;
    if (q && !`${m.senderName} ${m.body}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const me = meMember();
  const EMOJIS = ['👍', '🔥', '🎉', '✅', '❤️'];

  view.innerHTML = `
    <div class="chat-shell">
      <div class="chat-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:19px">${curChan?.emoji || '💬'}</span>
            <b style="font-size:16px;color:var(--ink)">#${esc(curChan?.name || 'general')}</b>
            <span class="badge b-grey">${chanMsgs.length} ข้อความ</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(curChan?.topic || '')}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn ${pinnedOnly ? 'btn-primary' : 'btn-ghost'} btn-sm"
            onclick="Store.ui.chatPinnedOnly=!Store.ui.chatPinnedOnly;App.refresh()">
            📌 ปักหมุด (${pinnedMsgs.length})
          </button>
          <button class="btn btn-ghost btn-sm" onclick="askAiInChannel('${curChan?.id}')">🤖 ให้ AI สรุปห้องนี้</button>
        </div>
      </div>

      <div class="chat-stream" id="chatStream">
        ${shownMsgs.length ? shownMsgs.map(m => {
          const isAi = m.kind === 'ai' || String(m.senderId).startsWith('ai');
          const ag = isAi ? aiAgentOf(m.senderId) : null;
          const u = !isAi ? Store.userOf(m.senderId) : null;
          const reacts = m.reactions || {};
          return `
            <div class="msg-card ${isAi ? 'is-ai' : ''} ${m.pinned ? 'is-pinned' : ''}">
              ${isAi
                ? `<div class="ai-orb" style="width:36px;height:36px;border-radius:12px;font-size:11px;background:${ag?.color || '#6C5CE7'}">${esc((ag?.code || 'AI').slice(0, 4))}</div>`
                : avatar(u, 'av-lg')}
              <div class="msg-body">
                <div class="msg-meta">
                  <b>${esc(m.senderName || u?.name || 'สมาชิก')}</b>
                  ${isAi ? '<span class="ai-copilot-tag">✨ AI Workforce</span>' : ''}
                  ${m.pinned ? '<span class="badge b-yellow" style="font-size:10px">📌 ปักหมุด</span>' : ''}
                  <span class="msg-time">${esc(m.at || '')}</span>
                </div>
                <div class="msg-text">${isAi ? m.body : esc(m.body)}</div>
                <div class="msg-actions">
                  ${EMOJIS.map(em => {
                    const arr = reacts[em] || [];
                    const mine = arr.includes(me.id);
                    return `<button type="button" class="react-btn ${mine ? 'mine' : ''}" onclick="toggleChatReaction('${m.id}','${em}')">${em}${arr.length ? ` <b>${arr.length}</b>` : ''}</button>`;
                  }).join('')}
                  <button type="button" class="react-btn" style="margin-left:auto" onclick="toggleChatPin('${m.id}')">
                    ${m.pinned ? 'เลิกปักหมุด' : '📌 ปักหมุด'}
                  </button>
                </div>
              </div>
            </div>`;
        }).join('') : '<div class="empty-state"><p>ยังไม่มีข้อความในห้องนี้ — พิมพ์ข้อความแรกด้านล่างได้เลย!</p></div>'}
      </div>

      <form class="chat-composer" id="chatComposeForm">
        <input id="chatMsgInput" placeholder="ส่งข้อความใน #${esc(curChan?.name || 'general')}… (พิมพ์ @NOVA หรือ @BYTE เพื่อให้ AI ตอบกลับอัตโนมัติ)" autocomplete="off"/>
        <button type="submit" class="btn btn-primary">${IC.send} ส่งข้อความ</button>
      </form>
    </div>
  `;

  const stream = $('#chatStream', view);
  if (stream) stream.scrollTop = stream.scrollHeight;

  $('#chatComposeForm', view).onsubmit = async (e) => {
    e.preventDefault();
    const inp = $('#chatMsgInput', view);
    const body = inp.value.trim();
    if (!body || !curChan) return;
    inp.value = '';
    await postChatMessage(curChan.id, body);
  };
}

async function postChatMessage(channelId, body) {
  const me = meMember();
  const senderName = me.nickname ? `${me.name} (${me.nickname})` : me.name;
  const nowAt = `${todayS()} ${nowHM()}`;

  if (Remote.on) {
    try {
      await Remote.req(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: { senderId: me.id, senderName, kind: 'text', body },
      });
      await Remote.refreshAll();
    } catch (e) {
      toast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'err');
      return;
    }
  } else {
    Store.data.messages.push({
      id: uid('m'), channelId, senderId: me.id, senderName, kind: 'text',
      body, pinned: false, reactions: {}, at: nowAt,
    });
    Store.save();
  }

  const mention = Store.data.aiAgents.find(a => body.toUpperCase().includes('@' + a.code)) ||
                  (body.toLowerCase().includes('@ai') ? Store.data.aiAgents[0] : null);
  if (mention && !mention.paused) {
    const reply = `✨ <b>${esc(mention.code)}</b> รับทราบครับ! สำหรับ "${esc(body.slice(0, 60))}" → แนะนำจัดลำดับความสำคัญในบอร์ด Kanban และตั้งจุดเช็กอินก่อน 16:00 วันนี้`;
    if (Remote.on) {
      await Remote.req(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: { senderId: mention.id, senderName: `${mention.code} (AI)`, kind: 'ai', body: reply },
      }).catch(() => {});
      await Remote.refreshAll();
    } else {
      Store.data.messages.push({
        id: uid('m'), channelId, senderId: mention.id, senderName: `${mention.code} (AI)`, kind: 'ai',
        body: reply, pinned: false, reactions: { '⚡': [me.id] }, at: `${todayS()} ${nowHM()}`,
      });
      Store.save();
    }
  }

  App.refresh();
}

async function askAiInChannel(channelId) {
  ensureAgencyData();
  const chan = Store.data.channels.find(c => c.id === channelId);
  const chanMsgs = Store.data.messages.filter(m => m.channelId === channelId);
  const echo = aiAgentOf('ai4') || Store.data.aiAgents[0];
  if (!chan || !echo) return;

  const summary = `✨ <b>สรุปห้อง #${esc(chan.name)}</b> (${chanMsgs.length} ข้อความล่าสุด) — ประเด็นหลักดำเนินตามแผน ไม่มีคอขวดวิกฤต แนะนำอัปเดตสถานะงานคงค้างก่อนจบวัน`;
  if (Remote.on) {
    await Remote.req(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: { senderId: echo.id, senderName: `${echo.code} (AI)`, kind: 'ai', body: summary },
    }).catch(() => {});
    await Remote.refreshAll();
  } else {
    Store.data.messages.push({
      id: uid('m'), channelId, senderId: echo.id, senderName: `${echo.code} (AI)`, kind: 'ai',
      body: summary, pinned: false, reactions: { '👍': ['u1'] }, at: `${todayS()} ${nowHM()}`,
    });
    Store.save();
    App.refresh();
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
  App.refresh();
}

function toggleChatPin(msgId) {
  const m = Store.data.messages.find(x => x.id === msgId);
  if (!m) return;
  m.pinned = !m.pinned;
  Store.save();
  Remote.push(`/messages/${msgId}/pin`, 'POST', {});
  App.refresh();
  toast(m.pinned ? '📌 ปักหมุดข้อความแล้ว' : 'เลิกปักหมุดข้อความแล้ว');
}

function openChannelForm() {
  openModal(`
    ${modalHead('💬 สร้างห้องแชตใหม่ (New Channel)', 'แยกห้องคุยตามโปรเจกต์ แผนก หรือแคมเปญ')}
    <form id="chanForm">
      <div class="modal-body">
        <div class="form-grid">
          <div class="f-group"><label>ชื่อห้อง *</label><input name="name" required placeholder="เช่น campaign-q4 หรือ ทีมโปรดักชัน"/></div>
          <div class="f-group"><label>ไอคอน Emoji</label><input name="emoji" value="🚀" maxlength="4"/></div>
          <div class="f-group full"><label>หัวข้อประจำห้อง (Topic)</label><input name="topic" placeholder="จุดประสงค์ของห้องสนทนานี้…"/></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">สร้างห้องแชต</button>
      </div>
    </form>
  `);
  $('#chanForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim().replace(/^#+/, '');
    const emoji = fd.get('emoji').trim() || '💬';
    const topic = fd.get('topic').trim();
    if (!name) return;

    if (Remote.on) {
      try {
        const res = await Remote.req('/channels', { method: 'POST', body: { name, emoji, topic } });
        await Remote.refreshAll();
        Store.ui.activeChannel = res.id;
      } catch (err) { toast(err.message, 'err'); return; }
    } else {
      const id = uid('ch');
      Store.data.channels.push({ id, slug: name.toLowerCase().replace(/\s+/g, '-'), name, emoji, topic });
      Store.ui.activeChannel = id;
      Store.save();
    }
    closeModal();
    App.refresh();
    toast(`สร้างห้อง #${name} เรียบร้อย`);
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
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#36D6A8,#14B890);color:#fff">${IC.users}</div>
        <div><div class="k-num">${todayCheckins.length}/${Store.data.team.length}</div><div class="k-lbl">เช็กอินเข้างานวันนี้</div></div><span class="k-trend k-up">ออฟฟิศ ${officeCnt}</span></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#3BA7FF,#2F6BF0);color:#fff">${IC.dash}</div>
        <div><div class="k-num">${wfhCnt}</div><div class="k-lbl">ปฏิบัติงาน WFH วันนี้</div></div></div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#FFD66B,#FFB020);color:#fff">${IC.clock}</div>
        <div><div class="k-num">${pendingLeaves}</div><div class="k-lbl">ใบลารออนุมัติ</div></div>${pendingLeaves ? '<span class="k-trend k-down">รออนุมัติ</span>' : ''}</div>
      <div class="kpi"><div class="k-ico" style="background:linear-gradient(135deg,#8E7CF3,#6C5CE7);color:#fff">${IC.flame}</div>
        <div><div class="k-num">${myStreak} วัน</div><div class="k-lbl">สถิติเช็กอินต่อเนื่อง</div></div></div>
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
              <button class="btn btn-ghost btn-sm" onclick="openBookingForm('${rm.id}', '${selDate}')">+ จอง</button>
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
