/* MNG ERP — แม่แบบบรีฟและแผนงาน ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์
   เป็นแม่แบบสำหรับวางแผน ไม่ได้เรียก AI หรือเผยแพร่ข้อมูลโดยอัตโนมัติ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProjectPlan = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ZONES = [
    { id: 'z1', title: 'Marketing & Media', subtitle: 'วางแผนสื่อและสร้างความสนใจ', icon: '📣', color: '#7c6cf0' },
    { id: 'z2', title: 'Lead & Sales', subtitle: 'รับความสนใจ ติดตามและปิดการขาย', icon: '💼', color: '#e8992f' },
    { id: 'z3', title: 'Production & Delivery', subtitle: 'ทำงาน ตรวจคุณภาพและส่งมอบ', icon: '🏭', color: '#2f83d7' },
    { id: 'z4', title: 'Customer Success', subtitle: 'ดูแลลูกค้า รับข้อเสนอแนะและต่อยอด', icon: '💚', color: '#20a77b' },
  ];
  const BRIEF_FIELDS = [
    'objective', 'audience', 'deliverables', 'successMetric', 'constraints',
    'marketingChannels', 'salesProcess', 'productionPlan', 'deliveryPlan',
    'supportPlan', 'approvalNotes', 'aiModel',
  ];
  const cleanText = (v, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const validId = (value, prefix) => {
    if (typeof value !== 'string' || !new RegExp('^' + prefix + '[a-z0-9]{1,32}$', 'i').test(value)) return '';
    const suffix = value.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return value; // รหัสชั่วคราวในโหมดสาธิต
    const id = Number(suffix);
    return Number.isSafeInteger(id) && id > 0 && id <= 4294967295 ? value : '';
  };
  const userId = v => validId(v, 'u');
  const agentId = v => validId(v, 'ai');

  function normalizeBrief(input) {
    const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const out = {};
    BRIEF_FIELDS.forEach(key => { out[key] = cleanText(b[key], key === 'aiModel' ? 120 : 2000); });
    out.ownerId = userId(b.ownerId);
    out.approverId = userId(b.approverId);
    out.aiAgentId = agentId(b.aiAgentId);
    out.members = Array.isArray(b.members) ? [...new Set(b.members.map(userId).filter(Boolean))].slice(0, 100) : [];
    return out;
  }

  function makeEdges(nodes) {
    const groups = ZONES.map(z => nodes.filter(n => n.zone === z.id));
    const edges = [];
    groups.forEach((group, index) => {
      group.slice(1).forEach((node, i) => edges.push({ from: group[i].id, to: node.id, kind: 'main', label: '' }));
      const next = groups.slice(index + 1).find(g => g.length);
      if (group.length && next) edges.push({ from: group[group.length - 1].id, to: next[0].id, kind: 'main', label: 'ส่งต่อ' });
    });
    const quality = nodes.find(n => n.id === 'quality');
    const production = nodes.find(n => n.id === 'production');
    if (quality && production && quality.zone === production.zone) {
      edges.push({ from: quality.id, to: production.id, kind: 'rework', label: 'ไม่ผ่าน · แก้ไข' });
    }
    const nonempty = groups.filter(g => g.length);
    if (nonempty.length > 1) edges.push({ from: nonempty[nonempty.length - 1].slice(-1)[0].id, to: nonempty[0][0].id, kind: 'loop', label: 'Feedback ต่อยอด' });
    return edges;
  }

  function makeMindmap(projectName, brief, nodes) {
    const b = normalizeBrief(brief);
    const leaf = (title, value) => ({ title, value: value || 'ยังไม่ได้ระบุ' });
    return {
      title: cleanText(projectName, 200) || 'โปรเจกต์',
      objective: b.objective || 'กำหนดเป้าหมายของโปรเจกต์ในบรีฟ',
      branches: [
        { id: 'goals', icon: '🎯', title: 'เป้าหมาย & ความสำเร็จ', color: '#7c6cf0', leaves: [leaf('ผลลัพธ์ที่ต้องการ', b.objective), leaf('ตัวชี้วัด', b.successMetric), leaf('ข้อจำกัด / ความเสี่ยง', b.constraints)] },
        { id: 'audience', icon: '👥', title: 'ลูกค้า & สิ่งส่งมอบ', color: '#e8992f', leaves: [leaf('กลุ่มเป้าหมาย', b.audience), leaf('สิ่งที่ส่งมอบ', b.deliverables)] },
        { id: 'media', icon: '📣', title: 'สื่อ & การขาย', color: '#d15384', leaves: [leaf('ช่องทางสื่อ', b.marketingChannels), leaf('กระบวนการขาย', b.salesProcess)] },
        { id: 'delivery', icon: '📦', title: 'ผลิต & ส่งมอบ', color: '#2f83d7', leaves: [leaf('แนวทางผลิต / พัฒนา', b.productionPlan), leaf('การส่งมอบ', b.deliveryPlan)] },
        { id: 'support', icon: '💚', title: 'ดูแล & ต่อยอด', color: '#20a77b', leaves: [leaf('การช่วยเหลือลูกค้า', b.supportPlan), leaf('ผู้ตรวจ / เงื่อนไขอนุมัติ', b.approvalNotes)] },
        { id: 'team', icon: '🤝', title: 'ทีม & AI', color: '#626ac8', leaves: [leaf('โมเดลที่วางแผนใช้', b.aiModel), { title: 'ขั้นตอนใน Flow', value: String(Array.isArray(nodes) ? nodes.length : 0) + ' ขั้นตอน' }] },
      ],
    };
  }

  function makeAiStack(brief, nodes) {
    const b = normalizeBrief(brief);
    const pairs = [];
    if (b.aiAgentId || b.aiModel) pairs.push({ agentId: b.aiAgentId, model: b.aiModel });
    (nodes || []).forEach(n => {
      if ((n.aiAgentId || n.model) && !pairs.some(p => p.agentId === n.aiAgentId && p.model === n.model)) {
        pairs.push({ agentId: n.aiAgentId || '', model: n.model || '' });
      }
    });
    return pairs;
  }

  function build(project, initialBrief) {
    const p = project || {};
    const b = normalizeBrief(initialBrief || p.brief || {
      objective: p.desc || '',
      members: p.members || [],
    });
    const hint = (label, value, fallback) => value ? label + ': ' + value : fallback;
    const makeNode = (id, zone, icon, title, desc, actorType, opts) => ({
      id, zone, icon, title, desc, actorType,
      assigneeId: (opts && opts.approver ? b.approverId : b.ownerId) || '',
      aiAgentId: actorType === 'ai' ? b.aiAgentId : '',
      model: actorType === 'ai' ? b.aiModel : '',
      estHours: 4,
      checklist: [],
    });
    const nodes = [
      makeNode('audience', 'z1', '🎯', 'กำหนดกลุ่มเป้าหมาย', hint('กลุ่มเป้าหมาย', b.audience, 'ค้นหาความต้องการและกำหนดกลุ่มเป้าหมาย'), 'human'),
      makeNode('content', 'z1', '✍️', 'วางแผนและสร้างสื่อ', hint('ช่องทาง', b.marketingChannels, 'เตรียมเนื้อหาและสื่อให้เหมาะกับช่องทาง'), 'ai'),
      makeNode('approve-media', 'z1', '✅', 'ตรวจและอนุมัติสื่อ', 'ตรวจข้อเท็จจริง สิทธิ์การใช้สื่อ และอนุมัติก่อนเผยแพร่', 'human', { approver: true }),
      makeNode('publish', 'z1', '📣', 'เผยแพร่และติดตามผล', hint('ช่องทาง', b.marketingChannels, 'เผยแพร่ตามแผนและเก็บผลลัพธ์'), 'human'),
      makeNode('lead', 'z2', '📥', 'รับและบันทึก Lead', 'รวบรวมผู้สนใจและช่องทางติดต่ออย่างเหมาะสม', 'system'),
      makeNode('qualify', 'z2', '💬', 'คัดกรองความต้องการ', 'พูดคุยเพื่อเข้าใจปัญหาและความต้องการลูกค้า', 'human'),
      makeNode('proposal', 'z2', '🧾', 'เสนอราคาและติดตาม', hint('แนวทางขาย', b.salesProcess, 'จัดทำข้อเสนอ ติดตามและตอบคำถาม'), 'human'),
      makeNode('sale', 'z2', '🤝', 'ตกลงและส่งต่องาน', 'ยืนยันขอบเขต เงื่อนไข และผู้รับผิดชอบก่อนเริ่มงาน', 'milestone'),
      makeNode('scope', 'z3', '📋', 'สรุปบรีฟและวางแผน', hint('สิ่งส่งมอบ', b.deliverables, 'ตกลงขอบเขต สิ่งส่งมอบ กำหนดเวลา และทีม'), 'human'),
      makeNode('production', 'z3', '🛠️', 'ผลิตหรือพัฒนางาน', hint('แผนการผลิต', b.productionPlan, 'แบ่งงานและดำเนินการตามแผน'), 'human'),
      makeNode('quality', 'z3', '🔍', 'ตรวจคุณภาพและแก้ไข', 'ตรวจตามเกณฑ์ที่ตกลง หากไม่ผ่านให้ส่งกลับแก้ไข', 'human', { approver: true }),
      makeNode('delivery', 'z3', '📦', 'ส่งมอบและยืนยันรับงาน', hint('การส่งมอบ', b.deliveryPlan, 'ส่งผลงานและให้ลูกค้ายืนยันการรับมอบ'), 'milestone'),
      makeNode('onboard', 'z4', '🎓', 'ส่งคู่มือและแนะนำการใช้งาน', 'ส่งเอกสารที่จำเป็นและแนะนำช่องทางติดต่อ', 'human'),
      makeNode('support', 'z4', '🎧', 'ดูแลและตอบคำถามลูกค้า', hint('แผนดูแล', b.supportPlan, 'กำหนดผู้รับเรื่อง ช่องทางและเวลาตอบกลับ'), 'human'),
      makeNode('feedback', 'z4', '📈', 'ติดตามผลและรับ Feedback', hint('ตัวชี้วัด', b.successMetric, 'ติดตามผลลัพธ์และเก็บข้อเสนอแนะ'), 'human'),
      makeNode('growth', 'z4', '⭐', 'รีวิวและโอกาสต่อยอด', 'นำบทเรียนไปปรับแผนสื่อและข้อเสนอครั้งถัดไป โดยขออนุญาตก่อนเผยแพร่', 'milestone'),
    ];
    return {
      templateKey: 'full_funnel', brief: b, zones: ZONES.map(z => ({ ...z })), nodes,
      edges: makeEdges(nodes), mindmap: makeMindmap(p.name, b, nodes), aiStack: makeAiStack(b, nodes),
    };
  }

  return { ZONES, BRIEF_FIELDS, normalizeBrief, makeEdges, makeMindmap, makeAiStack, build };
});
