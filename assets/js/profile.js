/* โปรไฟล์ส่วนตัวและหน้าผู้ใช้/สิทธิ์ของ Admin — ไม่เก็บข้อมูลส่วนตัวลง localStorage */
'use strict';

function myAvatar(name) {
  const src = Remote.profile?.avatar;
  return typeof src === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(src)
    ? `<img src="${src}" alt="">` : esc(initials(name || '?'));
}
function roleLabel(role) {
  return ({super_admin:'Super Admin',admin:'Admin',manager:'Manager',user:'User',viewer:'Viewer'})[role] || 'ผู้ใช้';
}

async function loadMyProfile() {
  if (!Remote.on || Remote.profileLoading) return;
  Remote.profileLoading = true;
  Remote.profileError = ''; Remote.connectionsError = '';
  const token = Remote.token;
  const [profile, connections] = await Promise.allSettled([
    Remote.req('/users/me/profile'), Remote.req('/users/me/connections'),
  ]);
  if (Remote.token !== token || !Remote.on) { Remote.profileLoading = false; return; }
  if (profile.status === 'fulfilled') Remote.profile = profile.value;
  else { Remote.profile = null; Remote.profileError = 'ไม่สามารถโหลดโปรไฟล์ได้ กรุณาลองใหม่'; }
  if (connections.status === 'fulfilled') Remote.connections = connections.value;
  else { Remote.connections = null; Remote.connectionsError = 'ไม่สามารถตรวจสอบบัญชีที่เชื่อมต่อได้'; }
  Remote.profileLoading = false;
  if (Store.ui?.route === 'profile') renderProfile();
  App.renderRail();
  App.renderTopbar();
}

function connectionCard(provider, label, subtitle) {
  const c = Remote.connections?.[provider];
  const icon = provider === 'google' ? '<span class="profile-provider-icon google">G</span>' : '<span class="profile-provider-icon line">LINE</span>';
  if (!c) return `<div class="profile-connection">${icon}<div class="profile-connection-text"><b>${label}</b><small>${Remote.connectionsError ? 'ตรวจสอบสถานะไม่ได้' : 'กำลังตรวจสอบ…'}</small></div></div>`;
  return `<div class="profile-connection">${icon}<div class="profile-connection-text"><b>${label}</b><small>${c.linked ? `เชื่อมต่อแล้ว${c.email ? ' · '+esc(c.email) : ''}${c.enabled ? '' : ' · การเข้าสู่ระบบปิดอยู่'}` : c.enabled ? subtitle : 'ผู้ดูแลยังไม่ได้ตั้งค่า'}</small></div>
    ${c.linked ? `<button class="btn btn-ghost btn-sm" type="button" data-connection="${provider}" data-mode="unlink">ยกเลิก</button>`
      : `<button class="btn btn-ghost btn-sm" type="button" data-connection="${provider}" data-mode="link" ${c.enabled ? '' : 'disabled'}>เชื่อมต่อ</button>`}</div>`;
}

function renderProfile() {
  const view = $('#view'), side = $('#side');
  const me = Remote.user || { name:'ผู้ใช้สาธิต', email:'', role:'viewer' };
  side.innerHTML = `<div class="profile-side"><div class="profile-side-kicker">MY ACCOUNT</div><h3>บัญชีของฉัน</h3><p>จัดการข้อมูลส่วนตัว<br>และการเข้าสู่ระบบของคุณ</p>
    <div class="profile-side-links"><span class="current" aria-current="page">${IC.user} โปรไฟล์ของฉัน</span><a href="#/settings" data-act="nav:settings">${IC.gear} ตั้งค่าระบบ</a>
    ${Remote.on && ['admin','super_admin'].includes(me.role) ? `<a href="#/users" data-act="nav:users">${IC.users} ผู้ใช้และสิทธิ์</a>` : ''}</div>
    <div class="profile-side-note">🔒 ข้อมูลประวัติและความสามารถในหน้านี้แสดงเฉพาะเจ้าของบัญชี</div></div>`;
  if (!Remote.on) {
    view.innerHTML = `<div class="profile-empty card"><div class="profile-empty-icon">${IC.user}</div><h2>โปรไฟล์ของฉัน</h2><p>เข้าสู่ระบบด้วยบัญชีจริงเพื่อแก้ไขโปรไฟล์ อัปโหลดรูป และเชื่อมต่อบัญชีของคุณ</p><small>โหมดสาธิตไม่บันทึกโปรไฟล์ลงฐานข้อมูล</small></div>`;
    return;
  }
  if (!Remote.profile) {
    view.innerHTML = `<div class="profile-empty card"><div class="profile-empty-icon">${IC.user}</div><h2>โปรไฟล์ของฉัน</h2><p>${Remote.profileError || 'กำลังโหลดข้อมูลของคุณ…'}</p>${Remote.profileError ? '<button class="btn btn-primary" id="profileRetry">ลองโหลดอีกครั้ง</button>' : ''}</div>`;
    if ($('#profileRetry')) $('#profileRetry').onclick = loadMyProfile;
    if (!Remote.profileError && !Remote.profileLoading) loadMyProfile();
    return;
  }
  const p = Remote.profile;
  const skills = Array.isArray(p.skills) ? p.skills : [];
  view.innerHTML = `<div class="profile-layout">
    <section class="profile-hero">
      <div class="profile-hero-copy"><div class="profile-eyebrow">YOUR WORKSPACE · MY PROFILE</div><h2>โปรไฟล์ของฉัน <span>✦</span></h2><p>พื้นที่ส่วนตัวสำหรับตัวตนและเรื่องราวของคุณ</p></div>
      <div class="profile-hero-shape" aria-hidden="true">✳</div>
    </section>
    <div class="profile-columns"><div class="profile-main">
      <section class="profile-card profile-identity-card">
        <div class="profile-picture" id="profilePicture">${myAvatar(me.name)}</div>
        <div class="profile-identity-text"><span class="profile-caption">บัญชีของคุณ</span><h3>${esc(me.name)}</h3><p>${esc(me.email)}</p><span class="profile-role">${esc(roleLabel(me.role))}</span></div>
        <div class="profile-picture-actions"><label class="btn btn-ghost btn-sm profile-file">${IC.edit} เปลี่ยนรูป<input id="profileFile" type="file" accept="image/jpeg,image/png,image/webp" aria-label="เลือกรูปโปรไฟล์"></label>
          ${p.avatar ? '<button class="profile-remove" type="button" id="profileRemove">ลบรูป</button>' : ''}<small>JPG, PNG หรือ WebP ไม่เกิน 8 MB<br>ระบบจะย่อและบันทึกทันที</small></div>
      </section>
      <section class="profile-card"><div class="profile-card-head"><div><span class="profile-section-index">01 / ACCOUNT</span><h3>ข้อมูลบัญชี</h3><p>ชื่อแสดงผลและอีเมลใช้ร่วมกับ MNG Hub</p></div><span class="profile-card-icon">${IC.user}</span></div>
        <form id="profileAccountForm"><div class="profile-form-grid">
          <div class="f-group"><label for="profileName">ชื่อแสดงผล <span>*</span></label><input id="profileName" required maxlength="100" autocomplete="name" value="${esc(me.name)}"></div>
          <div class="f-group"><label for="profileEmail">อีเมลสำหรับเข้าสู่ระบบ <span>*</span></label><input id="profileEmail" type="email" required maxlength="255" autocomplete="email" value="${esc(me.email)}"></div>
          <div class="f-group profile-wide"><label for="profileCurrentPassword">รหัสผ่าน ERP ปัจจุบัน <small>(จำเป็นเมื่อเปลี่ยนอีเมล)</small></label><input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="ยืนยันรหัสผ่านเมื่อเปลี่ยนอีเมล"></div>
        </div><div class="profile-form-foot"><p>เปลี่ยนอีเมลมีผลกับ MNG Hub และล้างสถานะยืนยันเดิม · ระบบนี้ยังไม่ส่งอีเมลยืนยันใหม่ กรุณาตรวจสอบกับผู้ดูแล Hub</p><button class="btn btn-primary" type="submit">บันทึกข้อมูลบัญชี</button></div></form>
      </section>
      <section class="profile-card"><div class="profile-card-head"><div><span class="profile-section-index">02 / ABOUT YOU</span><h3>แนะนำตัว & ความสามารถ</h3><p>เพิ่มรายละเอียดที่สะท้อนความเป็นคุณ</p></div><span class="profile-card-icon peach">✦</span></div>
        <form id="profileDetailsForm"><div class="profile-form-grid">
          <div class="f-group"><label for="profileFirst">ชื่อจริง</label><input id="profileFirst" maxlength="80" autocomplete="given-name" value="${esc(p.firstName)}" placeholder="ชื่อ"></div>
          <div class="f-group"><label for="profileLast">นามสกุล</label><input id="profileLast" maxlength="80" autocomplete="family-name" value="${esc(p.lastName)}" placeholder="นามสกุล"></div>
          <div class="f-group profile-wide"><label for="profileBio">ประวัติ / เกี่ยวกับฉัน</label><textarea id="profileBio" maxlength="4000" rows="5" placeholder="เล่าเกี่ยวกับประสบการณ์ ความสนใจ หรือสิ่งที่คุณทำ…">${esc(p.biography)}</textarea></div>
          <div class="f-group profile-wide"><label for="profileSkills">ความสามารถด้านต่าง ๆ</label><textarea id="profileSkills" rows="2" placeholder="เช่น Design, การสื่อสาร, Project Management">${esc(skills.join(', '))}</textarea><small class="profile-hint">คั่นแต่ละความสามารถด้วยจุลภาคหรือขึ้นบรรทัดใหม่ · สูงสุด 20 รายการ</small></div>
        </div><div class="profile-form-foot"><p>ข้อมูลส่วนนี้มองเห็นได้เฉพาะคุณ</p><button class="btn btn-primary" type="submit">บันทึกโปรไฟล์</button></div></form>
      </section>
    </div><div class="profile-aside">
      <section class="profile-card"><div class="profile-card-head"><div><span class="profile-section-index">03 / CONNECTIONS</span><h3>บัญชีที่เชื่อมต่อ</h3><p>ใช้บัญชีที่ผูกไว้เข้าสู่ระบบ ERP</p></div><span class="profile-card-icon mint">${IC.link}</span></div>
        <div class="profile-connections">${connectionCard('google','Google / Gmail','ยังไม่ได้เชื่อมต่อ')}${connectionCard('line','LINE','ยังไม่ได้เชื่อมต่อ')}</div>
        ${Remote.connectionsError ? '<button class="profile-remove" id="connectionsRetry" type="button">ลองตรวจสอบอีกครั้ง</button>' : ''}
        <div class="profile-privacy">🔐 ใช้เพื่อยืนยันตัวตนเท่านั้น ไม่อ่าน Gmail หรือข้อความ LINE · ต้องเข้าสู่ระบบ ERP และยืนยันรหัสผ่านก่อนผูกบัญชี</div>
      </section>
      <section class="profile-card"><div class="profile-card-head"><div><span class="profile-section-index">04 / SECURITY</span><h3>เปลี่ยนรหัสผ่าน</h3><p>ดูแลบัญชีของคุณให้ปลอดภัย</p></div><span class="profile-card-icon">${IC.eye}</span></div>
        <div class="profile-password"><div class="f-group"><label for="pwCur">รหัสผ่านปัจจุบัน</label><input type="password" id="pwCur" autocomplete="current-password"></div>
        <div class="f-group"><label for="pwNew">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label><input type="password" id="pwNew" autocomplete="new-password"></div>
        <div class="f-group"><label for="pwNew2">ยืนยันรหัสผ่านใหม่</label><input type="password" id="pwNew2" autocomplete="new-password"></div>
        <small class="profile-hint">การเปลี่ยนรหัสผ่านไม่ยกเลิก Google / LINE ที่ผูกไว้</small><button class="btn btn-ghost" data-act="self-pass" type="button">เปลี่ยนรหัสผ่าน</button></div>
      </section>
    </div></div>
  </div>`;

  $('#profileAccountForm').addEventListener('submit', saveProfileAccount);
  $('#profileDetailsForm').addEventListener('submit', saveProfileDetails);
  $('#profileFile').addEventListener('change', saveProfileImage);
  if ($('#profileRemove')) $('#profileRemove').onclick = removeProfileImage;
  if ($('#connectionsRetry')) $('#connectionsRetry').onclick = loadMyProfile;
  $$('[data-connection]', view).forEach(btn => btn.onclick = () => openConnectionModal(btn.dataset.connection, btn.dataset.mode));
}

async function saveProfileAccount(event) {
  event.preventDefault();
  const btn = event.currentTarget.querySelector('button[type="submit"]');
  const body = {name:$('#profileName').value.trim(), email:$('#profileEmail').value.trim(), currentPassword:$('#profileCurrentPassword').value};
  if (body.email.toLowerCase() !== String(Remote.user.email).toLowerCase() && !body.currentPassword) return toast('กรุณายืนยันรหัสผ่านเพื่อเปลี่ยนอีเมล', 'warn');
  btn.disabled = true;
  try {
    const out = await Remote.req('/users/me', {method:'PATCH', body});
    Remote.user = out.user;
    Store.data.user = {...Store.data.user, name:out.user.name, email:out.user.email, role:out.user.role};
    const passwordInput = $('#profileCurrentPassword');
    if (passwordInput) passwordInput.value = '';
    const refreshed = await Remote.refreshAll();
    if (!out.teamSync || !refreshed) toast('บันทึกบัญชีแล้ว แต่โหลดหรือซิงก์ข้อมูลทีมไม่สำเร็จ กรุณาตรวจสอบอีกครั้ง', 'warn');
    else toast('บันทึกข้อมูลบัญชีแล้ว ✓');
  } catch (e) { toast('บันทึกข้อมูลบัญชีไม่สำเร็จ: '+e.message, 'err'); }
  finally { btn.disabled = false; }
}

async function saveProfileDetails(event) {
  event.preventDefault();
  const btn = event.currentTarget.querySelector('button[type="submit"]');
  const body = {firstName:$('#profileFirst').value, lastName:$('#profileLast').value, biography:$('#profileBio').value,
    skills:$('#profileSkills').value.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean)};
  btn.disabled = true;
  try {
    const out = await Remote.req('/users/me/profile', {method:'PUT', body});
    Remote.profile = {...Remote.profile, firstName:out.firstName,lastName:out.lastName,biography:out.biography,skills:out.skills};
    if (Store.ui?.route === 'profile') renderProfile();
    toast('บันทึกโปรไฟล์แล้ว ✓');
  } catch (e) { toast('บันทึกโปรไฟล์ไม่สำเร็จ: '+e.message, 'err'); }
  finally { btn.disabled = false; }
}

async function preparedProfileImage(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('กรุณาเลือก JPG, PNG หรือ WebP ขนาดไม่เกิน 8 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('ไม่สามารถอ่านรูปได้')); img.src = url;
    });
    if (!image.width || !image.height || image.width > 12000 || image.height > 12000) throw new Error('ขนาดรูปไม่รองรับ');
    const scale = Math.min(1, 512 / image.width, 512 / image.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ไม่สามารถเตรียมรูปได้');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.82);
    if (result.length > Math.ceil(256 * 1024 / 3) * 4 + 32) throw new Error('รูปหลังย่อยังใหญ่เกินไป กรุณาเลือกรูปอื่น');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
async function saveProfileImage(event) {
  const input = event.currentTarget, file = input.files?.[0];
  if (!file) return;
  input.disabled = true;
  try {
    const image = await preparedProfileImage(file);
    const out = await Remote.req('/users/me/profile/avatar', {method:'PUT', body:{image}});
    Remote.profile.avatar = out.avatar;
    if (Store.ui?.route === 'profile') renderProfile();
    App.renderRail(); App.renderTopbar(); toast('บันทึกรูปโปรไฟล์แล้ว ✓');
  } catch (e) { toast('บันทึกรูปไม่สำเร็จ: '+e.message, 'err'); }
  finally { input.disabled = false; input.value = ''; }
}
function removeProfileImage() {
  confirmDlg('ลบรูปโปรไฟล์?', 'รูปที่บันทึกไว้จะถูกลบ และใช้ชื่อย่อแทน', async () => {
    try {
      await Remote.req('/users/me/profile/avatar', {method:'PUT',body:{image:null}});
      Remote.profile.avatar = null;
      if (Store.ui?.route === 'profile') renderProfile();
      App.renderRail(); App.renderTopbar(); toast('ลบรูปโปรไฟล์แล้ว');
    } catch (e) { toast('ลบรูปไม่สำเร็จ: '+e.message, 'err'); }
  }, 'ลบรูป');
}

function safeAuthorizationUrl(value, provider) {
  try {
    const url = new URL(value);
    return url.origin === (provider === 'google' ? 'https://accounts.google.com' : 'https://access.line.me') &&
      url.pathname === (provider === 'google' ? '/o/oauth2/v2/auth' : '/oauth2/v2.1/authorize') && !url.username && !url.password;
  } catch { return false; }
}
function openConnectionModal(provider, mode) {
  if (!['google','line'].includes(provider) || !['link','unlink'].includes(mode)) return;
  const label = provider === 'google' ? 'Google / Gmail' : 'LINE';
  const linking = mode === 'link';
  openModal(`<div class="modal-head"><h3>${linking ? 'เชื่อมต่อ' : 'ยกเลิกการเชื่อมต่อ'} ${label}</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><p class="profile-modal-note">${linking ? 'ยืนยันรหัสผ่าน ERP ก่อนเลือกบัญชี บัญชีนี้จะใช้เข้าสู่ระบบ ERP ได้ โดยไม่ให้สิทธิ์อ่านอีเมลหรือข้อความ' : 'บัญชีนี้จะไม่สามารถใช้เข้าสู่ระบบ ERP ได้อีก แต่ยังเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน ERP ได้'}</p>
    <div class="f-group"><label for="connectionPassword">รหัสผ่าน ERP ปัจจุบัน</label><input type="password" id="connectionPassword" autocomplete="current-password"></div></div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">ยกเลิก</button><button class="btn btn-primary" id="connectionConfirm">${linking ? 'ยืนยันและเชื่อมต่อ' : 'ยืนยันการยกเลิก'}</button></div>`);
  $('#connectionPassword').focus();
  $('#connectionConfirm').onclick = async () => {
    const password = $('#connectionPassword').value;
    if (!password) return toast('กรุณากรอกรหัสผ่าน ERP ปัจจุบัน', 'warn');
    const btn = $('#connectionConfirm'); btn.disabled = true;
    try {
      if (linking) {
        const out = await Remote.req('/users/me/connections/'+provider+'/start', {method:'POST',body:{password}});
        if (!safeAuthorizationUrl(out.url, provider)) throw new Error('ปลายทางยืนยันตัวตนไม่ถูกต้อง');
        location.assign(out.url);
      } else {
        await Remote.req('/users/me/connections/'+provider, {method:'DELETE',body:{password}});
        closeModal();
        try { Remote.connections = await Remote.req('/users/me/connections'); Remote.connectionsError = ''; }
        catch { Remote.connections = null; Remote.connectionsError = 'ตรวจสอบสถานะไม่ได้'; }
        if (Store.ui?.route === 'profile') renderProfile();
        toast('ยกเลิกการเชื่อมต่อแล้ว ✓');
      }
    } catch (e) { toast('ทำรายการไม่สำเร็จ: '+e.message, 'err'); btn.disabled = false; }
  };
}

function renderAdminUsers() {
  const side = $('#side'), view = $('#view'), me = Remote.user;
  side.innerHTML = `<div class="profile-side"><div class="profile-side-kicker">ADMINISTRATION</div><h3>จัดการบัญชี</h3><p>ผู้ใช้และสิทธิ์ขององค์กร</p><div class="profile-side-links"><span class="current" aria-current="page">${IC.users} ผู้ใช้และสิทธิ์</span><a href="#/profile" data-act="nav:profile">${IC.user} โปรไฟล์ของฉัน</a><a href="#/settings" data-act="nav:settings">${IC.gear} ตั้งค่าระบบ</a></div></div>`;
  if (!Remote.on || !['admin','super_admin'].includes(me?.role)) {
    view.innerHTML = '<div class="profile-empty card"><h2>เฉพาะผู้ดูแลระบบ</h2><p>คุณไม่มีสิทธิ์จัดการผู้ใช้และสิทธิ์</p><button class="btn btn-primary" data-act="nav:profile">ไปที่โปรไฟล์ของฉัน</button></div>';
    return;
  }
  const users = Store.data.authUsers, error = Store.ui._authUsersError;
  const statusTh = {active:'ใช้งาน',inactive:'ปิดไว้',suspended:'ระงับ',pending:'รอยืนยัน'};
  const rows = (users || []).map(u => {
    const role = ['super_admin','admin','manager','user','viewer'].includes(u.role) ? u.role : 'viewer';
    const status = Object.prototype.hasOwnProperty.call(statusTh,u.status) ? u.status : 'inactive';
    return `<tr><td><div class="admin-person"><span class="admin-person-av">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b>${u.authId===me.authId?' <small>(คุณ)</small>':''}${u.phone?`<small>${esc(u.phone)}</small>`:''}</div></div></td>
      <td>${esc(u.email)}</td><td><span class="urole ur-${role}">${esc(roleLabel(role))}</span></td><td><span class="ust ul-${status}">${esc(statusTh[status])}</span></td>
      <td class="admin-muted">${u.lastLogin ? esc(String(u.lastLogin).replace('T',' ').slice(0,16)) : 'ยังไม่เคย'}</td><td><div class="admin-actions">
      <button class="icon-btn" title="แก้ไขผู้ใช้" aria-label="แก้ไข ${esc(u.name)}" data-act="user-edit" data-id="${u.authId}">✏️</button>
      <button class="icon-btn" title="รีเซ็ตรหัสผ่าน" aria-label="รีเซ็ตรหัสผ่าน ${esc(u.name)}" data-act="user-pass" data-id="${u.authId}">🔑</button>
      <button class="icon-btn" title="บัญชีที่เชื่อมต่อ" aria-label="บัญชีที่เชื่อมต่อของ ${esc(u.name)}" data-act="user-connections" data-id="${u.authId}">🔗</button>
      ${u.authId!==me.authId ? `<button class="icon-btn" title="${status==='active'?'ระงับการใช้งาน':'เปิดใช้งาน'}" aria-label="${status==='active'?'ระงับ':'เปิดใช้งาน'} ${esc(u.name)}" data-act="user-toggle" data-id="${u.authId}">${status==='active'?'⏸':'▶️'}</button>` : ''}</div></td></tr>`;
  }).join('');
  view.innerHTML = `<div class="admin-layout"><section class="admin-heading"><div><span class="profile-section-index">ADMINISTRATION / ACCESS</span><h2>ผู้ใช้และสิทธิ์</h2><p>จัดการบัญชีที่ใช้เข้าสู่ระบบ MNG Hub และ ERP</p></div><button class="btn btn-primary" data-act="user-new">${IC.plus} เพิ่มผู้ใช้</button></section>
    <div class="admin-summary"><div><small>บัญชีทั้งหมด</small><strong>${Array.isArray(users)?users.length:'—'}</strong><span>ผู้ใช้งานในองค์กร</span></div><div><small>เปิดใช้งาน</small><strong>${Array.isArray(users)?users.filter(u=>u.status==='active').length:'—'}</strong><span>พร้อมเข้าสู่ระบบ</span></div><div><small>สิทธิ์การจัดการ</small><strong>${Array.isArray(users)?users.filter(u=>['admin','super_admin'].includes(u.role)).length:'—'}</strong><span>Admin และ Super Admin</span></div></div>
    <section class="profile-card admin-table-card"><div class="profile-card-head"><div><h3>รายชื่อผู้ใช้</h3><p>การเปลี่ยนสิทธิ์หรือระงับบัญชีมีผลทันที</p></div><span class="profile-card-icon">${IC.users}</span></div>
    ${error ? '<div class="admin-message">โหลดรายชื่อไม่สำเร็จ <button class="btn btn-ghost btn-sm" id="usersRetry">ลองอีกครั้ง</button></div>' : !Array.isArray(users) ? '<div class="admin-message">กำลังโหลดรายชื่อผู้ใช้…</div>' : users.length ? `<div class="admin-table-scroll"><table class="tbl"><thead><tr><th>ผู้ใช้</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th>จัดการ</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="admin-message">ยังไม่มีรายชื่อผู้ใช้</div>'}
    <div class="admin-note">🛡 จัดการได้เฉพาะ Admin / Super Admin · การแก้ไขบัญชีมีผลกับ MNG Hub ด้วย</div></section></div>`;
  if ($('#usersRetry')) $('#usersRetry').onclick = () => { Store.ui._authUsersError = ''; loadAuthUsers(true).catch(()=>{}); renderAdminUsers(); };
  if (users === undefined && !Store.ui._authUsersLoading && !error) loadAuthUsers().catch(()=>{});
}

async function openAdminConnections(user) {
  if (String(user.authId) === String(Remote.user?.authId)) { App.go('profile'); return; }
  try {
    const status = await Remote.req('/users/'+user.authId+'/connections');
    const rows = [['google','Google / Gmail'],['line','LINE']].map(([key,label]) => `<div class="admin-connection-row"><div><b>${label}</b><small>${status[key] ? 'เชื่อมต่ออยู่' : 'ยังไม่ได้เชื่อมต่อ'}</small></div>${status[key] ? `<button class="btn btn-danger btn-sm" type="button" data-admin-unlink="${key}">ยกเลิกการเชื่อมต่อ</button>` : ''}</div>`).join('');
    openModal(`<div class="modal-head"><h3>🔗 บัญชีที่เชื่อมต่อ — ${esc(user.name)}</h3><button class="modal-x" onclick="closeModal()">✕</button></div>
      <div class="modal-body"><p class="profile-modal-note">ผู้ดูแลเห็นเฉพาะสถานะ ไม่เห็นบัญชีภายนอกหรือโปรไฟล์ส่วนตัว การยกเลิกจะออกจาก session เว็บทั้งหมดของผู้ใช้นี้ แต่ไม่ลบ Hermes API token</p>
      ${rows}<div class="f-group" style="margin-top:16px"><label for="adminConnectionPassword">ยืนยันรหัสผ่าน Admin ของคุณก่อนยกเลิก</label><input type="password" id="adminConnectionPassword" autocomplete="current-password"></div></div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">ปิด</button></div>`);
    $$('[data-admin-unlink]').forEach(btn=>btn.onclick = async () => {
      const password = $('#adminConnectionPassword').value;
      if (!password) return toast('กรุณายืนยันรหัสผ่าน Admin ของคุณ', 'warn');
      btn.disabled = true;
      try {
        await Remote.req('/users/'+user.authId+'/connections/'+btn.dataset.adminUnlink, {method:'DELETE',body:{password}});
        closeModal(); toast('ยกเลิกการเชื่อมต่อและออกจาก session เว็บของผู้ใช้แล้ว ✓');
      } catch (e) { toast('ยกเลิกการเชื่อมต่อไม่สำเร็จ: '+e.message, 'err'); btn.disabled = false; }
    });
  } catch (e) { toast('ตรวจสอบบัญชีที่เชื่อมต่อไม่สำเร็จ: '+e.message, 'err'); }
}
