/* รักษาความสัมพันธ์สมาชิกทีมเมื่อเปลี่ยนอีเมลของบัญชีที่ใช้ร่วมกับ Hub */
'use strict';
const conflict = message => Object.assign(new Error(message), { status:409 });

async function prepareTeamEmail(workDb, userId, previousEmail, newEmail) {
  // เชื่อมด้วย auth ID ก่อนเปลี่ยนอีเมล; ไม่จับคู่กำกวมหรือแย่งสมาชิกที่ผูกกับบัญชีอื่น
  const [team] = await workDb.query('SELECT id,auth_user_id,email FROM erp_team WHERE auth_user_id=? OR LOWER(email)=LOWER(?) ORDER BY id', [userId, previousEmail]);
  const linked = team.filter(t => String(t.auth_user_id || '') === String(userId));
  const candidates = linked.length ? linked : team.filter(t => !t.auth_user_id && String(t.email || '').toLowerCase() === String(previousEmail).toLowerCase());
  if (candidates.length > 1) throw conflict('มีสมาชิกทีมที่ตรงกับบัญชีหลายรายการ กรุณาให้ผู้ดูแลตรวจสอบก่อนเปลี่ยนอีเมล');
  const candidate = candidates[0], teamId = candidate?.id || null;
  const [conflicts] = await workDb.query('SELECT id FROM erp_team WHERE LOWER(email)=LOWER(?)', [newEmail]);
  if (conflicts.some(t => String(t.id) !== String(teamId))) throw conflict('อีเมลใหม่นี้ใช้กับสมาชิกทีมอื่นแล้ว กรุณาให้ผู้ดูแลตรวจสอบ');
  if (candidate && !candidate.auth_user_id) {
    // ต้องยังเป็นอีเมลเดิมในขณะที่ผูก ไม่แย่งสมาชิกที่เพิ่งถูกแก้ไขโดยผู้ดูแล
    const [claimed] = await workDb.query('UPDATE erp_team SET auth_user_id=? WHERE id=? AND auth_user_id IS NULL AND LOWER(email)=LOWER(?)', [userId, teamId, previousEmail]);
    if (!claimed.affectedRows) throw conflict('ความสัมพันธ์กับทีมเปลี่ยนไป กรุณาลองใหม่');
  }
  return teamId;
}

async function syncTeamEmail(workDb, teamId, userId, previousEmail, newEmail) {
  if (!teamId) return true;
  try {
    // ห้ามเขียนทับอีเมลทีมที่ถูกเปลี่ยนแยกต่างหากหลังจาก preflight
    const [result] = await workDb.query('UPDATE erp_team SET email=? WHERE id=? AND auth_user_id=? AND LOWER(email)=LOWER(?)', [newEmail, teamId, userId, previousEmail]);
    return result.affectedRows > 0;
  } catch { return false; }
}
module.exports = { prepareTeamEmail, syncTeamEmail };
