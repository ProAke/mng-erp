/* MNG ERP — ภาพรวม 3D Office จากข้อมูลจริง (ต้องผ่าน auth middleware ก่อน) */
'use strict';

const express = require('express');
const { workPool } = require('./db');
const router = express.Router();

function bangkokClock(at = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at);
  return { date, time, generatedAt: at.toISOString(), timezone: 'Asia/Bangkok' };
}

function teamId(value) {
  const m = /^u?(\d+)$/i.exec(String(value ?? ''));
  return m && Number(m[1]) > 0 ? 'u' + Number(m[1]) : null;
}
function memberIds(value) {
  let ids = value;
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch { ids = []; }
  }
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(teamId).filter(Boolean))];
}

// อ่านทุกรายการของวันนี้โดยตรงและส่งเฉพาะฟิลด์ที่จำเป็น ไม่ส่งหมายเหตุส่วนตัว
// หากตารางหรือ migration ใช้งานไม่ได้ ให้ส่งข้อผิดพลาดแทนการแสดงข้อมูลตัวอย่าง/ศูนย์คน
router.get('/office/snapshot', async (_req, res) => {
  const clock = bangkokClock();
  try {
    const [team] = await workPool.query('SELECT id, name, nickname, role, department, color FROM erp_team ORDER BY id');
    const [checkins] = await workPool.query(
      'SELECT id, member_id, date, clock_in, clock_out, mode FROM erp_checkins WHERE date = ? ORDER BY id DESC', [clock.date]
    );
    const [events] = await workPool.query(
      "SELECT id, title, cat, date, start, end, allday, loc, members FROM erp_events WHERE date = ? AND cat = 'meeting' ORDER BY start, id", [clock.date]
    );
    res.json({
      ...clock,
      team: team.map(r => ({
        id: 'u' + r.id, name: r.name, nickname: r.nickname || '', role: r.role || '',
        department: r.department || '', color: r.color || '#6C5CE7',
      })),
      checkins: checkins.map(r => ({
        id: 'ck' + r.id, memberId: teamId(r.member_id), date: r.date,
        clockIn: r.clock_in || '', clockOut: r.clock_out || '', mode: r.mode || '',
      })),
      events: events.map(r => ({
        id: 'e' + r.id, title: r.title, cat: r.cat, date: r.date,
        start: r.start || '', end: r.end || '', allday: !!r.allday,
        loc: r.loc || '', members: memberIds(r.members),
      })),
    });
  } catch (err) {
    console.error('[office/snapshot]', err.message);
    res.status(503).json({ error: 'office_snapshot_unavailable', message: 'ไม่สามารถอ่านข้อมูลออฟฟิศได้ กรุณาตรวจสอบฐานข้อมูลและการเพิ่มคอลัมน์แผนก' });
  }
});

module.exports = router;
