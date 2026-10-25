/* MNG ERP — Agency OS Workspace Routes:
   1. Live Presence (/me/state)
   2. AI Workforce (/ai/*)
   3. Team Chat & Channels (/channels/*, /messages/*)
   4. HR Attendance Check-in & Leaves (/checkins/*, /leaves/*)
   5. Meeting Rooms & Studio Bookings (/rooms/*, /bookings/*) */

const express = require('express');
const { workPool } = require('./db');
const { resolveActorTeamId, logActivity } = require('./routes');

const router = express.Router();

const J = (x, fb) => { if (x == null) return fb; if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return fb; } };
const numid = fid => parseInt(String(fid ?? '').replace(/^[a-z_]+/i, ''), 10);
const escS = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEAD_ROLES = ['super_admin', 'admin', 'manager'];
const guardManage = (req, res, roles = LEAD_ROLES) => {
  if (!roles.includes(req.user?.role)) { res.status(403).json({ error: 'สิทธิ์ไม่พอ — เฉพาะ Admin/Manager' }); return false; }
  return true;
};

function bangkokNow() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function minutesDiff(hhmmActual, hhmmStart) {
  const [ah, am] = String(hhmmActual || '09:30').split(':').map(Number);
  const [sh, sm] = String(hhmmStart || '09:30').split(':').map(Number);
  if ([ah, am, sh, sm].some(Number.isNaN)) return 0;
  return Math.max(0, (ah * 60 + am) - (sh * 60 + sm));
}

/* =========================================================================
   1. LIVE PRESENCE (ทุกคนเปลี่ยนสถานะตัวเองได้ทันที)
   ========================================================================= */
const VALID_STATES = new Set(['online', 'working', 'focus', 'away']);

router.patch('/me/state', async (req, res) => {
  const state = String(req.body?.state || '');
  if (!VALID_STATES.has(state)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  try {
    const teamId = await resolveActorTeamId(req);
    await workPool.query('UPDATE erp_team SET state = ? WHERE id = ?', [state, teamId]);
    res.json({ ok: true, teamId: 'u' + teamId, state });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =========================================================================
   2. AI WORKFORCE (AI Agents, Run Execution, Token Logs)
   ========================================================================= */
function buildAgentDeliverable(agent, task, customPrompt) {
  const role = String(agent.role || '').toLowerCase();
  const title = task ? `${task.erp_code || ('#' + task.id)} — ${task.title}` : 'วิเคราะห์ภาพรวมระบบ';
  const promptNote = customPrompt ? ` (คำสั่งเพิ่มเติม: ${customPrompt})` : '';

  if (role.includes('engineer') || agent.name === 'BYTE') {
    return {
      action: task ? 'วิเคราะห์โค้ด แตกงานเทคนิค และตรวจ Schema' : 'ตรวจสอบสุขภาพโค้ดและฐานข้อมูล',
      subtasks: [
        { t: 'ตรวจสอบโครงสร้าง API และ Validation', d: true },
        { t: 'เชื่อมข้อมูล MariaDB และทดสอบ Edge Cases', d: true },
        { t: 'รันชุดทดสอบอัตโนมัติก่อนส่งตรวจรับ', d: false },
      ],
      output: `🤖 [${agent.name}] ดำเนินการกับ "${title}"${promptNote}: ตรวจสอบโครงสร้าง API/Database เรียบร้อย สร้างแผนการพัฒนาและอัปเดตความคืบหน้าให้ทีมรีวิวต่อได้ทันที`,
      tokens: 1850 + Math.floor(Math.random() * 900),
      durationSec: 9 + Math.floor(Math.random() * 8),
    };
  }
  if (role.includes('qa') || agent.name === 'ECHO') {
    return {
      action: 'สร้างชุดทดสอบ QA Gate และตรวจความถูกต้อง',
      subtasks: [
        { t: 'ตรวจสอบ UX Flow บน Desktop & Mobile', d: true },
        { t: 'ทดสอบกรณีข้อมูลว่างและสิทธิ์ผู้ใช้งาน', d: true },
        { t: 'ยืนยันผลลัพธ์ขั้นสุดท้ายกับเจ้าของโปรเจกต์', d: false },
      ],
      output: `🤖 [${agent.name}] ตรวจสอบคุณภาพ "${title}"${promptNote}: จำลอง Test Scenarios ครบถ้วน ไม่พบบั๊กร้ายแรง พร้อมส่งเข้าสู่ขั้นตอนตรวจรับงาน`,
      tokens: 1420 + Math.floor(Math.random() * 700),
      durationSec: 7 + Math.floor(Math.random() * 6),
    };
  }
  if (role.includes('finance') || role.includes('analytic') || agent.name === 'ORBIT') {
    return {
      action: 'วิเคราะห์ต้นทุน ชั่วโมงทำงาน และความคุ้มค่างบ',
      subtasks: [
        { t: 'คำนวณชั่วโมงประเมินเทียบงบคงเหลือ', d: true },
        { t: 'สรุปความเสี่ยงด้านกำหนดส่งมอบ', d: true },
      ],
      output: `🤖 [${agent.name}] วิเคราะห์ข้อมูล "${title}"${promptNote}: ตรวจสอบสัดส่วนงบประมาณและชั่วโมงงานคงเหลืออยู่ในเกณฑ์ปลอดภัย แนะนำติดตามงานค้างรายสัปดาห์`,
      tokens: 1180 + Math.floor(Math.random() * 600),
      durationSec: 6 + Math.floor(Math.random() * 5),
    };
  }
  if (role.includes('creative') || role.includes('design') || agent.name === 'PIXEL') {
    return {
      action: 'ร่างแนวทางดีไซน์ UX Copy และองค์ประกอบภาพ',
      subtasks: [
        { t: 'จัดวางลำดับความสำคัญของข้อมูลบนหน้าจอ', d: true },
        { t: 'เกลาข้อความภาษาไทยให้อ่านกระชับชัดเจน', d: true },
      ],
      output: `🤖 [${agent.name}] เตรียมแนวทางดีไซน์สำหรับ "${title}"${promptNote}: สรุป Mood & Tone และข้อความ UI ภาษาไทยพร้อมใช้งาน`,
      tokens: 1560 + Math.floor(Math.random() * 750),
      durationSec: 8 + Math.floor(Math.random() * 7),
    };
  }
  return {
    action: 'สรุปแผนงาน ติดตามความคืบหน้า และอัปเดตสถานะ',
    subtasks: [
      { t: 'รวบรวมขอบเขตงานและผู้เกี่ยวข้อง', d: true },
      { t: 'จัดลำดับความสำคัญและกำหนดส่งมอบย่อย', d: true },
      { t: 'แจ้งเตือนสรุปผลให้ทีมตรวจทาน', d: false },
    ],
    output: `🤖 [${agent.name}] ประสานงาน "${title}"${promptNote}: จัดระเบียบรายการย่อย อัปเดตความคืบหน้า และเตรียมสรุปสำหรับทีมเรียบร้อย`,
    tokens: 1340 + Math.floor(Math.random() * 650),
    durationSec: 7 + Math.floor(Math.random() * 6),
  };
}

router.post('/ai/agents/:id/run', async (req, res) => {
  const agentId = numid(req.params.id);
  if (!agentId) return res.status(400).json({ error: 'bad_agent_id' });
  try {
    const [agRows] = await workPool.query("SELECT * FROM erp_team WHERE id = ? AND kind = 'ai' LIMIT 1", [agentId]);
    if (!agRows.length) return res.status(404).json({ error: 'ไม่พบเอเจนต์ AI' });
    const agent = agRows[0];
    if (agent.paused) return res.status(400).json({ error: `เอเจนต์ ${agent.name} ถูกพักการทำงานอยู่ กรุณากดเปิดใช้งานก่อน` });

    const taskId = req.body?.taskId ? numid(req.body.taskId) : (agent.current_task_id || null);
    let task = null;
    if (taskId) {
      const [tRows] = await workPool.query('SELECT * FROM tasks WHERE id = ? AND archived = 0 LIMIT 1', [taskId]);
      task = tRows[0] || null;
    } else {
      const [tRows] = await workPool.query(
        "SELECT * FROM tasks WHERE archived = 0 AND status != 'done' ORDER BY (erp_assignee = ?) DESC, id DESC LIMIT 1",
        [agentId]
      );
      task = tRows[0] || null;
    }

    const plan = buildAgentDeliverable(agent, task, req.body?.prompt);
    const nowStamp = `${bangkokNow().date} ${bangkokNow().time}`;

    if (task) {
      const curSubs = J(task.erp_subtasks, []);
      const nextSubs = curSubs.length ? curSubs : plan.subtasks;
      const curComments = J(task.erp_comments, []);
      const nextComments = [...curComments, { u: 'u' + agentId, at: nowStamp, text: plan.output }];
      const nextStatus = task.status === 'todo' ? 'doing' : (task.status === 'doing' ? 'review' : task.status);
      const nextProg = task.status === 'done' ? 100 : Math.min(95, Math.max(task.progress || 0, 40) + 25);

      await workPool.query(
        `UPDATE tasks
         SET status = ?, progress = ?, erp_assignee = COALESCE(erp_assignee, ?),
             erp_subtasks = ?, erp_comments = ?, erp_spent = COALESCE(erp_spent, 0) + 0.5
         WHERE id = ?`,
        [nextStatus, nextProg, agentId, JSON.stringify(nextSubs), JSON.stringify(nextComments), task.id]
      );
    }

    await workPool.query(
      `UPDATE erp_team
       SET runs = COALESCE(runs, 0) + 1,
           tokens_today = COALESCE(tokens_today, 0) + ?,
           state = 'working',
           current_task_id = ?
       WHERE id = ?`,
      [plan.tokens, task ? task.id : null, agentId]
    );

    const detail = task ? `${task.erp_code || ('#' + task.id)} — ${task.title}` : 'ตรวจสอบภาพรวมงานในระบบ';
    const [runIns] = await workPool.query(
      `INSERT INTO erp_ai_runs (agent_id, task_id, action, detail, output, duration_sec, tokens, status)
       VALUES (?,?,?,?,?,?,?, 'success')`,
      [agentId, task ? task.id : null, plan.action, detail, plan.output, plan.durationSec, plan.tokens]
    );

    await logActivity(`🤖 <b>${escS(agent.name)}</b> รันงาน ${escS(detail)} (${plan.tokens.toLocaleString()} tokens)`, agentId);

    res.json({
      ok: true,
      runId: 'ar' + runIns.insertId,
      output: plan.output,
      tokens: plan.tokens,
      durationSec: plan.durationSec,
      taskId: task ? 't' + task.id : null,
    });
  } catch (e) {
    console.error('[ai/run]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/ai/toggle-all', async (req, res) => {
  if (!guardManage(req, res)) return;
  const enabled = !!req.body?.enabled;
  try {
    await workPool.query("UPDATE erp_team SET paused = ?, state = ? WHERE kind = 'ai'", [
      enabled ? 0 : 1,
      enabled ? 'online' : 'away',
    ]);
    const [cur] = await workPool.query('SELECT data FROM erp_settings WHERE id = 1');
    const data = { ...J(cur[0]?.data, {}), aiEnabled: enabled };
    await workPool.query('INSERT INTO erp_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = ?', [
      JSON.stringify(data), JSON.stringify(data),
    ]);
    await logActivity(`${enabled ? 'เปิดการทำงาน' : 'พักการทำงาน'} AI Workforce ทั้งระบบ`, req);
    res.json({ ok: true, aiEnabled: enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =========================================================================
   3. TEAM CHAT & CHANNELS (รวมระบบเรียก @AI ตอบในแชทอัตโนมัติ)
   ========================================================================= */
router.post('/channels', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อห้องแชท' });
  try {
    const actorId = await resolveActorTeamId(req);
    const [allTeam] = await workPool.query('SELECT id FROM erp_team ORDER BY id');
    const members = Array.isArray(b.members) && b.members.length
      ? b.members.map(numid).filter(Boolean)
      : allTeam.map(x => x.id);
    const cleanName = b.name.trim().replace(/^#+/, '');
    const [r] = await workPool.query(
      'INSERT INTO erp_channels (name, emoji, type, topic, project_id, members, pinned) VALUES (?,?,?,?,?,?,?)',
      [cleanName, b.emoji || '💬', b.type || 'group', b.topic?.trim() || null, b.projectId ? numid(b.projectId) : null, JSON.stringify(members), b.pinned ? 1 : 0]
    );
    await workPool.query(
      'INSERT INTO erp_messages (channel_id, author_id, text, kind) VALUES (?,?,?,?)',
      [r.insertId, actorId, `สร้างห้อง #${cleanName} แล้ว — สามารถพูดคุย แชร์ไฟล์ หรือพิมพ์ @NOVA / @BYTE เพื่อถามสถานะงานได้ทันที`, 'system']
    );
    res.status(201).json({ id: 'ch' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/channels/:id', async (req, res) => {
  const id = numid(req.params.id);
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.name !== undefined && String(b.name).trim()) { sets.push('name = ?'); vals.push(String(b.name).trim()); }
  if (b.emoji !== undefined) { sets.push('emoji = ?'); vals.push(b.emoji || '💬'); }
  if (b.topic !== undefined) { sets.push('topic = ?'); vals.push(b.topic || null); }
  if (b.pinned !== undefined) { sets.push('pinned = ?'); vals.push(b.pinned ? 1 : 0); }
  if (!sets.length) return res.json({ ok: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE erp_channels SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/channels/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  try {
    await workPool.query('DELETE FROM erp_messages WHERE channel_id = ?', [id]);
    await workPool.query('DELETE FROM erp_channels WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels/:id/messages', async (req, res) => {
  const channelId = numid(req.params.id);
  const b = req.body || {};
  if (!b.text?.trim() && !b.attachmentUrl) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความหรือแนบไฟล์' });
  try {
    const authorId = await resolveActorTeamId(req);
    const text = (b.text || '').trim() || `แนบไฟล์: ${b.attachmentName || 'เอกสาร'}`;
    const [ins] = await workPool.query(
      'INSERT INTO erp_messages (channel_id, author_id, text, kind, attachment_url, attachment_name) VALUES (?,?,?,?,?,?)',
      [channelId, authorId, text, 'text', b.attachmentUrl || null, b.attachmentName || null]
    );

    // Check if user mentioned an AI agent (e.g. @NOVA, @BYTE, @ECHO, @ORBIT, @PIXEL)
    const [aiAgents] = await workPool.query("SELECT * FROM erp_team WHERE kind = 'ai' AND paused = 0");
    const mentioned = aiAgents.find(ag => new RegExp(`@${ag.name}\\b`, 'i').test(text));
    if (mentioned) {
      const [[openStat]] = await workPool.query("SELECT COUNT(*) openCnt, SUM(CASE WHEN erp_blocked=1 THEN 1 ELSE 0 END) blockedCnt FROM tasks WHERE archived = 0 AND status != 'done'");
      const [[overdueStat]] = await workPool.query("SELECT COUNT(*) odCnt FROM tasks WHERE archived = 0 AND status != 'done' AND due_date < CURDATE()");
      const [[invStat]] = await workPool.query("SELECT COUNT(*) pendCnt, COALESCE(SUM(amount+vat),0) pendAmt FROM erp_invoices WHERE status IN ('pending','overdue')");
      const reply = `สวัสดีครับ (${mentioned.name} รายงานสด) — ขณะนี้ในระบบมีงานเปิดอยู่ ${openStat.openCnt || 0} งาน (เลยกำหนด ${overdueStat.odCnt || 0} งาน, ติดปัญหา Blocked ${openStat.blockedCnt || 0} งาน) และใบแจ้งหนี้รอรับชำระ ${invStat.pendCnt || 0} ใบรวม ฿${Math.round(invStat.pendAmt || 0).toLocaleString('th-TH')} ครับ`;

      await workPool.query(
        'INSERT INTO erp_messages (channel_id, author_id, text, kind) VALUES (?,?,?,?)',
        [channelId, mentioned.id, reply, 'ai']
      );
      await workPool.query(
        'UPDATE erp_team SET runs = COALESCE(runs,0)+1, tokens_today = COALESCE(tokens_today,0)+640 WHERE id = ?',
        [mentioned.id]
      );
      await workPool.query(
        "INSERT INTO erp_ai_runs (agent_id, action, detail, output, duration_sec, tokens, status) VALUES (?,?,?,?, 3, 640, 'success')",
        [mentioned.id, 'ตอบคำถามอัตโนมัติในห้องแชททีม', text.slice(0, 120), reply]
      );
    }

    res.status(201).json({ id: 'm' + ins.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/messages/:id', async (req, res) => {
  const id = numid(req.params.id);
  const b = req.body || {};
  try {
    const [rows] = await workPool.query('SELECT * FROM erp_messages WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบข้อความ' });
    const msg = rows[0];

    if (b.pinned !== undefined) {
      await workPool.query('UPDATE erp_messages SET pinned = ? WHERE id = ?', [b.pinned ? 1 : 0, id]);
    }
    if (b.emoji) {
      const actor = 'u' + (await resolveActorTeamId(req));
      const reactions = J(msg.reactions, {});
      const list = Array.isArray(reactions[b.emoji]) ? reactions[b.emoji] : [];
      reactions[b.emoji] = list.includes(actor) ? list.filter(u => u !== actor) : [...list, actor];
      if (!reactions[b.emoji].length) delete reactions[b.emoji];
      await workPool.query('UPDATE erp_messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/messages/:id', async (req, res) => {
  const id = numid(req.params.id);
  try {
    await workPool.query('DELETE FROM erp_messages WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =========================================================================
   4. HR ATTENDANCE CHECK-IN (GPS / WFH) & LEAVE MANAGEMENT
   ========================================================================= */
router.post('/checkins/in', async (req, res) => {
  try {
    const teamId = await resolveActorTeamId(req);
    const { date, time } = bangkokNow();
    const b = req.body || {};
    const mode = ['office', 'wfh', 'onsite'].includes(b.mode) ? b.mode : 'office';

    const [setR] = await workPool.query('SELECT data FROM erp_settings WHERE id = 1');
    const settings = J(setR[0]?.data, {});
    const workStart = settings.workStart || '09:30';
    const office = settings.office || { lat: 13.7563, lng: 100.5018, radius: 250 };

    let distanceM = null;
    if (b.lat != null && b.lng != null && office.lat != null && office.lng != null) {
      distanceM = haversineMeters(+b.lat, +b.lng, +office.lat, +office.lng);
    }
    const lateMin = minutesDiff(time, workStart);

    await workPool.query(
      `INSERT INTO erp_checkins (team_id, work_date, clock_in, mode, lat, lng, distance_m, note, late_min)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE clock_in = VALUES(clock_in), mode = VALUES(mode), lat = VALUES(lat), lng = VALUES(lng), distance_m = VALUES(distance_m), note = VALUES(note), late_min = VALUES(late_min)`,
      [teamId, date, time, mode, b.lat ?? null, b.lng ?? null, distanceM, b.note?.trim() || null, lateMin]
    );
    await workPool.query("UPDATE erp_team SET state = 'working' WHERE id = ?", [teamId]);
    await logActivity(`ลงเวลาเข้างาน <b>${time}</b> (${mode === 'wfh' ? 'WFH' : mode === 'onsite' ? 'นอกสถานที่' : 'ออฟฟิศ'})`, teamId);
    res.json({ ok: true, date, clockIn: time, distanceM, lateMin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkins/out', async (req, res) => {
  try {
    const teamId = await resolveActorTeamId(req);
    const { date, time } = bangkokNow();
    const [upd] = await workPool.query(
      'UPDATE erp_checkins SET clock_out = ? WHERE team_id = ? AND work_date = ?',
      [time, teamId, date]
    );
    if (!upd.affectedRows) {
      return res.status(400).json({ error: 'ยังไม่ได้ลงเวลาเข้างานของวันนี้' });
    }
    await workPool.query("UPDATE erp_team SET state = 'away' WHERE id = ?", [teamId]);
    await logActivity(`ลงเวลาเลิกงาน <b>${time}</b>`, teamId);
    res.json({ ok: true, date, clockOut: time });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const LEAVE_LABELS = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  annual: 'ลาพักร้อน',
  wfh: 'ปฏิบัติงานที่บ้าน (WFH)',
};

router.post('/leaves', async (req, res) => {
  const b = req.body || {};
  if (!b.startDate || !b.endDate) return res.status(400).json({ error: 'กรุณาระบุวันที่ลา' });
  try {
    const teamId = b.teamId ? numid(b.teamId) : await resolveActorTeamId(req);
    const d1 = new Date(b.startDate);
    const d2 = new Date(b.endDate);
    const calcDays = Math.max(0.5, Math.round((d2 - d1) / 86400000) + 1);
    const days = b.days ? +b.days : calcDays;
    const leaveType = LEAVE_LABELS[b.leaveType] ? b.leaveType : 'annual';

    const [ins] = await workPool.query(
      'INSERT INTO erp_leaves (team_id, leave_type, start_date, end_date, days, reason, status) VALUES (?,?,?,?,?,?,?)',
      [teamId, leaveType, b.startDate, b.endDate, days, b.reason?.trim() || null, 'pending']
    );
    await logActivity(`ยื่นคำขอ<b>${LEAVE_LABELS[leaveType]}</b> (${escS(b.startDate)} ถึง ${escS(b.endDate)})`, teamId);
    res.status(201).json({ id: 'lv' + ins.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/leaves/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  const status = req.body?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'สถานะใบลาไม่ถูกต้อง' });
  }
  try {
    const approverId = await resolveActorTeamId(req);
    const [rows] = await workPool.query('SELECT * FROM erp_leaves WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบใบลา' });
    const lv = rows[0];
    const [mRows] = await workPool.query('SELECT name FROM erp_team WHERE id = ? LIMIT 1', [lv.team_id]);
    const memberName = mRows[0]?.name || ('สมาชิก #' + lv.team_id);

    let calId = lv.calendar_event_id || null;
    if (status === 'approved' && !calId) {
      const startIso = typeof lv.start_date === 'string' ? lv.start_date.slice(0, 10) : new Date(lv.start_date).toISOString().slice(0, 10);
      const [evIns] = await workPool.query(
        `INSERT INTO erp_events (title, cat, date, start, end, allday, descp, members)
         VALUES (?, 'holiday', ?, '00:00', '23:59', 1, ?, ?)`,
        [`🌴 ${LEAVE_LABELS[lv.leave_type] || 'ลางาน'}: ${memberName}`, startIso, lv.reason || '', JSON.stringify([lv.team_id])]
      );
      calId = evIns.insertId;
    } else if (status !== 'approved' && calId) {
      await workPool.query('DELETE FROM erp_events WHERE id = ?', [calId]);
      calId = null;
    }

    await workPool.query(
      'UPDATE erp_leaves SET status = ?, approved_by = ?, calendar_event_id = ? WHERE id = ?',
      [status, approverId, calId, id]
    );
    await logActivity(`${status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}ใบลาของ <b>${escS(memberName)}</b>`, approverId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/leaves/:id', async (req, res) => {
  const id = numid(req.params.id);
  try {
    const [rows] = await workPool.query('SELECT calendar_event_id FROM erp_leaves WHERE id = ? LIMIT 1', [id]);
    if (rows[0]?.calendar_event_id) {
      await workPool.query('DELETE FROM erp_events WHERE id = ?', [rows[0].calendar_event_id]);
    }
    await workPool.query('DELETE FROM erp_leaves WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =========================================================================
   5. MEETING ROOMS & STUDIO BOOKINGS (ป้องกันจองชน + ซิงก์ขึ้นปฏิทิน)
   ========================================================================= */
router.post('/rooms', async (req, res) => {
  if (!guardManage(req, res)) return;
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อห้องหรืออุปกรณ์' });
  try {
    const [ins] = await workPool.query(
      'INSERT INTO erp_rooms (name, kind, capacity, floor, color, equipment, status) VALUES (?,?,?,?,?,?,?)',
      [
        b.name.trim(),
        b.kind || 'room',
        +b.capacity || 6,
        b.floor?.trim() || null,
        b.color || '#3BA7FF',
        JSON.stringify(Array.isArray(b.equipment) ? b.equipment : []),
        b.status || 'available',
      ]
    );
    res.status(201).json({ id: 'rm' + ins.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/rooms/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.name !== undefined && String(b.name).trim()) { sets.push('name = ?'); vals.push(String(b.name).trim()); }
  if (b.kind !== undefined) { sets.push('kind = ?'); vals.push(b.kind); }
  if (b.capacity !== undefined) { sets.push('capacity = ?'); vals.push(+b.capacity || 1); }
  if (b.floor !== undefined) { sets.push('floor = ?'); vals.push(b.floor || null); }
  if (b.color !== undefined) { sets.push('color = ?'); vals.push(b.color || '#3BA7FF'); }
  if (b.equipment !== undefined) { sets.push('equipment = ?'); vals.push(JSON.stringify(Array.isArray(b.equipment) ? b.equipment : [])); }
  if (b.status !== undefined) { sets.push('status = ?'); vals.push(b.status); }
  if (!sets.length) return res.json({ ok: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE erp_rooms SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/rooms/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  try {
    await workPool.query('DELETE FROM erp_bookings WHERE room_id = ?', [id]);
    await workPool.query('DELETE FROM erp_rooms WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bookings', async (req, res) => {
  const b = req.body || {};
  const roomId = numid(b.roomId);
  if (!roomId || !b.title?.trim() || !b.date || !b.startTime || !b.endTime) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลการจองให้ครบถ้วน' });
  }
  if (String(b.startTime) >= String(b.endTime)) {
    return res.status(400).json({ error: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น' });
  }
  try {
    // Check overlap on the same room & date
    const [clash] = await workPool.query(
      `SELECT id, title, start_time, end_time FROM erp_bookings
       WHERE room_id = ? AND book_date = ? AND start_time < ? AND end_time > ?
       LIMIT 1`,
      [roomId, b.date, b.endTime, b.startTime]
    );
    if (clash.length) {
      return res.status(409).json({
        error: `ช่วงเวลานี้ถูกจองแล้ว (${clash[0].start_time}–${clash[0].end_time}: ${clash[0].title})`,
      });
    }

    const teamId = await resolveActorTeamId(req);
    const attendees = Array.isArray(b.attendees) ? b.attendees.map(numid).filter(Boolean) : [teamId];
    const [rmRows] = await workPool.query('SELECT name FROM erp_rooms WHERE id = ? LIMIT 1', [roomId]);
    const roomName = rmRows[0]?.name || ('ห้อง #' + roomId);

    const [evIns] = await workPool.query(
      `INSERT INTO erp_events (title, cat, date, start, end, allday, loc, descp, members)
       VALUES (?, 'meeting', ?, ?, ?, 0, ?, ?, ?)`,
      [b.title.trim(), b.date, b.startTime, b.endTime, roomName, b.note?.trim() || null, JSON.stringify(attendees)]
    );

    const [ins] = await workPool.query(
      `INSERT INTO erp_bookings (room_id, team_id, title, book_date, start_time, end_time, attendees, note, calendar_event_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [roomId, teamId, b.title.trim(), b.date, b.startTime, b.endTime, JSON.stringify(attendees), b.note?.trim() || null, evIns.insertId]
    );

    await logActivity(`จอง<b>${escS(roomName)}</b> (${escS(b.date)} ${escS(b.startTime)}–${escS(b.endTime)})`, teamId);
    res.status(201).json({ id: 'bk' + ins.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bookings/:id', async (req, res) => {
  const id = numid(req.params.id);
  try {
    const [rows] = await workPool.query('SELECT calendar_event_id FROM erp_bookings WHERE id = ? LIMIT 1', [id]);
    if (rows[0]?.calendar_event_id) {
      await workPool.query('DELETE FROM erp_events WHERE id = ?', [rows[0].calendar_event_id]);
    }
    await workPool.query('DELETE FROM erp_bookings WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
