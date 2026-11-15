/* Text Speed + แมนนี่ — อยู่เหนือทุกหน้า/กล่องฟอร์ม โดยไม่ส่งข้อมูลช่องอื่น */
'use strict';

const TextSpeed = (() => {
  let root, rec, listening = false, mode = 'dictation', target = null, language = 'th-TH';
  let history = [], revision = new WeakMap(), pending = null, epoch = 0, restartTimer, instructionTimer, readyAfter = 0;
  let instructionDraft = '', lastStatus = 'ไมโครโฟนปิดอยู่ · เปิดเมื่อต้องการใช้งาน', handlers = null;
  const allowed = new Set(['text','search','email','url','tel','number','date','time']);
  const privateName = /(?:password|passwd|secret|token|api.?key|private.?key|otp|one.?time.?code|verification.?code|auth.?code|recovery.?code|credit.?card|card.?number|cc-(?:number|csc)|cvv|cvc)/i;
  const browserSecure = () => window.isSecureContext === true || location.protocol === 'https:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const supported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const get = id => root?.querySelector('#' + id);
  function eligible(el) {
    if (!el || !el.isConnected || el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-manny-private],#textSpeedRoot')) return false;
    if (privateName.test((el.id || '') + ' ' + (el.name || '') + ' ' + (el.autocomplete || ''))) return false;
    return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && allowed.has((el.type || 'text').toLowerCase()));
  }
  function editableTarget() { return eligible(target) ? target : null; }
  function say(message) {
    try {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(message); u.lang = 'th-TH'; window.speechSynthesis.speak(u);
    } catch {}
  }
  function status(message) { lastStatus = message; render(); }
  function render() {
    if (!root) return;
    get('tsStatus').textContent = lastStatus;
    get('tsLauncher').classList.toggle('is-listening', listening && !!rec);
    get('tsLauncherText').textContent = mode === 'choose' ? 'คลิกช่องที่ต้องการ' : mode === 'instruction' ? 'พร้อมรับคำสั่ง' : mode === 'busy' ? 'กำลังช่วย…' : listening ? 'กำลังฟัง' : 'Text Speed';
    get('tsMic').textContent = listening ? 'หยุดไมโครโฟน' : 'เปิดไมโครโฟน';
    get('tsMic').setAttribute('aria-pressed', String(listening));
    get('tsLang').disabled = listening;
    get('tsLang').value = language;
    get('tsInstructionWrap').hidden = mode !== 'instruction';
    get('tsSend').disabled = mode !== 'instruction';
    get('tsWake').disabled = mode === 'busy';
    root.classList.toggle('is-choosing', mode === 'choose');
    get('tsUndo').disabled = !history.length;
    get('tsCancel').hidden = !['choose','instruction','busy'].includes(mode);
  }
  function secureInfo() {
    if (!browserSecure()) return 'การใช้ไมโครโฟนต้องเปิดเว็บไซต์ผ่าน HTTPS หรือ localhost';
    if (!supported()) return 'เบราว์เซอร์นี้ไม่มี Speech Recognition · ลอง Chrome ที่รองรับ หรือพิมพ์คำสั่งให้แมนนี่';
    return '';
  }
  function init() {
    if (root?.isConnected) return;
    mode = 'dictation'; target = null; language = 'th-TH'; history = []; revision = new WeakMap(); epoch++;
    root = document.createElement('div'); root.id = 'textSpeedRoot'; root.className = 'ts-root';
    root.innerHTML = `<section class="ts-panel" id="tsPanel" aria-label="Text Speed และแมนนี่" hidden>
      <div class="ts-head"><div class="ts-mark" aria-hidden="true">✦</div><div><span>VOICE & WRITING ASSISTANT</span><h2>Text Speed <i>·</i> แมนนี่</h2></div><button type="button" class="ts-close" id="tsClose" aria-label="ย่อแผง">✕</button></div>
      <p class="ts-intro">คลิกช่องข้อความ แล้วพูดเพื่อกรอกข้อมูล</p>
      <div class="ts-row"><label for="tsLang">ภาษาที่พูด</label><select id="tsLang"><option value="th-TH">ไทย</option><option value="en-US">English</option></select><button type="button" class="ts-mic" id="tsMic" aria-pressed="false">เปิดไมโครโฟน</button></div>
      <div class="ts-status" role="status" aria-live="polite"><span class="ts-dot"></span><span id="tsStatus"></span></div>
      <div class="ts-actions"><button type="button" id="tsWake">✦ เรียกแมนนี่</button><button type="button" id="tsUndo">↶ ย้อนกลับ</button><button type="button" id="tsCancel" hidden>ยกเลิก</button></div>
      <div id="tsInstructionWrap" class="ts-instruction" hidden><label for="tsInstruction">พูดหรือพิมพ์คำสั่งให้แมนนี่</label><textarea id="tsInstruction" rows="2" maxlength="2000" placeholder="เช่น จัดเรียงให้อ่านง่ายและแก้คำผิด"></textarea><button type="button" id="tsSend">ให้แมนนี่ช่วย</button></div>
      <p class="ts-hint">พูด <b>“แมนนี่มานี่”</b> แล้วคลิกช่องที่ต้องการ · คำสั่ง: ลบคำสุดท้าย, ลบตัวอักษร, ลบทั้งหมด, ย้อนกลับ, ขึ้นบรรทัดใหม่</p>
      <p class="ts-privacy">เสียงอาจถูกส่งไปบริการของเบราว์เซอร์ · การเรียกแมนนี่ส่งข้อความช่องที่เลือกและคำสั่งไปยัง AI อาจมีค่าใช้จ่าย <a href="#/settings" id="tsSettings">ตั้งค่า AI</a></p>
    </section><button type="button" class="ts-launcher" id="tsLauncher" aria-expanded="false" aria-controls="tsPanel" aria-label="เปิด Text Speed และแมนนี่"><span class="ts-launcher-icon">✦</span><span id="tsLauncherText">Text Speed</span><span class="ts-launcher-mic" aria-hidden="true">🎙</span></button>`;
    document.body.appendChild(root);
    get('tsLauncher').onclick = () => { const p = get('tsPanel'); p.hidden = !p.hidden; get('tsLauncher').setAttribute('aria-expanded', String(!p.hidden)); };
    get('tsClose').onclick = () => { get('tsPanel').hidden = true; get('tsLauncher').setAttribute('aria-expanded','false'); };
    get('tsLang').onchange = e => { language = e.target.value === 'en-US' ? 'en-US' : 'th-TH'; status('เลือก ' + (language === 'th-TH' ? 'ภาษาไทย' : 'English') + ' แล้ว'); };
    get('tsMic').onclick = () => listening ? stop('หยุดไมโครโฟนแล้ว') : start();
    get('tsWake').onclick = () => wake();
    get('tsUndo').onclick = () => undo();
    get('tsCancel').onclick = () => cancel();
    get('tsSend').onclick = () => runAssistant(get('tsInstruction').value);
    get('tsInstruction').addEventListener('input', () => { instructionDraft = get('tsInstruction').value; clearTimeout(instructionTimer); });
    get('tsSettings').onclick = () => { get('tsPanel').hidden = true; get('tsLauncher').setAttribute('aria-expanded','false'); };
    handlers = {
      focus:e => {
        if (e.target?.closest?.('#textSpeedRoot')) return;
        if (mode === 'choose') {
          if (eligible(e.target)) choose(e.target);
          else if (e.target?.matches?.('input,textarea')) status('ช่องนี้ไม่รองรับหรือเป็นข้อมูลลับ กรุณาเลือกช่องข้อความอื่น');
        } else if (mode === 'dictation') {
          target = eligible(e.target) ? e.target : null;
        } else if (mode === 'instruction' && e.target !== target && eligible(e.target)) choose(e.target);
        else if (mode === 'busy' && e.target !== target) target = null;
      },
      click:e => { if (mode === 'choose' && eligible(e.target)) choose(e.target); },
      input:e => { if (e.target && !e.target.closest?.('#textSpeedRoot')) revision.set(e.target, (revision.get(e.target) || 0) + 1); },
      visibility:() => { if (document.visibilityState === 'hidden' && listening) stop('หยุดไมโครโฟนเมื่อออกจากแท็บแล้ว'); },
    };
    document.addEventListener('focusin', handlers.focus, true);
    document.addEventListener('click', handlers.click, true);
    document.addEventListener('input', handlers.input, true);
    document.addEventListener('visibilitychange', handlers.visibility);
    render();
  }
  function destroy() {
    if (!root) return;
    stop('หยุดไมโครโฟนแล้ว');
    if (handlers) {
      document.removeEventListener('focusin', handlers.focus, true);
      document.removeEventListener('click', handlers.click, true);
      document.removeEventListener('input', handlers.input, true);
      document.removeEventListener('visibilitychange', handlers.visibility);
    }
    root.remove(); root = null; handlers = null; target = null; history = []; epoch++;
  }
  function start(preserveStatus = false) {
    const info = secureInfo(); if (info) return status(info);
    try {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const instance = new Recognition(); rec = instance; instance.lang = language; instance.continuous = true; instance.interimResults = true;
      instance.onresult = e => { if (rec === instance && listening) onResult(e); };
      instance.onerror = e => {
        if (rec !== instance) return;
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        listening = false; clearTimeout(restartTimer);
        const messages = { 'not-allowed':'ไม่ได้รับอนุญาตใช้ไมโครโฟน กรุณาตรวจสิทธิ์เบราว์เซอร์', 'service-not-allowed':'บริการรู้จำเสียงไม่อนุญาตให้ใช้งาน', 'audio-capture':'ไม่พบไมโครโฟน กรุณาตรวจอุปกรณ์', network:'บริการรู้จำเสียงติดต่อเครือข่ายไม่ได้' };
        status(messages[e.error] || 'ระบบรู้จำเสียงขัดข้อง กรุณาลองเปิดใหม่');
      };
      instance.onend = () => {
        if (rec !== instance || !listening) return;
        restartTimer = setTimeout(() => {
          if (!listening || rec !== instance) return;
          try { instance.start(); } catch { listening = false; status('เปิดไมโครโฟนต่อไม่ได้ กรุณากดเปิดอีกครั้ง'); }
        }, 350);
      };
      listening = true; instance.start();
      if (preserveStatus) render();
      else status(mode === 'instruction' ? 'เลือกช่องแล้ว · พูดคำสั่ง หรือพิมพ์คำสั่งในแผง แล้วกดให้แมนนี่ช่วย' : 'กำลังฟัง · คลิกช่องข้อความแล้วพูด หรือพูด “แมนนี่มานี่”');
    } catch { listening = false; rec = null; status('เปิดไมโครโฟนไม่ได้ กรุณาตรวจสิทธิ์และลองใหม่'); }
  }
  function stop(message) {
    listening = false; clearTimeout(restartTimer); clearTimeout(instructionTimer);
    const old = rec; rec = null; try { old?.abort(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
    if (pending) { pending.abort(); pending = null; epoch++; }
    if (mode === 'busy') { mode = 'dictation'; target = null; }
    status(message || 'หยุดไมโครโฟนแล้ว');
  }
  // พักการรู้จำระหว่างที่แมนนี่พูด/กำลังเรียก AI เพื่อไม่รับเสียงตอบของตัวเองหรือข้อความที่พูดระหว่างรอ
  function pauseRecognition() {
    clearTimeout(restartTimer);
    const old = rec; rec = null;
    try { old?.abort(); } catch {}
  }
  function resumeRecognition() {
    if (!listening || rec || mode === 'choose' || mode === 'busy') return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { if (listening && !rec && mode !== 'choose' && mode !== 'busy') start(true); }, 350);
  }
  function wake() {
    if (mode === 'busy') return;
    clearTimeout(instructionTimer); instructionDraft = ''; target = null; mode = 'choose';
    pauseRecognition();
    if (root) { get('tsPanel').hidden = false; get('tsLauncher').setAttribute('aria-expanded','true'); get('tsInstruction').value = ''; }
    status('แมนนี่: ให้ช่วยตรงไหน? คลิกช่องข้อความที่ต้องการ แล้วพูดคำสั่ง');
    say('ให้ช่วยตรงไหนคะ กรุณาคลิกช่องข้อความที่ต้องการ แล้วพูดคำสั่ง');
  }
  function choose(el) {
    if (!eligible(el)) return;
    try { window.speechSynthesis?.cancel(); } catch {}
    target = el; mode = 'instruction'; readyAfter = Date.now() + 600; instructionDraft = ''; clearTimeout(instructionTimer);
    get('tsInstruction').value = '';
    status(listening ? 'เลือกช่องแล้ว · รอสักครู่แล้วพูดคำสั่ง หรือพิมพ์คำสั่งในแผง แล้วกดให้แมนนี่ช่วย' : 'เลือกช่องแล้ว · พิมพ์คำสั่งในแผงแล้วกดให้แมนนี่ช่วย หรือเปิดไมโครโฟนเพื่อพูด');
    resumeRecognition();
  }
  function cancel() {
    clearTimeout(instructionTimer); instructionDraft = '';
    if (pending) { pending.abort(); pending = null; epoch++; }
    try { window.speechSynthesis?.cancel(); } catch {}
    mode = 'dictation'; target = null; if (root) get('tsInstruction').value = '';
    status('ยกเลิกคำสั่งแล้ว · คลิกช่องข้อความเพื่อพิมพ์ด้วยเสียง');
    resumeRecognition();
  }
  function onResult(event) {
    let interim = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i], text = String(result[0]?.transcript || '').trim();
      if (!text) continue;
      if (!result.isFinal) { interim = true; continue; }
      heard(text);
    }
    if (interim && mode === 'instruction' && instructionDraft) scheduleInstruction();
  }
  function scheduleInstruction() {
    clearTimeout(instructionTimer);
    instructionTimer = setTimeout(() => { if (mode === 'instruction' && instructionDraft.trim()) runAssistant(instructionDraft); }, 1300);
  }
  function heard(text) {
    const compact = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
    if (compact.includes('แมนนี่มานี่') || compact.includes('แมนนีมานี่') || compact.includes('mannycomehere')) { wake(); return; }
    if (mode === 'choose' || mode === 'busy') return;
    if (mode === 'instruction') {
      if (Date.now() < readyAfter) return;
      instructionDraft = (instructionDraft ? instructionDraft + ' ' : '') + text;
      get('tsInstruction').value = instructionDraft.slice(0,2000);
      instructionDraft = get('tsInstruction').value;
      status('กำลังฟังคำสั่ง · เว้นช่วงสักครู่เพื่อให้แมนนี่ช่วย'); scheduleInstruction(); return;
    }
    const command = compact;
    if (['หยุดฟัง','ปิดไมโครโฟน','stoplistening'].includes(command)) return stop('หยุดไมโครโฟนแล้ว');
    if (['ย้อนกลับ','ยกเลิกการแก้ไข','undo'].includes(command)) return undo();
    if (['ลบทั้งหมด','ลบข้อความทั้งหมด','deleteall','clearall'].includes(command)) return change('clear');
    if (['ลบคำสุดท้าย','ลบคำ','deletelastword','deleteword'].includes(command)) return change('word');
    if (['ลบตัวอักษร','ลบตัวอักษรสุดท้าย','ลบหนึ่งตัว','deletelastcharacter','deletecharacter','backspace'].includes(command)) return change('character');
    if (['ขึ้นบรรทัดใหม่','บรรทัดใหม่','newline','newparagraph'].includes(command)) return change('newline');
    change('insert', text);
  }
  function selection(el) {
    try { if (Number.isInteger(el.selectionStart) && Number.isInteger(el.selectionEnd)) return [el.selectionStart,el.selectionEnd]; } catch {}
    return [el.value.length,el.value.length];
  }
  function apply(el, next, caret, record = true) {
    if (!eligible(el)) return false;
    const old = el.value;
    if (el.maxLength >= 0 && next.length > el.maxLength) { status('ข้อความยาวเกินที่ช่องนี้อนุญาต'); return false; }
    el.value = next;
    if (el.value !== next) { el.value = old; status('ข้อมูลไม่ตรงรูปแบบของช่องนี้'); return false; }
    if (record && next !== old) { history.push({el,before:old,after:next}); if (history.length > 20) history.shift(); }
    try { el.setSelectionRange(caret, caret); } catch {}
    el.dispatchEvent(new Event('input', {bubbles:true}));
    render(); return true;
  }
  function lastGraphemeIndex(str) {
    if (typeof Intl.Segmenter === 'function') { const parts = [...new Intl.Segmenter(language, {granularity:'grapheme'}).segment(str)]; return parts.at(-1)?.index ?? 0; }
    return str.length - ([...str].at(-1)?.length || 0);
  }
  function lastWordIndex(str) {
    if (typeof Intl.Segmenter === 'function') {
      const parts = [...new Intl.Segmenter(language, {granularity:'word'}).segment(str)];
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].isWordLike) return parts[i].index;
    }
    const match = str.match(/\S+\s*$/u); return match ? match.index : 0;
  }
  function change(action, phrase = '') {
    const el = editableTarget();
    if (!el) return status('คลิกช่องข้อความที่ต้องการก่อนพูด · ไม่รองรับรหัสผ่านหรือ key');
    const value = el.value, [start,end] = selection(el), type = (el.type || '').toLowerCase();
    let left = start, right = end, inserted = '';
    if (action === 'clear') { left = 0; right = value.length; }
    else if (action === 'character' && start === end && start > 0) left = lastGraphemeIndex(value.slice(0,start));
    else if (action === 'word' && start === end && start > 0) left = lastWordIndex(value.slice(0,start));
    else if (action === 'newline') {
      if (el.tagName !== 'TEXTAREA') return status('ช่องนี้ไม่รองรับการขึ้นบรรทัดใหม่');
      inserted = '\n';
    } else if (action === 'insert') {
      if (type === 'date' || type === 'time') {
        const clean = phrase.trim();
        if (!(type === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{2}:\d{2}$/).test(clean)) return status('กรุณาตรวจและกรอกวันที่/เวลาในรูปแบบที่ช่องกำหนด');
        left = 0; right = value.length; inserted = clean;
      } else if (type === 'number') {
        inserted = phrase.replace(/[\s,]/g,'');
        if (!/^[0-9.+-]+$/.test(inserted)) return status('ช่องตัวเลขรับเฉพาะตัวเลข กรุณาตรวจผลก่อนบันทึก');
      } else {
        inserted = phrase;
        const before = value.slice(0,start);
        if (!['email','url','tel'].includes(type) && before && !/\s$/.test(before) &&
            (language === 'en-US' || (/[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(inserted)))) inserted = ' ' + inserted;
      }
    }
    const next = value.slice(0,left) + inserted + value.slice(right);
    if (apply(el, next, left + inserted.length)) status('กรอกในช่องแล้ว · ตรวจข้อความก่อนบันทึก');
  }
  function undo() {
    const item = history.at(-1);
    if (!item || !eligible(item.el)) { history = []; return status('ไม่มีรายการที่ย้อนกลับได้'); }
    if (target !== item.el || item.el.value !== item.after) return status('เลือกช่องเดิมและตรวจข้อความก่อนย้อนกลับ (มีการแก้ไขภายหลัง)');
    history.pop(); apply(item.el, item.before, item.before.length, false); status('ย้อนกลับข้อความล่าสุดแล้ว');
  }
  async function runAssistant(instruction) {
    clearTimeout(instructionTimer);
    if (mode !== 'instruction') return;
    const el = editableTarget(), command = String(instruction || '').trim();
    if (!el) { mode = 'choose'; pauseRecognition(); return status('ช่องเดิมไม่พร้อมใช้งาน กรุณาคลิกเลือกช่องอีกครั้ง'); }
    if (!command) return status('กรุณาพูดหรือพิมพ์คำสั่งก่อน');
    if (command.length > 2000 || el.value.length > 12000) return status('ข้อความหรือคำสั่งยาวเกินที่แมนนี่รองรับ');
    if (!Remote.on || !Remote.token) return status('แมนนี่ AI ต้องเข้าสู่ระบบจริงและตั้ง API key ก่อน');
    if (!browserSecure()) return status('การส่งข้อมูลไป AI ต้องใช้ HTTPS หรือ localhost');
    const original = el.value, version = revision.get(el) || 0, token = Remote.token, user = Remote.user?.authId, requestEpoch = ++epoch;
    const controller = new AbortController(); pending = controller; mode = 'busy'; instructionDraft = ''; get('tsInstruction').value = '';
    pauseRecognition();
    status('แมนนี่กำลังช่วยแก้ไข… ข้อความในช่องและคำสั่งถูกส่งไปยังผู้ให้บริการ AI');
    try {
      const result = await Remote.req('/manny/assist', {method:'POST',body:{text:original,instruction:command,confirm:true},signal:controller.signal});
      if (requestEpoch !== epoch || !root || Remote.token !== token || Remote.user?.authId !== user) return;
      if (!eligible(el) || el.value !== original || (revision.get(el) || 0) !== version || target !== el) {
        mode = 'dictation'; target = null; return status('ข้อความหรือหน้าจอเปลี่ยนระหว่างรอ จึงไม่เขียนทับ กรุณาเรียกแมนนี่ใหม่');
      }
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('AI ไม่ส่งข้อความที่ใช้งานได้');
      mode = 'dictation';
      if (result.text === original) return status('แมนนี่ไม่ได้เปลี่ยนข้อความ · กรุณาตรวจความถูกต้อง');
      if (apply(el, result.text, result.text.length)) status('แมนนี่ใส่ข้อความแล้ว · ตรวจความถูกต้องและกดย้อนกลับได้');
    } catch (e) {
      if (requestEpoch !== epoch || !root) return;
      mode = 'instruction'; status('แมนนี่ช่วยไม่สำเร็จ: ' + (e.message || 'กรุณาลองใหม่'));
      get('tsInstruction').value = command; instructionDraft = command;
    } finally { if (pending === controller) pending = null; render(); resumeRecognition(); }
  }
  return { init, destroy, wake, stop };
})();

/* ตั้งค่าแยกจาก erp_settings ที่แชร์ทั้งองค์กร ห้ามเก็บ key ไว้ใน Store/localStorage */
const MannySettings = (() => {
  const labels = {openai:'OpenAI',gemini:'Google Gemini',anthropic:'Anthropic Claude',compatible:'OpenAI-compatible'};
  const options = value => Object.entries(labels).map(([id,label]) => `<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join('');
  const secure = () => window.isSecureContext === true || location.protocol === 'https:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const note = (root,text,bad=false) => { const el=root.querySelector('#msNotice'); if(el){el.textContent=text;el.classList.toggle('is-error',bad);} };
  function formFields(prefix, config = {}) {
    const provider = config.provider || 'openai';
    return `<div class="ms-form-grid"><div class="f-group"><label for="${prefix}Provider">ผู้ให้บริการ</label><select id="${prefix}Provider">${options(provider)}</select></div>
      <div class="f-group"><label for="${prefix}Model">โมเดล</label><input id="${prefix}Model" maxlength="120" value="${esc(config.model || '')}" placeholder="เช่น gpt-4o-mini" required></div>
      <div class="f-group ms-wide" id="${prefix}EndpointWrap" ${provider==='compatible'?'':'hidden'}><label for="${prefix}Endpoint">URL ของ Chat Completions (HTTPS)</label><input type="url" id="${prefix}Endpoint" maxlength="600" value="${esc(config.endpoint || '')}" placeholder="https://api.groq.com/openai/v1/chat/completions"><small>ใช้เฉพาะโฮสต์ที่ผู้ดูแลอนุญาต ไม่มี query string</small></div>
      <div class="f-group ms-wide" data-manny-private><label for="${prefix}Key">API key ใหม่</label><input type="password" id="${prefix}Key" maxlength="512" autocomplete="new-password" placeholder="วาง key จากผู้ให้บริการ" required><small>บันทึกแบบเข้ารหัส · ไม่แสดง key เดิม</small></div></div>`;
  }
  function wireProvider(root, prefix) {
    const select = root.querySelector('#'+prefix+'Provider');
    select.onchange = () => { root.querySelector('#'+prefix+'EndpointWrap').hidden = select.value !== 'compatible'; };
  }
  function readFields(root, prefix) {
    const v = id => root.querySelector('#'+prefix+id).value;
    return {provider:v('Provider'),model:v('Model'),endpoint:v('Endpoint'),apiKey:v('Key')};
  }
  async function mount(root) {
    if (!root) return;
    if (!Remote.on || !Remote.token) { root.innerHTML='<div class="card card-pad ms-card"><h3>✦ Text Speed & แมนนี่</h3><p>เข้าสู่ระบบจริงเพื่อตั้งค่า AI ส่วนตัวหรือใช้ key ส่วนกลาง · การพิมพ์ด้วยเสียงใช้บริการของเบราว์เซอร์</p></div>'; return; }
    const token = Remote.token, uid = Remote.user?.authId;
    root.innerHTML = '<div class="card card-pad ms-card"><h3>✦ Text Speed & แมนนี่</h3><p>กำลังตรวจการตั้งค่า…</p></div>';
    let data;
    try { data = await Remote.req('/manny/settings'); }
    catch (e) { if (root.isConnected && Remote.token===token) root.innerHTML='<div class="card card-pad ms-card"><h3>✦ Text Speed & แมนนี่</h3><p class="ms-error">โหลดการตั้งค่าไม่ได้ กรุณาลองใหม่</p></div>'; return; }
    if (!root.isConnected || Remote.token !== token || Remote.user?.authId !== uid) return;
    const own = data.personal, shared = Array.isArray(data.shared) ? data.shared : null;
    const active = own ? `ใช้ key ส่วนตัว · ${esc(labels[own.provider] || own.provider)} / ${esc(own.model)}${own.usable?'':' · ต้องตรวจการตั้งค่า'}`
      : data.sharedCount ? `ใช้ key ส่วนกลางแบบสุ่ม ${Number(data.sharedCount)} รายการต่อคำขอ` : 'ยังไม่มี key ส่วนตัวหรือส่วนกลาง';
    const sharedNames = (data.sharedProviders || []).map(x => `${esc(labels[x.provider] || x.provider)} / ${esc(x.model)}`).join(' · ');
    const rows = shared ? shared.map(x => `<div class="ms-key-row"><div><b>${esc(x.label)}</b><small>${esc(labels[x.provider] || x.provider)} · ${esc(x.model)} · ${x.enabled ? (x.usable?'เปิดใช้':'ตั้งค่าไม่พร้อม') : 'ปิดใช้'}</small></div><div><button type="button" class="btn btn-ghost btn-sm" data-ms-toggle="${esc(x.id)}" data-enabled="${x.enabled?'false':'true'}">${x.enabled?'พัก':'เปิด'}</button><button type="button" class="btn btn-ghost btn-sm" data-ms-delete="${esc(x.id)}">ลบ</button></div></div>`).join('') : '';
    root.innerHTML = `<div class="card card-pad ms-card"><div class="ms-heading"><div class="ms-icon">✦</div><div><small>PERSONAL ASSISTANT</small><h3>Text Speed & แมนนี่</h3></div><span class="ms-badge">${own?'ส่วนตัว':'ส่วนกลาง'}</span></div>
      <p>ผู้ช่วยของแต่ละบัญชีไม่ใช้ประวัติร่วมกัน · ผลลัพธ์ใส่ในช่องที่เลือก ไม่กดบันทึกหรือส่งแทน</p>
      <div class="ms-summary"><b>${active}</b><span>${!data.encryptionReady?'⚠ ผู้ดูแลต้องตั้ง MANNY_ENCRYPTION_KEY บนเซิร์ฟเวอร์ก่อนบันทึกหรือใช้ key':(sharedNames && !own?'บริการที่อาจถูกสุ่ม: '+sharedNames:'สถานะนี้ไม่ได้ยืนยันว่า key หรือโควตาใช้งานได้จริง')}</span></div>
      <p class="ms-privacy">เมื่อเรียก AI ข้อความในช่องที่เลือกและคำสั่งจะส่งไปผู้ให้บริการ อาจมีค่าใช้จ่าย · อย่าใส่ข้อมูลลับหรือข้อมูลที่ไม่มีสิทธิ์ส่ง</p>
      <div id="msNotice" class="ms-notice" role="status" aria-live="polite"></div>
      <details class="ms-details"><summary>ตั้งค่า key ส่วนตัวของฉัน ${own?'· ตั้งค่าแล้ว':''}</summary><form id="msOwnForm">${formFields('msOwn', own || {})}
        <div class="f-group" data-manny-private><label for="msOwnPassword">ยืนยันรหัสผ่าน ERP ปัจจุบัน</label><input type="password" id="msOwnPassword" autocomplete="current-password"></div>
        <div class="ms-buttons"><button class="btn btn-primary btn-sm" type="submit">บันทึก key ส่วนตัว</button>${own?'<button class="btn btn-ghost btn-sm" id="msOwnDelete" type="button">ลบ key ส่วนตัว · กลับไปใช้ส่วนกลาง</button>':''}</div></form></details>
      ${shared ? `<details class="ms-details"><summary>ชุด API key ส่วนกลางสำหรับ Admin · ${shared.length} รายการ</summary>
        <p class="ms-small">ระบบสุ่มเฉพาะ key ที่เปิดใช้ เมื่อผู้ใช้ไม่ได้ตั้งส่วนตัว · key จริงไม่ถูกส่งให้ผู้ใช้ · อาจมีค่าใช้จ่าย</p>
        <div class="f-group" data-manny-private><label for="msAdminPassword">รหัสผ่าน ERP ของ Admin สำหรับเพิ่ม/พัก/ลบ key</label><input id="msAdminPassword" type="password" autocomplete="current-password"></div>
        <div class="ms-key-list">${rows || '<p class="ms-small">ยังไม่มี key ส่วนกลาง</p>'}</div>
        <form id="msSharedForm"><div class="f-group"><label for="msSharedLabel">ชื่อสำหรับแยก key</label><input id="msSharedLabel" maxlength="80" placeholder="เช่น ทีมงาน — OpenAI 1" required></div>${formFields('msShared')}
        <div class="ms-buttons"><button class="btn btn-primary btn-sm" type="submit">เพิ่ม key ส่วนกลาง</button></div></form></details>` : ''}
      <p class="ms-foot">เปิด Text Speed มุมขวาล่าง · ตั้งภาษาก่อนพูด · <a href="/docs/TEXT-SPEED-MANNY.md" target="_blank" rel="noopener">คู่มือและข้อจำกัด</a></p></div>`;
    wireProvider(root,'msOwn'); if (shared) wireProvider(root,'msShared');
    async function perform(button, path, method, body, clearKey) {
      if (!root.isConnected || Remote.token !== token || Remote.user?.authId !== uid) return;
      if (!secure()) return note(root,'กรุณาเปิดเว็บไซต์ผ่าน HTTPS ก่อนส่ง API key หรือรหัสผ่าน',true);
      if (!body.password) return note(root,'กรุณายืนยันรหัสผ่าน ERP ปัจจุบัน',true);
      button.disabled = true;
      if (clearKey) root.querySelector('#'+clearKey).value = '';
      try { await Remote.req(path,{method,body}); await mount(root); note(root,'บันทึกการตั้งค่าแล้ว'); }
      catch (e) { note(root,e.message || 'บันทึกไม่สำเร็จ',true); button.disabled = false; }
    }
    root.querySelector('#msOwnForm').onsubmit = e => {
      e.preventDefault(); const pass = root.querySelector('#msOwnPassword'), body = {...readFields(root,'msOwn'),password:pass.value}; pass.value='';
      perform(e.submitter || e.target.querySelector('button[type=submit]'),'/manny/personal','PUT',body,'msOwnKey');
    };
    const ownDelete = root.querySelector('#msOwnDelete');
    if (ownDelete) ownDelete.onclick = () => {
      const pass=root.querySelector('#msOwnPassword'), password=pass.value; pass.value='';
      if (!password) return note(root,'กรุณายืนยันรหัสผ่าน ERP ปัจจุบัน',true);
      confirmDlg('ลบ key ส่วนตัว?', 'หลังลบ แมนนี่จะสุ่มใช้ key ส่วนกลางที่เปิดอยู่ หากไม่มีจะเรียก AI ไม่ได้', () => perform(ownDelete,'/manny/personal','DELETE',{password}), 'ลบ key');
    };
    if (shared) {
      const pass = root.querySelector('#msAdminPassword');
      root.querySelector('#msSharedForm').onsubmit = e => {
        e.preventDefault(); const body={...readFields(root,'msShared'),label:root.querySelector('#msSharedLabel').value,password:pass.value};pass.value='';
        perform(e.submitter || e.target.querySelector('button[type=submit]'),'/manny/shared','POST',body,'msSharedKey');
      };
      root.querySelectorAll('[data-ms-toggle]').forEach(button => button.onclick = () => {
        const password=pass.value;pass.value='';perform(button,'/manny/shared/'+button.dataset.msToggle,'PATCH',{password,enabled:button.dataset.enabled==='true'});
      });
      root.querySelectorAll('[data-ms-delete]').forEach(button => button.onclick = () => {
        const password=pass.value;pass.value='';
        if (!password) return note(root,'กรุณายืนยันรหัสผ่าน ERP ปัจจุบัน',true);
        confirmDlg('ลบ key ส่วนกลาง?', 'ผู้ใช้ที่ไม่มี key ส่วนตัวจะไม่สุ่มใช้รายการนี้อีก คำขอที่เริ่มไปแล้วอาจยังดำเนินต่อ', () => perform(button,'/manny/shared/'+button.dataset.msDelete,'DELETE',{password}), 'ลบ key');
      });
    }
  }
  return {mount};
})();
