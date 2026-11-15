/* กฎไทม์ไลน์และแนวโน้มใช้ข้อมูลแผนจริง ไม่ทดแทนวันปิดงานจริงหรือการพยากรณ์ AI */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaskManagementModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
    return Math.floor(ms / DAY);
  }
  function date(n) {
    if (!Number.isFinite(n)) return null;
    const d = new Date(n * DAY);
    if (!Number.isFinite(d.getTime())) return null;
    const s = d.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  function move(value, days) { const n = day(value); return n == null ? null : date(n + days); }
  function monday(value) {
    const n = day(value);
    if (n == null) return null;
    const weekday = new Date(n * DAY).getUTCDay();
    return date(n - ((weekday + 6) % 7));
  }
  function span(start, end, rangeStart, rangeDays) {
    const s = day(start), e = day(end), base = day(rangeStart);
    if (base == null || !Number.isFinite(rangeDays) || rangeDays < 1) return { kind:'invalid' };
    if (s == null && e == null) return { kind:'missing' };
    if (s != null && e != null && e < s) return { kind:'invalid' };
    const a = s == null ? e : s, b = e == null ? s : e;
    if (b < base) return { kind:'outside', side:'before' };
    if (a >= base + rangeDays) return { kind:'outside', side:'after' };
    const left = Math.max(0, a - base), right = Math.min(rangeDays, b - base + 1);
    return { kind:s == null || e == null ? 'point' : 'bar', left, width:right-left,
      point:s == null ? 'due' : e == null ? 'start' : null,
      clippedBefore:a < base, clippedAfter:b >= base + rangeDays };
  }
  function progress(task) {
    if (task.status === 'done') return 100;
    if (task.progress == null || task.progress === '') return null;
    const n = Number(task.progress);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  function assess(node, today, issueByTask) {
    const nodes = [], tasks = [], stack = [node], seen = new Set();
    while (stack.length) {
      const item = stack.pop();
      if (seen.has(item.project.id)) continue;
      seen.add(item.project.id); nodes.push(item);
      tasks.push(...item.tasks.filter(t => t.status !== 'cancelled'));
      stack.push(...item.children);
    }
    const active = tasks.filter(t => t.status !== 'done');
    const allIssues = tasks.flatMap(t => issueByTask.get(t.id) || []);
    const openIssues = allIssues.filter(i => i.status === 'open');
    const legacyBlocks = tasks.filter(t => t.legacyBlocked);
    const missingLeaf = nodes.some(n => !n.children.length && !n.tasks.some(t => t.status !== 'cancelled') && n.project.status !== 'done');
    const progressValues = tasks.map(progress);
    const average = tasks.length && progressValues.every(v => v != null)
      ? Math.round(progressValues.reduce((a, b) => a + b, 0) / tasks.length) : null;
    const due = day(node.project.end), start = day(node.project.start), now = day(today);
    const lateTasks = active.filter(t => day(t.due) != null && now != null && day(t.due) < now);
    const missingAssignees = active.filter(t => !t.assignee);
    const futureTasks = active.filter(t => due != null && day(t.due) != null && day(t.due) > due);
    const futureChildren = nodes.slice(1).filter(n => n.project.status !== 'done' && due != null && day(n.project.end) != null && day(n.project.end) > due);
    const holdTasks = active.filter(t => t.status === 'hold');
    const anyUnknownStatus = active.some(t => t.status === 'unknown');
    const missingSchedule = active.some(t => day(t.start) == null || day(t.due) == null || day(t.start) > day(t.due));
    const counts = { taskCount:tasks.length, openCount:active.length, progress:average,
      openIssues:openIssues.length, legacyBlocks:legacyBlocks.length, lateTasks:lateTasks.length,
      unassigned:missingAssignees.length, missingLeaf };
    const result = (kind, reason, predictedDate = null) => ({ kind, reason, predictedDate, ...counts });

    // แม้ปิดงานหมดแล้วก็ไม่มีข้อมูลวันที่ปิดจริง จึงห้ามเรียกว่า "ส่งทัน"
    if (!active.length && !missingLeaf && !openIssues.length && !legacyBlocks.length &&
        (tasks.length || nodes.every(n => n.project.status === 'done'))) {
      return result('completed', 'ปิดงานครบหรือทำเครื่องหมายโปรเจกต์เสร็จแล้ว แต่ไม่มีวันที่ส่งจริงให้ยืนยันว่าทันกำหนด');
    }
    if (due == null || now == null) return result('unknown', 'ยังไม่กำหนดวันส่งของโปรเจกต์ จึงประเมินว่าทันหรือไม่ทันไม่ได้');
    if (now > due) return result('late', 'เลยกำหนดโปรเจกต์แล้วและยังมีงานหรือข้อมูลที่ต้องตรวจ');
    if (openIssues.length || legacyBlocks.length) return result('risk', 'มีปัญหาที่ยังไม่ปิดหรือสถานะติดขัดเดิม');
    if (lateTasks.length) return result('risk', 'มีงานที่ยังไม่เสร็จและเลยกำหนดของงานแล้ว');
    if (holdTasks.length) return result('risk', 'มีงานที่อยู่ระหว่างพักหรือรอดำเนินการ');
    if (futureTasks.length || futureChildren.length) return result('risk', 'มีงานหรือโปรเจกต์ย่อยที่วางกำหนดหลังวันส่งของโปรเจกต์นี้');
    if (missingAssignees.length) return result('risk', 'มีงานที่ยังไม่ได้กำหนดผู้รับผิดชอบ');
    if (due == null || start == null || now == null || due < start) return result('unknown', 'ยังไม่มีวันเริ่มหรือวันส่งที่ถูกต้อง');
    if (!tasks.length || missingLeaf) return result('unknown', 'ยังไม่มีงานในบางโปรเจกต์ หรือยังไม่ระบุขอบเขตงาน');
    if (missingSchedule || anyUnknownStatus || average == null) return result('unknown', 'บางงานยังไม่มีวันเริ่ม วันส่ง สถานะ หรือความคืบหน้าที่ถูกต้อง');
    if (now < start) return result('unknown', 'ยังไม่ถึงวันเริ่มตามแผน');
    if (average <= 0 || average >= 100) return result('unknown', average >= 100
      ? 'ความคืบหน้า 100% แต่ยังมีงานที่ไม่ได้ปิดสถานะ' : 'ยังไม่มีความคืบหน้าเพียงพอสำหรับประมาณการ');
    // คาดการณ์อย่างง่ายโดยถือความเร็วจากวันเริ่มแผนคงที่และทุกงานมีน้ำหนักเท่ากัน
    const elapsed = now - start + 1;
    const remaining = Math.ceil(elapsed * (100 - average) / average);
    const predicted = date(now + remaining);
    if (!predicted || remaining > 7300) return result('unknown', 'ข้อมูลยังไม่เพียงพอที่จะประมาณวันเสร็จอย่างน่าเชื่อถือ');
    return predicted > node.project.end
      ? result('risk', 'แนวโน้มเชิงเส้นช้ากว่าวันส่ง หากความเร็วงานไม่เปลี่ยน', predicted)
      : result('ontrack', 'แนวโน้มเชิงเส้นอยู่ภายในกำหนด หากความเร็วงานไม่เปลี่ยน', predicted);
  }
  function build(snapshot, today) {
    const nodes = new Map();
    (snapshot.projects || []).forEach(p => { if (p && p.id && !nodes.has(p.id)) nodes.set(p.id, { project:p, tasks:[], children:[], orphan:false, cycle:false }); });
    const parents = new Map();
    (snapshot.links || []).forEach(l => {
      if (l && nodes.has(l.childId) && l.parentId) parents.set(l.childId, l.parentId);
    });
    const cycles = new Set();
    for (const id of nodes.keys()) {
      const path = [], seen = new Map();
      let cursor = id;
      while (nodes.has(cursor) && parents.has(cursor)) {
        if (seen.has(cursor)) { path.slice(seen.get(cursor)).forEach(x => cycles.add(x)); break; }
        seen.set(cursor, path.length); path.push(cursor); cursor = parents.get(cursor);
      }
    }
    cycles.forEach(id => { parents.delete(id); nodes.get(id).cycle = true; });
    (snapshot.tasks || []).forEach(t => { if (t && nodes.has(t.project)) nodes.get(t.project).tasks.push(t); });
    const issues = new Map();
    (snapshot.issues || []).forEach(i => { if (i && i.taskId) { if (!issues.has(i.taskId)) issues.set(i.taskId, []); issues.get(i.taskId).push(i); } });
    const roots = [];
    for (const [id, node] of nodes) {
      const parent = parents.get(id);
      if (parent && nodes.has(parent)) nodes.get(parent).children.push(node);
      else { node.orphan = !!parent; roots.push(node); }
    }
    const sortNodes = list => list.sort((a,b) => String(a.project.code || a.project.id).localeCompare(String(b.project.code || b.project.id), 'th'));
    sortNodes(roots);
    for (const node of nodes.values()) {
      sortNodes(node.children);
      node.tasks.sort((a,b) => String(a.start || '9999').localeCompare(String(b.start || '9999')) || String(a.code || '').localeCompare(String(b.code || '')));
      node.forecast = assess(node, today, issues);
    }
    return { roots, nodes, issueByTask:issues };
  }
  return { day, date, move, monday, span, progress, assess, build };
});
