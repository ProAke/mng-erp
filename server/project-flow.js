/* บันทึกบรีฟและผังโปรเจกต์ — ใช้ query บน connection ที่อยู่ใน transaction เสมอ */
const ProjectPlan = require('../assets/js/project-plan');

const parseJSON = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};
const badRequest = message => Object.assign(new Error(message), { status: 400 });
const validProjectId = value => {
  const match = String(value || '').match(/^p?([1-9]\d*)$/);
  const id = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(id) && id <= 4294967295 ? id : 0;
};
const idString = (value, prefix) => {
  if (typeof value !== 'string' || !new RegExp('^' + prefix + '[1-9]\\d*$').test(value)) return '';
  const id = Number(value.slice(prefix.length));
  return Number.isSafeInteger(id) && id <= 4294967295 ? value : '';
};
const limitText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const ACTOR_TYPES = new Set(['start', 'system', 'human', 'auto', 'ai', 'milestone']);
const ZONE_IDS = new Set(ProjectPlan.ZONES.map(z => z.id));

/* ไม่รับ taskId จาก client: รักษาเฉพาะลิงก์ที่เซิร์ฟเวอร์สร้างไว้ก่อนหน้า */
function normalizeFlow(raw, projectName, previousNodes = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('ข้อมูลผังไม่ถูกต้อง');
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0 || raw.nodes.length > 80) throw badRequest('ผังต้องมี 1–80 ขั้นตอน');
  if (!raw.brief || typeof raw.brief !== 'object' || Array.isArray(raw.brief)) throw badRequest('ข้อมูลบรีฟไม่ถูกต้อง');
  for (const [field, prefix] of [['ownerId', 'u'], ['approverId', 'u'], ['aiAgentId', 'ai']]) {
    if (raw.brief[field] && !idString(raw.brief[field], prefix)) throw badRequest('รหัสบุคคลหรือ AI ในบรีฟไม่ถูกต้อง');
  }
  if (raw.brief.members !== undefined && (!Array.isArray(raw.brief.members) || raw.brief.members.length > 100 || raw.brief.members.some(id => !idString(id, 'u')))) {
    throw badRequest('รายชื่อสมาชิกในบรีฟไม่ถูกต้อง');
  }
  const brief = ProjectPlan.normalizeBrief(raw.brief);
  const seen = new Set();
  const prior = new Map((Array.isArray(previousNodes) ? previousNodes : []).map(n => [n.id, n]));
  const nodes = raw.nodes.map(item => {
    if (!item || typeof item !== 'object' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id || '') || seen.has(item.id)) throw badRequest('รหัสขั้นตอนไม่ถูกต้องหรือซ้ำกัน');
    seen.add(item.id);
    if (!ZONE_IDS.has(item.zone)) throw badRequest('โซนของขั้นตอนไม่ถูกต้อง');
    if (!ACTOR_TYPES.has(item.actorType)) throw badRequest('ประเภทผู้ดำเนินการไม่ถูกต้อง');
    const title = limitText(item.title, 200);
    if (!title) throw badRequest('กรุณาระบุชื่อทุกขั้นตอน');
    if (item.assigneeId && !idString(item.assigneeId, 'u')) throw badRequest('รหัสผู้รับผิดชอบไม่ถูกต้อง');
    if (item.aiAgentId && !idString(item.aiAgentId, 'ai')) throw badRequest('รหัส AI Agent ไม่ถูกต้อง');
    if (item.checklist != null && (!Array.isArray(item.checklist) || item.checklist.length > 30)) throw badRequest('รายการตรวจสอบไม่ถูกต้อง');
    const prev = prior.get(item.id);
    const node = {
      id: item.id,
      zone: item.zone,
      icon: Array.from(limitText(item.icon, 24) || '📌').slice(0, 8).join(''),
      title,
      desc: limitText(item.desc, 4000),
      actorType: item.actorType,
      assigneeId: idString(item.assigneeId, 'u'),
      aiAgentId: idString(item.aiAgentId, 'ai'),
      model: limitText(item.model, 120),
      estHours: Math.max(0, Math.min(9999, Number.isFinite(Number(item.estHours)) ? Number(item.estHours) : 0)),
      checklist: (item.checklist || []).map(v => limitText(v, 300)).filter(Boolean),
    };
    if (prev && /^t[1-9]\d*$/.test(prev.taskId || '')) {
      node.taskId = prev.taskId;
      node.taskCode = limitText(prev.taskCode, 40);
    }
    return node;
  });
  return {
    templateKey: 'full_funnel', brief,
    zones: ProjectPlan.ZONES.map(z => ({ ...z })),
    nodes, edges: ProjectPlan.makeEdges(nodes),
    mindmap: ProjectPlan.makeMindmap(projectName, brief, nodes),
    aiStack: ProjectPlan.makeAiStack(brief, nodes),
  };
}

async function validateReferences(conn, flow) {
  const teamIds = new Set([flow.brief.ownerId, flow.brief.approverId, ...flow.brief.members, ...flow.nodes.map(n => n.assigneeId)]
    .filter(Boolean).map(id => Number(id.slice(1))));
  const agentIds = new Set([flow.brief.aiAgentId, ...flow.nodes.map(n => n.aiAgentId)]
    .filter(Boolean).map(id => Number(id.slice(2))));
  if (teamIds.size) {
    const [rows] = await conn.query('SELECT id FROM erp_team WHERE id IN (?)', [[...teamIds]]);
    const found = new Set(rows.map(r => Number(r.id)));
    if ([...teamIds].some(id => !found.has(id))) throw badRequest('ไม่พบสมาชิกทีมที่เลือก กรุณาเลือกใหม่');
  }
  if (agentIds.size) {
    const [rows] = await conn.query('SELECT id FROM erp_ai_agents WHERE id IN (?)', [[...agentIds]]);
    const found = new Set(rows.map(r => Number(r.id)));
    if ([...agentIds].some(id => !found.has(id))) throw badRequest('ไม่พบ AI Agent ที่เลือก กรุณาเลือกใหม่');
  }
}

function rowToFlow(row) {
  if (!row) return null;
  return {
    projectId: 'p' + row.project_id,
    templateKey: row.template_key || 'full_funnel',
    brief: parseJSON(row.brief, {}),
    zones: parseJSON(row.zones, []),
    nodes: parseJSON(row.nodes, []),
    edges: parseJSON(row.edges, []),
    mindmap: parseJSON(row.mindmap, {}),
    aiStack: parseJSON(row.ai_stack, []),
    revision: Number(row.revision) || 1,
    updatedBy: row.updated_by || '',
    updatedAt: row.updated_at ? String(row.updated_at).slice(0, 19) : '',
  };
}

async function saveFlow(conn, projectId, flow, actor, revision) {
  await conn.query(
    `INSERT INTO erp_project_flows (project_id, template_key, brief, zones, nodes, edges, mindmap, ai_stack, revision, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE template_key=VALUES(template_key), brief=VALUES(brief), zones=VALUES(zones),
       nodes=VALUES(nodes), edges=VALUES(edges), mindmap=VALUES(mindmap), ai_stack=VALUES(ai_stack),
       revision=VALUES(revision), updated_by=VALUES(updated_by)`,
    [projectId, flow.templateKey, JSON.stringify(flow.brief), JSON.stringify(flow.zones), JSON.stringify(flow.nodes),
      JSON.stringify(flow.edges), JSON.stringify(flow.mindmap), JSON.stringify(flow.aiStack), revision, limitText(actor, 100)]
  );
  return { ...flow, projectId: 'p' + projectId, revision, updatedBy: limitText(actor, 100) };
}

/* สร้างเฉพาะขั้นตอนที่ยังไม่เชื่อมงาน ภายใน transaction และภายใต้ row lock */
async function createNodeTasks(conn, project, flow, onlyNodeId) {
  if (onlyNodeId && !flow.nodes.some(n => n.id === onlyNodeId)) throw Object.assign(new Error('ไม่พบขั้นตอนที่เลือก'), { status: 404 });
  const code = String(project.erp_code || project.hub_id || project.title || 'MNG').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'MNG';
  const dateOrNull = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '').slice(0, 10)) ? String(d).slice(0, 10) : null;
  const created = [];
  for (const node of flow.nodes) {
    if (onlyNodeId && node.id !== onlyNodeId) continue;
    if (node.taskId) continue;
    const [result] = await conn.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, progress,
        erp_start, erp_assignee, erp_ai_agent, erp_est, erp_spent_hrs, erp_prio, erp_tags, erp_subtasks, erp_comments)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [project.id, `${node.icon} ${node.title}`.trim(), node.desc, 'todo', 'normal', dateOrNull(project.erp_end), 0,
        dateOrNull(project.erp_start), node.assigneeId ? Number(node.assigneeId.slice(1)) : null,
        node.aiAgentId || null, node.estHours, 0, 'med', JSON.stringify(['project-flow', node.zone]),
        JSON.stringify(node.checklist.map(t => ({ t, d: false }))), '[]']
    );
    const taskCode = `${code}-${1000 + result.insertId}`;
    await conn.query('UPDATE tasks SET erp_code=? WHERE id=?', [taskCode, result.insertId]);
    node.taskId = 't' + result.insertId;
    node.taskCode = taskCode;
    created.push({ nodeId: node.id, taskId: node.taskId, code: taskCode });
  }
  return created;
}

module.exports = { validProjectId, normalizeFlow, validateReferences, rowToFlow, saveFlow, createNodeTasks };
