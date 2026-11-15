/* ============================================================
   Task Management — ไทม์ไลน์โครงการ ทีม และประวัติแก้ปัญหา
   ============================================================ */
'use strict';

const TM_FORECAST = {
  ontrack:['มีแนวโน้มทัน','ontrack'], risk:['เสี่ยงไม่ทัน','risk'], late:['เกินกำหนด','late'],
  completed:['ปิดงานครบ','completed'], unknown:['ข้อมูลไม่พอ','unknown'],
};
const TM_STATUS = { todo:'รอเริ่ม', doing:'กำลังทำ', review:'ตรวจงาน', done:'เสร็จแล้ว', hold:'พักงาน', cancelled:'ยกเลิก', unknown:'ไม่ทราบสถานะ' };
const tmColor = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#6C5CE7';
const tmDate = value => TaskManagementModel.day(value) == null ? 'ไม่ระบุ' : fmtD(value);
const tmAvatar = (member, extra='') => {
  const name = member?.name || 'ยังไม่กำหนด';
  return `<span class="tm-avatar ${extra}" style="--tm-avatar:${tmColor(member?.color)}" title="${esc(name)}" aria-label="${esc(name)}">${esc(initials(name))}</span>`;
};
const tmIssueLabel = event => ({progress:'ความคืบหน้า', resolve:'แก้ไขแล้ว', reopen:'เปิดติดตามอีกครั้ง'}[event] || 'บันทึก');

const TaskManagement = {
  active:false, source:'', seq:0, controller:null, requestTimer:null,
  snapshot:null, model:null, loading:false, stale:false, error:'', offset:0,
  collapsed:new Set(), filters:{ q:'', team:'', forecast:'' }, dayWidth:16, rangeDays:56,

  sourceKey() { return Remote.on ? 'real:' + (Remote.token || '') : 'demo'; },
  canWrite() { return !this.stale && (!Remote.on || ['super_admin','admin','manager','user'].includes(Remote.user?.role)); },
  canManage() { return !this.stale && (!Remote.on || ['super_admin','admin','manager'].includes(Remote.user?.role)); },
  demoData() {
    const data = Store.data;
    if (!data.taskManagementDemo || !Array.isArray(data.taskManagementDemo.links) || !Array.isArray(data.taskManagementDemo.issues)) {
      data.taskManagementDemo = { links:[], issues:[] };
    }
    return data.taskManagementDemo;
  },
  demoSnapshot() {
    const d = this.demoData();
    return { ok:true, generatedAt:new Date().toISOString(), date:todayS(), timezone:'Asia/Bangkok',
      projects:(Store.data.projects || []).map(p => ({...p})),
      tasks:(Store.data.tasks || []).map(t => ({...t, legacyBlocked:!!(t.legacyBlocked || t.blocked), legacyBlockReason:t.legacyBlockReason || t.blockReason || ''})),
      team:(Store.data.team || []).map(u => ({...u})), aiAgents:(Store.data.aiAgents || []).map(a => ({...a})),
      links:d.links, issues:d.issues };
  },
  enter() {
    const source = this.sourceKey();
    if (!this.active || this.source !== source) {
      this.destroy(); this.active = true; this.source = source; this.offset = 0;
      this.collapsed = new Set(); this.filters = {q:'',team:'',forecast:''};
      this.load();
    } else if (!this.loading) this.load();
    else this.render();
  },
  destroy() {
    if (this.controller) this.controller.abort();
    if (this.requestTimer) clearTimeout(this.requestTimer);
    this.controller = null; this.requestTimer = null; this.seq++;
    this.active = false; this.snapshot = null; this.model = null; this.loading = false; this.stale = false; this.error = ''; this.source = '';
    const view = document.querySelector('#view');
    if (view) { view.onclick = null; view.onchange = null; view.oninput = null; }
  },
  async load() {
    if (!this.active) return false;
    const seq = ++this.seq, source = this.source;
    if (this.controller) this.controller.abort();
    if (this.requestTimer) clearTimeout(this.requestTimer);
    this.loading = true; this.error = ''; this.render();
    let controller = null;
    try {
      let d;
      if (Remote.on) {
        controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        this.controller = controller;
        const timeout = new Promise((_, reject) => {
          this.requestTimer = setTimeout(() => { controller?.abort(); reject(new Error('timeout')); }, 12000);
        });
        d = await Promise.race([Remote.req('/task-management/snapshot', {signal:controller?.signal}), timeout]);
      } else d = this.demoSnapshot();
      if (!this.active || seq !== this.seq || source !== this.sourceKey() || Store.ui?.route !== 'task-management') return false;
      if (!d || d.ok !== true || !['projects','tasks','team','aiAgents','links','issues'].every(k => Array.isArray(d[k])) ||
          TaskManagementModel.day(d.date) == null || d.timezone !== 'Asia/Bangkok') throw new Error('invalid_snapshot');
      this.snapshot = d; this.model = TaskManagementModel.build(d, d.date);
      this.loading = false; this.stale = false; this.error = '';
      this.render(); return true;
    } catch (_) {
      if (!this.active || seq !== this.seq || source !== this.sourceKey() || Store.ui?.route !== 'task-management') return false;
      this.loading = false; this.stale = !!this.snapshot;
      this.error = this.snapshot ? 'โหลดข้อมูลล่าสุดไม่สำเร็จ ข้อมูลด้านล่างอาจไม่เป็นปัจจุบัน กรุณาลองอีกครั้งก่อนแก้ไข' : 'ยังโหลด Task Management ไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล';
      this.render(); return false;
    } finally {
      if (seq === this.seq) {
        if (this.requestTimer) clearTimeout(this.requestTimer);
        this.requestTimer = null; this.controller = null;
      }
    }
  },
  team(id) { return (this.snapshot?.team || []).find(u => u.id === id) || null; },
  project(id) { return (this.snapshot?.projects || []).find(p => p.id === id) || null; },
  task(id) { return (this.snapshot?.tasks || []).find(t => t.id === id) || null; },
  issue(id) { return (this.snapshot?.issues || []).find(i => i.id === id) || null; },
  issuesFor(id) { return this.model?.issueByTask.get(id) || []; },
  asOf() {
    const d = new Date(this.snapshot?.generatedAt || '');
    if (!Number.isFinite(d.getTime())) return 'ไม่ทราบเวลา';
    const b = BangkokTime.fromInstant(d);
    return `${tmDate(b.date)} ${b.time} น.`;
  },
  side() {
    $('#side').innerHTML = `<div class="tm-side-brand"><span class="tm-side-icon">${IC.timeline}</span><div><small>PROJECT WORKSPACE</small><b>Task Management</b></div></div>
      <div class="tm-side-card"><h3>อ่านแผนอย่างไร</h3>
        <p><i class="tm-key-line"></i> เส้นแสดงช่วงวันที่บันทึกไว้</p>
        <p><i class="tm-key-dot"></i> รูปทีมคือผู้รับผิดชอบงานนั้น</p>
        <p><i class="tm-key-alert">!</i> ปัญหาที่ยังติดตามอยู่</p></div>
      <div class="tm-side-note"><b>ข้อมูลจากทีม ไม่ใช่การรับประกัน</b><p>แนวโน้มใช้วันเริ่มแผนและเปอร์เซ็นต์งานที่กรอก ไม่คำนวณวันหยุด ภาระคน หรือความซับซ้อน</p></div>
      <button type="button" class="btn btn-ghost tm-side-link" data-act="nav:projects">${IC.proj} ไปหน้าโปรเจกต์</button>`;
  },
  render() {
    if (!this.active || Store.ui?.route !== 'task-management') return;
    this.side();
    const view = $('#view');
    if (!this.snapshot) {
      view.innerHTML = `<div class="tm-loading" role="${this.error?'alert':'status'}"><div class="tm-loading-icon">${IC.timeline}</div><h2>${this.error ? 'ไม่สามารถแสดงไทม์ไลน์ได้' : 'กำลังโหลดแผนงาน'}</h2><p>${esc(this.error || 'กำลังรวบรวมโปรเจกต์และงานจากระบบ…')}</p>${this.error ? '<button class="btn btn-primary" data-tm-action="refresh">ลองอีกครั้ง</button>' : ''}</div>`;
      this.bind(); return;
    }
    const nodes = [...this.model.nodes.values()];
    const activeTasks = this.snapshot.tasks.filter(t => !['done','cancelled'].includes(t.status)).length;
    const openIssues = this.snapshot.issues.filter(i => i.status === 'open').length;
    const legacy = this.snapshot.tasks.filter(t => t.legacyBlocked).length;
    const risky = nodes.filter(n => ['risk','late'].includes(n.forecast.kind)).length;
    const source = Remote.on ? 'ข้อมูล MariaDB' : 'สาธิต / ออฟไลน์';
    const note = Remote.on
      ? (this.error ? `<div class="tm-alert" role="alert">${IC.alarm}<span>${esc(this.error)}</span><button data-tm-action="refresh">ลองอีกครั้ง</button></div>` : '')
      : `<div class="tm-demo-note">${IC.alarm}<span>โหมดสาธิต/ออฟไลน์: ข้อมูลอาจเป็นตัวอย่างหรือข้อมูลเก่า การแก้ไขเก็บเฉพาะในเบราว์เซอร์นี้</span></div>`;
    view.innerHTML = `<div class="tm-page">
      <div class="tm-page-head"><div><div class="tm-eyebrow"><span></span> PROJECT OVERVIEW</div><h2>มองเห็นทุกงาน ในเส้นเวลาเดียว</h2><p>โปรเจกต์หลัก โปรเจกต์ย่อย และงานของทีม อยู่ในภาพเดียวกัน</p></div>
        <div class="tm-head-actions"><span class="tm-sync"><i></i>${source} · ${esc(this.asOf())}</span><button class="btn btn-ghost btn-sm" data-tm-action="refresh" ${this.loading?'disabled':''}>${IC.clock} ${this.loading?'กำลังโหลด…':'อัปเดตข้อมูล'}</button></div></div>
      ${note}
      <div class="tm-kpis" aria-label="ภาพรวมทั้งหมด">
        <div class="tm-kpi"><span class="tm-kpi-ico purple">${IC.proj}</span><div><small>โปรเจกต์ทั้งหมด <span>รวมย่อย</span></small><strong>${nodes.length}</strong></div></div>
        <div class="tm-kpi"><span class="tm-kpi-ico blue">${IC.task}</span><div><small>งานที่ยังไม่ปิด</small><strong>${activeTasks}</strong></div></div>
        <div class="tm-kpi"><span class="tm-kpi-ico rose">${IC.alarm}</span><div><small>ปัญหาที่ติดตาม</small><strong>${openIssues + legacy}</strong></div></div>
        <div class="tm-kpi"><span class="tm-kpi-ico amber">${IC.flag}</span><div><small>โปรเจกต์เสี่ยง / เลยกำหนด</small><strong>${risky}</strong></div></div>
      </div>
      <section class="tm-workspace" aria-label="ไทม์ไลน์โปรเจกต์">
        <div class="tm-workspace-head"><div><span class="tm-section-kicker">THE BIG PICTURE</span><h3>เส้นเวลางานทั้งหมด <span>${nodes.length} โปรเจกต์</span></h3><p>คลิกช่วงงานเพื่อดูผู้รับผิดชอบและบันทึกการแก้ปัญหา</p></div><div class="tm-workspace-buttons"><button class="btn btn-ghost btn-sm" data-tm-action="expand">ขยายทั้งหมด</button><button class="btn btn-ghost btn-sm" data-tm-action="collapse">ย่อทั้งหมด</button></div></div>
        <div class="tm-filters"><label class="tm-search">${IC.search}<span class="sr-only">ค้นหาโปรเจกต์ งาน หรือปัญหา</span><input id="tmSearch" type="search" placeholder="ค้นหา Code, งาน หรือปัญหา…" value="${esc(this.filters.q)}"></label>
          <label><span class="sr-only">กรองทีม</span><select id="tmTeam"><option value="">ทุกคนในทีม</option><option value="unassigned" ${this.filters.team==='unassigned'?'selected':''}>ยังไม่กำหนดผู้รับผิดชอบ</option>${this.snapshot.team.map(u=>`<option value="${esc(u.id)}" ${this.filters.team===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label>
          <label><span class="sr-only">กรองแนวโน้ม</span><select id="tmForecast"><option value="">ทุกแนวโน้ม</option>${Object.entries(TM_FORECAST).map(([k,v])=>`<option value="${k}" ${this.filters.forecast===k?'selected':''}>${v[0]}</option>`).join('')}</select></label></div>
        <div class="tm-timeline-toolbar"><div class="tm-timeline-name">${IC.timeline}<b>Timeline</b><span>· 8 สัปดาห์</span></div><div class="tm-period"><button type="button" data-tm-action="prev" aria-label="ช่วงเวลาก่อนหน้า">‹</button><button type="button" class="tm-now-btn" data-tm-action="today">วันนี้</button><button type="button" data-tm-action="next" aria-label="ช่วงเวลาถัดไป">›</button><strong id="tmPeriod"></strong></div></div>
        <p class="tm-scroll-hint">เลื่อนซ้าย–ขวาเพื่อดูเส้นเวลา · วันที่ไม่ครบจะแสดงเป็นจุดหรือข้อความ ไม่สร้างช่วงขึ้นเอง</p>
        <div id="tmTimeline" class="tm-timeline-scroll" tabindex="0" aria-label="ตารางไทม์ไลน์ เลื่อนแนวนอนเพื่อดูวันที่"></div>
        <div class="tm-legend"><span><i class="tm-legend-dot purple"></i>ช่วงตามแผน</span><span><i class="tm-legend-dot green"></i>เสร็จแล้ว</span><span><i class="tm-legend-dot red"></i>ติดปัญหา</span><span><i class="tm-legend-now"></i>วันนี้ (เวลาไทย)</span></div>
      </section>
      ${this.issueSection()}
      <div class="tm-method"><b>วิธีอ่านแนวโน้ม</b><span>นับงานในโปรเจกต์และโปรเจกต์ย่อยทุกชิ้นเท่ากัน ใช้ความคืบหน้าที่กรอกเทียบกับเวลาตั้งแต่วันเริ่มแผน หากมีปัญหา งานเกินกำหนด หรือยังไม่มีผู้รับผิดชอบจะแจ้งความเสี่ยง ผลเป็นเพียงการประมาณ ไม่ใช่ AI หรือการยืนยันส่งทัน และไม่มีวันที่ปิดจริงในข้อมูลเดิม</span></div>
    </div>`;
    this.bind(); this.drawTimeline();
  },
  issueSection() {
    const open = (this.snapshot.issues || []).filter(i => i.status === 'open');
    const resolved = (this.snapshot.issues || []).filter(i => i.status === 'resolved').slice().reverse();
    const legacy = this.snapshot.tasks.filter(t => t.legacyBlocked).map(t => ({taskId:t.id, description:t.legacyBlockReason || 'ไม่มีรายละเอียด', legacy:true}));
    const cards = [...open, ...legacy].map(i => {
      const t = this.task(i.taskId), p = t && this.project(t.project);
      if (!t || !p) return '';
      const last = i.events?.[i.events.length-1];
      return `<button type="button" class="tm-issue-row" data-tm-task="${esc(t.id)}"><span class="tm-issue-symbol">!</span><span class="tm-issue-main"><b>${esc(i.description)}</b><small><strong>${esc(p.code)}</strong> · ${esc(t.code)} · ${esc(this.team(t.assignee)?.name || 'ยังไม่กำหนดผู้รับผิดชอบ')}${i.legacy?' · สถานะติดขัดเดิม':''}</small>${last?`<em>อัปเดตล่าสุด: ${esc(last.note)}</em>`:''}</span><span class="tm-issue-open">กำลังติดตาม ${IC.chevR}</span></button>`;
    }).join('');
    const closed = resolved.slice(0,4).map(i => {
      const t = this.task(i.taskId); if (!t) return '';
      const last = [...(i.events || [])].reverse().find(e => e.type === 'resolve');
      return `<button type="button" class="tm-resolved-row" data-tm-task="${esc(t.id)}"><span class="tm-resolved-check">✓</span><span><b>${esc(i.description)}</b><small>${esc(t.code)}${last ? ' · '+esc(last.note) : ''}</small></span><span>แก้ไขแล้ว</span></button>`;
    }).join('');
    return `<div class="tm-bottom-grid"><section class="tm-issues-card"><div class="tm-card-heading"><div><span class="tm-section-kicker">NEEDS ATTENTION</span><h3>ปัญหาที่ต้องติดตาม <span>${open.length + legacy.length}</span></h3></div><span class="tm-alert-chip">${open.length + legacy.length ? 'มีรายการรอติดตาม' : 'ไม่มีรายการเปิด'}</span></div>
      ${cards || '<div class="tm-empty-issues"><span>✓</span><div><b>ไม่มีปัญหาที่เปิดค้าง</b><p>หากงานติดขัด สามารถแจ้งได้จากแต่ละช่วงงาน</p></div></div>'}</section>
      <section class="tm-resolved-card"><div class="tm-card-heading"><div><span class="tm-section-kicker">RECENTLY RESOLVED</span><h3>บันทึกการแก้ไข <span>${resolved.length}</span></h3></div></div>${closed || '<p class="tm-empty-copy">ยังไม่มีบันทึกปัญหาที่แก้ไขแล้ว</p>'}${resolved.length>4?`<p class="tm-empty-copy">แสดงล่าสุด 4 รายการ · ดูประวัติทั้งหมดได้ในแต่ละงาน</p>`:''}</section></div>`;
  },
  matches(node) {
    const q = this.filters.q.trim().toLowerCase(), team = this.filters.team;
    const projectText = `${node.project.code || ''} ${node.project.name || ''}`.toLowerCase();
    const projectMatch = !q || projectText.includes(q);
    const taskMatch = t => {
      const u = this.team(t.assignee);
      const issueText = this.issuesFor(t.id).map(i => `${i.description} ${(i.events||[]).map(e=>e.note).join(' ')}`).join(' ');
      const text = `${t.code || ''} ${t.title || ''} ${u?.name || ''} ${issueText} ${t.legacyBlockReason || ''}`.toLowerCase();
      const teamMatch = !team || (team === 'unassigned' ? !t.assignee : t.assignee === team);
      return teamMatch && (projectMatch || !q || text.includes(q));
    };
    const filteredTasks = node.tasks.filter(taskMatch);
    const memberMatch = !team || (team !== 'unassigned' && (node.project.members || []).includes(team)) || filteredTasks.length > 0;
    const own = memberMatch && (!this.filters.forecast || node.forecast.kind === this.filters.forecast) && (projectMatch || filteredTasks.length > 0);
    const children = node.children.map(n => this.matches(n)).filter(Boolean);
    if (!own && !children.length) return null;
    return { node, own, tasks:own ? filteredTasks : [], children };
  },
  rangeStart() { return TaskManagementModel.move(TaskManagementModel.monday(this.snapshot.date), -14 + this.offset); },
  drawTimeline() {
    const root = $('#tmTimeline'); if (!root || !this.snapshot || !this.model) return;
    const oldScroll = root.scrollLeft;
    const start = this.rangeStart(), finish = TaskManagementModel.move(start, this.rangeDays - 1);
    $('#tmPeriod').textContent = `${tmDate(start)} – ${tmDate(finish)}`;
    const items = this.model.roots.map(n => this.matches(n)).filter(Boolean);
    const width = this.rangeDays * this.dayWidth;
    const todayOffset = TaskManagementModel.day(this.snapshot.date) - TaskManagementModel.day(start);
    const marker = todayOffset >= 0 && todayOffset < this.rangeDays
      ? `<span class="tm-today-line" style="left:${todayOffset*this.dayWidth+this.dayWidth/2}px" title="วันนี้"></span>` : '';
    const weeks = Array.from({length:8}, (_,i) => {
      const day = TaskManagementModel.move(start, i*7);
      return `<span style="width:${7*this.dayWidth}px"><b>${fmtD(day,{short:true})}</b><small>${i===0 || day.slice(0,7)!==TaskManagementModel.move(day,-7).slice(0,7) ? day.slice(0,4) : '&nbsp;'}</small></span>`;
    }).join('');
    const rows = [];
    const draw = (item, depth) => {
      const {node, own} = item, p=node.project, f=node.forecast, folded=this.collapsed.has(p.id);
      const meta=TM_FORECAST[f.kind] || TM_FORECAST.unknown;
      const count = node.tasks.length + node.children.length;
      const indent = Math.min(depth, 4)*16;
      const parentWarning = node.orphan ? '<small class="tm-parent-warning">โปรเจกต์หลักถูกเก็บเข้าคลังหรือไม่พบ</small>' : node.cycle ? '<small class="tm-parent-warning">พบความสัมพันธ์วน กรุณาตรวจสอบ</small>' : '';
      const summary = f.progress == null ? 'ยังไม่ทราบความคืบหน้า' : `คืบหน้า ${f.progress}%`;
      const prediction = f.predictedDate ? ` · คาด ${tmDate(f.predictedDate)}` : '';
      rows.push(`<div class="tm-grid-row tm-project-row"><div class="tm-row-label" style="--tm-indent:${indent}px"><button type="button" class="tm-fold" data-tm-fold="${esc(p.id)}" aria-expanded="${!folded}" aria-label="${folded?'ขยาย':'ย่อ'} ${esc(p.code)}">${folded?'▸':'▾'}</button><span class="tm-project-dot" style="--tm-color:${tmColor(p.color)}"></span><span class="tm-label-text"><b title="${esc(p.name)}">${esc(p.code || p.id)}</b><small title="${esc(p.name)}">${esc(p.name)}</small>${parentWarning}<span class="tm-row-meta">${depth?'โครงการย่อย':'โครงการหลัก'} · ${count} รายการ</span></span>${this.canManage()?`<button type="button" class="tm-link-btn" data-tm-link="${esc(p.id)}" title="จัดโครงการหลัก / ย่อย" aria-label="จัดโครงสร้าง ${esc(p.code)}">⋯</button>`:''}</div><div class="tm-track" style="width:${width}px">${marker}${this.track(p.start,p.end,'project',p.id,p.color,null,f)}<span class="tm-track-summary ${meta[1]}" title="${esc(f.reason)}">${meta[0]} · ${summary}${esc(prediction)}</span></div></div>`);
      if (folded) return;
      if (own) item.tasks.forEach(t => {
        const person = this.team(t.assignee), issueCount = this.issuesFor(t.id).filter(i=>i.status==='open').length + (t.legacyBlocked?1:0);
        const agent = (this.snapshot.aiAgents || []).find(a=>a.id===t.aiAgentId);
        const desc = person?.name || (t.assignee ? 'ไม่พบสมาชิก' : 'ยังไม่กำหนด');
        rows.push(`<div class="tm-grid-row tm-task-row"><div class="tm-row-label tm-task-label" style="--tm-indent:${Math.min(depth,4)*16}px"><span class="tm-tree-branch">└</span><span class="tm-label-text"><button type="button" data-tm-task="${esc(t.id)}" title="${esc(t.title)}"><b>${esc(t.code)}</b> <span>${esc(t.title)}</span></button><small>${esc(desc)} · ${esc(TM_STATUS[t.status] || 'ไม่ทราบสถานะ')}${agent ? ' · AI '+esc(agent.code) : ''}${issueCount ? ` · <span class="tm-red-text">${issueCount} ปัญหา</span>` : ''}</small></span></div><div class="tm-track tm-task-track" style="width:${width}px">${marker}${this.track(t.start,t.due,'task',t.id,p.color,person,{...t,issueCount})}</div></div>`);
      });
      item.children.forEach(ch => draw(ch, depth+1));
    };
    items.forEach(i => draw(i,0));
    root.innerHTML = `<div class="tm-timeline-grid" style="--tm-track-width:${width}px;--tm-week-width:${7*this.dayWidth}px"><div class="tm-grid-row tm-grid-header"><div class="tm-row-label"><span>PROJECT / TASK</span><span>แนวโน้ม</span></div><div class="tm-weeks" style="width:${width}px">${weeks}${marker}</div></div>${rows.join('') || '<div class="tm-grid-empty">ไม่พบโปรเจกต์ตามตัวกรอง หรือยังไม่มีโปรเจกต์ในระบบ</div>'}</div>`;
    root.scrollLeft = oldScroll;
  },
  track(start, end, kind, id, color, person, details) {
    const span = TaskManagementModel.span(start,end,this.rangeStart(),this.rangeDays), total=this.rangeDays*this.dayWidth;
    const task = kind === 'task';
    const action = task ? `data-tm-task="${esc(id)}"` : `data-tm-project="${esc(id)}"`;
    const text = task ? `${details.code} · ${details.title} · ${person?.name || (details.assignee?'ไม่พบสมาชิก':'ยังไม่กำหนด')} · ${tmDate(start)} – ${tmDate(end)}` : `โปรเจกต์ ${id} · ${tmDate(start)} – ${tmDate(end)} · ${details.reason}`;
    if (span.kind === 'missing' || span.kind === 'invalid') return `<button type="button" class="tm-undated ${span.kind==='invalid'?'invalid':''}" ${action} title="${esc(text)}">${span.kind==='invalid'?'⚠ วันที่ไม่ถูกต้อง':'— ไม่ระบุวันที่'}</button>`;
    if (span.kind === 'outside') return `<button type="button" class="tm-outside ${span.side}" ${action} title="${esc(text)}">${span.side==='before'?'← ก่อนช่วงนี้':'หลังช่วงนี้ →'}</button>`;
    const x = span.left*this.dayWidth, w = Math.max(this.dayWidth,span.width*this.dayWidth);
    const clipped = `${span.clippedBefore?' begins-before':''}${span.clippedAfter?' ends-after':''}`;
    if (span.kind === 'point') return `<button type="button" class="tm-date-point ${task?'task':''}" style="left:${x+4}px;--tm-color:${tmColor(color)}" ${action} title="${esc(text)} · ${span.point==='due'?'มีเฉพาะวันส่ง':'มีเฉพาะวันเริ่ม'}"><span>◆</span>${task?tmAvatar(person,'tiny'):''}</button>`;
    if (task) {
      const state = details.issueCount || details.legacyBlocked ? 'blocked' : details.status === 'done' ? 'done' : details.status === 'cancelled' ? 'cancelled' : 'active';
      const pc = TaskManagementModel.progress(details);
      return `<button type="button" class="tm-bar tm-task-bar ${state}${clipped}" style="left:${x}px;width:${w}px;--tm-color:${tmColor(color)}" ${action} title="${esc(text)}" aria-label="${esc(text)}">${tmAvatar(person,'tiny')}<span>${w>=80?esc(details.code):''}</span>${details.issueCount?'<i>!</i>':''}${pc != null && w>=105 ? `<small>${pc}%</small>` : ''}</button>`;
    }
    const pc = details.progress == null ? 0 : Math.max(0,Math.min(100,details.progress));
    return `<button type="button" class="tm-bar tm-project-bar ${details.kind}${clipped}" style="left:${x}px;width:${w}px;--tm-color:${tmColor(color)};--tm-progress:${pc}%" ${action} title="${esc(text)}" aria-label="${esc(text)}"><span></span></button>`;
  },
  bind() {
    const view = $('#view');
    view.onclick = e => {
      const target = e.target.closest('[data-tm-action],[data-tm-task],[data-tm-project],[data-tm-fold],[data-tm-link]');
      if (!target) return;
      if (target.dataset.tmTask) return this.openTask(target.dataset.tmTask);
      if (target.dataset.tmLink) return this.openParent(target.dataset.tmLink);
      if (target.dataset.tmProject) {
        const id=target.dataset.tmProject; this.collapsed.has(id)?this.collapsed.delete(id):this.collapsed.add(id); this.drawTimeline(); return;
      }
      if (target.dataset.tmFold) {
        const id=target.dataset.tmFold; this.collapsed.has(id)?this.collapsed.delete(id):this.collapsed.add(id); this.drawTimeline(); return;
      }
      switch (target.dataset.tmAction) {
        case 'refresh': this.load(); break;
        case 'prev': this.offset-=28; this.drawTimeline(); break;
        case 'next': this.offset+=28; this.drawTimeline(); break;
        case 'today': this.offset=0; this.drawTimeline(); break;
        case 'expand': this.collapsed.clear(); this.drawTimeline(); break;
        case 'collapse': this.model?.nodes.forEach(n=>this.collapsed.add(n.project.id)); this.drawTimeline(); break;
      }
    };
    view.oninput = e => { if (e.target.id === 'tmSearch') { this.filters.q=e.target.value; this.drawTimeline(); } };
    view.onchange = e => {
      if (e.target.id === 'tmTeam') { this.filters.team=e.target.value; this.drawTimeline(); }
      if (e.target.id === 'tmForecast') { this.filters.forecast=e.target.value; this.drawTimeline(); }
    };
  },
  descendantIds(node) {
    const result = new Set(), stack = [node];
    while (stack.length) { const n=stack.pop(); if (result.has(n.project.id)) continue; result.add(n.project.id); stack.push(...n.children); }
    return result;
  },
  openParent(id) {
    if (!this.canManage() || !this.model?.nodes.has(id)) return;
    const node = this.model.nodes.get(id), excluded=this.descendantIds(node);
    const previous = this.snapshot.links.find(l=>l.childId===id)?.parentId || '';
    const missing = previous && !this.project(previous);
    openModal(`${modalHead('จัดโครงการหลัก / ย่อย', `เลือกโปรเจกต์หลักของ ${esc(node.project.code)} · ${esc(node.project.name)}`)}
      <div class="modal-body"><p class="tm-modal-intro">โปรเจกต์ที่มีอยู่จะเชื่อมเป็นโครงสร้างเดียวกัน โดยไม่ย้ายหรือลบงานเดิม</p>
      <div class="f-group"><label for="tmParentSelect">อยู่ภายใต้โปรเจกต์</label><select id="tmParentSelect"><option value="" ${!previous?'selected':''}>ไม่มี — เป็นโปรเจกต์หลัก</option>${missing?`<option value="${esc(previous)}" selected disabled>โปรเจกต์หลักเดิมถูกเก็บเข้าคลังหรือไม่พบ (${esc(previous)})</option>`:''}${this.snapshot.projects.filter(p=>!excluded.has(p.id)).map(p=>`<option value="${esc(p.id)}" ${p.id===previous?'selected':''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select></div>
      <p class="tm-modal-hint">ไม่สามารถเลือกตัวเองหรือลูกหลานเป็นโปรเจกต์หลักได้ · เฉพาะ Admin/Manager จัดโครงสร้างข้อมูลจริง</p></div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button><button class="btn btn-primary" id="tmSaveParent">บันทึกโครงสร้าง</button></div>`);
    $('#tmSaveParent').onclick = async () => {
      const parentId=$('#tmParentSelect').value || null, button=$('#tmSaveParent');
      if (parentId && (excluded.has(parentId) || !this.project(parentId))) return toast('กรุณาเลือกโปรเจกต์หลักที่มีอยู่','warn');
      button.disabled=true;
      try {
        if (Remote.on) await Remote.req('/task-management/projects/'+encodeURIComponent(id)+'/parent', {method:'PUT', body:{parentId}});
        else {
          const demo=this.demoData(); demo.links=demo.links.filter(l=>l.childId!==id); if (parentId) demo.links.push({childId:id,parentId}); Store.save();
        }
        closeModal(); const ok=await this.load();
        toast(ok?'บันทึกโครงสร้างแล้ว':'บันทึกแล้ว แต่ยังโหลดข้อมูลล่าสุดไม่ได้ กรุณาลองอีกครั้ง',ok?'ok':'warn');
      } catch (e) { button.disabled=false; toast('บันทึกไม่สำเร็จ: '+esc(e.message),'err'); }
    };
  },
  openTask(id) {
    const t=this.task(id); if (!t) return;
    const p=this.project(t.project), u=this.team(t.assignee), issues=this.issuesFor(id);
    const canWrite=this.canWrite();
    const issueCards=issues.map(i => {
      const state=i.status==='open'?'กำลังติดตาม':i.status==='resolved'?'แก้ไขแล้ว':'สถานะไม่ถูกต้อง';
      const events=(i.events || []).map(e=>`<li><span class="tm-history-dot"></span><div><b>${esc(tmIssueLabel(e.type))} · ${esc(e.actor || 'ผู้ใช้')}</b><small>${esc(e.at || '')} น. (เวลาไทย)</small><p>${esc(e.note)}</p></div></li>`).join('');
      const action=i.status==='open' ? '<option value="progress">อัปเดตความคืบหน้า</option><option value="resolve">แก้ไขแล้ว / ปิดปัญหา</option>' : i.status==='resolved' ? '<option value="reopen">เปิดติดตามอีกครั้ง</option>' : '';
      return `<article class="tm-modal-issue"><div class="tm-modal-issue-head"><span class="tm-issue-status ${i.status==='resolved'?'resolved':'open'}">${state}</span><small>แจ้งโดย ${esc(i.createdBy || 'ผู้ใช้')} · ${esc(i.createdAt || '')} น.</small></div><p class="tm-issue-description">${esc(i.description)}</p><details ${i.status==='open'?'open':''}><summary>ประวัติการติดตาม (${(i.events || []).length})</summary><ul class="tm-history">${events || '<li class="tm-no-history">ยังไม่มีการอัปเดต</li>'}</ul></details>${canWrite && action?`<div class="tm-update-form"><label>บันทึกการแก้ไข / ติดตาม<textarea maxlength="2000" rows="2" data-tm-note="${esc(i.id)}" placeholder="ระบุสิ่งที่ทำ วิธีแก้ หรือสิ่งที่ต้องติดตามต่อ"></textarea></label><div><select data-tm-update-action="${esc(i.id)}" aria-label="สถานะปัญหา">${action}</select><button type="button" class="btn btn-sm btn-primary" data-tm-save-update="${esc(i.id)}">บันทึก</button></div></div>`:''}</article>`;
    }).join('');
    const legacy=t.legacyBlocked ? `<article class="tm-modal-issue legacy"><div class="tm-modal-issue-head"><span class="tm-issue-status open">สถานะติดขัดเดิม</span></div><p>${esc(t.legacyBlockReason || 'ไม่มีรายละเอียด')}</p>${canWrite?`<div class="tm-update-form"><label for="tmLegacyNote">บันทึกวิธีแก้ก่อนปลดสถานะ<textarea id="tmLegacyNote" maxlength="2000" rows="2" placeholder="ระบุวิธีแก้หรือผลการตรวจสอบ"></textarea></label><button class="btn btn-sm" id="tmResolveLegacy">บันทึกวิธีแก้และปลดสถานะเดิม</button></div>`:''}</article>` : '';
    const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
    openModal(`${modalHead(`${esc(t.code)} · ${esc(t.title)}`, `${esc(p?.code || '')} · ${esc(p?.name || '')}`)}
      <div class="modal-body tm-task-modal"><div class="tm-task-facts"><div>${tmAvatar(u)}<span><small>ผู้รับผิดชอบ</small><b>${esc(u?.name || (t.assignee?'ไม่พบสมาชิก':'ยังไม่กำหนด'))}</b></span></div><div><small>สถานะ</small><b>${esc(TM_STATUS[t.status] || 'ไม่ทราบสถานะ')} · ${TaskManagementModel.progress(t) == null ? 'ไม่ทราบ %' : TaskManagementModel.progress(t)+'%'}</b></div><div><small>ช่วงตามแผน</small><b>${tmDate(t.start)} – ${tmDate(t.due)}</b></div></div>
      ${subtasks.length?`<div class="tm-checklist"><b>รายการย่อย (${subtasks.filter(s=>s.d).length}/${subtasks.length})</b><small>รายการย่อยเป็นเช็กลิสต์ ยังไม่มีวันที่หรือผู้รับผิดชอบแยก</small>${subtasks.map(s=>`<span>${s.d?'✓':'○'} ${esc(s.t)}</span>`).join('')}</div>`:''}
      <div class="tm-modal-section"><h4>ปัญหาและการแก้ไข <span>${issues.length + (t.legacyBlocked?1:0)}</span></h4>${legacy}${issueCards || (!t.legacyBlocked?'<p class="tm-modal-hint">ยังไม่มีปัญหาที่บันทึกในงานนี้</p>':'')}</div>
      ${canWrite?`<div class="tm-new-issue"><h4>แจ้งปัญหาใหม่</h4><label for="tmNewIssue">ปัญหาที่พบ</label><textarea id="tmNewIssue" rows="2" maxlength="1000" placeholder="ระบุสิ่งที่ติดขัด เพื่อให้ทีมติดตามและบันทึกวิธีแก้"></textarea><button type="button" class="btn btn-primary btn-sm" id="tmAddIssue">${IC.plus} แจ้งปัญหา</button></div>`:`<p class="tm-modal-hint">${this.stale?'ข้อมูลอาจไม่เป็นปัจจุบัน กรุณาอัปเดตก่อนแก้ไข':'สิทธิ์ Viewer ดูประวัติได้อย่างเดียว'}</p>`}</div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">ปิด</button><button class="btn" id="tmOpenOriginal">${IC.task} เปิดการ์ดงาน</button></div>`, {wide:true});
    const root=$('#modalRoot');
    if ($('#tmAddIssue')) $('#tmAddIssue').onclick=()=>{
      const description=$('#tmNewIssue').value.trim();
      if (!description || description.length>1000) return toast('กรุณาระบุปัญหาไม่เกิน 1,000 ตัวอักษร','warn');
      this.mutate($('#tmAddIssue'), id, 'create', {taskId:id,description});
    };
    if ($('#tmResolveLegacy')) $('#tmResolveLegacy').onclick=()=>{
      const note=$('#tmLegacyNote').value.trim(); if (!note || note.length>2000) return toast('กรุณาระบุวิธีแก้ไม่เกิน 2,000 ตัวอักษร','warn');
      this.mutate($('#tmResolveLegacy'), id, 'legacy', {note});
    };
    $$('[data-tm-save-update]',root).forEach(button=>button.onclick=()=>{
      const issueId=button.dataset.tmSaveUpdate, issue=this.issue(issueId);
      const note=$$('[data-tm-note]',root).find(el=>el.dataset.tmNote===issueId)?.value.trim() || '';
      const action=$$('[data-tm-update-action]',root).find(el=>el.dataset.tmUpdateAction===issueId)?.value;
      if (!issue || !note || note.length>2000) return toast('กรุณาระบุผลการติดตามไม่เกิน 2,000 ตัวอักษร','warn');
      this.mutate(button,id,'update',{issueId,revision:issue.revision,action,note});
    });
    $('#tmOpenOriginal').onclick=async () => {
      const button=$('#tmOpenOriginal'), source=this.source; button.disabled=true;
      try {
        if (Remote.on) {
          const data=await Remote.req('/bootstrap');
          if (!this.active || this.source!==source || source!==this.sourceKey()) return;
          Store.hydrate(data);
        }
        const latest=Store.getTask(id);
        if (!latest) throw new Error('ไม่พบงานล่าสุด');
        // bootstrap เดิมใช้วันที่ fallback; ห้ามให้การแก้การ์ดเขียนวันสมมติกลับลงฐานข้อมูล
        latest.start=t.start || ''; latest.due=t.due || '';
        closeModal(); openTaskModal(id);
      } catch (e) { if (button.isConnected) button.disabled=false; toast('เปิดการ์ดงานไม่สำเร็จ: '+esc(e.message),'err'); }
    };
  },
  async mutate(button, taskId, kind, data) {
    if (!this.canWrite()) return toast('กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก','warn');
    const source=this.source, remote=Remote.on;
    button.disabled=true;
    try {
      if (remote) {
        const path=kind==='create'?'/task-management/issues':kind==='legacy'?`/task-management/tasks/${encodeURIComponent(taskId)}/legacy-blocker/resolve`:`/task-management/issues/${encodeURIComponent(data.issueId)}/updates`;
        const body=kind==='update'?{revision:data.revision,action:data.action,note:data.note}:data;
        await Remote.req(path,{method:'POST',body});
      } else {
        const demo=this.demoData(), who=Store.data.user?.name || Store.data.team?.find(u=>u.me)?.name || 'ผู้ใช้สาธิต', at=BangkokTime.current().dateTime;
        if (kind==='create') demo.issues.push({id:uid('ti'),taskId,description:data.description,status:'open',revision:1,createdBy:who,createdAt:at,updatedAt:at,events:[]});
        else if (kind==='legacy') {
          const task=Store.data.tasks.find(x=>x.id===taskId);
          if (!task || !(task.legacyBlocked || task.blocked)) throw new Error('สถานะติดขัดเดิมถูกปลดแล้ว');
          demo.issues.push({id:uid('ti'),taskId,description:'อุปสรรคจากระบบเดิม: '+(task.legacyBlockReason || task.blockReason || 'ไม่มีรายละเอียด'),status:'resolved',revision:2,createdBy:who,createdAt:at,updatedAt:at,events:[{id:uid('tie'),type:'resolve',note:data.note,actor:who,at}]});
          task.legacyBlocked=false; task.blocked=false;
        } else {
          const issue=demo.issues.find(i=>i.id===data.issueId);
          if (!issue || issue.revision!==data.revision) throw new Error('ปัญหาถูกอัปเดตแล้ว กรุณาโหลดข้อมูลล่าสุด');
          if ((data.action==='reopen' && issue.status!=='resolved') || (data.action!=='reopen' && issue.status!=='open')) throw new Error('สถานะเปลี่ยนแล้ว');
          issue.events.push({id:uid('tie'),type:data.action,note:data.note,actor:who,at});
          issue.status=data.action==='resolve'?'resolved':'open'; issue.revision++; issue.updatedAt=at;
        }
        Store.save();
      }
      if (!this.active || this.source!==source || source!==this.sourceKey()) return;
      closeModal(); const ok=await this.load();
      if (ok) this.openTask(taskId);
      toast(ok?'บันทึกการติดตามแล้ว':'บันทึกแล้ว แต่ยังโหลดข้อมูลล่าสุดไม่ได้ กรุณาลองอีกครั้ง',ok?'ok':'warn');
    } catch (e) {
      if (button.isConnected) button.disabled=false;
      toast('บันทึกไม่สำเร็จหรือยังยืนยันไม่ได้: '+esc(e.message)+' · กรุณาตรวจข้อมูลล่าสุดก่อนลองซ้ำ','err');
    }
  },
};
function renderTaskManagement() { TaskManagement.enter(); }
