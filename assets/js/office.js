/* ============================================================
   3D Office — เช็กอินจริง + รายชื่อที่เชิญตามปฏิทิน
   ภาพคน บ้าน และจอประชุมเป็นภาพจำลอง ไม่ใช่กล้องหรือการระบุตำแหน่ง
   ============================================================ */
'use strict';

const Office3D = {
  active: false,
  generation: 0,
  paintGeneration: 0,
  snapshot: null,
  snapshotSource: '',
  failed: false,
  selected: 'all',
  scene: null,
  timer: null,
  requestTimer: null,
  abortController: null,
  requestTimeoutMs: 12000,
  loading: false,
  signature: '',
  modulePromise: null,

  mount() {
    this.active = true;
    this.snapshot = null;
    this.snapshotSource = '';
    this.failed = false;
    this.loading = false;
    this.signature = '';
    const token = ++this.generation;
    $('#side').innerHTML = this.sideLoading();
    $('#view').innerHTML = `<div class="office-page"><div class="office-loading"><span class="office-loading-icon">✦</span><b>กำลังเตรียมออฟฟิศของคุณ</b><span>กำลังอ่านข้อมูลเช็กอินและปฏิทิน…</span></div></div>`;
    this.visibilityHandler = () => {
      if (this.active && document.visibilityState === 'visible') this.refresh();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.refresh(token);
  },

  destroy() {
    this.active = false;
    this.generation++;
    this.paintGeneration++;
    clearTimeout(this.timer);
    this.timer = null;
    clearTimeout(this.requestTimer);
    this.requestTimer = null;
    this.abortController?.abort();
    this.abortController = null;
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.scene) this.scene.dispose();
    this.scene = null;
    this.snapshot = null;
    this.snapshotSource = '';
    this.loading = false;
  },

  sideLoading(failed = false) {
    return `<div class="office-side-intro"><span class="office-side-icon">▦</span><div><b>3D Office</b><small>พื้นที่ทำงานของเรา</small></div></div><div class="office-side-tip">${failed ? 'ยังโหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง' : 'กำลังเตรียมข้อมูลจากเช็กอินและปฏิทิน'}</div>`;
  },

  demoSnapshot() {
    // ชุดสาธิตใช้ instant ของอุปกรณ์ แต่แปลงแสดงเป็นเวลาไทยเหมือนหน้าลงเวลา
    const instant = BangkokTime.now(), clock = BangkokTime.fromInstant(instant);
    return {
      date: clock.date, time: clock.time, generatedAt: instant.toISOString(), timezone: clock.timezone,
      team: Store.data.team || [], checkins: Store.data.checkins || [], events: Store.data.events || [],
    };
  },

  async refresh(token = this.generation) {
    if (!this.active || token !== this.generation || this.loading) return;
    clearTimeout(this.timer);
    this.loading = true;
    const button = $('#officeRefresh');
    if (button) { button.disabled = true; button.classList.add('is-loading'); }
    const source = Remote.on ? 'remote' : 'demo';
    // ห้ามนำข้อมูลสาธิตไปติดป้ายว่าเป็นข้อมูลจริง หากโหมดการเชื่อมต่อเปลี่ยน
    if (this.snapshot && this.snapshotSource !== source) { this.snapshot = null; this.snapshotSource = ''; this.signature = ''; }
    const controller = source === 'remote' && typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.abortController = controller;
    let requestTimer = null;
    try {
      const snapshot = source === 'remote' ? await Promise.race([
        Remote.req('/office/snapshot', { signal: controller?.signal }),
        new Promise((_, reject) => {
          requestTimer = setTimeout(() => { controller?.abort(); reject(new Error('office_timeout')); }, this.requestTimeoutMs);
          this.requestTimer = requestTimer;
        }),
      ]) : this.demoSnapshot();
      if (!this.active || token !== this.generation || source !== (Remote.on ? 'remote' : 'demo')) return;
      if (!snapshot || !Array.isArray(snapshot.team) || !Array.isArray(snapshot.checkins) || !Array.isArray(snapshot.events) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date || '') || !this.validTime(snapshot.time)) throw new Error('invalid_snapshot');
      const model = this.buildModel(snapshot);
      const signature = JSON.stringify({
        date: snapshot.date, team: snapshot.team, checkins: snapshot.checkins, events: snapshot.events,
        personStates: model.people.map(p => [p.id, p.status]),
        meetingStates: model.meetings.map(m => [m.event.id, m.state]),
      });
      const repaint = !this.snapshot || this.failed || signature !== this.signature;
      this.snapshot = snapshot;
      this.snapshotSource = source;
      this.failed = false;
      this.signature = signature;
      if (repaint) this.paint();
      else this.updateSyncText();
    } catch (_err) {
      if (!this.active || token !== this.generation || source !== (Remote.on ? 'remote' : 'demo')) return;
      this.failed = true;
      this.paint();
    } finally {
      clearTimeout(requestTimer);
      if (this.requestTimer === requestTimer) this.requestTimer = null;
      if (this.abortController === controller) this.abortController = null;
      if (this.active && token === this.generation) {
        this.loading = false;
        const nextButton = $('#officeRefresh');
        if (nextButton) { nextButton.disabled = false; nextButton.classList.remove('is-loading'); }
        if (source !== (Remote.on ? 'remote' : 'demo')) this.refresh(token);
        else this.scheduleNext();
      }
    }
  },

  scheduleNext() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.active) return;
      if (document.visibilityState === 'hidden') this.scheduleNext();
      else this.refresh();
    }, 60000);
  },

  validTime(time) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
    return !!m && +m[1] < 24 && +m[2] < 60;
  },
  safeColor(color) {
    return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#8e7cf3';
  },
  department(name) {
    return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  },
  meetingState(event, time) {
    if (event.allday) return 'allday';
    if (!this.validTime(event.start) || !this.validTime(event.end) || event.end <= event.start) return 'invalid';
    if (time < event.start) return 'upcoming';
    if (time >= event.end) return 'ended';
    return 'scheduled';
  },
  meetingUrl(location) {
    // เปิดเฉพาะ HTTPS ของ Google Meet / Zoom ไม่เชื่อชื่อที่คล้ายหรือ protocol อื่น
    const candidate = String(location || '').match(/https:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,;!?\])}]+$/, '');
    if (!candidate) return '';
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      const allowed = host === 'meet.google.com' || host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoom.com' || host.endsWith('.zoom.com');
      return url.protocol === 'https:' && allowed && !url.username && !url.password && !url.port ? url.href : '';
    } catch { return ''; }
  },

  buildModel(snapshot) {
    const latest = new Map();
    // API เรียง ID ล่าสุดก่อน ส่วนโหมดสาธิตมี ID สุ่มและเพิ่มรายการใหม่ไว้ต้นอาร์เรย์
    // จึงต้องรักษาลำดับอาร์เรย์สาธิต ไม่ให้ ID ตัวอย่างเก่าทับรอบใหม่
    const checks = [...snapshot.checkins];
    if (snapshot.timezone !== 'local-demo') checks.sort((a, b) => {
      const x = /^ck(\d+)$/.exec(String(a.id || '')), y = /^ck(\d+)$/.exec(String(b.id || ''));
      return x && y ? Number(y[1]) - Number(x[1]) : 0;
    });
    checks.forEach(c => {
      if (c && c.date === snapshot.date && c.memberId && !latest.has(String(c.memberId))) latest.set(String(c.memberId), c);
    });
    const byId = new Map();
    const groups = new Map();
    const people = snapshot.team.map(member => {
      const c = latest.get(String(member.id));
      let status = 'none';
      if (c && c.clockOut) status = this.validTime(c.clockIn) && this.validTime(c.clockOut) && c.clockIn <= c.clockOut && c.clockOut <= snapshot.time ? 'out' : 'unknown';
      else if (c && this.validTime(c.clockIn) && c.clockIn <= snapshot.time && c.mode === 'office') status = 'office';
      else if (c && this.validTime(c.clockIn) && c.clockIn <= snapshot.time && c.mode === 'wfh') status = 'wfh';
      else if (c) status = 'unknown';
      const dept = this.department(member.department);
      const key = dept ? 'department:' + dept.toLocaleLowerCase() : 'unassigned';
      const person = { ...member, color: this.safeColor(member.color), department: dept, status, checkin: c || null, departmentKey: key };
      byId.set(String(member.id), person);
      if (!groups.has(key)) groups.set(key, { key, name: dept || 'ยังไม่ระบุแผนก', members: [], office: [], wfh: [] });
      const group = groups.get(key);
      group.members.push(person);
      if (status === 'office') group.office.push(person);
      if (status === 'wfh') group.wfh.push(person);
      return person;
    });
    const sortedGroups = [...groups.values()].sort((a, b) =>
      a.key === 'unassigned' ? 1 : b.key === 'unassigned' ? -1 : a.name.localeCompare(b.name, 'th')
    );
    sortedGroups.forEach((g, i) => { g.index = i; });
    const meetings = snapshot.events.filter(e => e && e.cat === 'meeting' && e.date === snapshot.date).map(event => ({
      event, state: this.meetingState(event, snapshot.time), url: this.meetingUrl(event.loc),
      invitees: [...new Set(Array.isArray(event.members) ? event.members.map(String) : [])].map(id =>
        byId.get(id) || { id, name: 'ไม่พบข้อมูลสมาชิก', nickname: '', department: '', color: '#aab3c7', missing: true }),
    }));
    return {
      groups: sortedGroups, people, byId, meetings,
      office: people.filter(p => p.status === 'office'),
      wfh: people.filter(p => p.status === 'wfh'),
      other: people.filter(p => p.status !== 'office' && p.status !== 'wfh'),
      activeMeetings: meetings.filter(m => m.state === 'scheduled'),
      otherMeetings: meetings.filter(m => m.state !== 'scheduled'),
    };
  },

  syncText() {
    if (!this.snapshot) return this.failed ? 'เชื่อมต่อไม่ได้ · ยังไม่มีข้อมูล' : 'กำลังโหลดข้อมูล';
    if (this.snapshotSource !== 'remote') return `สาธิต/ออฟไลน์ · เวลาไทยจากอุปกรณ์ ${fmtD(this.snapshot.date)} ${this.snapshot.time} น. · ข้อมูลในเบราว์เซอร์อาจเก่า`;
    return `MariaDB · เวลาไทย · ข้อมูล ณ ${fmtD(this.snapshot.date)} ${this.snapshot.time} น.${this.failed ? ' · อาจไม่เป็นปัจจุบัน' : ''}`;
  },
  updateSyncText() {
    const sync = $('#officeSyncText');
    if (sync) sync.textContent = this.syncText();
  },

  paint() {
    if (!this.active) return;
    const paintId = ++this.paintGeneration;
    if (this.scene) this.scene.dispose();
    this.scene = null;
    const view = $('#view'), side = $('#side');
    const previousScroll = view.scrollTop;
    if (!this.snapshot) {
      side.innerHTML = this.sideLoading(true);
      const help = Remote.on ? 'กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูลและลองใหม่ หน้านี้จะไม่ใช้ข้อมูลตัวอย่างแทนข้อมูลจริง' : 'ข้อมูลสาธิตในเบราว์เซอร์ไม่พร้อม กรุณาลองอีกครั้ง';
      view.innerHTML = `<div class="office-page"><div class="office-error" role="alert"><span>⚠</span><div><b>ยังโหลดข้อมูลออฟฟิศไม่ได้</b><p>${help}</p><button class="btn btn-primary btn-sm" id="officeRefresh">ลองอีกครั้ง</button></div></div></div>`;
      $('#officeRefresh').onclick = () => this.refresh();
      return;
    }
    const model = this.buildModel(this.snapshot);
    if (this.selected !== 'all' && !model.groups.some(g => g.key === this.selected)) this.selected = 'all';
    const visibleGroups = this.selected === 'all' ? model.groups : model.groups.filter(g => g.key === this.selected);
    const visibleOffice = visibleGroups.flatMap(g => g.office);
    const visibleWfh = visibleGroups.flatMap(g => g.wfh);
    const visibleOther = visibleGroups.flatMap(g => g.members.filter(p => p.status !== 'office' && p.status !== 'wfh'));
    const selectedName = this.selected === 'all' ? 'ทุกแผนก' : visibleGroups[0]?.name || 'ทุกแผนก';
    const deptButtons = model.groups.map(g => `<button type="button" class="office-dept-button ${this.selected === g.key ? 'is-active' : ''}" data-office-dept="${g.index}" title="${esc(g.name)}" aria-pressed="${this.selected === g.key}"><span class="office-dept-dot office-tone-${g.index % 6}"></span><span>${esc(g.name)}</span><small>${g.office.length}</small></button>`).join('');
    side.innerHTML = `<div class="office-side-intro"><span class="office-side-icon">▦</span><div><b>3D Office</b><small>พื้นที่ทำงานของเรา</small></div></div>
      <div class="office-side-caption">WORKSPACE</div>
      <button type="button" class="office-dept-button ${this.selected === 'all' ? 'is-active' : ''}" data-office-all aria-pressed="${this.selected === 'all'}"><span class="office-dept-dot office-tone-all"></span><span>ทุกแผนก</span><small>${model.office.length}</small></button>
      <div class="office-side-caption">แผนก <span>${model.groups.length}</span></div><div class="office-dept-list">${deptButtons || '<p class="office-side-empty">ยังไม่มีสมาชิกทีม</p>'}</div>
      <div class="office-side-tip"><b>✦ &nbsp;รู้จักพื้นที่นี้</b><p>ภาพจำลองจากการเช็กอิน ไม่ใช่การติดตามตำแหน่งหรือกล้องสด</p><button type="button" data-act="nav:hr">ไปหน้าลงเวลา ↗</button></div>`;
    const stale = this.failed ? `<div class="office-warning" role="alert">⚠ อัปเดตข้อมูลไม่สำเร็จ กำลังแสดงข้อมูลครั้งล่าสุดซึ่งอาจไม่เป็นปัจจุบัน <button type="button" id="officeRetry">ลองอีกครั้ง</button></div>` : '';
    const offline = this.snapshotSource === 'demo' ? `<div class="office-offline-notice">โหมดสาธิต / ออฟไลน์ · ใช้ข้อมูลในเบราว์เซอร์ ซึ่งอาจเป็นข้อมูลตัวอย่างหรือข้อมูลเก่าจากการเชื่อมต่อก่อนหน้า ไม่ใช่สถานะสดจากฐานข้อมูล</div>` : '';
    view.innerHTML = `<div class="office-page">
      <header class="office-header"><div><div class="office-eyebrow"><span></span> MNG VIRTUAL WORKSPACE</div><h1>ออฟฟิศของเรา <span>✦</span></h1><p>พื้นที่เล็ก ๆ ที่ทำให้ทีมอยู่ใกล้กัน ไม่ว่าจะทำงานที่ไหน</p></div>
        <div class="office-header-actions"><button type="button" class="office-button office-button-light" id="officeRefresh" aria-label="รีเฟรชข้อมูลออฟฟิศ">↻ <span>รีเฟรช</span></button><button type="button" class="office-button office-button-primary" data-act="nav:hr">◷ &nbsp; ลงเวลาเข้างาน</button></div></header>
      ${stale}${offline}
      <div class="office-sync ${this.failed ? 'is-stale' : ''}"><span class="office-sync-dot"></span><span id="officeSyncText">${esc(this.syncText())}</span><span class="office-sync-auto">อัปเดตอัตโนมัติทุก 60 วินาที</span></div>
      <div class="office-stats" aria-label="สรุปข้อมูลเช็กอิน"><div class="office-stat"><span class="office-stat-icon violet">▦</span><div><small>เช็กอินที่ออฟฟิศ</small><b>${model.office.length} <em>คน</em></b></div><span class="office-stat-note">OFFICE</span></div>
        <div class="office-stat"><span class="office-stat-icon mint">⌂</span><div><small>เช็กอิน WFH</small><b>${model.wfh.length} <em>คน</em></b></div><span class="office-stat-note">AT HOME</span></div>
        <div class="office-stat"><span class="office-stat-icon peach">◷</span><div><small>นัดหมายช่วงเวลานี้</small><b>${model.activeMeetings.length} <em>รายการ</em></b></div><span class="office-stat-note">CALENDAR</span></div>
        <div class="office-stat"><span class="office-stat-icon slate">◌</span><div><small>ไม่มีเช็กอินที่เปิดอยู่ / ไม่ระบุ</small><b>${model.other.length} <em>คน</em></b></div><span class="office-stat-note">OTHER</span></div></div>
      <div class="office-workspace"><section class="office-floor-card" aria-labelledby="officeFloorTitle"><div class="office-card-head"><div><div class="office-kicker">THE WORKSPACE <span>✦</span></div><h2 id="officeFloorTitle">แผนผังออฟฟิศ <span>${esc(selectedName)}</span></h2></div><span class="office-floor-count"><i></i> ${visibleOffice.length} คนเช็กอิน</span></div>
        <div class="office-mobile-filter"><label for="officeDepartment">เลือกแผนก</label><select id="officeDepartment"><option value="all">ทุกแผนก</option>${model.groups.map(g=>`<option value="${g.index}" ${g.key===this.selected?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>
        <div class="office-stage" id="officeStage"><div class="office-stage-background" aria-hidden="true"></div><div id="officeCanvasHost" class="office-canvas-host"></div><div id="officeLabels" class="office-label-layer"></div>
          <div class="office-stage-loading" id="officeSceneMessage">กำลังสร้างภาพ 3 มิติ…</div><div class="office-stage-tag"><span>✦</span> MNG OFFICE <small>พื้นที่จำลอง</small></div>
          <div class="office-stage-controls" aria-label="ปรับมุมมองออฟฟิศ"><button type="button" id="officeTurnLeft" aria-label="หมุนไปทางซ้าย">↶</button><button type="button" id="officeTurnRight" aria-label="หมุนไปทางขวา">↷</button><span></span><button type="button" id="officeZoomOut" aria-label="ซูมออก">−</button><button type="button" id="officeZoomIn" aria-label="ซูมเข้า">+</button><button type="button" id="officeResetView" aria-label="กลับมุมมองเริ่มต้น">⌂</button></div></div>
        <div class="office-stage-footer"><span><i></i> ตัวละครแสดงผู้ที่เช็กอินออฟฟิศและยังไม่ลงเวลาออก</span><span>ลากเพื่อหมุน · ใช้ปุ่มเพื่อซูม</span></div></section>
      <section class="office-roster-card" aria-labelledby="officeRosterTitle"><div class="office-card-head"><div><div class="office-kicker">PEOPLE IN OFFICE</div><h2 id="officeRosterTitle">เพื่อนร่วมออฟฟิศ</h2></div><span class="office-roster-total">${visibleOffice.length}</span></div><p class="office-card-sub">${esc(selectedName)} · ตามรายการเช็กอิน</p>
        <div class="office-roster-list">${visibleOffice.length ? visibleGroups.map(g => g.office.length ? `<div class="office-roster-group"><div class="office-roster-group-title"><span class="office-dept-dot office-tone-${g.index % 6}"></span>${esc(g.name)}<small>${g.office.length}</small></div>${g.office.map(p => this.personRow(p)).join('')}</div>` : '').join('') : `<div class="office-roster-empty"><span>☕</span><b>ยังไม่มีเช็กอินในออฟฟิศ</b><small>เมื่อมีคนเช็กอิน ตัวละครจะแสดงที่นี่</small></div>`}</div>
        ${visibleOther.length ? `<details class="office-other"><summary>ไม่มีเช็กอินที่เปิดอยู่ / ไม่ระบุ (${visibleOther.length})</summary><div>${visibleOther.map(p=>`<div class="office-other-row"><b>${esc(p.nickname || p.name)}</b><small>${p.status === 'out' ? 'ลงเวลาออกแล้ว' : p.status === 'unknown' ? 'ข้อมูลไม่ครบ / เวลาหรือสถานที่ไม่ถูกต้อง' : 'ยังไม่เช็กอิน'}</small></div>`).join('')}</div></details>` : ''}
        <button type="button" class="office-roster-link" data-act="nav:team">จัดการสมาชิกและแผนก <span>↗</span></button></section></div>
      <section class="office-section" id="officeHomes"><div class="office-section-head"><div><div class="office-kicker">A LITTLE CLOSER, FROM ANYWHERE</div><h2>มุมทำงานที่บ้าน <span>⌂</span></h2><p>ภาพจำลองของผู้ที่เช็กอิน WFH และยังไม่ลงเวลาออก · ${esc(selectedName)}</p></div><span class="office-section-count">${visibleWfh.length} คน WFH</span></div>
        <div class="office-homes">${visibleWfh.length ? visibleWfh.map((p,i)=>this.homeCard(p,i)).join('') : `<div class="office-empty-wide"><span>⌂</span><div><b>ยังไม่มีเช็กอิน WFH</b><p>เมื่อมีเพื่อนเช็กอินจากบ้าน จอจำลองจะแสดงตรงนี้</p></div></div>`}</div></section>
      <section class="office-section office-meetings-section" id="officeMeetings"><div class="office-section-head"><div><div class="office-kicker">LET'S MEET</div><h2>ห้องประชุมของทีม <span>✺</span></h2><p>แสดงรายชื่อที่เชิญตามเวลานัดในปฏิทิน ไม่ยืนยันการเข้าร่วมหรือสถานะกล้อง</p></div><button type="button" class="office-button office-button-light" data-act="nav:calendar">ดูปฏิทิน ↗</button></div>
        ${model.activeMeetings.length ? model.activeMeetings.map(m => this.meetingCard(m)).join('') : `<div class="office-meeting-empty"><div class="office-empty-illustration">▣<span>✦</span></div><div><b>ยังไม่มีนัดประชุมในช่วงเวลานี้</b><p>เมื่อถึงเวลานัด รายชื่อผู้ได้รับเชิญจะแสดงเป็นจอแยกที่นี่</p><button type="button" data-act="nav:calendar">เพิ่มหรือดูนัดหมายในปฏิทิน ↗</button></div></div>`}
        ${this.otherMeetings(model.otherMeetings)}</section>
      <section class="office-accuracy"><span class="office-info-icon" aria-hidden="true">i</span><div><b>เกี่ยวกับข้อมูลหน้านี้</b><p>สถานที่อ้างอิงจากการเช็กอิน ไม่ใช่ GPS · หากลงเวลาออกหรือยังไม่เช็กอิน จะไม่แสดงตัวละครในออฟฟิศ/บ้าน · จอประชุมเป็นรายชื่อที่เชิญ ไม่ใช่การเข้าร่วมจริงหรือวิดีโอ</p></div></section>
      </div>`;
    view.scrollTop = previousScroll;
    const chooseGroup = index => { this.selected = model.groups[index]?.key || 'all'; this.paint(); };
    $$('[data-office-dept]', side).forEach(button => { button.onclick = () => chooseGroup(Number(button.dataset.officeDept)); });
    $('[data-office-all]', side).onclick = () => { this.selected = 'all'; this.paint(); };
    $('#officeDepartment').onchange = e => { if (e.target.value === 'all') { this.selected = 'all'; this.paint(); } else chooseGroup(Number(e.target.value)); };
    $('#officeRefresh').onclick = () => this.refresh();
    if ($('#officeRetry')) $('#officeRetry').onclick = () => this.refresh();
    this.mountScene(visibleGroups, paintId, chooseGroup);
  },

  personRow(person) {
    return `<div class="office-person"><span class="office-person-avatar" style="--person-color:${person.color}">${esc(initials(person.nickname || person.name))}</span><span class="office-person-name"><b>${esc(person.nickname || person.name)}</b><small>${esc(person.name)}${person.role ? ' · ' + esc(person.role) : ''}</small></span><span class="office-person-time">${esc(person.checkin?.clockIn || '')}</span></div>`;
  },

  homeCard(person, index) {
    const walls = ['#ede5ff','#e3f3f1','#fce8df','#e6eeff','#f9e8ee','#f7f0df'];
    const wall = walls[index % walls.length], shirt = person.color;
    const displayName = person.nickname ? `${person.name} (${person.nickname})` : person.name;
    return `<article class="office-home-card"><div class="office-home-screen"><div class="office-home-label"><span></span> WFH <small>ภาพจำลอง</small></div>
      <svg viewBox="0 0 250 145" role="img" aria-label="ภาพจำลองมุมทำงานที่บ้าน" preserveAspectRatio="xMidYMid slice"><rect width="250" height="145" fill="${wall}"/><path d="M0 101h250v44H0z" fill="#e7cbb2"/><path d="M0 119h250M0 132h250" stroke="#d7b79e" stroke-width="2"/>
      <rect x="19" y="22" width="52" height="48" rx="2" fill="#fff"/><rect x="24" y="27" width="42" height="38" fill="#b9e4ef"/><path d="M45 27v38M24 47h42" stroke="#fff" stroke-width="3"/><circle cx="34" cy="36" r="5" fill="#fff5b4"/><path d="M25 63l11-10 9 8 7-7 14 9" fill="#a5cfbf"/>
      <rect x="173" y="20" width="37" height="31" rx="2" fill="#fff"/><rect x="178" y="25" width="27" height="21" fill="#f7d6a5"/><path d="M181 42l7-9 6 5 5-5 5 9" fill="#b2c9a6"/>
      <rect x="158" y="80" width="68" height="8" rx="2" fill="#bd8c71"/><path d="M163 88h5v37h-5zm53 0h5v37h-5z" fill="#9b715d"/><rect x="184" y="57" width="30" height="21" rx="2" fill="#546480"/><rect x="187" y="60" width="24" height="14" fill="#d2e5f5"/><path d="M198 78v3m-6 0h12" stroke="#546480" stroke-width="2"/>
      <rect x="37" y="104" width="33" height="7" rx="3" fill="#bb8a73"/><rect x="43" y="91" width="21" height="15" rx="2" fill="#c98f71"/><path d="M52 92V65m0 17c-11-1-15-8-14-14 10 1 15 5 14 14zm1-5c9-1 14-7 14-13-9 0-14 5-14 13z" fill="#7cad8d"/>
      <ellipse cx="119" cy="123" rx="29" ry="6" fill="#c8aa99" opacity=".45"/><rect x="105" y="91" width="29" height="25" rx="5" fill="${shirt}"/><rect x="101" y="95" width="6" height="20" rx="3" fill="#efb99c"/><rect x="132" y="95" width="6" height="20" rx="3" fill="#efb99c"/><rect x="110" y="112" width="8" height="12" rx="2" fill="#67718a"/><rect x="122" y="112" width="8" height="12" rx="2" fill="#67718a"/><rect x="104" y="62" width="31" height="31" rx="7" fill="#f4c5a7"/><path d="M104 74v-7c0-9 6-13 15-13 10 0 16 5 16 13v7h-5V66c-6 4-12 5-21 5v3z" fill="#5b4850"/><rect x="111" y="77" width="3" height="4" rx="1" fill="#4d3d46"/><rect x="125" y="77" width="3" height="4" rx="1" fill="#4d3d46"/><path d="M117 85q3 2 6 0" fill="none" stroke="#b9776c" stroke-width="1.3"/></svg></div>
      <div class="office-home-meta"><span class="office-person-avatar" style="--person-color:${shirt}">${esc(initials(person.nickname || person.name))}</span><div><b title="${esc(displayName)}">${esc(displayName)}</b><small>${esc(person.department || 'ยังไม่ระบุแผนก')} · เข้า ${esc(person.checkin?.clockIn || '')}</small></div><span class="office-home-online" title="มีเช็กอิน WFH ที่ยังไม่ลงเวลาออก"></span></div></article>`;
  },

  meetingCard(meeting) {
    const e = meeting.event;
    const button = meeting.url ? `<a class="office-meeting-join" href="${esc(meeting.url)}" target="_blank" rel="noopener noreferrer">เปิดลิงก์ประชุม ↗</a>` : `<span class="office-meeting-no-link">ยังไม่มีลิงก์ Google Meet / Zoom</span>`;
    return `<article class="office-meeting-card"><div class="office-meeting-head"><div><div class="office-meeting-indicator"><i></i> อยู่ในช่วงเวลานัด · ตามปฏิทิน</div><h3>${esc(e.title || 'ประชุม')}</h3><p>${esc(e.start)} – ${esc(e.end)} น. · ผู้ได้รับเชิญ ${meeting.invitees.length} คน</p></div>${button}</div>
      <div class="office-meeting-tiles">${meeting.invitees.length ? meeting.invitees.map((p,i)=>{ const name = p.nickname ? `${p.name} (${p.nickname})` : p.name; return `<div class="office-meeting-tile office-meeting-tone-${i%6}"><div class="office-meeting-symbol" style="--person-color:${p.color}"><span>${esc(initials(p.nickname || p.name))}</span></div><div><b title="${esc(name)}">${esc(name)}</b><small>${p.missing ? 'ข้อมูลสมาชิกไม่พร้อม' : esc(p.department || 'ยังไม่ระบุแผนก')}</small></div><span class="office-meeting-tile-label">ผู้ได้รับเชิญ</span></div>`; }).join('') : `<div class="office-no-invitees">ยังไม่ได้ระบุผู้ได้รับเชิญในปฏิทิน</div>`}</div>
      <div class="office-meeting-disclaimer"><span class="office-info-icon" aria-hidden="true">i</span> จอเป็นเพียงรายชื่อผู้ได้รับเชิญ ไม่ใช่วิดีโอสดและไม่ยืนยันว่าเข้าร่วมแล้ว</div></article>`;
  },

  otherMeetings(meetings) {
    if (!meetings.length) return '';
    const labels = { upcoming:'ยังไม่ถึงเวลานัด', ended:'เลยเวลานัดแล้ว', allday:'ตลอดวัน', invalid:'เวลาไม่ครบหรือไม่ถูกต้อง' };
    return `<div class="office-upcoming"><div class="office-upcoming-head"><b>นัดหมายอื่นในวันนี้</b><span>${meetings.length} รายการ</span></div>${meetings.map(m=>`<div class="office-upcoming-row"><span class="office-upcoming-clock">◷</span><div><b>${esc(m.event.title || 'ประชุม')}</b><small>${m.state === 'allday' ? 'ตลอดวัน' : `${esc(m.event.start || '—')} – ${esc(m.event.end || '—')} น.`} · ${labels[m.state]}</small></div>${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">ลิงก์ ↗</a>` : ''}</div>`).join('')}</div>`;
  },

  async mountScene(groups, paintId, chooseGroup) {
    const message = $('#officeSceneMessage');
    if (!groups.length) { if (message) message.textContent = 'ยังไม่มีข้อมูลแผนกหรือสมาชิกทีม'; $('#officeStage')?.classList.add('is-fallback'); return; }
    try {
      if (!this.modulePromise) this.modulePromise = import(new URL('assets/js/office-scene.js?v=1', document.baseURI).href);
      const sceneModule = await this.modulePromise;
      if (!this.active || paintId !== this.paintGeneration) return;
      const host = $('#officeCanvasHost'), labels = $('#officeLabels');
      this.scene = sceneModule.createOfficeScene({
        host, labels, groups,
        onChoose: index => chooseGroup(index),
        onUnavailable: () => {
          const m = $('#officeSceneMessage');
          if (m && this.active && paintId === this.paintGeneration) { m.textContent = 'อุปกรณ์นี้แสดงภาพ 3 มิติไม่ได้ ยังดูรายชื่อและแผนกได้ตามปกติ'; m.classList.add('is-fallback'); m.style.display = 'flex'; $('#officeStage')?.classList.add('is-fallback'); }
        },
        onRestored: () => {
          const m = $('#officeSceneMessage');
          if (m && this.active && paintId === this.paintGeneration) { m.classList.remove('is-fallback'); m.style.display = 'none'; $('#officeStage')?.classList.remove('is-fallback'); }
        },
      });
      if (message) message.style.display = 'none';
      const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
      bind('#officeZoomIn', () => this.scene?.zoom(1.2));
      bind('#officeZoomOut', () => this.scene?.zoom(1 / 1.2));
      bind('#officeTurnLeft', () => this.scene?.turn(-0.3));
      bind('#officeTurnRight', () => this.scene?.turn(0.3));
      bind('#officeResetView', () => this.scene?.reset());
    } catch (_err) {
      this.modulePromise = null;
      if (!this.active || paintId !== this.paintGeneration) return;
      if (message) { message.textContent = 'อุปกรณ์นี้แสดงภาพ 3 มิติไม่ได้ ยังดูรายชื่อและแผนกได้ตามปกติ'; message.classList.add('is-fallback'); $('#officeStage')?.classList.add('is-fallback'); }
    }
  },
};

function renderOffice() { Office3D.mount(); }
