/* MNG ERP — hermes-mini: Lightweight AI Agent (simulated LLM on Node.js)
 *
 * Reads real data from MariaDB (pacific_mng + pacific_mngworks) and generates
 * AI-like insights, summaries, priorities, and chat responses using rule-based
 * analysis. No external LLM API key required — simulates agentic behaviour
 * by combining data patterns, thresholds, and template responses in Thai.
 *
 * Designed to be mounted in the existing Express server OR run standalone.
 */
'use strict';

const { workPool, authPool } = require('../db');

/* ---------- constants ---------- */
const STATUS_META = {
  todo:   { label: 'รอดำเนินการ', color: '#8a8fb1' },
  doing:  { label: 'กำลังทำ',     color: '#3BA7FF' },
  review: { label: 'ตรวจแก้',     color: '#FFB020' },
  done:   { label: 'เสร็จแล้ว',   color: '#22C793' },
};
const PRIO_META = ['low', 'med', 'high', 'urgent'];
const TH_MONTHS_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_DOW     = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

function thDate(s) {
  if (!s) return '—';
  const d = typeof s === 'string' ? s2d(s) : s;
  return `${d.getDate()} ${TH_MONTHS_S[d.getMonth()]} ${d.getFullYear()+543}`;
}
function s2d(s) { const [y,m,dd]=s.split('-').map(Number); return new Date(y,m-1,dd); }
function daysLeft(s) { return Math.round((s2d(s)-s2d(todayS()))/86400000); }
function todayS() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function money(n) { return '฿' + Number(n||0).toLocaleString('en-US'); }

/* ---------- HermesMini class ---------- */
class HermesMini {
  constructor(workPool, authPool) {
    this.workPool = workPool;
    this.authPool = authPool;
    this.startTime = Date.now();
    this.sessionLog = [];
    this._cache = null;
    this._cacheTS = 0;
    this.CACHE_TTL = 60000; // 60 seconds
  }

  _log(msg) {
    this.sessionLog.push({ at: new Date().toISOString(), msg });
    if (this.sessionLog.length > 100) this.sessionLog.shift();
  }

  /* ---- fetch real data from MariaDB ---- */
  async fetchData() {
    this._log('Fetching data from MariaDB (pacific_mng + pacific_mngworks)');
    const [tasksR] =  await this.workPool.query('SELECT * FROM tasks WHERE COALESCE(archived,0)=0 ORDER BY id');
    const [projR] =   await this.workPool.query('SELECT * FROM projects WHERE COALESCE(erp_archived,0)=0 ORDER BY id');
    const [teamR] =   await this.workPool.query('SELECT * FROM erp_team ORDER BY id');
    const [actR] =    await this.workPool.query('SELECT * FROM erp_activity ORDER BY id DESC LIMIT 50');
    const [invR] =    await this.workPool.query('SELECT * FROM erp_invoices ORDER BY due DESC');

    const STATUS_MAP = { delivery: 'done', hold: 'todo', cancel: 'done' };
    const tasks = tasksR.map(r => ({
      id: 't' + r.id,
      code: r.erp_code || ('MNG-' + (1000 + r.id)),
      project: 'p' + r.project_id,
      title: r.title,
      desc: r.description || '',
      status: STATUS_MAP[r.status] || r.status,
      priority: r.erp_prio || r.priority || 'med',
      assignee: r.erp_assignee ? 'u' + r.erp_assignee : null,
      start: r.erp_start,
      due: r.due_date,
      progress: r.progress || 0,
      est: r.erp_est ? +r.erp_est : 0,
      tags: jsonParse(r.erp_tags, []),
      subtasks: jsonParse(r.erp_subtasks, []),
      comments: jsonParse(r.erp_comments, []),
    }));
    const projects = projR.map(r => ({
      id: 'p' + r.id,
      name: r.title,
      short: (r.title || '').split('—')[0].trim().slice(0, 16),
      client: r.erp_client || 'Internal',
      grad: r.erp_grad || 'g-slate',
      color: r.erp_color || '#5A6280',
      status: r.erp_status || (r.stat === 'live' ? 'done' : 'doing'),
      progress: r.erp_progress || 0,
      budget: r.erp_budget ? +r.erp_budget : 0,
      spent: r.erp_spent ? +r.erp_spent : 0,
      start: r.erp_start,
      end: r.erp_end,
    }));
    const team = teamR.map(r => ({
      id: 'u' + r.id,
      name: r.name, role: r.role, color: r.color,
      email: r.email, isMe: !!r.is_me,
    }));
    const invoices = invR.map(r => ({
      id: 'i' + r.id, no: r.no, client: 'c' + r.client_id,
      title: r.title, amount: +r.amount, vat: +r.vat,
      issue: r.issue, due: r.due, paid: r.paid, status: r.status,
    }));
    const activity = actR.map(r => ({
      at: String(r.created_at).slice(0, 16),
      teamId: r.team_id, text: r.text,
    })).reverse();

    return { tasks, projects, team, invoices, activity };
  }

  /* ---- cached data fetch (TTL = 60s) ---- */
  async getData() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTS) < this.CACHE_TTL) return this._cache;
    this._cache = await this.fetchData();
    this._cacheTS = now;
    return this._cache;
  }

  /* ---- simulate AI insight generation ---- */
  async insights() {
    const d = await this.getData();
    const now = new Date();
    const insights = [];

    // 1. Overdue tasks
    const overdue = d.tasks.filter(t =>
      t.status !== 'done' && daysLeft(t.due) < 0
    );
    if (overdue.length) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'งานเกินกำหนดแล้ว',
        text: `${overdue.length} งานเกินกำหนดมาแล้ว — ควรเร่งติดตามทันที`,
        items: overdue.slice(0, 5).map(t => ({
          code: t.code, title: t.title, assignee: d.team.find(u=>u.id===t.assignee)?.name || 'ไม่ระบุ',
          days: Math.abs(daysLeft(t.due)), project: d.projects.find(p=>p.id===t.project)?.short || '',
        })),
      });
    }

    // 2. Due today / soon
    const dueSoon = d.tasks.filter(t =>
      t.status !== 'done' && daysLeft(t.due) >= 0 && daysLeft(t.due) <= 3
    );
    if (dueSoon.length) {
      insights.push({
        type: 'info',
        icon: '📅',
        title: 'งานใกล้ครบกำหนด',
        text: `${dueSoon.length} งานครบกำหนดภายใน 3 วันนี้ — วันที่ ${dueSoon.map(t=>thDate(t.due)).join(', ')}`,
        items: dueSoon.map(t => ({
          code: t.code, title: t.title, days: daysLeft(t.due),
          priority: t.priority, project: d.projects.find(p=>p.id===t.project)?.short || '',
        })),
      });
    }

    // 3. Projects at risk
    const atRisk = d.projects.filter(p => {
      if (p.status === 'done') return false;
      const openTasks = d.tasks.filter(t => t.project === p.id && t.status !== 'done');
      if (openTasks.length === 0) return false;
      const overdueInProj = openTasks.filter(t => daysLeft(t.due) < 0);
      const nearDue = openTasks.filter(t => daysLeft(t.due) >= 0 && daysLeft(t.due) <= 2);
      return overdueInProj.length > 0 || nearDue.length >= 2;
    });
    if (atRisk.length) {
      insights.push({
        type: 'warning',
        icon: '🔴',
        title: 'โปรเจกต์เสี่ยงต่ำกลุ่ม',
        text: `${atRisk.length} โปรเจกต์มีงานล่วงเวลาหรืองวดใกล้จริง — ควรปรึกษาทีมและปรับแผน`,
        items: atRisk.map(p => ({
          name: p.short, progress: p.progress, end: p.end,
          overdueTasks: d.tasks.filter(t => t.project === p.id && daysLeft(t.due) < 0 && t.status !== 'done').length,
          nearDueTasks: d.tasks.filter(t => t.project === p.id && daysLeft(t.due) >= 0 && daysLeft(t.due) <= 2 && t.status !== 'done').length,
        })),
      });
    }

    // 4. Team workload imbalance
    const loadByUser = {};
    d.team.forEach(u => loadByUser[u.id] = { name: u.name, role: u.role, color: u.color, hours: 0, count: 0 });
    d.tasks.forEach(t => {
      if (t.status !== 'done' && loadByUser[t.assignee]) {
        const hrs = t.est * (1 - (t.progress / 100));
        loadByUser[t.assignee].hours += hrs;
        loadByUser[t.assignee].count++;
      }
    });
    const loads = Object.values(loadByUser).filter(l => l.count > 0);
    if (loads.length >= 2) {
      loads.sort((a, b) => b.hours - a.hours);
      const max = loads[0], min = loads[loads.length - 1];
      if (max.hours > min.hours * 2) {
        insights.push({
          type: 'info',
          icon: '⚖️',
          title: 'การกระจายงานไม่สมดุล',
          text: `${max.name} มีงานค้าง ${max.count} รายการ (${max.hours.toFixed(1)} ชม.) หลายเท่ากับ ${min.name} (${min.hours.toFixed(1)} ชม.) — ควร redistribute`,
          items: loads.slice(0, 4).map(l => ({ name: l.name, hours: l.hours.toFixed(1), count: l.count })),
        });
      }
    }

    // 5. Completed this week
    const thisWeek = d.tasks.filter(t =>
      t.status === 'done' && daysLeft(t.due) >= -7 && daysLeft(t.due) <= 0
    );
    if (thisWeek.length) {
      insights.push({
        type: 'success',
        icon: '✅',
        title: 'งานเสร็จสมบูรณ์ this week',
        text: `${thisWeek.length} งานเสร็จในสัปดาห์นี้ — ความสำเรียจดี`,
        items: thisWeek.slice(0, 5).map(t => ({ code: t.code, title: t.title, project: d.projects.find(p=>p.id===t.project)?.short || '' })),
      });
    }

    // 6. Invoices
    const pending = d.invoices.filter(i => i.status === 'pending');
    const overdueI = d.invoices.filter(i => i.status === 'overdue');
    if (overdueI.length) {
      insights.push({
        type: 'warning',
        icon: '💰',
        title: 'ใบแจ้งหนี้เกินกำหนดชำระ',
        text: `${overdueI.length} ใบแจ้งหนี้เกินกำหนดชำระ — รวม ${money(overdueI.reduce((s,i)=>s+i.amount+i.vat,0))}`,
        items: overdueI.slice(0, 5).map(i => ({ no: i.no, amount: money(i.amount+i.vat), due: thDate(i.due), client: i.client })),
      });
    } else if (pending.length) {
      insights.push({
        type: 'info',
        icon: '💰',
        title: 'ใบแจ้งหนี้รอชำระ',
        text: `${pending.length} ใบแจ้งหนี้อยู่ระหว่างรอชำระ — รวม ${money(pending.reduce((s,i)=>s+i.amount+i.vat,0))}`,
        items: pending.slice(0, 5).map(i => ({ no: i.no, amount: money(i.amount+i.vat), due: thDate(i.due), client: i.client })),
      });
    }

    this._log(`Generated ${insights.length} insights`);
    return { team: d.team, projects: d.projects, taskCount: d.tasks.length, insights };
  }

  /* ---- simulate AI summary generation ---- */
  async summary() {
    const d = await this.getData();
    const open = d.tasks.filter(t => t.status !== 'done');
    const done = d.tasks.filter(t => t.status === 'done');
    const overdue = open.filter(t => daysLeft(t.due) < 0);
    const priority = (p) => open.filter(t => t.priority === p).length;

    // Project status breakdown
    const projByStatus = {};
    d.projects.forEach(p => {
      (projByStatus[p.status] = projByStatus[p.status] || []).push(p);
    });

    // Revenue this month
    const paidInv = d.invoices.filter(i => i.status === 'paid' && i.paid);
    const totalRevenue = paidInv.reduce((s, i) => s + i.amount + i.vat, 0);

    // Team summary
    const userStats = {};
    d.team.forEach(u => userStats[u.id] = { name: u.name, role: u.role, open: 0, done: 0, overdue: 0 });
    d.tasks.forEach(t => {
      const u = userStats[t.assignee];
      if (u) {
        if (t.status === 'done') u.done++;
        else { u.open++; if (daysLeft(t.due) < 0) u.overdue++; }
      }
    });

    const lines = [];
    lines.push(`📊 **สรุปสถานะทีม MNGERP — ${thDate(todayS())}**`);
    lines.push(``);
    lines.push(`งานทั้งหมด: **${d.tasks.length}** รายการ | เสร็จแล้ว: **${done.length}** | ทำอยู่: **${open.length}** | เกินกำหนด: **${overdue.length}**`);
    lines.push(``);
    lines.push(`แยกตามความสำคัญ (งำหน้า): ด่วน **${priority('urgent')}** | สูง **${priority('high')}** | ปกติ **${priority('med')}** | ต่ำ **${priority('low')}**`);
    lines.push(``);
    lines.push(`โปรเจกต์: ทั้งหมด **${d.projects.length}** โปรเจกต์ — กำลังทำ **${projByStatus.doing?.length||0}**, ตรวจแก้ **${projByStatus.review?.length||0}**, เสร็จแล้ว **${projByStatus.done?.length||0}**, รอดำเนินการ **${projByStatus.todo?.length||0}**`);
    lines.push(``);
    if (overdue.length) {
      lines.push(`🚨 **${overdue.length} งานเกินกำหนด** — ควรเร่งดำเนินการ:`);
      overdue.slice(0, 3).forEach(t => {
        const u = d.team.find(x => x.id === t.assignee);
        lines.push(`  • ${t.code} — ${t.title} (${u?.name || 'ไม่ระบุ'}) · เกิน ${Math.abs(daysLeft(t.due))} วัน`);
      });
      lines.push(``);
    }
    if (totalRevenue > 0) {
      lines.push(`💰 รายได้รับชำระ (ทั้งหมด): **${money(totalRevenue)}** จาก ${paidInv.length} ใบแจ้งหนี้`);
      lines.push(``);
    }
    const topUser = Object.values(userStats).sort((a,b) => (b.done+b.open) - (a.done+a.open))[0];
    if (topUser) {
      lines.push(`👤 **${topUser.name} (${topUser.role})** มีภาระงานมากที่สุด: ${topUser.open} งานทำอยู่, ${topUser.done} งานเสร็จ`);
    }

    this._log('Generated team summary');
    return {
      summary: lines.join('\n'),
      stats: { total: d.tasks.length, done: done.length, open: open.length, overdue: overdue.length, revenue: totalRevenue },
      userStats: Object.values(userStats),
    };
  }

  /* ---- simulate AI task prioritization ---- */
  async prioritize() {
    const d = await this.getData();
    const openTasks = d.tasks.filter(t => t.status !== 'done');

    // Score each task: due date urgency + priority + effort
    const scored = openTasks.map(t => {
      let score = 0;
      const dl = daysLeft(t.due);
      // Urgency from due date (0-40 points)
      if (dl < 0) score += 40;      // overdue
      else if (dl === 0) score += 35;
      else if (dl <= 3) score += 25;
      else if (dl <= 7) score += 15;
      else score += 5;
      // Priority (0-30 points)
      const prioScore = { urgent: 30, high: 20, med: 10, low: 5 };
      score += prioScore[t.priority] || 10;
      // Progress inverse (0-15 points — tasks barely started get boost)
      score += Math.round((100 - t.progress) * 0.15);
      // Subtasks remaining (0-15 points)
      const remainingSubs = t.subtasks.filter(s => !s.d).length;
      score += remainingSubs * 3;

      return { ...t, score, project: d.projects.find(p => p.id === t.project) };
    });
    scored.sort((a, b) => b.score - a.score);

    const recommendations = scored.slice(0, 10).map((t, i) => ({
      rank: i + 1,
      code: t.code,
      title: t.title,
      priority: t.priority,
      project: t.project?.short || '—',
      assignee: d.team.find(u => u.id === t.assignee)?.name || 'ไม่ระบุ',
      daysLeft: daysLeft(t.due),
      progress: t.progress,
      est: t.est,
      score: t.score,
      reason: t.score >= 70 ? 'เกินกำหนดหรือด่วนที่สุด' :
              t.score >= 55 ? 'ใกล้ครบกำหนดและ/หรือความสำคัญสูง' :
              t.score >= 40 ? 'ควรทำก่อนงานอื่น ๆ ในลำดับนี้' :
              'จัดลำดับหลังงานเร่ง',
    }));

    this._log(`Generated ${recommendations.length} priority recommendations`);
    return {
      recommendations,
      totalOpen: openTasks.length,
      overdue: scored.filter(t => daysLeft(t.due) < 0).length,
      urgent: scored.filter(t => t.priority === 'urgent').length,
    };
  }

  /* ---- simulate AI chat (question answering) ---- */
  async chat(question, context) {
    const d = await this.getData();
    const q = (question || '').toLowerCase().trim();
    this._log(`Chat query: "${question}"`);

    const respond = (type, text, data = null) => ({ type, text, data, timestamp: new Date().toISOString() });

    // Greeting
    if (q === '' || q.match(/^(สวัสดี|hi|hello|hey|หวังดี|ใช้งานยังงี้)/)) {
      return respond('greeting', 'สวัสดีครับ! ฉันคือ hermes-mini — ผู้ช่วย AI สำหรับ MNG ERP 🤖\nฉันสามารถช่วยคุณได้หลายอย่างเชชั่น:\n\n• "มีงานเท่าไรเกินกำหนดบ้าง?"\n• "โปรเจกต์ไหนเสี่ยงมากที่สุด?"\n• "ใครทำงานมากที่สุด?"\n• "ให้คำปรึกษางานวันนี้"\n• "สรุปสถานะทีม"\n\nลองถามฉันดูไหมครับ 😊', { mode: 'standalone' });
    }

    // Overdue tasks
    if (q.includes('เกินกำหนด') || q.includes('overdue') || q.includes('ล่วงเวลา')) {
      const overdue = d.tasks.filter(t => t.status !== 'done' && daysLeft(t.due) < 0);
      if (!overdue.length) return respond('info', 'ยอดดี! ไม่มีงานเกินกำหนดเลยครับ 🎉');
      return respond('list', `มี **${overdue.length} งานเกินกำหนด** ดังนี้:`, overdue.map(t => ({
        code: t.code, title: t.title,
        assignee: d.team.find(u => u.id === t.assignee)?.name || 'ไม่ระบุ',
        days: Math.abs(daysLeft(t.due)),
        project: d.projects.find(p => p.id === t.project)?.short || '',
      })));
    }

    // Today's tasks / deadlines
    if (q.includes('วันนี้') || q.includes('today') || q.includes('ครบกำหนด')) {
      const today = d.tasks.filter(t => t.status !== 'done' && daysLeft(t.due) === 0);
      const todayEvents = d.activities?.filter(a => true) || [];
      if (!today.length) return respond('info', 'ไม่มีงานครบกำหนดวันนี้ครับ 🎉');
      return respond('list', `งานครบกำหนด **วันนี้** (${overdue.length ? overdue.length + ' overdue' : ''}):`,
        today.map(t => ({ code: t.code, title: t.title, assignee: d.team.find(u => u.id === t.assignee)?.name, priority: t.priority })));
    }

    // Priority / recommendations
    if (q.includes('ทำไหร่') || q.includes('ลำดับ') || q.includes('priority') || q.includes('first') || q.includes('prioritize')) {
      const pri = await this.prioritize();
      return respond('recommendations', 'นี่คือลำดับความสำคัญที่ hermes-mini แนะนำ:', pri.recommendations.slice(0, 7));
    }

    // Project status
    if (q.includes('โปรเจกต์') || q.includes('project')) {
      const projList = d.projects.map(p => ({
        name: p.short, status: p.status, progress: p.progress + '%',
        owner: '—', end: p.end,
        openTasks: d.tasks.filter(t => t.project === p.id && t.status !== 'done').length,
      }));
      return respond('list', `มี **${d.projects.length} โปรเจกต์** อยู่ในระบบ:`, projList);
    }

    // Who does the most
    if (q.includes('ใครทำ') || q.includes('ทีมงาน') || q.includes('workload') || q.includes('งานมาก') || q.includes('ใคร')) {
      const loadByUser = {};
      d.team.forEach(u => loadByUser[u.id] = { name: u.name, role: u.role, open: 0, done: d.tasks.filter(t => t.assignee === u.id && t.status === 'done').length });
      d.tasks.forEach(t => { if (t.status !== 'done' && loadByUser[t.assignee]) loadByUser[t.assignee].open++; });
      const sorted = Object.values(loadByUser).filter(l => l.open > 0).sort((a, b) => b.open - a.open);
      return respond('list', 'การกระจายงานในทีม:', sorted.map(u => ({ name: u.name, role: u.role, open: u.open, done: u.done })));
    }

    // Revenue / invoices
    if (q.includes('เงิน') || q.includes('รายได้') || q.includes('invoice') || q.includes('ใบแจ้งหนี้') || q.includes('billing')) {
      const total = d.invoices.reduce((s, i) => s + i.amount + i.vat, 0);
      const paid = d.invoices.filter(i => i.status === 'paid');
      const received = paid.reduce((s, i) => s + i.amount + i.vat, 0);
      return respond('info', `📊 **สรุปการเงิน**\n\nรวมใบแจ้งหนี้ทั้งหมด: ${d.invoices.length} ฉบับ\nรวมมูลค่า: ${money(total)}\nชำระแล้ว: ${paid.length} ฉบัก (${money(received)})\nรอชำระ: ${d.invoices.filter(i => i.status === 'pending').length} ฉบับ\nเกินกำหนด: ${d.invoices.filter(i => i.status === 'overdue').length} ฉบับ`);
    }

    // Summary — check before team ("สรุปสถานะทีม" contains "ทีม")
    if (q.includes('สรุป') || q.includes('summary') || q.includes('ภาพรวม')) {
      const s = await this.summary();
      return respond('summary', s.summary);
    }

    // Default: acknowledge + offer help
    return respond('info', `ฉันเข้าใจคุณกำลังถามเกี่ยวกับ "${question}"\n\nษันท์ฉันสามารถช่วยได้:\n• ตรวจสอบงานเกินกำหนด\n• ให้คำปรึกษาลำดับความสำคัญ\n• สรุปสถานะทีมและโปรเจกต์\n• วิเคราะห์การกระจายงานในทีม\n• ติดตามการเงิน / ใบแจ้งหนี้\n\nลองพิมพ์มาใหม่หรือเลือกหนึ่งในข้อเสนอแนะเหนือนี้ดูไหมครับ?`, { suggestions: ['มีงานเท่าไรเกินกำหนดบ้าง?', 'ให้คำปรึกษางานวันนี้', 'สรุปสถานะทีม', 'โปรเจกต์ไหนเสี่ยงมากที่สุด?', 'ใครทำงานมากที่สุด?'] });
  }

  /* ---- simulate AI risk prediction ---- */
  async predictRisk() {
    const d = await this.getData();
    const risks = [];

    // Task-level risk
    d.tasks.forEach(t => {
      if (t.status === 'done') return;
      const dl = daysLeft(t.due);
      const proj = d.projects.find(p => p.id === t.project);
      let risk = 'low', reason = '';
      if (dl < 0) { risk = 'high'; reason = `เกินกำหนด ${Math.abs(dl)} วัน`; }
      else if (dl <= 1) { risk = 'high'; reason = `ครบกำหนดภายใน ${dl} วันและ progress เพียง ${t.progress}%`; }
      else if (dl <= 3 && t.progress < 50) { risk = 'medium'; reason = `ใกล้ครบกำหนดแต่ progress ต่ำ (${t.progress}%)`; }
      else if (t.est > 0 && t.progress > 0 && dl > 0) {
        const el = daysLeft(t.start);
        const daysElapsed = t.est - (t.est * t.progress / 100);
        if (daysElapsed > dl) { risk = 'medium'; reason = ` pace ไม่พอสะสม (เหลือ ${t.progress}% ในขณะที่เวลาเหลือ ${dl} วัน)`; }
      }
      if (risk !== 'low') {
        risks.push({
          itemType: 'task', code: t.code, title: t.title, risk, reason,
          project: proj?.short || '—', assignee: d.team.find(u => u.id === t.assignee)?.name || 'ไม่ระบุ',
          daysLeft: dl, progress: t.progress, est: t.est,
        });
      }
    });

    // Project-level risk
    d.projects.forEach(p => {
      if (p.status === 'done') return;
      const projTasks = d.tasks.filter(t => t.project === p.id);
      const openTasks = projTasks.filter(t => t.status !== 'done');
      const overdueTasks = openTasks.filter(t => daysLeft(t.due) < 0);
      const nearDue = openTasks.filter(t => daysLeft(t.due) >= 0 && daysLeft(t.due) <= 2);
      let risk = 'low', reason = '';
      if (overdueTasks.length > 0) { risk = 'high'; reason = `${overdueTasks.length} งานเกินกำหนดแล้ว`; }
      else if (nearDue.length >= 2) { risk = 'medium'; reason = `${nearDue.length} งานใกล้ครบกำหนด (≤2 วัน)`; }
      else if (p.progress < 30 && daysLeft(p.end) <= 7) { risk = 'medium'; reason = `progress ต่ำ (${p.progress}%) แต่ครบกำหนดภายในสัปดาห์`; }
      if (risk !== 'low') {
        risks.push({
          itemType: 'project', name: p.short, risk, reason,
          progress: p.progress, end: p.end,
          openTasks: openTasks.length, overdue: overdueTasks.length,
        });
      }
    });

    // Sort by risk severity
    const riskOrder = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

    this._log(`Predicted ${risks.length} risks (${risks.filter(r=>r.risk==='high').length} high, ${risks.filter(r=>r.risk==='medium').length} medium)`);
    return { risks, riskCount: risks.length, highCount: risks.filter(r => r.risk === 'high').length };
  }

  /* ---- simulate AI worklog generation ---- */
  async generateWorklog(taskId) {
    const d = await this.getData();
    const t = d.tasks.find(x => x.id === taskId || x.code === taskId);
    if (!t) return { error: `ไม่พบงาน ${taskId}` };
    const p = d.projects.find(x => x.id === t.project);
    const u = d.team.find(x => x.id === t.assignee);

    const now = new Date();
    const worklog = {
      title: `Worklog — ${t.code} ${t.title}`,
      date: thDate(todayS()),
      task: { code: t.code, title: t.title, project: p?.short, status: STATUS_META[t.status]?.label },
      assignee: u?.name || 'ไม่ระบุ',
      progress: t.progress,
      est: t.est,
      due: t.due,
      daysLeft: daysLeft(t.due),
      tags: t.tags,
      subtasks: t.subtasks.map(s => ({ ...s, done: s.d })),
      comments: t.comments,
      activity: `สถานะปัจจุบัน: ${STATUS_META[t.status].label} (${t.progress}%)\n` +
        `เหลือเวลา: ${daysLeft(t.due)} วัน\n` +
        `ความเหลื่อของงาน: ${t.est - (t.est * t.progress / 100)} ชม.\n` +
        `แท็ก: ${t.tags.join(', ') || '—'}`,
      aiNote: this._aiNote(t, daysLeft(t.due), p),
    };

    this._log(`Generated worklog for ${t.code}`);
    return worklog;
  }

  _aiNote(t, dl, p) {
    if (dl < 0) return `🚨 งานนี้เกินกำหนด ${Math.abs(dl)} วันแล้ว — ควรประชุมกับทีม assignee ทันที และพิจารณา reassign หรือขยายกำหนด`;
    if (dl === 0) return `⏰ งานครบกำหนดวันนี้ — ตรวจสอบให้แน่ใจว่าทุกงานย่อยเสร็จหรืออัปเดตสถานะเป็น 'ตรวจแก้' ก่อน EOD`;
    if (dl <= 3) return `⚡ งานนี้ครบกำหนดอีก ${dl} วัน — progress ปัจจุบัน ${t.progress}% ควรเพิ่มความเร็ว`;
    if (t.progress < 30 && t.est > 0) return `📈 งานยังอยู่ในขั้นตอนเริ่มต้น (progress ${t.progress}%) ควรแบ่งเป็นงานย่อยเพิ่มเพื่อให้ก้าวหน้าชัดเจนขึ้น`;
    if (t.progress >= 80 && t.status !== 'done') return `🎯 งานใกล้เสร็จ (${t.progress}%) — ควรเร่งให้ผ่าน QA และอัปเดตสถานะเป็น 'เสร็จแล้ว' ภายในวันนี้`;
    return `✅ งานคลี่คลายดี — เร่งดำเนินต่อตามแผน`;
  }

  /* ---- get team member details ---- */
  async memberDetail(userId) {
    const d = await this.getData();
    const uid = userId.startsWith('u') ? userId : 'u' + userId;
    const m = d.team.find(u => u.id === uid);
    if (!m) return { error: 'ไม่พบสมาชิกทีม' };

    const tasks = d.tasks.filter(t => t.assignee === uid);
    const open = tasks.filter(t => t.status !== 'done');
    const done = tasks.filter(t => t.status === 'done');
    const overdue = open.filter(t => daysLeft(t.due) < 0);

    return {
      member: m,
      stats: { total: tasks.length, open: open.length, done: done.length, overdue: overdue.length },
      openTasks: open.map(t => ({ code: t.code, title: t.title, project: d.projects.find(p => p.id === t.project)?.short, due: t.due, priority: t.priority, progress: t.progress })),
    };
  }

  /* ---- uptime / health ---- */
  status() {
    return {
      name: 'hermes-mini',
      version: '1.0.0',
      uptime: Date.now() - this.startTime,
      dbConnected: !!(this.workPool && this.authPool),
      features: ['insights', 'summary', 'prioritize', 'chat', 'predictRisk', 'worklog', 'memberDetail'],
      log: this.sessionLog.slice(-10).reverse(),
    };
  }
}

/* ---------- helpers ---------- */
function jsonParse(v, fb) {
  if (v == null) return fb;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

module.exports = { HermesMini, jsonParse, daysLeft, todayS, thDate, money };
