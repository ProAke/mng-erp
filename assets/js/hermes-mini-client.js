/* ============================================================\
   MNG ERP — hermes-mini Client (AI Assistant panel + Insights)
   Integrates with server/hermes-mini/ API routes
   ============================================================ */
'use strict';

const HermesMiniClient = {
  on: false,          // backend available?
  mini: null,         // cached /status
  panelOpen: false,

  /* ---- API wrapper (reuses existing Remote token) ---- */
  async req(path, opts = {}) {
    const r = await fetch('/api/hermes-mini' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(Remote.token ? { Authorization: 'Bearer ' + Remote.token } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401) return { error: 'unauthorized' };
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.detail || ('HTTP ' + r.status));
    return d;
  },

  async status() {
    try {
      this.mini = await this.req('/status');
      this.on = true;
    } catch (e) {
      this.on = false;
      this.mini = null;
    }
  },

  /* ---- open the AI assistant chat panel ---- */
  openPanel() {
    this.panelOpen = true;
    const panel = $('#hmPanel');
    if (panel) { panel.style.display = 'flex'; this._renderPanel('open'); }
    else { this._createPanel(); }
  },

  closePanel() {
    this.panelOpen = false;
    $('#hmPanel')?.remove();
  },

  _createPanel() {
    const root = document.createElement('div');
    root.id = 'hmPanel';
    root.className = 'hm-panel';
    root.innerHTML = `
      <div class="hm-header">
        <div class="hm-title">
          <span class="hm-avatar">🤖</span>
          <div><b>hermes-mini</b><small>AI Assistant</small></div>
        </div>
        <button class="hm-close" id="hmClose">✕</button>
      </div>
      <div class="hm-body" id="hmBody">
        <div class="hm-welcome">
          <p>สวัสดีครับ! ฉ็อง hermes-mini — ผู้ช่วย AI สำหรับ MNG ERP</p>
          <p>ลองถามมาได้เลย เช่น "มีงานเท่าไรเกินกำหนดบ้าง?" หรือ "สรุปสถานะทีม"</p>
          <div class="hm-suggestions">
            <button class="hm-suggest" data-q="มีงานเท่าไรเกินกำหนดบ้าง?">งานเกินกำหนด</button>
            <button class="hm-suggest" data-q="ให้คำปรึกษางานวันนี้">ลำดับความสำคัญ</button>
            <button class="hm-suggest" data-q="สรุปสถานะทีม">สรุปทีม</button>
            <button class="hm-suggest" data-q="โปรเจกต์ไหนเสี่ยงมากที่สุด?">วิเคราะห์風險</button>
          </div>
        </div>
      </div>
      <div class="hm-input">
        <input type="text" id="hmInput" placeholder="ถามอะไรก็ได้เกี่ยวกับงาน / ทีม / โปรเจกต์…" autocomplete="off">
        <button class="hm-send" id="hmSend">ส่ง</button>
      </div>
    `;
    document.body.appendChild(root);

    /* auto-scroll to bottom */
    const body = $('#hmBody');
    const scrollToBottom = () => body.scrollTop = body.scrollHeight;

    /* suggestion clicks */
    $$('.hm-suggest').forEach(btn => {
      btn.addEventListener('click', () => {
        this._onChat(btn.dataset.q, scrollToBottom);
      });
    });

    /* send button */
    $('#hmSend').addEventListener('click', () => {
      const q = $('#hmInput').value.trim();
      if (q) this._onChat(q, scrollToBottom);
    });

    /* enter key */
    $('#hmInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = $('#hmInput').value.trim();
        if (q) this._onChat(q, scrollToBottom);
      }
    });

    /* close */
    $('#hmClose').addEventListener('click', () => this.closePanel());

    /* click outside to close */
    root.addEventListener('mousedown', e => {
      if (e.target === root) this.closePanel();
    });

    scrollToBottom();
  },

  _renderPanel(state) {
    // just ensure visibility
    const p = $('#hmPanel');
    if (p) p.style.display = state === 'open' ? 'flex' : 'none';
  },

  /* ---- send a chat message ---- */
  async _onChat(message, onDone) {
    const body = $('#hmBody');
    // user message
    body.innerHTML += `<div class="hm-msg hm-user"><span class="hm-avatar">👤</span><div class="hm-msg-content">${esc(message)}</div></div>`;
    $('#hmInput').value = '';
    body.scrollTop = body.scrollHeight;

    // bot is typing
    const typing = document.createElement('div');
    typing.className = 'hm-msg hm-bot';
    typing.innerHTML = `<span class="hm-avatar">🤖</span><div class="hm-msg-content"><span class="hm-typing">กำลังคิดอยู่…</span></div>`;
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;

    try {
      const res = await this.req('/chat', { method: 'POST', body: { question: message } });
      typing.innerHTML = `<span class="hm-avatar">🤖</span><div class="hm-msg-content">${this._formatResponse(res)}</div>`;
    } catch (e) {
      typing.innerHTML = `<span class="hm-avatar">🤖</span><div class="hm-msg-content" style="color:var(--red)">เชื่อมต่อกับ AI ไม่สำเร็จ: ${esc(e.message)}</div>`;
    }
    body.scrollTop = body.scrollHeight;
    if (onDone) onDone();
  },

  /* ---- format AI response for display ---- */
  _formatResponse(res) {
    const lines = res.text ? res.text.split('\n') : [];
    let html = '';
    lines.forEach(line => {
      if (line.startsWith('• ')) html += `<div style="margin:2px 0">${esc(line)}</div>`;
      else if (line.startsWith('**')) html += `<div style="font-weight:600;color:var(--ink);margin:4px 0 2px">${esc(line.replace(/\*\*/g, ''))}</div>`;
      else if (line.trim()) html += `<div style="color:var(--ink-2);font-size:13px">${esc(line)}</div>`;
    });

    // For list-type responses (accept array or {items: array})
    const items = res.type === 'list' && res.data && (Array.isArray(res.data) ? res.data : res.data.items);
    if (items && items.length) {
      html = res.text ? `<div style="margin-bottom:8px">${esc(res.text)}</div>` : '';
      html += `<div class="hm-table">`;
      items.forEach(it => {
        const row = Object.entries(it).map(([k, v]) => `<span class="hm-td">${esc(formatVal(k, v))}</span>`).join('');
        html += `<div class="hm-tr">${row}</div>`;
      });
      html += `</div>`;
    }

    // For recommendations
    if (res.type === 'recommendations' && res.data?.length) {
      html = `<div style="margin-bottom:8px"><b>ลำดับความสำคัญที่แนะนำ</b></div>`;
      res.data.forEach((it, i) => {
        html += `<div class="hm-rec">
          <span class="hm-rank">${i + 1}</span>
          <div><b>${esc(it.code)}</b> · ${esc(it.title)}<br>
          <small style="color:var(--muted)">${esc(it.project)} · ความสำคัญ: ${esc(it.priority)} · progress: ${it.progress}%</small></div>
        </div>`;
      });
    }

    return html || (res.text || 'พบข้อผิดพลาด — กรุณาลองใหม่');
  },

  /* ---- show AI insights on dashboard ---- */
  async showInsights() {
    const view = $('#view');
    const existing = view.querySelector('.hm-insights-section');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'hm-insights-section';
    wrap.innerHTML = `
      <div class="hm-insights-header">
        <h3>${IC.flame} hermes-mini — วิเคราะห์อัจฉริยะ</h3>
        <span class="hm-refresh" id="hmRefresh">🔄 รีเฟรช</span>
      </div>
      <div class="hm-insights-body" id="hmInsightsBody">
        <div style="padding:20px;text-align:center;color:var(--muted)">กำลังโหลดข้อมูล…</div>
      </div>
    `;
    view.appendChild(wrap);

    $('#hmRefresh').addEventListener('click', () => this._loadInsights());
    await this._loadInsights();
  },

  async _loadInsights() {
    const body = $('#hmInsightsBody');
    if (!body) return;
    body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">กำลังวิเคราะห์…</div>';
    try {
      const data = await this.req('/insights');
      let html = '';
      if (!data.insights || !data.insights.length) {
        html = `<div style="padding:20px;text-align:center;color:var(--ink-2)">✅ ไม่มีปัญหาพบ — ทุกงานเสี่ยงควบคุมดี</div>`;
      } else {
        html = data.insights.map(ins => `
          <div class="hm-insight-card ${ins.type}">
            <div class="hm-insight-icon">${ins.icon}</div>
            <div class="hm-insight-content">
              <h4>${esc(ins.title)}</h4>
              <p>${esc(ins.text)}</p>
              ${ins.items && ins.items.length ? `<div class="hm-insight-items">` + ins.items.slice(0, 4).map(it => {
                const label = ins.type === 'list'
                  ? Object.values(it).join(' · ')
                  : Object.entries(it).map(([k, v]) => `${formatVal(k, v)}`).join(' | ');
                return `<div class="hm-insight-item">${esc(label)}</div>`;
              }).join('') + `</div>` : ''}
            </div>
          </div>
        `).join('');
      }
      body.innerHTML = html;
    } catch (e) {
      body.innerHTML = `<div style="padding:20px;color:var(--red)">โหลดข้อมูลไม่สำเร็จ: ${esc(e.message)}</div>`;
    }
  },

  /* ---- quick risk badge for task modal ---- */
  async taskRisk(taskId) {
    try {
      const risks = await this.req('/risk');
      const taskRisk = risks.risks?.find(r => r.code === taskId);
      if (taskRisk) {
        return `<span class="hm-risk-badge hm-risk-${taskRisk.risk}">hermes-mini: ${taskRisk.risk === 'high' ? '⚠️ เสี่ยงสูง' : taskRisk.risk === 'medium' ? '⚡ เสี่ยงกลาง' : '✅ ปกติ'}</span>`;
      }
    } catch (e) { /* silent */ }
    return '';
  },
};

function formatVal(k, v) {
  const labels = { code: 'งาน', title: 'ชื่องาน', assignee: 'ผู้รับผิดชอบ', days: 'เกิน (วัน)', project: 'โปรเจกต์', priority: 'ความสำคัญ', count: 'จำนวน', hours: 'ชม.', name: 'ชื่อ', status: 'สถานะ', done: 'เสร็จ', open: 'ทำอยู่', overdue: 'เกินกำหนด', amount: 'จำนวนเงิน', no: 'เลขที่', due: 'ครบกำหนด', client: 'ลูกค้า', progress: 'ความคืบหน้า', end: 'ส่งมอบ', openTasks: 'งานค้าง', overdueTasks: 'งานเกินกำหนด', nearDueTasks: 'งานใกล้ครบกำหนด', budget: 'งบ', spent: 'ใช้ไป' };
  const lbl = labels[k] || k;
  if (typeof v === 'number' && v % 1 === 0 && v > 100) return `${v}`;
  if (typeof v === 'string' && v.match(/^p\d+$/)) return v.replace('p', 'โปรเจกต์ ');
  if (typeof v === 'string' && v.match(/^u\d+$/)) return v.replace('u', 'u');
  return `${v}`;
}
