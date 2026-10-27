/* ============================================================
   MNG ERP — Project Brief, Mindmap, System Flow และคู่มือ
   ผังเป็นแผนงาน: การเลือกโมเดล/ช่องทางไม่ได้สั่ง AI หรือเผยแพร่จริง
   ============================================================ */
'use strict';

const FLOW_ACTORS = {
  start: ['จุดเริ่ม', 'start'], system: ['ระบบ', 'system'], human: ['คนทำ', 'human'],
  auto: ['อัตโนมัติ', 'auto'], ai: ['AI', 'ai'], milestone: ['จุดส่งมอบ', 'milestone'],
};
const flowCopy = value => JSON.parse(JSON.stringify(value));
const flowCanEdit = () => !Remote.on || canLead();
const flowAvailable = () => !Remote.on || Store.data.featureAvailability?.projectFlow !== false;
const docsAvailable = () => !Remote.on || Store.data.featureAvailability?.docs !== false;
const flowProject = id => Store.data.projects.find(p => p.id === id);
const flowMemberName = id => Store.data.team.find(u => u.id === id)?.name || (id ? 'ไม่พบสมาชิก' : 'ยังไม่กำหนด');
const flowAgentName = id => (Store.data.aiAgents || []).find(a => a.id === id)?.name || (id ? 'ไม่พบ Agent' : 'ยังไม่กำหนด');

function previewProjectFlow(project) {
  const saved = Store.data.projectFlows?.[project.id];
  if (saved) return saved;
  const members = ProjectPlan.normalizeBrief({ members: project.members || [] }).members;
  return { ...ProjectPlan.build(project, { objective: project.desc || '', members }), projectId: project.id, revision: 0 };
}

function goToProjectFlow(id) {
  Store.ui.projectFlowMode = 'flow';
  const hash = '#/project-flow?project=' + encodeURIComponent(id);
  if (location.hash === hash) App.route(); else location.hash = hash;
}

async function refreshFlowData() {
  if (!Remote.on) return true;
  try { Store.hydrate(await Remote.req('/bootstrap')); return true; }
  catch { return false; }
}

function localFlowTasks(project, flow, onlyNodeId) {
  let next = Store.data.tasks.reduce((n, t) => Math.max(n, Number(String(t.code || '').split('-').pop()) || 1000), 1000);
  const created = [];
  flow.nodes.forEach(node => {
    if ((onlyNodeId && node.id !== onlyNodeId) || node.taskId) return;
    const id = uid('t');
    const code = (project.code || 'MNG') + '-' + (++next);
    Store.data.tasks.push({
      id, code, project: project.id, title: `${node.icon} ${node.title}`.trim(), desc: node.desc || '',
      status: 'todo', priority: 'med', assignee: node.assigneeId || null, aiAgentId: node.aiAgentId || null,
      start: project.start || todayS(), due: project.end || todayS(), progress: 0,
      est: node.estHours || 0, spent: 0, tags: ['project-flow', node.zone],
      subtasks: (node.checklist || []).map(t => ({ t, d: false })), comments: [],
    });
    node.taskId = id; node.taskCode = code; created.push(id);
  });
  return created;
}

/* ตั้งค่าบรีฟ: โครงการใหม่สร้างผังไปพร้อมกัน, โครงการเดิมเก็บขั้นตอนที่แก้ไขไว้ */
function openProjectWizard(project) {
  const editing = !!project;
  if (editing && !flowCanEdit()) return toast('เฉพาะ Admin/Manager เท่านั้นที่แก้ไขบรีฟได้', 'warn');
  if (!flowAvailable()) return toast('ตารางผังโปรเจกต์ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ', 'err');
  const existing = editing ? previewProjectFlow(project) : null;
  const current = Store.data.team.find(u => u.me) || Store.data.team[0];
  const initialBrief = existing?.brief || { ownerId: current?.id || '', members: current ? [current.id] : [] };
  const draft = {
    name: project?.name || '', code: project?.code || '',
    clientName: editing ? (Store.clientOf(project)?.name || project.clientName || 'Internal — MNG Groups') : 'Internal — MNG Groups',
    budget: project?.budget ?? 0, start: project?.start || todayS(),
    end: project?.end || d2s(addDays(new Date(), 30)),
    brief: ProjectPlan.normalizeBrief(initialBrief), autoCreateTasks: false,
  };
  if (editing && !draft.brief.members.length) draft.brief.members = (project.members || []).slice();
  let step = 0;
  const steps = ['ข้อมูล & เป้าหมาย', 'เส้นทางลูกค้า', 'ทีม & AI', 'ตรวจสอบแผน'];
  const field = (label, id, value, placeholder, rows=2, hint='') => `
    <div class="f-group full"><label for="${id}">${label}</label>
      <textarea id="${id}" rows="${rows}" maxlength="2000" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea>
      ${hint ? `<small class="pf-field-hint">${hint}</small>` : ''}</div>`;
  const optionPeople = (selected, blank='ยังไม่กำหนด') => `<option value="">${blank}</option>` +
    Store.data.team.map(u => `<option value="${esc(u.id)}" ${u.id===selected?'selected':''}>${esc(u.name)}${u.role?' · '+esc(u.role):''}</option>`).join('');
  const optionAgents = selected => `<option value="">ยังไม่เลือก AI Agent</option>` +
    (Store.data.aiAgents || []).map(a => `<option value="${esc(a.id)}" ${a.id===selected?'selected':''}>${esc(a.name)} · ${esc(a.model || 'ไม่ระบุโมเดล')}${a.paused?' (พักใช้งาน)':''}</option>`).join('');

  function capture() {
    const read = (id, cb) => { const e = document.getElementById(id); if (e) cb(e); };
    read('bwName', e => { if (!editing) draft.name = e.value.trim(); });
    read('bwCode', e => { if (!editing) draft.code = e.value.trim(); });
    read('bwClient', e => { if (!editing) draft.clientName = e.value; });
    read('bwBudget', e => { if (!editing) draft.budget = e.value; });
    read('bwStart', e => { if (!editing) draft.start = e.value; });
    read('bwEnd', e => { if (!editing) draft.end = e.value; });
    ['objective','audience','deliverables','successMetric','constraints','marketingChannels','salesProcess',
      'productionPlan','deliveryPlan','supportPlan','approvalNotes','aiModel','ownerId','approverId','aiAgentId'].forEach(key => {
      read('bw-' + key, e => { draft.brief[key] = e.value.trim(); });
    });
    const teamFields = $$('[data-bw-member]');
    if (teamFields.length) draft.brief.members = teamFields.filter(e => e.checked).map(e => e.value);
    read('bwCreateTasks', e => { draft.autoCreateTasks = e.checked; });
  }
  function validateBasics() {
    if (!draft.name) { step = 0; draw(); toast('กรุณาระบุชื่อโปรเจกต์', 'warn'); return false; }
    if (!editing && (!draft.start || !draft.end || draft.end < draft.start)) {
      step = 0; draw(); toast('กรุณาตรวจสอบวันที่เริ่มและส่งมอบ', 'warn'); return false;
    }
    if (!editing && (!Number.isFinite(Number(draft.budget)) || Number(draft.budget) < 0)) {
      step = 0; draw(); toast('กรุณาตรวจสอบงบประมาณ', 'warn'); return false;
    }
    return true;
  }
  function page() {
    const b = draft.brief;
    if (step === 0) return `<div class="form-grid">
      <div class="f-group"><label for="bwName">ชื่อโปรเจกต์ *</label><input id="bwName" maxlength="200" value="${esc(draft.name)}" placeholder="เช่น แคมเปญเปิดตัวสินค้า" ${editing?'disabled':''}></div>
      <div class="f-group"><label for="bwCode">รหัสโปรเจกต์</label><input id="bwCode" maxlength="4" value="${esc(draft.code)}" placeholder="เช่น MNG" ${editing?'disabled':''}></div>
      ${editing ? `<div class="pf-inline-note full">แก้ไขชื่อ งบประมาณ หรือวันที่ได้จากปุ่ม “แก้ไขโปรเจกต์” ในหน้าโปรเจกต์</div>` : `
      <div class="f-group"><label for="bwClient">ลูกค้า</label><select id="bwClient"><option value="Internal — MNG Groups" ${draft.clientName==='Internal — MNG Groups'?'selected':''}>Internal — MNG Groups</option>${Store.data.clients.map(c=>`<option value="${esc(c.name)}" ${c.name===draft.clientName?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="f-group"><label for="bwBudget">งบประมาณ (บาท)</label><input id="bwBudget" type="number" min="0" step="1000" value="${esc(draft.budget)}"></div>
      <div class="f-group"><label for="bwStart">วันที่เริ่ม *</label><input id="bwStart" type="date" value="${esc(draft.start)}"></div>
      <div class="f-group"><label for="bwEnd">กำหนดส่งมอบ *</label><input id="bwEnd" type="date" value="${esc(draft.end)}"></div>`}
      ${field('โปรเจกต์นี้ต้องการบรรลุอะไร?', 'bw-objective', b.objective, 'เช่น เปิดตัวเว็บไซต์และเพิ่มยอดคำขอใบเสนอราคา')}
      ${field('กลุ่มเป้าหมายหรือลูกค้าเป็นใคร?', 'bw-audience', b.audience, 'เช่น เจ้าของกิจการที่ต้องการช่องทางขายออนไลน์')}
      ${field('ต้องส่งมอบอะไรบ้าง?', 'bw-deliverables', b.deliverables, 'เช่น เว็บไซต์ คู่มือ และสื่อเปิดตัว')}
      ${field('วัดความสำเร็จอย่างไร?', 'bw-successMetric', b.successMetric, 'เช่น จำนวน Lead ที่มีคุณภาพ / เวลาตอบกลับ')}
      ${field('ข้อจำกัดหรือความเสี่ยงที่ต้องระวัง', 'bw-constraints', b.constraints, 'เช่น งบ เวลา การขออนุญาตเผยแพร่ข้อมูล')}
    </div>`;
    if (step === 1) return `<div class="pf-inline-note">คำตอบช่วยเติมบริบทให้ผังตั้งต้น สามารถแก้ไขแต่ละขั้นตอนได้ภายหลัง</div><div class="form-grid">
      ${field('จะสื่อสารหรือเผยแพร่ผ่านช่องทางใด?', 'bw-marketingChannels', b.marketingChannels, 'เช่น เว็บไซต์, Facebook, LINE OA, บทความ')}
      ${field('รับ Lead และขายอย่างไร?', 'bw-salesProcess', b.salesProcess, 'เช่น รับคำถาม → คัดกรอง → เสนอราคา → ติดตาม')}
      ${field('ผลิตหรือพัฒนางานอย่างไร?', 'bw-productionPlan', b.productionPlan, 'เช่น วางโครง สร้าง ทดสอบ และตรวจคุณภาพ')}
      ${field('ส่งมอบและให้ลูกค้ารับงานอย่างไร?', 'bw-deliveryPlan', b.deliveryPlan, 'เช่น ส่งลิงก์ คู่มือ และให้ลูกค้ายืนยัน')}
      ${field('ดูแลลูกค้าหลังส่งมอบอย่างไร?', 'bw-supportPlan', b.supportPlan, 'เช่น ช่องทางติดต่อ ผู้รับผิดชอบ และเวลาตอบกลับ')}
      ${field('ใครตรวจอนุมัติ และมีข้อควรระวังอะไร?', 'bw-approvalNotes', b.approvalNotes, 'เช่น ตรวจความถูกต้อง สิทธิ์สื่อ และขออนุญาตลูกค้า')}
    </div>`;
    if (step === 2) return `<div class="form-grid">
      <div class="f-group"><label for="bw-ownerId">หัวหน้า / ผู้ประสานงาน</label><select id="bw-ownerId">${optionPeople(b.ownerId)}</select></div>
      <div class="f-group"><label for="bw-approverId">ผู้ตรวจ / อนุมัติ</label><select id="bw-approverId">${optionPeople(b.approverId)}</select></div>
      <div class="f-group full"><label>สมาชิกทีมในโปรเจกต์</label><div class="pf-member-grid">${Store.data.team.map(u=>`<label class="pf-member-option"><input type="checkbox" data-bw-member value="${esc(u.id)}" ${b.members.includes(u.id)?'checked':''}><span><b>${esc(u.name)}</b><small>${esc(u.role || 'ทีมงาน')}</small></span></label>`).join('') || '<span class="pf-field-hint">ยังไม่มีสมาชิกทีม เพิ่มได้จากเมนูทีม</span>'}</div></div>
      ${flowCanEdit()?`<div class="f-group full"><button type="button" class="btn btn-sm" id="bwToggleMember">${IC.plus} เพิ่มสมาชิกทีมใหม่</button>
        <div class="bw-quick-add" id="bwMemberPanel" hidden><b>เพิ่มสมาชิกในรายชื่อทีมส่วนกลาง</b><div class="form-grid">
          <div class="f-group"><label for="bwNewMemberName">ชื่อ *</label><input id="bwNewMemberName" maxlength="100" placeholder="ชื่อผู้ร่วมงาน"></div>
          <div class="f-group"><label for="bwNewMemberRole">ตำแหน่ง</label><input id="bwNewMemberRole" maxlength="80" placeholder="เช่น Project Manager"></div>
          <div class="f-group full"><label for="bwNewMemberEmail">อีเมล (ไม่บังคับ)</label><input id="bwNewMemberEmail" type="email" maxlength="255" placeholder="name@example.com"></div></div>
          <small class="pf-field-hint">บันทึกเข้าทีมส่วนกลางทันที ไม่ได้สร้างบัญชีเข้าสู่ระบบ</small><button type="button" class="btn btn-primary btn-sm" id="bwSaveMember">บันทึกและเลือกสมาชิก</button></div></div>`:''}
      <div class="f-group"><label for="bw-aiAgentId">AI Agent ที่วางแผนใช้</label><select id="bw-aiAgentId">${optionAgents(b.aiAgentId)}</select></div>
      <div class="f-group"><label for="bw-aiModel">โมเดลที่วางแผนใช้</label><input id="bw-aiModel" list="bwModels" maxlength="120" value="${esc(b.aiModel)}" placeholder="เลือกหรือระบุชื่อโมเดล"><datalist id="bwModels">${[...new Set((Store.data.aiAgents || []).map(a=>a.model).filter(Boolean))].map(m=>`<option value="${esc(m)}"></option>`).join('')}</datalist><small class="pf-field-hint">เลือกรายการจาก Agent ในระบบ หรือระบุชื่อเอง</small></div>
      ${flowCanEdit()?`<div class="f-group full"><button type="button" class="btn btn-sm" id="bwToggleAgent">${IC.plus} เพิ่ม AI Agent ใหม่</button>
        <div class="bw-quick-add" id="bwAgentPanel" hidden><b>เพิ่ม Agent ใน AI Hub</b><div class="form-grid">
          <div class="f-group"><label for="bwNewAgentName">ชื่อ Agent *</label><input id="bwNewAgentName" maxlength="100" placeholder="เช่น ผู้ช่วยวางแผน"></div>
          <div class="f-group"><label for="bwNewAgentCode">รหัส Agent</label><input id="bwNewAgentCode" maxlength="16" placeholder="เช่น PLANNER"></div>
          <div class="f-group"><label for="bwNewAgentRole">บทบาท</label><input id="bwNewAgentRole" maxlength="120" placeholder="เช่น วิเคราะห์บรีฟ"></div>
          <div class="f-group"><label for="bwNewAgentModel">ชื่อโมเดล *</label><input id="bwNewAgentModel" list="bwModels" maxlength="80" placeholder="เลือกหรือระบุชื่อโมเดล"></div></div>
          <small class="pf-field-hint">บันทึกเข้ารายชื่อ AI Hub ทันที เป็นข้อมูลแผนเท่านั้น ยังไม่เชื่อมโมเดลจริง</small><button type="button" class="btn btn-primary btn-sm" id="bwSaveAgent">บันทึกและเลือก Agent</button></div></div>`:''}
      <div class="pf-inline-note full">การเลือก Agent และโมเดลเป็นข้อมูลแผนงานเท่านั้น ยังไม่ได้เชื่อมผู้ให้บริการ เรียกโมเดล หรือสั่ง AI ทำงานโดยอัตโนมัติ ห้ามใส่รหัสผ่านหรือ API Key ในบรีฟ</div>
    </div>`;
    const team = b.members.map(flowMemberName).join(', ') || 'ยังไม่กำหนด';
    return `<div class="bw-review">
      <div class="bw-review-hero"><span>✨ พร้อมเริ่มต้น</span><h3>${esc(draft.name || 'โปรเจกต์ใหม่')}</h3><p>${esc(b.objective || 'ยังไม่ได้ระบุเป้าหมาย')}</p></div>
      <div class="doc-step-grid">
        <div class="doc-step-box"><b>📣 สื่อ & การขาย</b><span>${esc(b.marketingChannels || 'ยังไม่ได้ระบุช่องทาง')} · ${esc(b.salesProcess || 'ยังไม่ได้ระบุแนวทางขาย')}</span></div>
        <div class="doc-step-box"><b>📦 ผลิต & ดูแลลูกค้า</b><span>${esc(b.deliverables || 'ยังไม่ได้ระบุสิ่งส่งมอบ')} · ${esc(b.supportPlan || 'ยังไม่ได้ระบุแผนดูแล')}</span></div>
        <div class="doc-step-box"><b>🤝 ทีมงาน</b><span>${esc(team)}</span></div>
        <div class="doc-step-box"><b>🤖 AI ที่วางแผนใช้</b><span>${esc(flowAgentName(b.aiAgentId))}${b.aiModel?' · '+esc(b.aiModel):''}</span></div>
      </div>
      <p class="pf-field-hint">ระบบสร้าง Mindmap และ Flow ตั้งต้น 4 โซนจากคำตอบ โดยไม่ส่งข้อมูลออกไปหรือเผยแพร่จริง</p>
      ${editing ? '<div class="pf-inline-note">ขั้นตอนและงานที่เชื่อมไว้จะไม่ถูกรีเซ็ต หากต้องการแก้ไขให้คลิกการ์ดในผัง</div>' : flowCanEdit() ? `<label class="pf-task-opt"><input id="bwCreateTasks" type="checkbox" ${draft.autoCreateTasks?'checked':''}><span><b>สร้างการ์ดงานจากขั้นตอนในผังด้วย</b><small>ไม่บังคับ · กำหนดส่งเริ่มต้นใช้วันส่งมอบโปรเจกต์ และปรับแต่ละงานได้ภายหลัง</small></span></label>` : '<div class="pf-inline-note">การสร้างงานจากผังต้องใช้สิทธิ์ Admin/Manager</div>'}
    </div>`;
  }
  function draw() {
    openModal(`${modalHead(editing ? `แก้ไขบรีฟ — ${esc(project.name)}` : 'สร้างโปรเจกต์ & บรีฟ', 'ตอบเท่าที่ทราบก่อน แล้วกลับมาเติมรายละเอียดได้เสมอ')}
      <div class="modal-body"><div class="bw-step-bar" aria-label="ขั้นตอนการตั้งค่า">${steps.map((label,i)=>`<button type="button" class="bw-step-pill ${i===step?'on':''}" data-bw-step="${i}">${i+1}. ${label}</button>`).join('')}</div>${page()}</div>
      <div class="modal-foot"><button class="btn btn-ghost" id="bwCancel">ยกเลิก</button>${step>0?'<button class="btn" id="bwBack">← ย้อนกลับ</button>':''}<button class="btn btn-primary" id="bwNext">${step===steps.length-1?(editing?'บันทึกบรีฟ':'สร้างโปรเจกต์ & ผัง'): 'ถัดไป →'}</button></div>`, { wide: true });
    $$('#modalRoot [data-bw-step]').forEach(btn => btn.onclick = () => { capture(); const target = Number(btn.dataset.bwStep); if (target > step && !validateBasics()) return; step = target; draw(); });
    $('#bwCancel').onclick = closeModal;
    if ($('#bwBack')) $('#bwBack').onclick = () => { capture(); step--; draw(); };
    const agentSelect = $('#bw-aiAgentId');
    if (agentSelect) agentSelect.onchange = () => {
      const agent = (Store.data.aiAgents || []).find(a => a.id === agentSelect.value);
      const model = $('#bw-aiModel');
      if (agent && model && (!model.value.trim() || model.value === draft.brief.aiModel)) model.value = agent.model || '';
    };
    if ($('#bwToggleMember')) $('#bwToggleMember').onclick = () => { $('#bwMemberPanel').hidden = !$('#bwMemberPanel').hidden; };
    if ($('#bwToggleAgent')) $('#bwToggleAgent').onclick = () => { $('#bwAgentPanel').hidden = !$('#bwAgentPanel').hidden; };
    if ($('#bwSaveMember')) $('#bwSaveMember').onclick = async () => {
      const name = $('#bwNewMemberName').value.trim(), role = $('#bwNewMemberRole').value.trim() || 'สมาชิกทีม';
      const emailEl = $('#bwNewMemberEmail'), email = emailEl.value.trim();
      if (!name) return toast('กรุณาระบุชื่อสมาชิกทีม', 'warn');
      if (email && !emailEl.checkValidity()) return toast('กรุณาตรวจสอบรูปแบบอีเมล', 'warn');
      const button = $('#bwSaveMember'); button.disabled = true;
      capture();
      try {
        const body = { name, role, email, color:'#6C5CE7', skills:[] };
        let id;
        if (Remote.on) {
          id = (await Remote.req('/teams', {method:'POST', body})).id;
          const refreshed = await refreshFlowData();
          if (!Remote.on) return; // session หมดระหว่างโหลดข้อมูล ไม่บันทึกข้อมูลจริงลงโหมดสาธิต
          if (!refreshed) Store.data.team.push({id, ...body, me:false, presence:'online'});
        } else {
          id = uid('u'); Store.data.team.push({id, ...body, me:false, presence:'online'}); Store.save();
        }
        if (!draft.brief.members.includes(id)) draft.brief.members.push(id);
        draw(); toast('เพิ่มสมาชิกในทีมส่วนกลางและเลือกเข้าโปรเจกต์แล้ว ✓');
      } catch (e) { button.disabled = false; toast('เพิ่มสมาชิกไม่สำเร็จ: '+esc(e.message), 'err'); }
    };
    if ($('#bwSaveAgent')) $('#bwSaveAgent').onclick = async () => {
      const name = $('#bwNewAgentName').value.trim(), role = $('#bwNewAgentRole').value.trim() || 'AI Specialist';
      const model = $('#bwNewAgentModel').value.trim();
      const code = ($('#bwNewAgentCode').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'') || name.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12) || ('AI'+Date.now().toString(36).toUpperCase())).slice(0,16);
      if (!name || !model) return toast('กรุณาระบุชื่อ Agent และชื่อโมเดล', 'warn');
      if ((Store.data.aiAgents || []).some(a => String(a.code).toUpperCase() === code)) return toast('รหัส Agent นี้มีอยู่แล้ว กรุณาใช้รหัสอื่น', 'warn');
      const button = $('#bwSaveAgent'); button.disabled = true;
      capture();
      try {
        const body = { name, code, role, model, color:'#6C5CE7', skills:[] };
        let id;
        if (Remote.on) {
          id = (await Remote.req('/ai/agents', {method:'POST', body})).id;
          const refreshed = await refreshFlowData();
          if (!Remote.on) return;
          if (!refreshed) Store.data.aiAgents.push({id, ...body, autonomy:85, paused:false, runs:0, successRate:0, tokensToday:0, prompt:''});
        } else {
          id = uid('ai'); Store.data.aiAgents.push({id, ...body, autonomy:85, paused:false, runs:0, successRate:0, tokensToday:0, prompt:''}); Store.save();
        }
        draft.brief.aiAgentId = id; draft.brief.aiModel = model;
        draw(); toast('เพิ่ม Agent ใน AI Hub และเลือกเข้าโปรเจกต์แล้ว ✓');
      } catch (e) { button.disabled = false; toast('เพิ่ม Agent ไม่สำเร็จ: '+esc(e.message), 'err'); }
    };
    $('#bwNext').onclick = async () => {
      capture();
      if (!validateBasics()) return;
      if (step < steps.length - 1) { step++; draw(); return; }
      draft.brief = ProjectPlan.normalizeBrief(draft.brief);
      [draft.brief.ownerId, draft.brief.approverId].filter(Boolean).forEach(id => {
        if (!draft.brief.members.includes(id)) draft.brief.members.push(id);
      });
      const button = $('#bwNext'); button.disabled = true; button.textContent = 'กำลังบันทึก…';
      try {
        if (editing) {
          const flow = flowCopy(existing);
          const old = ProjectPlan.normalizeBrief(flow.brief);
          const oldDefaults = new Map(ProjectPlan.build(project, old).nodes.map(n => [n.id, n]));
          const newDefaults = new Map(ProjectPlan.build(project, draft.brief).nodes.map(n => [n.id, n]));
          flow.brief = draft.brief;
          flow.nodes.forEach(n => {
            const before = oldDefaults.get(n.id), after = newDefaults.get(n.id);
            if (!before || !after) return; // ไม่แตะขั้นตอนที่เพิ่มเอง
            if ((n.desc || '') === before.desc) n.desc = after.desc;
            if ((n.assigneeId || '') === before.assigneeId) n.assigneeId = after.assigneeId;
            if (n.actorType === 'ai') {
              if ((n.aiAgentId || '') === before.aiAgentId) n.aiAgentId = after.aiAgentId;
              if ((n.model || '') === before.model) n.model = after.model;
            }
          });
          await persistProjectFlow(project.id, flow);
          closeModal(); App.route(); toast('บันทึกบรีฟและปรับ Mindmap แล้ว ✓');
          return;
        }
        const code = (draft.code.toUpperCase().replace(/[^A-Z0-9]/g, '') || draft.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'PRJ').slice(0, 4);
        const body = { name: draft.name, code, clientName: draft.clientName, budget: Number(draft.budget) || 0,
          start: draft.start, end: draft.end, desc: draft.brief.objective, members: draft.brief.members,
          flowData: ProjectPlan.build({ name: draft.name }, draft.brief), autoCreateTasks: draft.autoCreateTasks };
        let id, createdCount = 0;
        if (Remote.on) {
          const result = await Remote.req('/projects', { method: 'POST', body });
          id = result.id; createdCount = result.tasksCreated || 0;
          // ถ้า bootstrap ชั่วคราวล้มเหลว แสดงข้อมูลที่สร้างแล้วในหน้านี้โดยไม่สร้างซ้ำ
          const refreshed = await refreshFlowData();
          if (!refreshed) {
            Store.data.projects.push({ id, code, name: body.name, short: body.name.slice(0,16), client: body.clientName,
              clientName: body.clientName, grad:'g-blue', color:'#2F6BF0', status:'todo', progress:0, budget:body.budget,
              spent:0, start:body.start, end:body.end, owner:body.members[0] || '', members:body.members, desc:body.desc });
            Store.data.projectFlows[id] = result.flow;
          }
        } else {
          id = uid('p');
          const p = { id, code, name:body.name, short:body.name.slice(0,16), client:body.clientName, clientName:body.clientName,
            grad:'g-blue', color:'#2F6BF0', status:'todo', progress:0, budget:body.budget, spent:0,
            start:body.start, end:body.end, owner:body.members[0] || '', members:body.members, desc:body.desc };
          const flow = { ...body.flowData, projectId:id, revision:1 };
          if (body.autoCreateTasks) createdCount = localFlowTasks(p, flow).length;
          Store.data.projects.push(p); Store.data.projectFlows[id] = flow; Store.save();
        }
        closeModal(); goToProjectFlow(id);
        toast(`สร้างโปรเจกต์ บรีฟ และผังแล้ว${createdCount ? ` · ${createdCount} งาน` : ''} ✓`);
      } catch (e) {
        button.disabled = false; button.textContent = editing ? 'บันทึกบรีฟ' : 'สร้างโปรเจกต์ & ผัง';
        toast('บันทึกไม่สำเร็จ: ' + esc(e.message), 'err');
      }
    };
  }
  draw();
}

async function persistProjectFlow(projectId, flow) {
  if (!flowCanEdit()) throw new Error('เฉพาะ Admin/Manager เท่านั้นที่แก้ไขผังได้');
  if (!flowAvailable()) throw new Error('ตารางผังโปรเจกต์ยังไม่พร้อม');
  const project = flowProject(projectId);
  if (!project) throw new Error('ไม่พบโปรเจกต์');
  const next = flowCopy(flow);
  next.brief = ProjectPlan.normalizeBrief(next.brief);
  next.edges = ProjectPlan.makeEdges(next.nodes);
  next.mindmap = ProjectPlan.makeMindmap(project.name, next.brief, next.nodes);
  next.aiStack = ProjectPlan.makeAiStack(next.brief, next.nodes);
  next.revision = Number(flow.revision) || 0;
  let saved;
  if (Remote.on) saved = (await Remote.req('/projects/' + encodeURIComponent(projectId) + '/flow', { method: 'PUT', body: next })).flow;
  else saved = { ...next, projectId, revision: next.revision + 1 };
  Store.data.projectFlows[projectId] = saved;
  project.members = saved.brief.members.slice();
  if (!Remote.on) Store.save();
  return saved;
}

/* ---------- หน้าผังงาน / Mindmap ---------- */
function renderProjectFlow() {
  const view = $('#view'), side = $('#side');
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const requested = params.get('project') || Store.ui.flowProjectId;
  const project = flowProject(requested) || Store.data.projects[0];
  const canEdit = flowCanEdit() && flowAvailable();
  side.innerHTML = `<div class="side-block"><h3>เลือกโปรเจกต์</h3>
    <select id="pfProjectSelect" class="pf-side-select" aria-label="เลือกโปรเจกต์">
      ${Store.data.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===project?.id?'selected':''}>${esc(p.code || '')} · ${esc(p.name)}</option>`).join('') || '<option>ยังไม่มีโปรเจกต์</option>'}
    </select></div>
    <div class="side-block"><h3>PROJECT WORKSPACE</h3>
      <p class="pf-side-copy">เชื่อมบรีฟ ทีม คนทำงาน และ AI เข้ากับแผนตั้งแต่สื่อ การขาย ไปจนถึงการส่งมอบและดูแลลูกค้า</p></div>
    <div class="pf-side-tip"><b>💡 เริ่มจากบรีฟ</b><span>ตอบคำถามเท่าที่รู้ แล้วคลิกการ์ดในผังเพื่อกำหนดผู้รับผิดชอบหรือปรับขั้นตอน</span>
      <button type="button" data-act="nav:docs" class="btn btn-sm">${IC.book} เปิดคู่มือ</button></div>`;
  const selector = $('#pfProjectSelect');
  if (selector && project) selector.onchange = () => goToProjectFlow(selector.value);
  if (!project) {
    view.innerHTML = `<div class="pf-empty"><div class="pf-empty-icon">🧭</div><h2>ยังไม่มีโปรเจกต์</h2><p>สร้างโปรเจกต์แรก พร้อมตอบบรีฟเพื่อเริ่มต้น Mindmap และ Flow</p><button class="btn btn-primary" data-act="new-project">${IC.plus} สร้างโปรเจกต์</button></div>`;
    return;
  }
  Store.ui.flowProjectId = project.id;
  const saved = !!Store.data.projectFlows?.[project.id];
  const flow = previewProjectFlow(project);
  const mode = ['flow','mindmap','brief'].includes(Store.ui.projectFlowMode) ? Store.ui.projectFlowMode : 'flow';
  const allNodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const linked = allNodes.filter(n => n.taskId).length;
  const members = (flow.brief?.members || []).map(flowMemberName).join(', ');
  const editableBtns = canEdit ? `<button class="btn btn-sm" id="pfEditBrief">${IC.edit} ตั้งค่าบรีฟ</button>
        ${mode === 'flow' ? `<button class="btn btn-sm" id="pfAddNode">${IC.plus} เพิ่มขั้นตอน</button>
          <button class="btn btn-primary btn-sm" id="pfSyncTasks" ${!saved || linked===allNodes.length?'disabled':''}>${IC.task} สร้างงานจากผัง</button>` : ''}` : '';
  const statusHint = !flowAvailable()
    ? '<div class="pf-alert error">ยังโหลดข้อมูลผังจากฐานข้อมูลไม่ได้ กรุณาติดต่อผู้ดูแลระบบ — จะไม่บันทึกทับข้อมูลเดิม</div>'
    : !saved ? '<div class="pf-alert">ผังนี้เป็นตัวอย่างสำหรับโปรเจกต์เดิม ยังไม่บันทึก กด “ตั้งค่าบรีฟ” เพื่อเริ่มใช้งาน</div>' : '';
  view.innerHTML = `<div class="pf-page">
    <div class="pf-breadcrumb"><span>โปรเจกต์</span><span>/</span><b>${esc(project.name)}</b><span>/</span><span>Project Workspace</span></div>
    <select id="pfProjectSelectMobile" class="pf-side-select pf-mobile-project-select" aria-label="เลือกโปรเจกต์">${Store.data.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===project.id?'selected':''}>${esc(p.code || '')} · ${esc(p.name)}</option>`).join('')}</select>
    <header class="pf-head-card">
      <div class="pf-head-left"><div class="pf-proj-badge">${esc((project.code || 'PRJ').slice(0,4))}</div>
        <div class="pf-head-titles"><h2>${esc(project.name)} <span class="pf-status-pill">${saved?'ผังที่บันทึกแล้ว':'ผังตัวอย่าง'}</span></h2>
          <p>${esc(Store.clientOf(project)?.name || project.clientName || 'โปรเจกต์ภายใน')} · ${allNodes.length} ขั้นตอน · ${linked} งานที่เชื่อมแล้ว</p></div></div>
      <div class="pf-head-actions">${Remote.on?'<button class="btn btn-ghost btn-sm" id="pfReload" title="โหลดข้อมูลล่าสุด">↻ รีเฟรช</button>':''}${editableBtns}</div>
    </header>
    ${statusHint}
    <div class="pf-intro"><div><div class="pf-eyebrow">PROJECT BLUEPRINT <span>✦</span> จากไอเดียสู่ผลลัพธ์</div>
      <h3>${mode==='flow'?'มองเห็นทุกขั้นตอนในภาพเดียว':mode==='mindmap'?'Mindmap ของโปรเจกต์':'บรีฟ & การตั้งค่า'}</h3>
      <p>${mode==='flow'?'เชื่อมการตลาด การขาย การผลิต และการดูแลลูกค้าให้ทำงานไปในทิศทางเดียวกัน':mode==='mindmap'?'สรุปเป้าหมาย สิ่งส่งมอบ ทีม และโอกาสต่อยอดจากบรีฟของคุณ':'ข้อมูลตั้งต้นที่ช่วยให้ทุกคนเข้าใจเป้าหมายและบทบาทตรงกัน'}</p></div>
      <div class="pf-mode-tabs" role="tablist" aria-label="มุมมองโปรเจกต์">
        <button type="button" role="tab" aria-selected="${mode==='flow'}" class="pf-mode-tab ${mode==='flow'?'on':''}" data-pf-mode="flow">${IC.flow} Flow</button>
        <button type="button" role="tab" aria-selected="${mode==='mindmap'}" class="pf-mode-tab ${mode==='mindmap'?'on':''}" data-pf-mode="mindmap">✳ Mindmap</button>
        <button type="button" role="tab" aria-selected="${mode==='brief'}" class="pf-mode-tab ${mode==='brief'?'on':''}" data-pf-mode="brief">${IC.doc} บรีฟ</button>
      </div></div>
    ${mode==='flow' ? flowDiagram(flow) : mode==='mindmap' ? flowMindmap(project, flow) : flowBrief(project, flow, members)}
  </div>`;
  $$('[data-pf-mode]', view).forEach(btn => btn.onclick = () => { Store.ui.projectFlowMode = btn.dataset.pfMode; App.route(); });
  if ($('#pfEditBrief')) $('#pfEditBrief').onclick = () => openProjectWizard(project);
  if ($('#pfAddNode')) $('#pfAddNode').onclick = () => openFlowNodeEditor(project.id);
  if ($('#pfSyncTasks')) $('#pfSyncTasks').onclick = () => syncProjectFlowTasks(project.id);
  if ($('#pfReload')) $('#pfReload').onclick = async () => {
    const ok = await refreshFlowData();
    if (ok) { App.route(); toast('โหลดข้อมูลล่าสุดแล้ว'); }
    else toast('โหลดข้อมูลล่าสุดไม่สำเร็จ', 'err');
  };
  if (mode === 'flow') {
    $$('[data-pf-zone]', view).forEach(btn => btn.onclick = () => {
      Store.ui.flowZone = Store.ui.flowZone === btn.dataset.pfZone ? '' : btn.dataset.pfZone;
      App.route();
    });
    $$('[data-pf-node]', view).forEach(btn => btn.onclick = () => openFlowNodeEditor(project.id, btn.dataset.pfNode));
    wireFlowCanvas();
  }
}

function flowDiagram(flow) {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const zoneFilter = Store.ui.flowZone || '';
  const groups = ProjectPlan.ZONES.map(z => nodes.filter(n => n.zone === z.id));
  const maxRows = Math.max(1, ...groups.map(g => g.length));
  const laneWidth = 280, gap = 38, cardHeight = 132, rowHeight = 163;
  const stageWidth = 4 * (laneWidth + gap) + 30, stageHeight = 110 + maxRows * rowHeight + 50;
  const pos = {};
  const lanes = ProjectPlan.ZONES.map((z, col) => {
    const x = 24 + col * (laneWidth + gap);
    groups[col].forEach((n, row) => { pos[n.id] = { x:x+16, y:80+row*rowHeight, zone:col }; });
    return `<div class="pf-lane-box" style="left:${x}px;top:18px;width:${laneWidth}px;height:${stageHeight-44}px">
      <div class="pf-lane-head"><span>${z.icon} โซน ${col+1} · ${esc(z.title)}</span><span>${groups[col].length}</span></div></div>`;
  }).join('');
  const edges = ProjectPlan.makeEdges(nodes);
  const paths = edges.map(e => {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) return '';
    let d;
    if (e.kind === 'loop') {
      const bottom = stageHeight - 14;
      d = `M ${a.x+124} ${a.y+cardHeight} V ${bottom} H 8 V ${b.y+66} H ${b.x}`;
    } else if (e.kind === 'rework') {
      d = `M ${a.x} ${a.y+66} H ${a.x-12} V ${b.y+66} H ${b.x-5}`;
    } else if (a.zone === b.zone) {
      d = `M ${a.x+124} ${a.y+cardHeight} V ${b.y-5}`;
    } else {
      const midX = a.x + 266;
      d = `M ${a.x+248} ${a.y+66} H ${midX} V ${b.y-16} H ${b.x-10} V ${b.y+66} H ${b.x-5}`;
    }
    const isLoop = e.kind === 'loop' || e.kind === 'rework';
    return `<path class="${isLoop?'pf-edge-loop':'pf-edge-main'}" d="${d}" marker-end="url(#pfArrow${isLoop?'Loop':''})"/>`;
  }).join('');
  const edgeLabels = edges.filter(e => e.kind === 'rework').map(e => {
    const a = pos[e.from], b = pos[e.to];
    return a && b ? `<span class="pf-edge-pill is-loop" style="left:${a.x-12}px;top:${(a.y+b.y)/2+66}px">${esc(e.label)}</span>` : '';
  }).join('');
  const cards = nodes.map(n => {
    const p = pos[n.id]; if (!p) return '';
    const actor = FLOW_ACTORS[n.actorType] || FLOW_ACTORS.human;
    const task = n.taskId && Store.getTask(n.taskId);
    const person = n.assigneeId ? flowMemberName(n.assigneeId) : 'ยังไม่กำหนด';
    const ai = n.aiAgentId ? flowAgentName(n.aiAgentId) : '';
    return `<button type="button" class="pf-node ${zoneFilter && zoneFilter!==n.zone?'dimmed':''}" data-pf-node="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px;height:${cardHeight}px" aria-label="รายละเอียดขั้นตอน ${esc(n.title)}">
      <div class="pf-node-top"><span class="pf-node-ico">${esc(n.icon || '📌')}</span><span class="pf-actor-badge pf-actor-${actor[1]}">${actor[0]}</span></div>
      <div class="pf-node-title">${esc(n.title)}</div><div class="pf-node-desc">${esc(n.desc || 'คลิกเพื่อเพิ่มรายละเอียดและผู้รับผิดชอบ')}</div>
      <div class="pf-node-foot"><span class="pf-human-chip">${ai?'🤖 '+esc(ai):'👤 '+esc(person)}</span>${n.taskId?`<span class="pf-task-chip">${esc(n.taskCode || 'งาน')} ${task && task.status==='done'?'✓':''}</span>`:'<span class="pf-node-planned">แผนงาน</span>'}</div></button>`;
  }).join('');
  return `<div class="pf-zone-strip">${ProjectPlan.ZONES.map((z,i)=>`<button type="button" class="pf-zone-banner ${zoneFilter===z.id?'active':''}" data-pf-zone="${z.id}" style="--z-color:${z.color}">
      <span class="zb-top"><span class="zb-title">${z.icon} โซน ${i+1} · ${esc(z.title)}</span><span class="pf-zone-count">${groups[i].length}</span></span><span class="zb-sub">${esc(z.subtitle)}</span></button>`).join('')}</div>
    <div class="pf-canvas-shell"><div class="pf-viewport" id="pfViewport" tabindex="0" aria-label="ผังขั้นตอน ใช้ปุ่มซูมและลากเพื่อเลื่อน">
      <div class="pf-stage" id="pfStage" data-width="${stageWidth}" data-height="${stageHeight}" style="width:${stageWidth}px;height:${stageHeight}px">
        ${lanes}<svg class="pf-svg-layer" style="width:${stageWidth}px;height:${stageHeight}px" viewBox="0 0 ${stageWidth} ${stageHeight}" aria-hidden="true"><defs>
          <marker id="pfArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#7c6cf0"/></marker>
          <marker id="pfArrowLoop" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#f59e0b"/></marker>
        </defs>${paths}</svg>${edgeLabels}${cards}
        <span class="pf-edge-pill is-loop" style="left:${stageWidth/2}px;top:${stageHeight-14}px">Feedback · นำผลไปต่อยอด</span>
      </div></div>
      <div class="pf-zoom-bar"><button class="pf-zoom-btn" type="button" id="pfZoomOut" aria-label="ย่อ">−</button><span id="pfZoomLevel">100%</span><button class="pf-zoom-btn" type="button" id="pfZoomIn" aria-label="ขยาย">+</button><button class="pf-zoom-btn pf-fit" type="button" id="pfZoomFit" aria-label="พอดีหน้าจอ">พอดี</button></div>
      <div class="pf-canvas-hint">ลากเพื่อเลื่อน · เลื่อนเมาส์เพื่อซูม · คลิกการ์ดเพื่อดูรายละเอียด</div>
    </div>
    <div class="pf-legend-bar"><div class="pf-legend-items"><b>สัญลักษณ์</b>${Object.values(FLOW_ACTORS).map(a=>`<span class="pf-actor-badge pf-actor-${a[1]}">${a[0]}</span>`).join('')}</div>
      <div class="pf-legend-items"><span class="pf-line-sample"><i class="solid"></i> ขั้นตอนหลัก</span><span class="pf-line-sample"><i class="dashed"></i> Feedback / ต่อยอด</span></div></div>
    <p class="pf-disclaimer">ผังแสดงแผนและผู้รับผิดชอบ ไม่ได้เชื่อม Webhook ส่งข้อความ เผยแพร่สื่อ หรือเรียก AI อัตโนมัติ</p>`;
}

function wireFlowCanvas() {
  const viewport = $('#pfViewport'), stage = $('#pfStage');
  if (!viewport || !stage) return;
  const w = Number(stage.dataset.width), h = Number(stage.dataset.height);
  let scale = 1, x = 0, y = 0, drag = null;
  const apply = () => {
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    $('#pfZoomLevel').textContent = Math.round(scale * 100) + '%';
  };
  const fit = () => {
    const vw = viewport.clientWidth || 920, vh = viewport.clientHeight || 610;
    scale = Math.max(0.3, Math.min(1, (vw - 24) / w, (vh - 24) / h));
    x = Math.max(8, (vw - w * scale) / 2); y = 10; apply();
  };
  const zoom = (factor, cx, cy) => {
    const ns = Math.max(.3, Math.min(1.6, scale * factor));
    x = cx - (cx - x) * ns / scale; y = cy - (cy - y) * ns / scale; scale = ns; apply();
  };
  $('#pfZoomIn').onclick = () => zoom(1.2, (viewport.clientWidth || 920)/2, (viewport.clientHeight || 610)/2);
  $('#pfZoomOut').onclick = () => zoom(1/1.2, (viewport.clientWidth || 920)/2, (viewport.clientHeight || 610)/2);
  $('#pfZoomFit').onclick = fit;
  viewport.addEventListener('wheel', e => {
    e.preventDefault(); const r = viewport.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.1 : 1/1.1, e.clientX-r.left, e.clientY-r.top);
  }, { passive:false });
  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    drag = { x:e.clientX, y:e.clientY, baseX:x, baseY:y };
    viewport.classList.add('panning'); viewport.setPointerCapture?.(e.pointerId);
  });
  viewport.addEventListener('pointermove', e => { if (drag) { x=drag.baseX+e.clientX-drag.x; y=drag.baseY+e.clientY-drag.y; apply(); } });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => viewport.addEventListener(type, () => { drag=null; viewport.classList.remove('panning'); }));
  viewport.addEventListener('keydown', e => {
    if (e.target !== viewport) return;
    const d = 35;
    if (e.key === 'ArrowLeft') x += d; else if (e.key === 'ArrowRight') x -= d;
    else if (e.key === 'ArrowUp') y += d; else if (e.key === 'ArrowDown') y -= d;
    else if (e.key === '+' || e.key === '=') { zoom(1.2, viewport.clientWidth/2, viewport.clientHeight/2); e.preventDefault(); return; }
    else if (e.key === '-') { zoom(1/1.2, viewport.clientWidth/2, viewport.clientHeight/2); e.preventDefault(); return; }
    else return;
    e.preventDefault(); apply();
  });
  fit();
}

function flowMindmap(project, flow) {
  const map = ProjectPlan.makeMindmap(project.name, flow.brief, flow.nodes);
  return `<div class="mm-shell"><div class="mm-center-banner"><span class="pf-eyebrow">✳ PROJECT MINDMAP</span><h3>${esc(map.title)}</h3><p>${esc(map.objective)}</p></div>
    <div class="mm-grid">${map.branches.map(branch=>`<section class="mm-branch" style="--b-color:${branch.color}"><div class="mm-branch-hd"><b>${branch.icon} ${esc(branch.title)}</b><span>↗</span></div>
      <div class="mm-leaf-list">${branch.leaves.map(leaf=>`<div class="mm-leaf"><div><b>${esc(leaf.title)}</b><small>${esc(leaf.value)}</small></div></div>`).join('')}
      ${branch.id==='team'?`<div class="mm-leaf"><div><b>สมาชิก</b><small>${esc((flow.brief.members || []).map(flowMemberName).join(', ') || 'ยังไม่กำหนด')}</small></div></div>
        <div class="mm-leaf"><div><b>AI Agent</b><small>${esc(flowAgentName(flow.brief.aiAgentId))}</small></div></div>`:''}</div></section>`).join('')}</div></div>
    <p class="pf-disclaimer">Mindmap อัปเดตจากบรีฟและขั้นตอนที่บันทึกไว้โดยอัตโนมัติ</p>`;
}

function flowBrief(project, flow, members) {
  const b = ProjectPlan.normalizeBrief(flow.brief);
  const items = [
    ['🎯 เป้าหมาย',b.objective],['👥 กลุ่มเป้าหมาย',b.audience],['📦 สิ่งส่งมอบ',b.deliverables],['📈 ตัวชี้วัด',b.successMetric],
    ['⚠️ ข้อจำกัด',b.constraints],['📣 ช่องทางสื่อ',b.marketingChannels],['💼 การขาย',b.salesProcess],['🏭 การผลิต',b.productionPlan],
    ['🚚 การส่งมอบ',b.deliveryPlan],['🎧 การดูแลลูกค้า',b.supportPlan],['✅ เงื่อนไขอนุมัติ',b.approvalNotes],
    ['🤝 สมาชิก',members],['👤 ผู้ประสานงาน',flowMemberName(b.ownerId)],['🔎 ผู้อนุมัติ',flowMemberName(b.approverId)],
    ['🤖 AI Agent',flowAgentName(b.aiAgentId)],['✨ โมเดลที่วางแผนใช้',b.aiModel],
  ];
  return `<div class="pf-brief-grid">${items.map(([title,value])=>`<section class="pf-brief-card"><b>${title}</b><p>${value?esc(value).replace(/\n/g,'<br>'):'<span>ยังไม่ได้ระบุ</span>'}</p></section>`).join('')}</div>
    <div class="pf-inline-note" style="margin-top:14px">ทีมที่เข้าสู่ระบบสามารถอ่านบรีฟนี้ได้ อย่าใส่รหัสผ่าน API Key หรือข้อมูลส่วนบุคคลเกินความจำเป็น</div>`;
}

/* คลิกการ์ดเพื่อดู / แก้ขั้นตอน การเชื่อมงานเป็นการกระทำที่ผู้ใช้กดยืนยัน */
function openFlowNodeEditor(projectId, nodeId) {
  const project = flowProject(projectId); if (!project) return;
  const original = previewProjectFlow(project);
  const editing = !!nodeId;
  const found = original.nodes.find(n => n.id === nodeId);
  if (editing && !found) return toast('ไม่พบขั้นตอนนี้', 'warn');
  const canEdit = flowCanEdit() && flowAvailable();
  const node = found || { id:'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,7), zone:'z1', icon:'📌', title:'', desc:'', actorType:'human', assigneeId:'', aiAgentId:'', model:'', estHours:4, checklist:[] };
  const task = node.taskId ? Store.getTask(node.taskId) : null;
  const options = (list, selected, blank) => `<option value="">${blank}</option>` + list.map(x => `<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}${x.model?' · '+esc(x.model):''}</option>`).join('');
  const disabled = canEdit ? '' : 'disabled';
  openModal(`${modalHead(editing ? 'รายละเอียดขั้นตอนใน Flow' : 'เพิ่มขั้นตอนใน Flow', 'แก้ไขแผนงานและกำหนดผู้รับผิดชอบของขั้นตอนนี้')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group"><label for="fnTitle">ชื่อขั้นตอน *</label><input id="fnTitle" maxlength="200" value="${esc(node.title)}" placeholder="เช่น ตรวจสื่อก่อนเผยแพร่" ${disabled}></div>
      <div class="f-group"><label for="fnZone">โซน</label><select id="fnZone" ${disabled}>${ProjectPlan.ZONES.map((z,i)=>`<option value="${z.id}" ${z.id===node.zone?'selected':''}>${i+1} · ${esc(z.title)}</option>`).join('')}</select></div>
      <div class="f-group"><label for="fnActor">ประเภทขั้นตอน</label><select id="fnActor" ${disabled}>${Object.entries(FLOW_ACTORS).map(([key,val])=>`<option value="${key}" ${key===node.actorType?'selected':''}>${val[0]}</option>`).join('')}</select></div>
      <div class="f-group"><label for="fnIcon">สัญลักษณ์</label><input id="fnIcon" maxlength="16" value="${esc(node.icon || '📌')}" ${disabled}></div>
      <div class="f-group full"><label for="fnDesc">รายละเอียด / สิ่งที่ต้องทำ</label><textarea id="fnDesc" rows="3" maxlength="4000" ${disabled}>${esc(node.desc || '')}</textarea></div>
      <div class="f-group"><label for="fnAssignee">ผู้รับผิดชอบ (คน)</label><select id="fnAssignee" ${disabled}>${options(Store.data.team, node.assigneeId, 'ยังไม่กำหนด')}</select></div>
      <div class="f-group"><label for="fnAgent">AI Agent ที่วางแผนใช้</label><select id="fnAgent" ${disabled}>${options(Store.data.aiAgents || [], node.aiAgentId, 'ไม่เลือก AI Agent')}</select></div>
      <div class="f-group"><label for="fnModel">โมเดลที่วางแผนใช้</label><input id="fnModel" list="fnModels" maxlength="120" value="${esc(node.model || '')}" placeholder="เลือกหรือระบุชื่อโมเดล" ${disabled}><datalist id="fnModels">${[...new Set((Store.data.aiAgents || []).map(a=>a.model).filter(Boolean))].map(m=>`<option value="${esc(m)}"></option>`).join('')}</datalist></div>
      <div class="f-group"><label for="fnEst">เวลาประเมิน (ชั่วโมง)</label><input id="fnEst" type="number" min="0" max="9999" step="0.5" value="${esc(node.estHours ?? 4)}" ${disabled}></div>
      <div class="f-group full"><label for="fnChecklist">รายการตรวจสอบ (บรรทัดละข้อ)</label><textarea id="fnChecklist" rows="3" maxlength="9000" placeholder="เช่น ตรวจสิทธิ์ภาพ\nอนุมัติก่อนเผยแพร่" ${disabled}>${esc((node.checklist || []).join('\n'))}</textarea></div>
      <div class="pf-inline-note full">${node.taskId ? `เชื่อมกับงาน ${esc(node.taskCode || node.taskId)}${task ? ` · สถานะ ${esc(STATUS_META[task.status]?.label || task.status)}` : ' (งานอาจถูกเก็บเข้าคลัง)'}. การแก้ผังไม่เปลี่ยนงานที่สร้างไปแล้ว` : 'ยังไม่มีการ์ดงาน — สร้างได้หลังบันทึกขั้นตอน'}<br>การเลือก AI / อัตโนมัติเป็นแผน ไม่ได้สั่งรันหรือเชื่อมบริการจริง</div>
    </div></div><div class="modal-foot pf-node-modal-foot">
      ${editing && canEdit ? '<button class="btn btn-danger" id="fnDelete">ลบขั้นตอน</button><button class="btn btn-ghost" id="fnUp" title="เลื่อนขึ้นในโซน">↑</button><button class="btn btn-ghost" id="fnDown" title="เลื่อนลงในโซน">↓</button>' : ''}
      <span class="pf-flex-space"></span><button class="btn btn-ghost" id="fnClose">ปิด</button>
      ${task ? '<button class="btn" id="fnOpenTask">ดูงานที่เชื่อม</button>' : ''}
      ${editing && !node.taskId && canEdit ? '<button class="btn" id="fnCreateTask">บันทึกและสร้างงาน</button>' : ''}
      ${canEdit ? '<button class="btn btn-primary" id="fnSave">บันทึกขั้นตอน</button>' : ''}
    </div>`, { wide:true });
  $('#fnClose').onclick = closeModal;
  if ($('#fnOpenTask')) $('#fnOpenTask').onclick = () => { closeModal(); openTaskModal(node.taskId); };
  if (!canEdit) return;
  $('#fnAgent').onchange = () => {
    const agent = (Store.data.aiAgents || []).find(a => a.id === $('#fnAgent').value);
    const model = $('#fnModel');
    if (agent && (!model.value.trim() || model.value === (node.model || ''))) model.value = agent.model || '';
  };
  const readNode = () => {
    const title = $('#fnTitle').value.trim();
    if (!title) throw new Error('กรุณาระบุชื่อขั้นตอน');
    const checklist = $('#fnChecklist').value.split('\n').map(v=>v.trim()).filter(Boolean);
    if (checklist.length > 30 || checklist.some(v=>v.length>300)) throw new Error('รายการตรวจสอบไม่เกิน 30 ข้อ และข้อละ 300 ตัวอักษร');
    const est = Number($('#fnEst').value);
    if (!Number.isFinite(est) || est < 0 || est > 9999) throw new Error('เวลาประเมินไม่ถูกต้อง');
    return { ...node, title, zone:$('#fnZone').value, icon:$('#fnIcon').value.trim() || '📌',
      actorType:$('#fnActor').value, desc:$('#fnDesc').value.trim(), assigneeId:$('#fnAssignee').value,
      aiAgentId:$('#fnAgent').value, model:$('#fnModel').value.trim(), estHours:est, checklist };
  };
  async function saveNode(move) {
    const nextNode = readNode();
    const next = flowCopy(original);
    const index = next.nodes.findIndex(n=>n.id===nextNode.id);
    if (index < 0) {
      if (next.nodes.length >= 80) throw new Error('ผังมีได้ไม่เกิน 80 ขั้นตอน');
      next.nodes.push(nextNode);
    } else if (next.nodes[index].zone !== nextNode.zone) {
      next.nodes.splice(index, 1); next.nodes.push(nextNode);
    } else next.nodes[index] = nextNode;
    if (nextNode.assigneeId && !next.brief.members.includes(nextNode.assigneeId)) next.brief.members.push(nextNode.assigneeId);
    if (move) {
      const zoneIndices = next.nodes.map((n,i)=>n.zone===nextNode.zone?i:-1).filter(i=>i>=0);
      const ix = next.nodes.findIndex(n=>n.id===nextNode.id), inZone = zoneIndices.indexOf(ix);
      const other = zoneIndices[inZone + move];
      if (other !== undefined) [next.nodes[ix], next.nodes[other]] = [next.nodes[other], next.nodes[ix]];
    }
    await persistProjectFlow(projectId, next);
  }
  const handleSave = async (after, move=0) => {
    const buttons = $$('#modalRoot button'); buttons.forEach(b=>{ b.disabled = true; });
    try {
      await saveNode(move); closeModal(); App.route();
      if (after === 'create') syncProjectFlowTasks(projectId, node.id);
      else if (after === 'move') openFlowNodeEditor(projectId, node.id);
      else toast('บันทึกขั้นตอนแล้ว ✓');
    } catch (e) { buttons.forEach(b=>{ b.disabled = false; }); toast('บันทึกไม่สำเร็จ: '+esc(e.message), 'err'); }
  };
  $('#fnSave').onclick = () => handleSave();
  if ($('#fnCreateTask')) $('#fnCreateTask').onclick = () => handleSave('create');
  if ($('#fnUp')) $('#fnUp').onclick = () => handleSave('move', -1);
  if ($('#fnDown')) $('#fnDown').onclick = () => handleSave('move', 1);
  if ($('#fnDelete')) $('#fnDelete').onclick = () => {
    if (original.nodes.length <= 1) return toast('ผังต้องมีอย่างน้อยหนึ่งขั้นตอน', 'warn');
    confirmDlg('ลบขั้นตอนนี้ออกจากผัง?', 'การ์ดงานที่สร้างไว้แล้วจะยังอยู่ในบอร์ดงาน และจะไม่ถูกลบ', async () => {
      try {
        const next = flowCopy(original); next.nodes = next.nodes.filter(n=>n.id!==node.id);
        await persistProjectFlow(projectId, next); App.route(); toast('ลบขั้นตอนออกจากผังแล้ว');
      } catch (e) { toast('ลบไม่สำเร็จ: '+esc(e.message), 'err'); }
    }, 'ลบขั้นตอน');
  };
}

function syncProjectFlowTasks(projectId, nodeId) {
  const project = flowProject(projectId), flow = Store.data.projectFlows?.[projectId];
  if (!project || !flow) return toast('กรุณาบันทึกบรีฟและผังก่อนสร้างงาน', 'warn');
  if (!flowCanEdit()) return toast('เฉพาะ Admin/Manager เท่านั้นที่สร้างงานจากผังได้', 'warn');
  const eligible = flow.nodes.filter(n=>!n.taskId && (!nodeId || n.id===nodeId));
  if (!eligible.length) return toast('ขั้นตอนที่เลือกมีงานเชื่อมอยู่แล้ว', 'warn');
  openModal(`${modalHead('สร้างงานจากผัง', 'สร้างการ์ดงานในโปรเจกต์เฉพาะขั้นตอนที่ยังไม่มีงานเชื่อม')}
    <div class="modal-body"><p>จะสร้าง <b>${eligible.length} งาน</b> ในโปรเจกต์ <b>${esc(project.name)}</b></p>
      <p class="pf-field-hint" style="margin-top:10px">งานใหม่เริ่มต้นที่สถานะ “ยังไม่เริ่ม” และใช้วันส่งมอบโปรเจกต์เป็นกำหนดส่ง ปรับผู้รับผิดชอบและวันที่แต่ละงานได้ในบอร์ดงาน การสร้างงานไม่ได้สั่ง AI หรือเผยแพร่สื่อ</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" id="pfSyncCancel">ยกเลิก</button><button class="btn btn-primary" id="pfSyncConfirm">สร้าง ${eligible.length} งาน</button></div>`);
  $('#pfSyncCancel').onclick = closeModal;
  $('#pfSyncConfirm').onclick = async () => {
    const btn = $('#pfSyncConfirm'); btn.disabled=true;
    try {
      let count;
      if (Remote.on) {
        const out = await Remote.req('/projects/'+encodeURIComponent(projectId)+'/flow/sync-tasks', { method:'POST', body:{ nodeId:nodeId || null, revision:flow.revision } });
        count = out.createdCount; Store.data.projectFlows[projectId] = out.flow;
        const ok = await refreshFlowData();
        if (!ok) toast('สร้างงานแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดรีเฟรช', 'warn');
      } else {
        const next = flowCopy(flow); count = localFlowTasks(project, next, nodeId).length;
        next.revision = (Number(next.revision) || 0) + (count ? 1 : 0);
        Store.data.projectFlows[projectId] = next; Store.save();
      }
      closeModal(); App.route(); toast(count ? `สร้างงาน ${count} รายการแล้ว ✓` : 'ไม่มีงานใหม่ที่ต้องสร้าง');
    } catch (e) { btn.disabled=false; toast('สร้างงานไม่สำเร็จ: '+esc(e.message), 'err'); }
  };
}

/* ---------- คู่มือสำเร็จรูปและคลังความรู้ของทีม ---------- */
const BUILTIN_GUIDES = [
  { id:'guide-start', icon:'🚀', category:'เริ่มต้นใช้งาน', title:'เริ่มต้นใช้งาน MNG ERP', summary:'ทำความรู้จักโปรเจกต์ งาน ทีม และพื้นที่คู่มือในภาพรวม', body:`# ยินดีต้อนรับสู่ MNG ERP
เริ่มจากเป้าหมายของลูกค้า แล้วเชื่อมคน งาน และข้อมูลให้ทีมมองเห็นภาพเดียวกัน
## เริ่มต้นใน 5 ขั้นตอน
1. ตรวจสอบรายชื่อลูกค้าและทีมงานในเมนู ลูกค้า และ ทีม
2. กด โปรเจกต์ → เพิ่มโปรเจกต์ แล้วตอบคำถามในบรีฟ
3. เปิด Mindmap เพื่อทบทวนเป้าหมายและสิ่งส่งมอบ จากนั้นเปิด Flow เพื่อกำหนดผู้รับผิดชอบ
4. หากต้องการติดตามงานในบอร์ด ให้กด สร้างงานจากผัง และปรับกำหนดส่งของแต่ละงาน
5. บันทึกวิธีทำงานและบทเรียนในเมนู คู่มือ เพื่อให้ทีมใช้ต่อได้
## ข้อมูลจริงและสิทธิ์
ข้อมูลที่บันทึกขณะเชื่อมต่อ MariaDB จะมองเห็นร่วมกันในองค์กร เมื่อระบบไม่เชื่อมฐานข้อมูล หน้าสาธิตเก็บข้อมูลเฉพาะเบราว์เซอร์และไม่ใช่ข้อมูลจริง
Admin, Manager และ Super Admin แก้โครงสร้างโปรเจกต์และสร้างงานจากผังได้ ผู้ใช้อื่นดูได้ โปรดตรวจสอบสิทธิ์กับผู้ดูแล` },
  { id:'guide-flow', icon:'🧭', category:'โปรเจกต์', title:'สร้างบรีฟ, Mindmap และ Project Flow', summary:'ตั้งคำถามให้ครบ วาง 4 โซน ปรับขั้นตอน และเชื่อมบอร์ดงาน', body:`# จากบรีฟสู่แผนงาน
เมื่อสร้างโปรเจกต์ ระบบสร้างบรีฟ Mindmap และ Flow ตั้งต้นจากแม่แบบ โดยไม่เรียก AI หรือส่งข้อมูลออกภายนอก
## 1. ตอบคำถามในบรีฟ
ระบุเป้าหมาย กลุ่มลูกค้า สิ่งส่งมอบ ตัวชี้วัด ความเสี่ยง ช่องทางสื่อ แนวทางขาย ผลิต ส่งมอบ และดูแลหลังการขาย หากยังไม่ทราบสามารถเว้นว่างและกลับมาแก้ไขได้
## 2. กำหนดทีมและ AI
เลือกสมาชิก ผู้ประสานงาน ผู้อนุมัติ AI Agent และชื่อโมเดลที่วางแผนใช้ การเลือกนี้เป็นข้อมูลประกอบแผน ไม่ได้เรียกโมเดลจริง
## 3. สำรวจ Mindmap และ Flow
Mindmap สรุปคำตอบเป็นหมวดหมู่ Flow แบ่งเป็น Marketing & Media, Lead & Sales, Production & Delivery และ Customer Success เส้นประแสดงการนำ Feedback กลับมาต่อยอด
ลากพื้นที่ว่างเพื่อเลื่อนผัง ใช้ปุ่มบวก/ลบหรือล้อเมาส์เพื่อซูม คลิกการ์ดเพื่อดูหรือแก้ชื่อ รายละเอียด ผู้รับผิดชอบ AI และรายการตรวจสอบ เพิ่ม ลบ หรือเลื่อนขั้นตอนภายในโซนได้
## 4. สร้างงานเมื่อพร้อม
กด สร้างงานจากผัง เพื่อสร้างงานเฉพาะขั้นตอนที่ยังไม่มีงานเชื่อม หรือสร้างจากการ์ดทีละขั้นตอน งานใหม่ใช้วันส่งมอบโปรเจกต์เป็นกำหนดส่งเริ่มต้น ควรเปิดบอร์ดงานเพื่อตั้งวันจริงและตรวจผู้รับผิดชอบ
การกดซ้ำไม่สร้างงานซ้ำสำหรับขั้นตอนเดิม การแก้หรือลบขั้นตอนภายหลังไม่แก้หรือลบการ์ดงานที่สร้างไปแล้ว
## โปรเจกต์เดิม
เปิดเมนู ผังงาน เลือกโปรเจกต์ แล้วกด ตั้งค่าบรีฟ เพื่อบันทึกผังตั้งต้น โปรเจกต์เดิมจะไม่ถูกแก้โดยอัตโนมัติ` },
  { id:'guide-team-ai', icon:'🤝', category:'ทีม & AI', title:'ประสานงานคนและ AI อย่างปลอดภัย', summary:'เลือกผู้รับผิดชอบ ผู้อนุมัติ Agent และโมเดล พร้อมตั้งขอบเขต', body:`# ทีมและ AI ทำงานร่วมกัน
เลือกสมาชิกจากข้อมูลจริงในเมนู ทีม และเลือก Agent ที่มีใน AI Hub จากนั้นระบุผู้รับผิดชอบและผู้อนุมัติในบรีฟหรือในการ์ดแต่ละขั้นตอน
ผู้ดูแล/Manager สามารถเพิ่มสมาชิกหรือ Agent จากขั้นตอน ทีม & AI ในบรีฟได้ รายการจะบันทึกเข้าองค์กรทันทีแม้ยกเลิกบรีฟ การเพิ่มสมาชิกไม่สร้างบัญชีล็อกอิน และการเพิ่ม Agent ไม่เชื่อมผู้ให้บริการ AI
## สิ่งที่ควรตกลงก่อนเริ่ม
- กำหนดขอบเขตงาน อินพุต ผลลัพธ์ที่ต้องการ และผู้รับผิดชอบ
- ระบุผู้ตรวจความถูกต้อง ข้อเท็จจริง สิทธิ์สื่อ และข้อมูลลูกค้าก่อนเผยแพร่
- เลือกชื่อโมเดลที่ทีมตั้งใจใช้ และตรวจสอบสิทธิ์ ค่าใช้จ่าย และนโยบายข้อมูลกับผู้ให้บริการแยกต่างหาก
## ข้อจำกัดสำคัญ
การบันทึก Agent หรือโมเดลในบรีฟเป็นเพียงการวางแผน ระบบไม่ได้เชื่อมผู้ให้บริการ เรียกโมเดล หรือเริ่มงานอัตโนมัติจากผังนี้
อย่าใส่รหัสผ่าน API Key Token หรือข้อมูลลูกค้าที่ไม่จำเป็นลงในบรีฟและคู่มือ` },
  { id:'guide-growth', icon:'📣', category:'สื่อ & การขาย', title:'สื่อ การขาย และการส่งมอบ', summary:'ใช้ Flow วางแผนตั้งแต่สร้างความสนใจจนส่งมอบอย่างมีคุณภาพ', body:`# วางเส้นทางตั้งแต่การตลาดถึงส่งมอบ
## Marketing & Media
กำหนดกลุ่มเป้าหมาย เนื้อหา ช่องทาง ตัวชี้วัด และผู้อนุมัติ ตรวจข้อเท็จจริงและสิทธิ์ก่อนเผยแพร่
## Lead & Sales
กำหนดช่องทางรับข้อมูลผู้สนใจ การคัดกรอง ผู้รับผิดชอบ ใบเสนอราคา และรอบติดตาม ใช้ข้อมูลส่วนบุคคลเท่าที่จำเป็นและตามนโยบายองค์กร
## Production & Delivery
แตกงานตามขอบเขต ระบุผู้ทำ กำหนดส่ง เกณฑ์ QC และวิธีรับมอบ หาก QC ไม่ผ่านให้บันทึกงานแก้ไขในบอร์ดงาน
## ระบบภายนอก
ผังเป็นแผนงานเท่านั้น ยังไม่ได้เชื่อมโฆษณา LINE OA ระบบ CRM อีเมล หรือการเผยแพร่จริง ต้องติดตั้งและทดสอบการเชื่อมต่อแยกก่อนใช้งาน` },
  { id:'guide-support', icon:'💚', category:'ดูแลลูกค้า', title:'ดูแลลูกค้าและนำ Feedback ไปต่อยอด', summary:'กำหนดช่องทางรับเรื่อง ผู้รับผิดชอบ และการติดตามผลหลังส่งมอบ', body:`# Customer Success
## ก่อนส่งมอบ
ตกลงผู้รับมอบ คู่มือ การอบรม ช่องทางติดต่อ และวิธียืนยันว่าลูกค้ารับงานเรียบร้อย
## หลังส่งมอบ
- ระบุช่องทางรับเรื่อง ผู้รับผิดชอบ และเวลาตอบกลับที่ทีมตกลงกัน
- บันทึกปัญหาในงานของโปรเจกต์ กำหนดความสำคัญ และแจ้งผลให้ลูกค้าทราบ
- ติดตามตัวชี้วัด เก็บ Feedback และนำบทเรียนไปปรับการผลิตหรือข้อเสนอถัดไป
- ขออนุญาตลูกค้าก่อนนำข้อมูล ผลงาน หรือรีวิวไปเผยแพร่
## ข้อควรทราบ
Flow ช่วยวางแผน แต่ยังไม่ใช่ระบบ Ticket หรือระบบส่งข้อความอัตโนมัติ ให้ทีมติดตามและตอบลูกค้าผ่านช่องทางที่องค์กรใช้งานจริง` },
  { id:'guide-api', icon:'🔌', category:'API & Hermes', title:'เชื่อมต่อ API และ Hermes', summary:'แนวทางใช้บัญชีของตัวเอง อ่านคู่มือ API และเก็บข้อมูลยืนยันตัวตนอย่างปลอดภัย', body:`# API & Hermes
ผู้ใช้งานหรือ Agent ต้องมีบัญชีของตัวเองและเข้าสู่ระบบก่อนเรียก API ที่มีข้อมูล ERP
## เริ่มต้น
1. ให้ผู้ดูแลสร้างบัญชีตามสิทธิ์ที่เหมาะสม
2. อ่านคู่มือ REST API และ Hermes Skill จากลิงก์ด้านล่างของหน้านี้
3. เก็บรหัสผ่านและ Token ในตัวจัดการความลับของสภาพแวดล้อม อย่าใส่ในคู่มือ บรีฟ หรือ Git
4. ทดสอบในสภาพแวดล้อมที่ได้รับอนุญาตก่อนใช้งานจริง
## Project Flow API
GET /api/projects/:id/flow ใช้อ่านผัง และ PUT ใช้บันทึกโดยส่ง revision ล่าสุด ผู้ใช้ระดับ Admin/Manager สร้างงานที่ยังไม่เชื่อมได้ผ่าน POST /api/projects/:id/flow/sync-tasks
การเลือกโมเดลในผังไม่เท่ากับการเชื่อมต่อผู้ให้บริการ AI` },
];

function guideMarkdown(text) {
  // แสดง Markdown แบบจำกัดและ escape HTML เสมอ เพื่อไม่ให้เนื้อหาคู่มือรันสคริปต์
  const lines = String(text || '').replace(/\r/g,'').split('\n');
  let html = '', list = '';
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const close = () => { if (list) { html += `</${list}>`; list = ''; } };
  lines.forEach(line => {
    const l = line.trim();
    if (!l) { close(); return; }
    const heading = l.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { close(); const tag = heading[1].length===1 ? 'h2' : 'h3'; html += `<${tag}>${inline(heading[2])}</${tag}>`; return; }
    const bullet = l.match(/^[-*]\s+(.+)$/), numbered = l.match(/^\d+\.\s+(.+)$/);
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (list !== tag) { close(); html += `<${tag}>`; list = tag; }
      html += `<li>${inline((bullet || numbered)[1])}</li>`; return;
    }
    close(); html += `<p>${inline(l)}</p>`;
  });
  close(); return html;
}

function allGuides() {
  return [...BUILTIN_GUIDES.map(d=>({ ...d, builtin:true })), ...(Store.data.customDocs || []).map(d=>({ ...d, builtin:false }))];
}

function renderDocs() {
  const view = $('#view'), side = $('#side');
  const docs = allGuides();
  const selected = docs.find(d => d.id === Store.ui.selectedGuide);
  const query = Store.ui.docQuery || '';
  const listButtons = docs.map(d=>`<button type="button" class="doc-side-link ${selected?.id===d.id?'on':''}" data-guide-open="${esc(d.id)}" data-doc-search="${esc((d.title+' '+d.summary+' '+d.category).toLowerCase())}"><span>${esc(d.icon)}</span><span>${esc(d.title)}</span></button>`).join('');
  side.innerHTML = `<div class="side-block"><h3>ค้นหาคู่มือ</h3><div class="side-search">${IC.search}<input id="docsSearch" type="search" value="${esc(query)}" placeholder="ค้นหาหัวข้อหรือคำสำคัญ…" aria-label="ค้นหาคู่มือ"></div></div>
    <div class="side-block"><h3>คลังความรู้</h3><button type="button" class="doc-side-link ${!selected?'on':''}" id="docsHome"><span>📚</span><span>คู่มือทั้งหมด</span></button><div class="doc-side-list">${listButtons}</div></div>
    <div class="pf-side-tip"><b>✍️ แบ่งปันความรู้</b><span>เขียน SOP หรือวิธีทำงานให้ทีมใช้ต่อร่วมกัน หลีกเลี่ยงรหัสผ่านและข้อมูลลับ</span><button class="btn btn-sm" id="docsNewSide">${IC.plus} เพิ่มคู่มือ</button></div>`;
  const status = !docsAvailable() ? '<div class="pf-alert error">ยังโหลดคู่มือของทีมจากฐานข้อมูลไม่ได้ กรุณาติดต่อผู้ดูแลระบบ คู่มือสำเร็จรูปยังอ่านได้</div>' : '';
  if (!selected) {
    view.innerHTML = `<div class="docs-wrap"><div class="doc-hero"><div><div class="pf-eyebrow">MNG KNOWLEDGE HUB <span>✦</span></div><h2>ความรู้ที่ช่วยให้ทุกโปรเจกต์ไปต่อได้</h2><p>คู่มือการใช้งาน แนวทางทำงาน และบทเรียนของทีม<br>จากบรีฟแรกไปจนถึงการดูแลลูกค้าหลังส่งมอบ</p></div><button class="btn btn-primary" id="docsNew">${IC.plus} เขียนคู่มือทีม</button></div>${status}
      <div class="side-search doc-mobile-search">${IC.search}<input id="docsSearchMobile" type="search" value="${esc(query)}" placeholder="ค้นหาคู่มือ…" aria-label="ค้นหาคู่มือ"></div>
      <div class="doc-section-heading"><div><h3>สำรวจคู่มือ</h3><p>เลือกหัวข้อเพื่อเริ่มต้น หรือต่อยอดเป็น SOP ของทีม</p></div><span>${docs.length} บทความ</span></div>
      <div class="docs-card-grid">${docs.map((d,i)=>`<button type="button" class="docs-card" data-guide-open="${esc(d.id)}" data-doc-search="${esc((d.title+' '+d.summary+' '+d.category).toLowerCase())}">
        <span class="docs-card-icon docs-tone-${i%4}">${esc(d.icon)}</span><span class="docs-card-category">${esc(d.category)} ${d.builtin?'· คู่มือระบบ':'· คู่มือทีม'}</span><b>${esc(d.title)}</b><span class="docs-card-summary">${esc(d.summary || 'เปิดอ่านเนื้อหาคู่มือ')}</span><span class="docs-card-more">อ่านคู่มือ <span>↗</span></span></button>`).join('')}</div>
      <div class="doc-callout">🔐 คู่มือของทีมมองเห็นได้โดยผู้ใช้ที่เข้าสู่ระบบทุกคน กรุณาไม่บันทึกรหัสผ่าน Token หรือ API Key</div></div>`;
  } else {
    const project = selected.projectId ? flowProject(selected.projectId) : null;
    view.innerHTML = `<div class="docs-wrap"><div class="doc-article-toolbar"><button class="btn btn-ghost btn-sm" id="docsBack">← คู่มือทั้งหมด</button>
      <div>${!selected.builtin && docsAvailable()?`<button class="btn btn-sm" id="docsEdit">${IC.edit} แก้ไข</button> ${flowCanEdit()?`<button class="btn btn-danger btn-sm" id="docsDelete">${IC.trash} ลบ</button>`:''}`:''}</div></div>${status}
      <header class="doc-title-block"><div class="docs-card-icon docs-tone-0">${esc(selected.icon)}</div><div><div class="pf-eyebrow">${esc(selected.category)} · ${selected.builtin?'คู่มือระบบ':'คู่มือทีม'}</div><h2>${esc(selected.title)}</h2><p>${esc(selected.summary || '')}${project?' · '+esc(project.name):''}</p></div></header>
      <article class="doc-article-card">${guideMarkdown(selected.body)}
      ${selected.id==='guide-api'?`<div class="doc-callout">📘 <a href="/api/hermes/manual.md" target="_blank" rel="noopener noreferrer">เปิดคู่มือ REST API ฉบับเต็ม</a> · <a href="/api/hermes/skill.md" target="_blank" rel="noopener noreferrer">เปิด Hermes SKILL.md</a></div>`:''}</article></div>`;
    $('#docsBack').onclick = () => { Store.ui.selectedGuide = null; App.route(); };
    if ($('#docsEdit')) $('#docsEdit').onclick = () => openGuideEditor(selected);
    if ($('#docsDelete')) $('#docsDelete').onclick = () => deleteGuide(selected);
  }
  const applySearch = (value) => {
    const q = String(value ?? Store.ui.docQuery ?? '').trim().toLowerCase(); Store.ui.docQuery = q;
    if ($('#docsSearch') && $('#docsSearch').value !== q) $('#docsSearch').value = q;
    if ($('#docsSearchMobile') && $('#docsSearchMobile').value !== q) $('#docsSearchMobile').value = q;
    $$('[data-doc-search]', side).concat($$('[data-doc-search]', view)).forEach(el=>{ el.hidden = !!q && !el.dataset.docSearch.includes(q); });
  };
  $('#docsSearch').oninput = e => applySearch(e.target.value);
  if ($('#docsSearchMobile')) $('#docsSearchMobile').oninput = e => applySearch(e.target.value);
  applySearch();
  $$('[data-guide-open]', side).concat($$('[data-guide-open]', view)).forEach(btn=>btn.onclick=()=>{ Store.ui.selectedGuide=btn.dataset.guideOpen; App.route(); });
  $('#docsHome').onclick = () => { Store.ui.selectedGuide=null; App.route(); };
  $('#docsNewSide').onclick = () => openGuideEditor();
  if ($('#docsNew')) $('#docsNew').onclick = () => openGuideEditor();
}

function openGuideEditor(guide) {
  if (!docsAvailable()) return toast('ตารางคู่มือยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ', 'err');
  const editing = !!guide; guide = guide || {};
  const categories = ['คู่มือทีม','โปรเจกต์','ทีม & AI','สื่อ & การขาย','ดูแลลูกค้า','API & Hermes'];
  openModal(`${modalHead(editing?'แก้ไขคู่มือทีม':'เพิ่มคู่มือ / SOP', 'เนื้อหาจะมองเห็นได้โดยผู้ใช้ที่เข้าสู่ระบบทุกคน')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group"><label for="dgTitle">ชื่อคู่มือ *</label><input id="dgTitle" maxlength="240" value="${esc(guide.title || '')}" placeholder="เช่น วิธีรับบรีฟลูกค้า"></div>
      <div class="f-group"><label for="dgCategory">หมวดหมู่</label><select id="dgCategory">${categories.map(c=>`<option ${c===guide.category?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="f-group full"><label for="dgSummary">คำอธิบายสั้น</label><input id="dgSummary" maxlength="400" value="${esc(guide.summary || '')}" placeholder="คู่มือนี้ช่วยเรื่องอะไร"></div>
      <div class="f-group full"><label for="dgProject">เชื่อมกับโปรเจกต์ (ถ้ามี)</label><select id="dgProject"><option value="">คู่มือส่วนกลาง</option>${Store.data.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===guide.projectId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="f-group full"><label for="dgBody">เนื้อหา *</label><textarea id="dgBody" rows="12" maxlength="50000" placeholder="# หัวข้อ\n## ขั้นตอน\n- รายละเอียดแต่ละขั้นตอน">${esc(guide.body || '')}</textarea><small class="pf-field-hint">รองรับหัวข้อ #, ##, รายการ - และลำดับเลข ข้อความ HTML จะไม่ถูกรัน</small></div>
      <div class="pf-inline-note full">อย่าใส่รหัสผ่าน Token API Key หรือข้อมูลลูกค้าที่ไม่จำเป็นในคู่มือ</div>
    </div></div><div class="modal-foot"><button class="btn btn-ghost" id="dgCancel">ยกเลิก</button><button class="btn btn-primary" id="dgSave">บันทึกคู่มือ</button></div>`, { wide:true });
  $('#dgCancel').onclick = closeModal;
  $('#dgSave').onclick = async () => {
    const body = { title:$('#dgTitle').value.trim(), category:$('#dgCategory').value, summary:$('#dgSummary').value.trim(),
      projectId:$('#dgProject').value || null, body:$('#dgBody').value, icon:guide.icon || '📘', pinned:!!guide.pinned };
    if (!body.title || !body.body.trim()) return toast('กรุณาระบุชื่อและเนื้อหาคู่มือ', 'warn');
    const btn=$('#dgSave'); btn.disabled=true;
    try {
      let id = guide.id;
      if (Remote.on) {
        const out = await Remote.req(editing ? '/docs/'+encodeURIComponent(id) : '/docs', { method:editing?'PATCH':'POST', body });
        id = out.id || id;
        try { Store.data.customDocs = (await Remote.req('/docs')).docs; }
        catch {
          const fallback = { ...guide, ...body, id, authorName:Remote.user?.name || '' };
          Store.data.customDocs = Store.data.customDocs.filter(d=>d.id!==id).concat(fallback);
          toast('บันทึกแล้ว แต่โหลดรายการคู่มือล่าสุดไม่สำเร็จ', 'warn');
        }
      } else {
        id = id || uid('doc');
        Store.data.customDocs = Store.data.customDocs.filter(d=>d.id!==id).concat({ ...guide, ...body, id, authorName:Store.data.user?.name || 'ทีมงาน' });
      }
      if (!Remote.on) Store.save();
      Store.ui.selectedGuide=id; Store.ui.docQuery=''; closeModal(); App.route(); toast('บันทึกคู่มือแล้ว ✓');
    } catch (e) { btn.disabled=false; toast('บันทึกไม่สำเร็จ: '+esc(e.message), 'err'); }
  };
}

function deleteGuide(guide) {
  if (!flowCanEdit()) return toast('เฉพาะ Admin/Manager เท่านั้นที่ลบคู่มือได้', 'warn');
  confirmDlg('ลบคู่มือของทีม?', `ลบ “${esc(guide.title)}” ออกจากคลังความรู้ การลบนี้ไม่สามารถย้อนกลับได้`, async () => {
    try {
      if (Remote.on) await Remote.req('/docs/'+encodeURIComponent(guide.id), { method:'DELETE' });
      Store.data.customDocs = Store.data.customDocs.filter(d=>d.id!==guide.id);
      if (!Remote.on) Store.save();
      Store.ui.selectedGuide=null; App.route(); toast('ลบคู่มือแล้ว');
    } catch (e) { toast('ลบไม่สำเร็จ: '+esc(e.message), 'err'); }
  }, 'ลบคู่มือ');
}
