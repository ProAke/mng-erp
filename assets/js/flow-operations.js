/* ติดตามงานจริงและส่งออกผ่านขั้นตรวจ/อนุมัติของ Project Flow */
'use strict';
const FLOW_ACTION_KINDS = { media:'📣 สื่อ / เผยแพร่', sales:'💼 Lead / ฝ่ายขาย', support:'💚 ดูแลลูกค้า' };
const FLOW_ACTION_STATES = {
  draft:['ร่าง','draft'], generating:['กำลังเรียก AI','busy'], approved:['อนุมัติแล้ว','approved'],
  sending:['กำลังส่ง','busy'], accepted:['Webhook รับแล้ว','accepted'], unknown:['ต้องตรวจสอบผล','unknown'], canceled:['ยกเลิกแล้ว','canceled'],
};
const FLOW_ACTION_EVENTS = {
  created:'สร้างร่าง', edited:'แก้ไขร่าง', ai_started:'เริ่มเรียก AI', ai_completed:'AI สร้างร่างแล้ว', ai_failed:'เรียก AI ไม่สำเร็จ',
  ai_reset:'คืนร่างหลัง AI ค้าง', approved:'อนุมัติ', approval_revoked:'ถอนอนุมัติ', canceled:'ยกเลิก', send_started:'เริ่มส่ง webhook',
  webhook_accepted:'Webhook ตอบรับ', delivery_unknown:'ยังยืนยันผลส่งไม่ได้', manually_accepted:'ตรวจสอบแล้วว่าปลายทางรับ', confirmed_not_accepted:'ตรวจสอบแล้วว่าปลายทางไม่รับ',
};
const flowLinkedTask = (project, node) => {
  const task = node.taskId && Store.getTask(node.taskId);
  return task && task.project === project.id ? task : null;
};
const flowStatusLabel = status => STATUS_META[status]?.label || status || 'ยังไม่เริ่ม';

function flowWorkView(project, flow) {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const tasks = nodes.map(node => flowLinkedTask(project, node)).filter(Boolean);
  const done = tasks.filter(t => t.status === 'done').length;
  const active = tasks.filter(t => t.status === 'doing').length;
  const review = tasks.filter(t => t.status === 'review').length;
  const notLinked = nodes.length - tasks.length;
  return `<div class="fo-work">
    <div class="fo-stats">
      <div><span>งานที่เชื่อม</span><strong>${tasks.length}<small> / ${nodes.length} ขั้นตอน</small></strong></div>
      <div><span>กำลังทำ</span><strong>${active}</strong></div><div><span>รอตรวจ</span><strong>${review}</strong></div>
      <div><span>เสร็จแล้ว</span><strong>${done}</strong></div><div><span>ยังไม่เชื่อม / ไม่พบงาน</span><strong>${notLinked}</strong></div>
    </div>
    <div class="fo-help">สถานะอ้างอิงจากการ์ดงานจริงในบอร์ด ไม่ใช่การเปลี่ยนสถานะของผัง หากงานถูกย้ายหรือเก็บเข้าคลังจะแสดงว่าไม่พบงาน และจะไม่สร้างซ้ำอัตโนมัติ</div>
    ${ProjectPlan.ZONES.map(z => {
      const group = nodes.filter(n => n.zone === z.id);
      if (!group.length) return '';
      return `<section class="fo-work-group"><h4>${z.icon} ${esc(z.title)} <span>${group.length} ขั้นตอน</span></h4>
        ${group.map(n => {
          const task = flowLinkedTask(project, n);
          const assignee = task?.assignee ? flowMemberName(task.assignee) : (n.assigneeId ? flowMemberName(n.assigneeId) : 'ยังไม่กำหนด');
          const create = !n.taskId && Store.data.projectFlows?.[project.id] && flowCanEdit()
            ? `<button class="btn btn-sm" data-fw-create="${esc(n.id)}">สร้างงาน</button>` : '';
          return `<div class="fo-work-row"><div class="fo-work-title"><b>${esc(n.icon || '📌')} ${esc(n.title)}</b>
            <small>${task ? esc(task.code || task.id) : (n.taskId ? 'งานถูกย้าย เก็บเข้าคลัง หรือไม่พบ' : 'ยังไม่มีงานเชื่อม')} · 👤 ${esc(assignee)}</small></div>
            <div class="fo-work-controls">${task ? `<label class="sr-only" for="fw-${esc(n.id)}">สถานะ ${esc(n.title)}</label>
              <select id="fw-${esc(n.id)}" data-fw-status="${esc(task.id)}" aria-label="สถานะงาน ${esc(n.title)}">
                ${['todo','doing','review','done'].map(s=>`<option value="${s}" ${task.status===s?'selected':''}>${esc(flowStatusLabel(s))}</option>`).join('')}</select>
              <button class="btn btn-sm" data-fw-open="${esc(task.id)}">เปิดงาน</button>` : create}</div></div>`;
        }).join('')}</section>`;
    }).join('')}
  </div>`;
}

function wireFlowWork(project) {
  $$('[data-fw-open]', $('#view')).forEach(button => button.onclick = () => openTaskModal(button.dataset.fwOpen));
  $$('[data-fw-create]', $('#view')).forEach(button => button.onclick = () => syncProjectFlowTasks(project.id, button.dataset.fwCreate));
  $$('[data-fw-status]', $('#view')).forEach(select => select.onchange = async () => {
    const task = Store.getTask(select.dataset.fwStatus), next = select.value;
    if (!task || !['todo','doing','review','done'].includes(next)) return;
    const previous = task.status;
    select.disabled = true;
    try {
      const body = { status:next };
      if (next !== 'done' && previous === 'done') body.progress = 0;
      if (Remote.on) {
        await Remote.req('/tasks/' + encodeURIComponent(task.id), { method:'PATCH', body });
        if (!await refreshFlowData()) {
          task.status = next; if (next === 'done') task.progress = 100; else if (body.progress === 0) task.progress = 0;
          toast('บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณารีเฟรช', 'warn');
        }
      } else {
        task.status = next; if (next === 'done') task.progress = 100; else if (body.progress === 0) task.progress = 0;
        Store.save();
      }
      App.route();
      toast('อัปเดตสถานะงานแล้ว');
    } catch (e) { select.value = previous; select.disabled = false; toast('อัปเดตไม่สำเร็จ: ' + esc(e.message), 'err'); }
  });
}

function flowActionPanel(project, flow, saved) {
  if (!Remote.on) return `<div class="fo-empty"><h4>การเชื่อมต่อใช้ได้เมื่อเข้าสู่ระบบจริง</h4><p>โหมดสาธิตไม่เรียก AI และไม่ส่ง webhook เพื่อป้องกันส่งข้อมูลจริงโดยไม่ตั้งใจ</p></div>`;
  if (!flowCanEdit()) return `<div class="fo-empty"><h4>พื้นที่สำหรับ Admin / Manager</h4><p>รายการส่งออกอาจมีข้อมูลลูกค้า จึงจำกัดการเข้าถึงเฉพาะผู้มีสิทธิ์จัดการโปรเจกต์</p></div>`;
  if (!saved) return `<div class="fo-empty"><h4>บันทึกผังก่อนเริ่ม</h4><p>กดตั้งค่าบรีฟเพื่อบันทึกผังของโปรเจกต์นี้ก่อนสร้างรายการ</p></div>`;
  return `<div id="faPanel" data-project="${esc(project.id)}" class="fo-action-panel"><div class="fo-empty">กำลังโหลดรายการและสถานะการเชื่อมต่อ…</div></div>`;
}

async function wireFlowActions(project, flow, saved) {
  const pane = $('#faPanel');
  if (!pane || !Remote.on || !flowCanEdit() || !saved) return;
  try {
    const [config, data] = await Promise.all([
      Remote.req('/flow/integrations'), Remote.req('/projects/'+encodeURIComponent(project.id)+'/flow/actions'),
    ]);
    if ($('#faPanel') !== pane || pane.dataset.project !== project.id) return;
    Store.ui.flowIntegrationStatus = config;
    pane.innerHTML = `<div class="fo-connection">
      <span class="fo-connection-pill ${config.aiReady?'ready':''}">🤖 AI: ${config.aiReady?'ตั้งค่าแล้ว · '+esc(config.aiModel):'ยังไม่ได้ตั้งค่า'}</span>
      <span class="fo-connection-pill ${config.webhookReady?'ready':''}">↗ Webhook: ${config.webhookReady?'ตั้งค่าแล้ว':'ยังไม่ได้ตั้งค่า'}</span>
      <button class="btn btn-primary btn-sm" id="faNew">${IC.plus} สร้างร่าง</button></div>
      <div class="fo-help">ตั้งค่าหมายถึงมีข้อมูลเชื่อมต่อในเซิร์ฟเวอร์ ไม่ได้ยืนยันทดสอบบริการ ปลายทางต้องตรวจลายเซ็นและป้องกัน event ซ้ำ; การตอบรับ webhook ไม่ยืนยันว่าเผยแพร่หรือส่งถึงลูกค้าแล้ว</div>
      <div class="fo-list-head"><h4>รายการของโปรเจกต์</h4><span>ล่าสุดไม่เกิน 100 รายการ</span></div>
      ${data.actions.length ? `<div class="fo-action-list">${data.actions.map(a => {
        const state = FLOW_ACTION_STATES[a.status] || [a.status,'draft'];
        return `<button type="button" class="fo-action-row" data-fa-open="${esc(a.id)}"><span class="fo-action-icon">${a.kind==='media'?'📣':a.kind==='sales'?'💼':'💚'}</span>
          <span class="fo-action-copy"><b>${esc(a.title)}</b><small>${esc(a.nodeTitle)} · ${esc(a.destination || 'ยังไม่ระบุปลายทาง')} · ${esc(a.updatedAt)}</small></span>
          <span class="fo-state is-${state[1]}">${esc(state[0])}</span><span aria-hidden="true">›</span></button>`;
      }).join('')}</div>` : '<div class="fo-empty"><h4>ยังไม่มีรายการ</h4><p>สร้างร่างจากขั้นตอนสื่อ ฝ่ายขาย หรือการดูแลลูกค้า แล้วให้ผู้มีสิทธิ์ตรวจอนุมัติก่อนส่ง</p></div>'}`;
    $('#faNew').onclick = () => openFlowActionNew(project, flow);
    $$('[data-fa-open]', pane).forEach(button => button.onclick = () => openFlowActionDetail(project.id, button.dataset.faOpen));
  } catch (e) {
    if ($('#faPanel') === pane) pane.innerHTML = `<div class="fo-empty"><h4>โหลดรายการไม่สำเร็จ</h4><p>${esc(e.message)}</p><p>ตรวจการสร้างตารางและสิทธิ์ฐานข้อมูล แล้วกดรีเฟรช</p></div>`;
  }
}

function flowActionBase(projectId, id='') {
  return '/projects/' + encodeURIComponent(projectId) + '/flow/actions' + (id ? '/' + encodeURIComponent(id) : '');
}
function openFlowActionNew(project, flow) {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  if (!nodes.length) return toast('ไม่พบขั้นตอนในผัง', 'warn');
  const eventId = globalThis.crypto?.randomUUID?.();
  openModal(`${modalHead('สร้างร่างจากผัง', 'ร่างจะยังไม่เรียก AI หรือส่งข้อมูลออก')}
    <div class="modal-body"><div class="form-grid">
      <div class="f-group full"><label for="fanNode">ขั้นตอนในผัง *</label><select id="fanNode">${nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.icon)} ${esc(n.title)}</option>`).join('')}</select></div>
      <div class="f-group"><label for="fanKind">ประเภท *</label><select id="fanKind">${Object.entries(FLOW_ACTION_KINDS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="f-group"><label for="fanDestination">ปลายทาง / ช่องทาง</label><input id="fanDestination" maxlength="200" placeholder="เช่น LINE OA / รหัสผู้รับ"></div>
      <div class="f-group full"><label for="fanTitle">ชื่อรายการ *</label><input id="fanTitle" maxlength="200" value="${esc(nodes[0].title)}"></div>
      <div class="f-group full"><label for="fanContent">เนื้อหาร่าง</label><textarea id="fanContent" rows="6" maxlength="12000" placeholder="เขียนเองหรือบันทึกร่างแล้วใช้ AI ช่วยร่าง"></textarea></div>
      <div class="pf-inline-note full">ข้อมูลรายการและปลายทางเห็นได้โดย Admin/Manager ใน workspace อย่าใส่รหัสผ่านหรือ API key</div>
    </div></div><div class="modal-foot"><button class="btn btn-ghost" id="fanCancel">ยกเลิก</button><button class="btn btn-primary" id="fanSave">บันทึกร่าง</button></div>`, {wide:true});
  let previousTitle = nodes[0].title;
  $('#fanNode').onchange = () => {
    const node = nodes.find(n=>n.id===$('#fanNode').value);
    if (!node) return;
    if (!$('#fanTitle').value.trim() || $('#fanTitle').value === previousTitle) $('#fanTitle').value = node.title;
    previousTitle = node.title;
    $('#fanKind').value = node.zone === 'z2' ? 'sales' : node.zone === 'z4' ? 'support' : 'media';
  };
  $('#fanCancel').onclick = closeModal;
  $('#fanSave').onclick = async () => {
    const btn = $('#fanSave'); btn.disabled = true;
    try {
      const out = await Remote.req(flowActionBase(project.id), { method:'POST', body:{
        ...(eventId ? {eventId} : {}), nodeId:$('#fanNode').value, kind:$('#fanKind').value,
        title:$('#fanTitle').value.trim(), destination:$('#fanDestination').value.trim(), content:$('#fanContent').value.trim(),
      } });
      closeModal(); App.route(); await openFlowActionDetail(project.id, out.action.id); toast('บันทึกร่างแล้ว');
    } catch (e) { btn.disabled=false; toast('บันทึกไม่สำเร็จ: '+esc(e.message), 'err'); }
  };
}

async function openFlowActionDetail(projectId, actionId) {
  try {
    const data = await Remote.req(flowActionBase(projectId, actionId));
    const a = data.action, state = FLOW_ACTION_STATES[a.status] || [a.status,'draft'];
    const editable = a.status === 'draft' && a.attempts === 0;
    const disabled = editable ? '' : 'disabled';
    const generationRecoverable = a.status === 'generating' && a.stale;
    const deliveryRecoverable = a.status === 'unknown' || (a.status === 'sending' && a.stale);
    const actions = a.status === 'draft'
      ? `${editable ? '<button class="btn" id="faGenerate">✦ ช่วยร่างด้วย AI</button><button class="btn" id="faSave">บันทึกการแก้ไข</button>' : ''}<button class="btn btn-primary" id="faApprove">ตรวจและอนุมัติ</button><button class="btn btn-ghost" id="faCancelAction">ยกเลิกรายการ</button>`
      : a.status === 'approved' ? '<button class="btn" id="faReturn">ถอนอนุมัติ</button><button class="btn btn-primary" id="faSend">ส่ง webhook</button><button class="btn btn-ghost" id="faCancelAction">ยกเลิกรายการ</button>'
      : (generationRecoverable || deliveryRecoverable) ? '<button class="btn btn-primary" id="faReconcile">บันทึกผลตรวจสอบ</button>' : '';
    openModal(`${modalHead('รายการจาก Project Flow', esc(a.nodeTitle))}<div class="modal-body">
      <div class="fo-detail-top"><span class="fo-state is-${state[1]}">${esc(state[0])}</span><span>${esc(a.id)} · ${esc(a.updatedAt)} · สร้างโดย ${esc(a.createdBy)}</span></div>
      <div class="form-grid"><div class="f-group"><label for="fadKind">ประเภท</label><select id="fadKind" ${disabled}>${Object.entries(FLOW_ACTION_KINDS).map(([k,v])=>`<option value="${k}" ${a.kind===k?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="f-group"><label for="fadDestination">ปลายทาง / ช่องทาง</label><input id="fadDestination" maxlength="200" value="${esc(a.destination)}" ${disabled}></div>
        <div class="f-group full"><label for="fadTitle">ชื่อรายการ</label><input id="fadTitle" maxlength="200" value="${esc(a.title)}" ${disabled}></div>
        <div class="f-group full"><label for="fadContent">เนื้อหา</label><textarea id="fadContent" rows="7" maxlength="12000" ${disabled}>${esc(a.content)}</textarea></div></div>
      <div class="fo-help">${a.approvedBy ? `อนุมัติโดย ${esc(a.approvedBy)} · ${esc(a.approvedAt)}<br>` : ''}
        ${a.attempts ? 'รายการนี้เคยส่งแล้ว เนื้อหาถูกล็อกเพื่อป้องกันส่ง event เดิมด้วยข้อมูลต่างกัน<br>' : ''}
        ${a.lastError ? 'รหัสผลล่าสุด: '+esc(a.lastError)+'<br>' : ''}
        ${a.status==='accepted' ? 'Webhook ตอบรับแล้ว แต่ต้องตรวจผลการเผยแพร่/ส่งข้อความในระบบปลายทางอีกครั้ง' : a.status==='unknown' || a.status==='sending' ? 'ห้ามส่งซ้ำจนกว่าจะตรวจผลกับระบบปลายทาง; หากกระบวนการค้าง ต้องรออย่างน้อย 2 นาทีจึงบันทึกผลตรวจสอบได้' : 'ตรวจความถูกต้อง ความยินยอม และสิทธิ์เผยแพร่ก่อนอนุมัติ'}</div>
      <details class="fo-history"><summary>ประวัติการดำเนินการ (${data.events.length})</summary>${data.events.map(e=>`<div><b>${esc(FLOW_ACTION_EVENTS[e.type] || e.type)}</b> · ${esc(e.actor)} · ${esc(e.at)}${e.note?`<br><small>${esc(e.note)}</small>`:''}</div>`).join('') || '<p>ยังไม่มีประวัติ</p>'}</details>
    </div><div class="modal-foot fo-modal-actions"><button class="btn btn-ghost" id="faClose">ปิด</button>${actions}</div>`, {wide:true});
    $('#faClose').onclick = closeModal;
    const reload = async message => { closeModal(); if (Store.ui.projectFlowMode==='actions') App.route(); await openFlowActionDetail(projectId, actionId); if (message) toast(message); };
    const call = async (operation, extra, message) => {
      try {
        const out = await Remote.req(flowActionBase(projectId, actionId)+'/'+operation, { method:'POST', body:{revision:a.revision, confirm:true, ...extra} });
        await reload(message);
        if (operation==='send' && !out.accepted) toast('ยังยืนยันผลส่งไม่ได้ กรุณาตรวจสอบปลายทางก่อนดำเนินการต่อ', 'warn');
      } catch (e) { toast('ดำเนินการไม่สำเร็จ: '+esc(e.message), 'err'); await reload(); }
    };
    if ($('#faSave')) $('#faSave').onclick = async () => {
      const btn=$('#faSave'); btn.disabled=true;
      try {
        await Remote.req(flowActionBase(projectId, actionId), {method:'PATCH', body:{revision:a.revision, kind:$('#fadKind').value,
          destination:$('#fadDestination').value.trim(), title:$('#fadTitle').value.trim(), content:$('#fadContent').value.trim()}});
        await reload('บันทึกการแก้ไขแล้ว');
      } catch(e) { btn.disabled=false; toast('บันทึกไม่สำเร็จ: '+esc(e.message), 'err'); }
    };
    const hasUnsavedDraft = () => editable && ($('#fadKind').value!==a.kind || $('#fadDestination').value.trim()!==a.destination || $('#fadTitle').value.trim()!==a.title || $('#fadContent').value.trim()!==a.content);
    if ($('#faGenerate')) $('#faGenerate').onclick = () => {
      if (hasUnsavedDraft()) return toast('กรุณาบันทึกการแก้ไขก่อนเรียก AI', 'warn');
      openFlowActionGenerate(projectId, a, call);
    };
    if ($('#faApprove')) $('#faApprove').onclick = () => {
      // ผู้ตรวจต้องอนุมัติเนื้อหาที่บันทึกจริง ไม่ใช่ข้อความที่แก้ค้างไว้บนหน้าจอ
      if (hasUnsavedDraft()) return toast('กรุณาบันทึกการแก้ไขก่อนอนุมัติ', 'warn');
      confirmDlg('ตรวจและอนุมัติร่าง?', 'ยืนยันว่าตรวจเนื้อหา ปลายทาง ความยินยอม และสิทธิ์เผยแพร่แล้ว ขั้นตอนนี้ยังไม่ส่งข้อมูลออก', () => call('approve', {}, 'อนุมัติแล้ว ยังไม่ได้ส่ง'), 'ยืนยันอนุมัติ');
    };
    if ($('#faSend')) $('#faSend').onclick = () => confirmDlg('ส่งให้ webhook จริง?', `รายการ <b>${esc(a.title)}</b> จะส่งไปยังระบบที่ตั้งค่าบนเซิร์ฟเวอร์ ปลายทางอาจเผยแพร่ ส่งข้อความ หรือมีค่าใช้จ่าย หากไม่ทราบผลต้องตรวจสอบก่อนส่งซ้ำ`, () => call('send', {}, ''), 'ยืนยันส่ง');
    if ($('#faReturn')) $('#faReturn').onclick = () => confirmDlg('ถอนอนุมัติ?', 'รายการจะกลับเป็นร่างและต้องตรวจอนุมัติใหม่ก่อนส่ง', () => call('return-draft', {}, 'ถอนอนุมัติแล้ว'), 'ถอนอนุมัติ');
    if ($('#faCancelAction')) $('#faCancelAction').onclick = () => confirmDlg('ยกเลิกรายการ?', 'รายการจะไม่ถูกส่ง และประวัติจะยังอยู่', () => call('cancel', {}, 'ยกเลิกรายการแล้ว'), 'ยืนยันยกเลิก');
    if ($('#faReconcile')) $('#faReconcile').onclick = () => openFlowActionReconcile(a, call);
  } catch(e) { toast('โหลดรายการไม่สำเร็จ: '+esc(e.message), 'err'); }
}

function openFlowActionGenerate(projectId, action, call) {
  const config = Store.ui.flowIntegrationStatus || {};
  openModal(`${modalHead('ให้ AI ช่วยร่าง', 'ผลลัพธ์จะบันทึกเป็นร่าง ไม่อนุมัติหรือส่งออกอัตโนมัติ')}
    <div class="modal-body"><div class="fo-help">เซิร์ฟเวอร์จะส่งชื่อโปรเจกต์ ชื่อ/รายละเอียดขั้นตอน เป้าหมาย กลุ่มเป้าหมาย สิ่งส่งมอบ ข้อจำกัด เนื้อหาร่างที่บันทึกแล้ว และคำสั่งด้านล่างไปยังผู้ให้บริการ AI ที่องค์กรตั้งค่าไว้ อาจมีค่าใช้จ่าย กรุณาตรวจข้อมูลส่วนบุคคลก่อนกด</div>
      <div class="f-group"><label for="fagPrompt">ต้องการให้ AI ร่างอะไร *</label><textarea id="fagPrompt" rows="4" maxlength="2000" placeholder="เช่น ร่างข้อความตอบลูกค้าอย่างสุภาพ โดยไม่รับปากเกินข้อมูลที่มี"></textarea></div>
      <label class="fo-check"><input type="checkbox" id="fagConsent"> ยืนยันว่ามีสิทธิ์ส่งข้อมูลดังกล่าวให้ผู้ให้บริการ AI</label>
      ${!config.aiReady?'<p class="fo-error">ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์</p>':''}</div>
    <div class="modal-foot"><button class="btn btn-ghost" id="fagCancel">ย้อนกลับ</button><button class="btn btn-primary" id="fagRun" ${!config.aiReady?'disabled':''}>เรียก AI เพื่อร่าง</button></div>`, {wide:true});
  $('#fagCancel').onclick = () => openFlowActionDetail(projectId, action.id);
  $('#fagRun').onclick = async () => {
    if (!$('#fagConsent').checked || !$('#fagPrompt').value.trim()) return toast('กรุณาระบุคำสั่งและยืนยันสิทธิ์ส่งข้อมูล', 'warn');
    const instruction=$('#fagPrompt').value.trim(); $('#fagRun').disabled=true;
    await call('generate', {instruction}, 'AI สร้างร่างแล้ว โปรดตรวจเนื้อหาก่อนอนุมัติ');
  };
}

function openFlowActionReconcile(action, call) {
  const generation = action.status === 'generating';
  openModal(`${modalHead('บันทึกผลตรวจสอบ', generation?'คืนร่างหลังตรวจสอบการเรียก AI ที่ค้าง':'ตรวจสอบกับระบบปลายทางก่อนเลือกผล')}
    <div class="modal-body"><div class="fo-help">${generation?'การเรียก AI อาจมีค่าใช้จ่ายแม้ไม่เห็นผลลัพธ์ ตรวจสอบกับผู้ให้บริการก่อนลองใหม่':'การส่งอาจเกิดขึ้นแล้วแม้ไม่ได้รับคำตอบ ห้ามเดาผล หากยืนยันว่าไม่รับ รายการจะกลับเป็นร่างที่แก้เนื้อหาไม่ได้และต้องอนุมัติใหม่ โดยใช้ event ID เดิม'}</div>
      ${generation ? '' : '<div class="f-group"><label for="farResolution">ผลตรวจสอบ *</label><select id="farResolution"><option value="">เลือกผลที่ตรวจสอบแล้ว</option><option value="accepted">ปลายทางรับ event แล้ว</option><option value="not_accepted">ยืนยันแน่นอนว่าปลายทางไม่รับ event</option></select></div>'}
      <div class="f-group"><label for="farNote">หลักฐาน / วิธีตรวจสอบ * (10–500 ตัวอักษร)</label><textarea id="farNote" rows="3" maxlength="500"></textarea></div>
    </div><div class="modal-foot"><button class="btn btn-ghost" id="farCancel">ยกเลิก</button><button class="btn btn-primary" id="farSave">ยืนยันผลตรวจสอบ</button></div>`, {wide:true});
  $('#farCancel').onclick = closeModal;
  $('#farSave').onclick = async () => {
    const note=$('#farNote').value.trim(), resolution=generation?'reset_generation':$('#farResolution').value;
    if (note.length<10 || !resolution) return toast('กรุณาเลือกผลและระบุหลักฐานอย่างน้อย 10 ตัวอักษร', 'warn');
    $('#farSave').disabled=true; await call('reconcile', {resolution,note}, 'บันทึกผลตรวจสอบแล้ว');
  };
}
