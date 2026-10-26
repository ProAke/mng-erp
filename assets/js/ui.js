/* ============================================================
   MNG ERP — UI utilities, icons, formatters, modal, toast, charts
   ============================================================ */
'use strict';

/* ---------- tiny dom helpers ---------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + Math.random().toString(36).slice(2, 9);

/* ---------- Thai dates ---------- */
const TH_MONTHS   = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_MONTHS_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_DOW      = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const TH_DOW_S    = ['อา','จ','อ','พ','พฤ','ศ','ส'];

const d2s   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const s2d   = s => { if(!s || typeof s!=='string') return new Date(); const [y,m,dd]=s.slice(0,10).split('-').map(Number); return new Date(y||2026, (m||1)-1, dd||1); };
const todayS = () => d2s(new Date());
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const sameDay = (a,b) => d2s(a)===d2s(b);

function fmtD(s, opt={}) {           // '2026-10-21' -> '21 ต.ค. 2569'
  if(!s) return '—';
  const d = typeof s==='string' ? s2d(s) : s;
  const bud = d.getFullYear()+543;
  if(opt.short) return `${d.getDate()} ${TH_MONTHS_S[d.getMonth()]}`;
  if(opt.full)  return `วัน${TH_DOW[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${bud}`;
  return `${d.getDate()} ${TH_MONTHS_S[d.getMonth()]} ${bud}`;
}
function relDay(s){                 // relative to today
  if(!s) return '—';
  const t=s2d(todayS()), d=s2d(s);
  const diff=Math.round((d-t)/86400000);
  if(diff===0) return 'วันนี้';
  if(diff===1) return 'พรุ่งนี้';
  if(diff===-1) return 'เมื่อวาน';
  if(diff>1 && diff<=7) return `อีก ${diff} วัน`;
  if(diff<-1 && diff>=-7) return `${-diff} วันก่อน`;
  return fmtD(s);
}
const daysLeft = s => s ? Math.round((s2d(s)-s2d(todayS()))/86400000) : 999;
const money = (n, unit='฿') => (unit==='฿'?'฿':'') + Number(n||0).toLocaleString('en-US');
const moneyK = n => n < 1000 ? '฿' + Number(n||0).toLocaleString('en-US') : '฿' + (n/1000).toLocaleString('en-US', {maximumFractionDigits:0}) + 'k';

/* ---------- avatar ---------- */
function initials(name){
  name = String(name||'').trim();
  if(/[ก-๙]/.test(name)){ const chars = [...name.replace(/\s+/g,'')]; return (chars[0]||'?') + (chars[1]||''); }
  const parts = name.split(/\s+/);
  return (parts[0]?.[0]||'?').toUpperCase() + (parts[1] ? parts[1][0].toUpperCase() : '');
}
function avatar(u, cls=''){ return `<span class="av ${cls}" style="background:${u.color}" title="${esc(u.name)}">${initials(u.name)}</span>`; }
function avatarStack(users, max=3){
  const shown = users.slice(0,max).map(u=>avatar(u)).join('');
  const more = users.length>max ? `<span class="av" style="background:#c9cde4">+${users.length-max}</span>` : '';
  return `<span class="avatar-stack">${shown}${more}</span>`;
}

/* ---------- SVG icon set (stroke style) ---------- */
const IC = (() => {
  const w = (inner, vb='0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return {
    dash:    w('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
    cal:     w('<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1.2" fill="currentColor"/><circle cx="12" cy="14.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="14.5" r="1.2" fill="currentColor"/>'),
    task:    w('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
    proj:    w('<path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    money:   w('<circle cx="12" cy="12" r="8.5"/><path d="M9 9.5h6M9 12.5h6M12 7v10"/>'),
    team:    w('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.4"/><path d="M16 14.4c2.3.3 3.9 1.9 4.4 4.3"/>'),
    client:  w('<path d="M4 20V8.5L12 4l8 4.5V20"/><path d="M4 20h16M9.5 20v-5h5v5"/><path d="M9.5 10.5h5"/>'),
    report:  w('<path d="M4 4v15.5a1 1 0 0 0 1 1h15"/><path d="M8.5 15.5v-4M12.5 15.5V8M16.5 15.5v-6.5"/><path d="M7 9.5l4-3 3.5 2.5 4-3.5"/>'),
    gear:    w('<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5l1 2.5 2.6-.6 1.1 2.4 2.6.6-.5 2.6 2 1.7-2 1.7.5 2.4-2.6.6-1.1 2.6-2.6-.6-1 2.5-1-2.5-2.6.6-1.1-2.6-2.6-.6.5-2.4-2-1.7 2-1.7-.5-2.6 2.6-.6 1.1-2.4 2.6.6z"/>'),
    search:  w('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
    bell:    w('<path d="M6 16.5v-5a6 6 0 1 1 12 0v5l1.6 2.7H4.4z"/><path d="M10 21a2.3 2.3 0 0 0 4 0"/>'),
    chevL:   w('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
    chevR:   w('<path d="M9.5 5.5L16 12l-6.5 6.5"/>'),
    chevD:   w('<path d="M5.5 9.5L12 16l6.5-6.5"/>'),
    plus:    w('<path d="M12 5.5v13M5.5 12h13"/>'),
    clock:   w('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    flag:    w('<path d="M6 21V4"/><path d="M6 4.8c4-2.2 6.5 1.8 11-.4v9.2c-4.5 2.2-7-1.8-11 .4"/>'),
    paperclip:w('<path d="M18 11.5l-6.4 6.4a4 4 0 0 1-5.7-5.7l7.1-7.1a2.7 2.7 0 0 1 3.8 3.8l-6.7 6.7a1.4 1.4 0 0 1-2-2l5.8-5.8"/>'),
    comment: w('<path d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-5 4z"/>'),
    user:    w('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.5-5.6 7-5.6s6.2 2 7 5.6"/>'),
    users:   w('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.4"/><path d="M16 14.4c2.3.3 3.9 1.9 4.4 4.3"/>'),
    folder:  w('<path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    logout:  w('<path d="M14 4h-7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><path d="M10 12h10M17 8.5l3.5 3.5-3.5 3.5"/>'),
    fullscreen:w('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    filter:  w('<path d="M4 5.5h16l-6.2 7v5.2l-3.6 2v-7.2z"/>'),
    gridview:w('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
    list:    w('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.6" cy="6" r="1.3" fill="currentColor"/><circle cx="4.6" cy="12" r="1.3" fill="currentColor"/><circle cx="4.6" cy="18" r="1.3" fill="currentColor"/>'),
    check:   w('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x:       w('<path d="M6 6l12 12M18 6L6 18"/>'),
    doc:     w('<path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 3.5V8h4.5"/><path d="M9 12.5h6M9 16h6"/>'),
    flame:   w('<path d="M12 3.5c1 3-2 4.2-2 7a4.5 4.5 0 0 0 9 0c0-2-1-3.6-2-4.7 0 1.5-.8 2.2-1.6 2.2.5-2.8-1.4-4.9-3.4-4.5zM8.5 14a4.5 4.5 0 0 0 7 4"/>'),
    pin:     w('<path d="M12 21s6.5-5.5 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'),
    phone:   w('<path d="M6.5 3.5h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>'),
    mail:    w('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7.5L12 13l7.5-5.5"/>'),
    edit:    w('<path d="M4.5 19.5l1-3.8L15.7 5.5a2 2 0 0 1 2.8 2.8L8.3 18.5z"/><path d="M13.5 7.5l3 3"/>'),
    trash:   w('<path d="M4.5 6.5h15M9.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13"/><path d="M10 10.5v6M14 10.5v6"/>'),
    export:  w('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
    link:    w('<path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 1 0-5.7-5.6l-1.6 1.6"/><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 1 0 5.7 5.6l1.6-1.6"/>'),
    alarm:   w('<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5 3.5L3 5.5M19 3.5l2 2"/>'),
    eye:     w('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    bot:     w('<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4M8.5 12.5h.01M15.5 12.5h.01M9.5 16h5"/><path d="M2 12h2M20 12h2"/>'),
    chat:    w('<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6A3.5 3.5 0 0 1 16.5 16H10l-4.5 4v-4A3.5 3.5 0 0 1 4 12.5z"/><path d="M8.5 8.5h7M8.5 11.5h4.5"/>'),
    hr:      w('<path d="M12 20.5s-7-4.5-7-10a4.2 4.2 0 0 1 7-3.1 4.2 4.2 0 0 1 7 3.1c0 5.5-7 10-7 10z"/><path d="M9.5 12h2l1-2 1.5 4 1-2h1.5"/>'),
    room:    w('<path d="M4 20h16M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20"/><circle cx="14.5" cy="12" r="1" fill="currentColor"/>'),
    send:    w('<path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z"/>'),
    tack:    w('<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3zM12 13.5v7"/>'),
    bolt:    w('<path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z"/>'),
    pause:   w('<rect x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2"/>'),
    play:    w('<path d="M7.5 5.5l11 6.5-11 6.5z"/>'),
  };
})();

/* ---------- toast ---------- */
function toast(msg, type='ok'){
  const root = $('#toastRoot');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const ico = type==='ok' ? IC.check : type==='warn' ? IC.alarm : IC.x;
  t.innerHTML = `<span class="t-ico">${ico}</span><span>${msg}</span>`;
  root.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(()=>t.remove(), 320); }, 3400);
}

/* ---------- modal ---------- */
function openModal(html, opts={}){
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-ov"><div class="modal ${opts.wide?'wide':''}">${html}</div></div>`;
  const ov = $('.modal-ov', root);
  ov.addEventListener('mousedown', e => { if(e.target === ov && !opts.static) closeModal(); });
  document.addEventListener('keydown', escClose);
  return ov;
}
function escClose(e){ if(e.key==='Escape') closeModal(); }
function closeModal(){ $('#modalRoot').innerHTML=''; document.removeEventListener('keydown', escClose); }
function modalHead(title, sub=''){
  return `<div class="modal-head"><div><h3>${title}</h3>${sub?`<div class="mh-sub">${sub}</div>`:''}</div>
    <button class="m-close" onclick="closeModal()">✕</button></div>`;
}

/* ---------- confirm dialog ---------- */
function confirmDlg(title, text, onYes, yesLabel='ลบ'){
  openModal(`${modalHead(title)}
    <div class="modal-body" style="font-size:13.5px;color:var(--ink-2)">${text}</div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-danger" id="cfYes">${yesLabel}</button>
    </div>`);
  $('#cfYes').onclick = () => { closeModal(); onYes(); };
}

/* ============================================================
   CHARTS — pure SVG, no dependencies
   ============================================================ */
function el(tag, attrs={}, children=[]){
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
  children.forEach(c => n.appendChild(c));
  return n;
}

/* --- line chart (smooth path), 2 series --- */
function lineChart({series, labels, height=230, colors=['#8E7CF3','#22C793'], area=true, legend=null, yFmt=v=>v}){
  const W=760, H=height, padL=52, padR=14, padT=16, padB=30;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const maxV = Math.max(1, ...series.flat()) * 1.15;
  const stepX = plotW/(labels.length-1);
  const gy = v => padT + plotH - (v/maxV)*plotH;
  const gx = i => padL + i*stepX;
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, preserveAspectRatio:'xMidYMid meet'});

  // gridlines + y labels
  for(let g=0; g<=4; g++){
    const v = maxV*g/4, y = gy(v);
    svg.appendChild(el('line', {x1:padL, x2:W-padR, y1:y, y2:y, stroke:'#eef0f8', 'stroke-width':1}));
    const t = el('text', {x:padL-9, y:y+4, 'text-anchor':'end', 'font-size':10.5, fill:'#a0a5c4'});
    t.textContent = yFmt(Math.round(v));
    svg.appendChild(t);
  }
  // x labels
  labels.forEach((l,i)=>{
    const t = el('text', {x:gx(i), y:H-10, 'text-anchor':'middle','font-size':10.5, fill:'#a0a5c4'});
    t.textContent = l; svg.appendChild(t);
  });

  series.forEach((data, si)=>{
    const pts = data.map((v,i)=>[gx(i), gy(v)]).filter((_,i)=>data[i]!=null);
    if(pts.length<2) return;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for(let i=1;i<pts.length;i++){
      const [x0,y0]=pts[i-1], [x1,y1]=pts[i], mx=(x0+x1)/2;
      d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
    }
    if(area){
      const last = pts[pts.length-1];
      const a = el('path', {d:`${d} L ${last[0]} ${padT+plotH} L ${pts[0][0]} ${padT+plotH} Z`, fill:colors[si], opacity:.12});
      svg.appendChild(a);
    }
    svg.appendChild(el('path', {d, fill:'none', stroke:colors[si], 'stroke-width':2.6, 'stroke-linecap':'round'}));
    pts.forEach(([x,y],i)=>{
      const c = el('circle', {cx:x, cy:y, r:3.6, fill:'#fff', stroke:colors[si], 'stroke-width':2.4, style:'cursor:pointer'});
      const tt = el('title'); tt.textContent = `${legend?legend[si]+': ' : ''}${labels[i]} — ${data[i]}`;
      c.appendChild(tt); svg.appendChild(c);
    });
  });

  // current month highlight band (Oct = index 9)
  const hx = gx(9);
  svg.insertBefore(el('rect', {x:hx-stepX/2, y:padT, width:stepX, height:plotH, fill:'#f6f3ff', rx:6}), svg.firstChild);
  return svg;
}

/* --- donut chart --- */
function donutChart({items, size=156, hole=.70, centerTop='', centerBottom=''}){
  const svg = el('svg', {viewBox:`0 0 ${size} ${size}`, style:`width:${size}px;height:${size}px;flex:none`});
  const cx=size/2, cy=size/2, r=size/2-6, ir=r*hole;
  const nonZero = items.filter(i=>i.value>0).length;
  const total = items.reduce((s,i)=>s+i.value,0) || 1;
  svg.appendChild(el('circle', {cx, cy, r:(r+ir)/2, fill:'none', stroke:'#eef0f8', 'stroke-width':r-ir}));
  let angle = -Math.PI/2;
  const P = (a, rad)=>[cx+Math.cos(a)*rad, cy+Math.sin(a)*rad];
  items.forEach(it=>{
    const rawSweep = it.value/total * Math.PI*2;
    if(rawSweep<=0) return;
    const sweep = nonZero===1 ? Math.PI*2 - 0.002 : rawSweep;
    const a0=angle, a1=angle+sweep, gap = nonZero>1 ? .032 : 0;
    const [x0,y0]=P(a0+gap, r), [x1,y1]=P(a1-gap, r), [x2,y2]=P(a1-gap, ir), [x3,y3]=P(a0+gap, ir);
    const large = (sweep - gap*2) > Math.PI ? 1 : 0;
    svg.appendChild(el('path', {
      d:`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${ir} ${ir} 0 ${large} 0 ${x3} ${y3} Z`,
      fill: it.color, style:'cursor:pointer', opacity:.96
    })).appendChild(el('title')).textContent = `${it.label}: ${it.value}`;
    it._mid = (a0+a1)/2;
    angle += rawSweep;
  });
  const t1 = el('text', {x:cx, y:cy-2, 'text-anchor':'middle','font-size':22,'font-weight':700, fill:'#23264d'});
  t1.textContent = centerTop; svg.appendChild(t1);
  const t2 = el('text', {x:cx, y:cy+15, 'text-anchor':'middle','font-size':10.5, fill:'#8a8fb1'});
  t2.textContent = centerBottom; svg.appendChild(t2);
  return svg;
}

/* --- vertical bar chart --- */
function barChart({data, labels, height=220, color='#6C5CE7', highlight=-1, yFmt=v=>v}){
  const W=760, H=height, padL=54, padR=12, padT=14, padB=30;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const maxV = Math.max(1,...data)*1.15;
  const bw = Math.min(44, plotW/data.length*0.55);
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`});
  for(let g=0; g<=4; g++){
    const v=maxV*g/4, y=padT+plotH-(v/maxV)*plotH;
    svg.appendChild(el('line', {x1:padL,x2:W-padR,y1:y,y2:y,stroke:'#eef0f8'}));
    const t=el('text',{x:padL-9,y:y+4,'text-anchor':'end','font-size':10.5,fill:'#a0a5c4'}); t.textContent=yFmt(Math.round(v)); svg.appendChild(t);
  }
  data.forEach((v,i)=>{
    const cx = padL + plotW*(i+.5)/data.length;
    const h = (v/maxV)*plotH, y = padT+plotH-h;
    const r = el('rect', {x:cx-bw/2, y, width:bw, height:Math.max(2,h), rx:7,
      fill: i===highlight ? 'url(#bgrad)' : color, opacity: i===highlight?1:.32, style:'cursor:pointer'});
    r.appendChild(el('title')).textContent = `${labels[i]} — ${yFmt(v)}`;
    svg.appendChild(r);
    const t=el('text',{x:cx,y:H-10,'text-anchor':'middle','font-size':10.5,fill: i===highlight?'#23264d':'#a0a5c4','font-weight':i===highlight?700:400});
    t.textContent=labels[i]; svg.appendChild(t);
    if(i===highlight && v>0){
      const vt=el('text',{x:cx,y:y-7,'text-anchor':'middle','font-size':11,'font-weight':700,fill:'#23264d'});
      vt.textContent=yFmt(v); svg.appendChild(vt);
    }
  });
  const defs = el('defs'); const grad = el('linearGradient',{id:'bgrad',x1:0,y1:0,x2:0,y2:1});
  grad.appendChild(el('stop',{offset:'0%','stop-color':'#8E7CF3'})); grad.appendChild(el('stop',{offset:'100%','stop-color':'#6C5CE7'}));
  defs.appendChild(grad); svg.insertBefore(defs, svg.firstChild);
  return svg;
}

/* --- horizontal bars (workload) --- */
function hbarChart({items, height=null, vFmt=v=>v}){  // items: [label, value, color]
  const rows = items.length, rowH=34, W=720, H = height || rows*rowH+14;
  const padL=110, padR=52, plotW=W-padL-padR;
  const maxV = Math.max(1,...items.map(i=>i[1]))*1.05;
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`});
  items.forEach((it,i)=>{
    const y = 8+i*rowH, barH=19, w=Math.max(3,(it[1]/maxV)*plotW);
    const lt = el('text',{x:padL-10, y:y+barH/2+4, 'text-anchor':'end','font-size':11, fill:'#454a75','font-weight':600});
    lt.textContent = it[0]; svg.appendChild(lt);
    svg.appendChild(el('rect',{x:padL, y:y, width:plotW, height:barH, rx:9, fill:'#f1f2fa'}));
    svg.appendChild(el('rect',{x:padL, y:y, width:w, height:barH, rx:9, fill:it[2]}));
    const vt = el('text',{x:padL+w+9, y:y+barH/2+4.5,'font-size':11, fill:'#23264d','font-weight':700});
    vt.textContent = vFmt(it[1]); svg.appendChild(vt);
  });
  return svg;
}

/* ---------- status & priority meta ---------- */
const STATUS_META = {
  todo:   {label:'รอดำเนินการ', color:'#8a8fb1', badge:'b-grey'},
  doing:  {label:'กำลังทำ',     color:'#3BA7FF', badge:'b-blue'},
  review: {label:'ตรวจแก้',     color:'#FFB020', badge:'b-yellow'},
  done:   {label:'เสร็จแล้ว',   color:'#22C793', badge:'b-green'},
};
const PRIO_META = {
  urgent:{label:'ด่วนมาก',  cls:'p-urgent'},
  high:  {label:'สูง',      cls:'p-high'},
  med:   {label:'ปานกลาง',  cls:'p-med'},
  low:   {label:'ต่ำ',      cls:'p-low'},
};
const INV_META = {
  paid:   {label:'ชำระแล้ว',  badge:'b-green'},
  pending:{label:'รอชำระ',    badge:'b-yellow'},
  overdue:{label:'เกินกำหนด', badge:'b-red'},
  draft:  {label:'ฉบับร่าง',  badge:'b-grey'},
};
const PRESENCE_META = {
  online:  { label:'ออนไลน์',      color:'#22C793', badge:'b-green',  dot:'🟢' },
  working: { label:'กำลังทำงาน',   color:'#3BA7FF', badge:'b-blue',   dot:'💻' },
  focus:   { label:'โฟกัสห้ามกวน', color:'#6C5CE7', badge:'b-purple', dot:'🎧' },
  away:    { label:'ไม่อยู่ชั่วคราว', color:'#FFB020', badge:'b-yellow', dot:'🌙' },
};
const statusBadge = st => { const m=STATUS_META[st]||STATUS_META.todo; return `<span class="badge ${m.badge}"><span class="dot" style="background:${m.color}"></span>${m.label}</span>`; };
const prioBadge  = p  => { const m=PRIO_META[p]||PRIO_META.med;  return `<span class="prio ${m.cls}">${m.label}</span>`; };
const invBadge   = st => { const m=INV_META[st]||INV_META.draft;  return `<span class="badge ${m.badge}">${m.label}</span>`; };
const presenceBadge = p => { const m=PRESENCE_META[p]||PRESENCE_META.online; return `<span class="badge ${m.badge}"><span class="dot" style="background:${m.color}"></span>${m.label}</span>`; };

function pdKpi({ icon, grad, num, label, pill='', pillCls='k-violet', act='' }){
  return `<div class="kpi ${act?'clickable':''}" ${act?`data-act="${act}"`:''}>
    <div class="kpi-top">
      <div class="k-ico" style="background:${grad};color:#fff">${icon}</div>
      ${pill ? `<span class="k-trend ${pillCls}">${pill}</span>` : ''}
    </div>
    <div class="k-num">${num}</div>
    <div class="k-lbl">${label}</div>
  </div>`;
}
