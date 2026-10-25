/* MNG ERP — one-time seed into pacific_mngworks
   - Creates ERP module data (team, clients, invoices, events, activity)
   - Enriches the REAL projects/tasks with erp_* metadata (additive only)
   - Guarded by erp_settings seedVersion — safe to run repeatedly         */
const { workPool } = require('./db');

const SEED_VERSION = 4;

const TEAM_ENRICH = {
  'worapot@outlook.com': { nickname:'เอก',   state:'online',  skills:['Product','Strategy','AI Ops'] },
  'nuna@mnggroups.co':   { nickname:'หนูนา', state:'focus',   skills:['Figma','UX/UI','Design System'] },
  'bank@mnggroups.co':   { nickname:'แบงค์', state:'working', skills:['Next.js','Node.js','MariaDB'] },
  'may@mnggroups.co':    { nickname:'เมย์',  state:'working', skills:['React','Tailwind','Motion'] },
  'art@mnggroups.co':    { nickname:'อาร์ท', state:'online',  skills:['API','SQL','DevOps'] },
  'fah@mnggroups.co':    { nickname:'ฟ้า',   state:'focus',   skills:['QA','UAT','Playwright'] },
};

const AI_AGENTS = [
  { name:'BYTE',  nickname:'Byte',  role:'AI Full-stack Engineer', color:'#22C793', email:'byte@ai.mnggroups.co',  state:'working', skills:['Next.js','SQL','Refactor'],    model:'Claude Sonnet 4.5', paused:0, autonomy:78, runs:142, success_rate:94, tokens_today:284500 },
  { name:'NOVA',  nickname:'Nova',  role:'AI Project Coordinator', color:'#6C5CE7', email:'nova@ai.mnggroups.co',  state:'online',  skills:['Planning','Follow-up','Summary'], model:'Claude Sonnet 4.5', paused:0, autonomy:85, runs:118, success_rate:96, tokens_today:162400 },
  { name:'ECHO',  nickname:'Echo',  role:'AI QA & Client Comms',   color:'#3BA7FF', email:'echo@ai.mnggroups.co',  state:'online',  skills:['QA Gate','Test Cases','Copy'],  model:'Gemini 2.5 Pro',    paused:0, autonomy:65, runs:64,  success_rate:90, tokens_today:74200 },
  { name:'ORBIT', nickname:'Orbit', role:'AI Finance & Analytics', color:'#FFB020', email:'orbit@ai.mnggroups.co', state:'away',    skills:['Forecast','Budget','KPI'],      model:'GPT-4.1',           paused:1, autonomy:60, runs:39,  success_rate:89, tokens_today:18900 },
  { name:'PIXEL', nickname:'Pixel', role:'AI Creative & UI Assist',color:'#FF6B9D', email:'pixel@ai.mnggroups.co', state:'online',  skills:['Key Visual','Banner','UX Copy'],model:'Flux 1.1 Pro',      paused:0, autonomy:72, runs:83,  success_rate:92, tokens_today:95300 },
];

const DEFAULT_ROOMS = [
  { name:'ห้องประชุมใหญ่ MNG Boardroom', kind:'room',   capacity:12, floor:'ชั้น 3', color:'#3BA7FF', equipment:['จอ 4K 75"','ชุดไมค์ประชุม','Whiteboard','HDMI/USB-C'] },
  { name:'ห้อง Focus Pod A (คุยลูกค้า)',  kind:'room',   capacity:4,  floor:'ชั้น 3', color:'#8E7CF3', equipment:['จอ 55"','Webcam 4K','เก็บเสียง'] },
  { name:'สตูดิโอถ่ายทำ & Live Set',      kind:'studio', capacity:6,  floor:'ชั้น 2', color:'#FF6B9D', equipment:['ไฟ Softbox 3 จุด','ฉากเขียว','ไมค์ไร้สายคู่'] },
  { name:'ชุดกล้อง Sony FX3 + เลนส์ G',   kind:'gear',   capacity:1,  floor:'ตู้เก็บอุปกรณ์', color:'#22C793', equipment:['Sony FX3','24-70mm GM','ขาตั้งวิดีโอ','SD 256GB'] },
];

const DEFAULT_CHANNELS = [
  { name:'ประกาศและเป้าหมายทีม', emoji:'📢', type:'group', topic:'อัปเดตเป้าหมายประจำสัปดาห์และข่าวสำคัญของ MNG Groups', pinned:1 },
  { name:'dev-engineering',      emoji:'💻', type:'group', topic:'พูดคุยงานพัฒนา โค้ดรีวิว API และเซิร์ฟเวอร์ (เรียก @BYTE หรือ @NOVA ได้)', pinned:1 },
  { name:'design-ux-review',     emoji:'🎨', type:'group', topic:'ส่งดราฟต์ดีไซน์ ขอฟีดแบ็ก UI/UX และชิ้นงานลูกค้า', pinned:0 },
];

const TEAM = [
  { name:'Worapot',       role:'Founder / PM',   color:'#FF8A5C', email:'worapot@outlook.com', phone:'081-234-5678', is_me:1, auth:2 },
  { name:'Nuna Sirima',   role:'UX/UI Designer', color:'#8E7CF3', email:'nuna@mnggroups.co',   phone:'089-111-2233', is_me:0 },
  { name:'Bank Kritsada', role:'Full-stack Dev', color:'#3BA7FF', email:'bank@mnggroups.co',   phone:'086-555-8899', is_me:0 },
  { name:'May Thanyarat', role:'Front-end Dev',  color:'#FF6B9D', email:'may@mnggroups.co',    phone:'092-777-1144', is_me:0 },
  { name:'Art Pongsakorn',role:'Back-end Dev',   color:'#22C793', email:'art@mnggroups.co',    phone:'095-888-2211', is_me:0 },
  { name:'Fah Chanya',    role:'QA Tester',      color:'#FFB020', email:'fah@mnggroups.co',    phone:'097-333-4455', is_me:0 },
];

const CLIENTS = [
  { name:'Calmat Co., Ltd.',  short:'Calmat',   color:'#2F6BF0', contact:'คุณแพรว — Marketing Manager', phone:'02-111-3344', email:'praew@calmat.co.th',  addr:'อาคารใจฟู่ ชั้น 12 สุขุมวิท กรุงเทพฯ', since:'2025-03-01' },
  { name:'Chef-jeed',         short:'Chef-jeed',color:'#6C5CE7', contact:'เชฟจี๊ด — เจ้าของกิจการ',    phone:'081-900-1122', email:'jeed@chefjeed.com',   addr:'ลาดพร้าว 101 กรุงเทพฯ', since:'2025-06-15' },
  { name:'168 Pool Villa',    short:'168 Pool', color:'#14B890', contact:'คุณโอ๋ — ผู้จัดการรีสอร์ท', phone:'038-555-168', email:'oh@168poolvilla.com', addr:'พัทยา ชลบุรี', since:'2025-11-20' },
  { name:'LoveIT Thailand',   short:'LoveIT',   color:'#F25C8B', contact:'คุณเลิฟ — Editor',          phone:'02-555-8899', email:'love@loveit.co.th',    addr:'อารีย์ กรุงเทพฯ', since:'2024-09-01' },
  { name:'APH Logistics',     short:'APH',      color:'#17A2B8', contact:'คุณอาร์ม — IT Director',    phone:'02-777-6655', email:'arm@aphlogistics.com', addr:'บางนา-ตราด กม.18', since:'2026-08-10' },
  { name:'SGI Group',         short:'SGI',      color:'#4B5ED9', contact:'คุณนิดา — Corporate Comms', phone:'02-333-2211', email:'nida@sgigroup.co.th',  addr:'สาทร กรุงเทพฯ', since:'2025-01-08' },
];

/* enrich REAL projects by hub_id */
const PROJ_META = {
  'chefjeed':  { client:2, clientName:'Chef-jeed',    budget:240000, spent:228000, color:'#6C5CE7', grad:'g-purple', status:'doing', start:'2026-09-10', end:'2026-11-15', members:[3,5], desc:'แบรนด์อาหาร Chef-jeed — เว็บสั่งอาหาร v1+v2 deploy แล้ว, v3 grand restaurant กำลังทำ' },
  'loveit':    { client:4, clientName:'LoveIT Thailand', budget:95000, spent:74000, color:'#F25C8B', grad:'g-pink',  status:'review', start:'2026-10-08', end:'2026-10-27', members:[2,4,6], desc:'เว็บข่าว LoveIT — การ์ดข่าว 5 แบบ + cron ดึงข่าวทุก 2 ชม.' },
  'sgi':       { client:6, clientName:'SGI Group',    budget:210000, spent:152000, color:'#4B5ED9', grad:'g-indigo',status:'review', start:'2026-09-21', end:'2026-10-30', members:[2,4], desc:'เว็บไซต์องค์กร SGI สองภาษา TH/EN + CMS' },
  'aph':       { client:5, clientName:'APH Logistics',budget:95000,  spent:51000,  color:'#17A2B8', grad:'g-teal',  status:'doing', start:'2026-09-01', end:'2026-12-04', members:[5,3], desc:'APH Interactive — ระบบแสดงผล + กู้รูปสินค้า' },
  'mng':       { client:null, clientName:'Internal — MNG Groups', budget:0, spent:0, color:'#F2762E', grad:'g-orange', status:'doing', start:'2026-10-15', end:'2026-12-15', members:[1,2,3,4,5,6], desc:'MNG Dashboard — อัปเกรด Work Tracking + Calendar ERP เต็มจอ' },
  'work':      { client:null, clientName:'Internal — MNG Groups', budget:0, spent:0, color:'#5A6280', grad:'g-slate', status:'todo',  start:'2026-11-10', end:'2027-01-29', members:[1,3,5], desc:'Work Trackers — บอร์ดงานกลางของทีม + Client Portal' },
  'tps-project':{ color:'#2F6BF0', grad:'g-blue',  status:'doing', start:'2026-10-01', end:'2026-12-31', members:[1,3] },
  'fdvs':      { color:'#2F6BF0', grad:'g-blue',  status:'done', start:'2026-08-01', end:'2026-10-10', members:[3] },
  'afterklass':{ color:'#2F6BF0', grad:'g-blue',  status:'done', start:'2026-07-01', end:'2026-09-30', members:[4] },
  'nobis':     { color:'#8E7CF3', grad:'g-purple',status:'doing', start:'2026-09-15', end:'2026-12-20', members:[3,5] },
  'op':        { color:'#14B890', grad:'g-green', status:'done', start:'2026-06-01', end:'2026-09-15', members:[4] },
  'firezone':  { color:'#F2762E', grad:'g-orange',status:'doing', start:'2026-10-05', end:'2026-11-06', members:[1,3,4,6], desc:'FireZone — รวมถึงงาน Calmat Chat โทรศัพท์/Facebook/LINE' },
  'jeed':      { color:'#6C5CE7', grad:'g-purple',status:'doing', start:'2026-10-01', end:'2026-11-30', members:[3] },
  'play':      { color:'#F25C8B', grad:'g-pink',  status:'doing', start:'2026-09-01', end:'2026-12-01', members:[3,4] },
  'playwebsite':{ color:'#F25C8B', grad:'g-pink',  status:'doing', start:'2026-10-01', end:'2026-11-20', members:[4] },
  'multica':   { color:'#17A2B8', grad:'g-teal',  status:'doing', start:'2026-09-20', end:'2026-12-10', members:[5] },
  'mng-finance':{ color:'#FFB020', grad:'g-orange',status:'doing', start:'2026-10-10', end:'2026-12-31', members:[1,5] },
  'sapafiles': { color:'#5A6280', grad:'g-slate', status:'doing', start:'2026-10-01', end:'2026-11-15', members:[3] },
};

/* enrich the REAL 8 tasks (match by id) */
const REAL_TASK_META = {
  1: { assignee:3, prio:'urgent', start:'2026-10-18', due:'2026-10-21', est:16, tags:['Backend','API'], subtasks:[{t:'ตั้งค่า webhook',d:true},{t:'retry queue',d:true},{t:'load test',d:false}], desc:'ระบบแชตรวม 3 ช่องทาง (โทรศัพท์ / Facebook / LINE OA) — deployed ครบ 29 หน้า + live browser verified, เหลือ QA gate', comments:[{u:'u1',at:'2026-10-19 14:20',text:'ฝาก load test ที่ 200 msg/s ด้วยนะ'}] },
  2: { assignee:3, prio:'high', start:'2026-10-12', due:'2026-10-15', est:24, tags:['DevOps'], subtasks:[{t:'deploy v1',d:true},{t:'deploy v2 + images',d:true}], comments:[{u:'u1',at:'2026-10-14 18:02',text:'deploy ผ่าน verified แล้ว ✅'}] },
  3: { assignee:4, prio:'high', start:'2026-10-09', due:'2026-10-24', est:32, tags:['Frontend','Canvas'], subtasks:[{t:'table layout',d:true},{t:'auto-reset',d:false}] },
  4: { assignee:2, prio:'med', start:'2026-10-08', due:'2026-10-23', est:26, tags:['Design','Cron'], subtasks:[{t:'5 การ์ด',d:true},{t:'cron 2 ชม.',d:true},{t:'QA',d:false}], comments:[{u:'u1',at:'2026-10-20 09:12',text:'ขอดูแบบที่ 3 กับ 5 อีกรอบก่อน approve'}] },
  5: { assignee:4, prio:'med', start:'2026-10-25', due:'2026-11-07', est:24, tags:['Frontend','Template'] },
  6: { assignee:5, prio:'high', start:'2026-10-21', due:'2026-10-29', est:14, tags:['Backend','Media'], subtasks:[{t:'กู้รูป 70 รายการ',d:false}] },
  7: { assignee:1, prio:'low', start:'2026-10-26', due:'2026-11-06', est:6, tags:['Planning'] },
  8: { assignee:1, prio:'urgent', start:'2026-10-19', due:'2026-10-23', est:30, tags:['Design','ERP'], subtasks:[{t:'layout ตาม reference',d:true},{t:'calendar engine',d:false},{t:'kanban',d:false},{t:'รายงาน',d:false}], comments:[{u:'u1',at:'2026-10-20 10:00',text:'ลูกค้าอยากได้ปฏิทินใหญ่ๆ เต็มจอ layout คล้าย dribbble ที่ส่งมา'}], desc:'ออกแบบ MNG Dashboard ใหม่ตาม Innovalue + ทำ Work Tracking ERP' },
  8.1: null,
};

/* extra tasks to make the board/calendar rich (reference REAL project ids) */
const EXTRA_TASKS = [
  { project:5,  title:'ปฏิทินใหญ่เต็มจอ: month/week/day/agenda + ลากย้ายอีเวนต์', status:'doing', prio:'urgent', assignee:3, start:'2026-10-20', due:'2026-10-27', est:36, tags:['Frontend','Calendar'], subtasks:[{t:'month grid',d:true},{t:'week grid',d:true},{t:'drag & drop',d:true},{t:'mini cal',d:true}] },
  { project:5,  title:'โมดูลการเงิน: ใบแจ้งหนี้ + VAT 7% + รายงานรายรับ', status:'todo', prio:'high', assignee:5, start:'2026-10-28', due:'2026-11-10', est:28, tags:['Backend','Finance'] },
  { project:5,  title:'เชื่อมฐานข้อมูลจริง MariaDB (แยก pool auth/works)', status:'doing', prio:'urgent', assignee:5, start:'2026-10-20', due:'2026-10-22', est:18, tags:['Backend','Database'], subtasks:[{t:'schema + pools',d:true},{t:'REST API',d:true},{t:'login bcrypt',d:false}] },
  { project:5,  title:'ระบบสิทธิ์ผู้ใช้ (role: admin/member/viewer)', status:'todo', prio:'med', assignee:3, start:'2026-11-02', due:'2026-11-13', est:20, tags:['Backend','Auth'] },
  { project:5,  title:'ออกแบบฐานข้อมูล ERP (ERD ทั้งระบบ)', status:'review', prio:'high', assignee:5, start:'2026-10-19', due:'2026-10-24', est:12, tags:['Database'], subtasks:[{t:'core tables',d:true},{t:'finance',d:true},{t:'HR',d:false}] },
  { project:4,  title:'QA รอบแรก: ความเร็วโหลดข่าว < 1.5s', status:'todo', prio:'med', assignee:6, start:'2026-10-26', due:'2026-10-27', est:6, tags:['QA','Perf'] },
  { project:4,  title:'ส่งมอบ + อบรมทีม content ของ LoveIT', status:'todo', prio:'high', assignee:2, start:'2026-10-27', due:'2026-10-28', est:6, tags:['Training'] },
  { project:4,  title:'เก็บ feedback การ์ดข่าวแบบที่ 3/5 แล้วปรับ final', status:'doing', prio:'med', assignee:2, start:'2026-10-20', due:'2026-10-22', est:8, tags:['Design'] },
  { project:9,  title:'แปลเนื้อหา EN ทั้งเว็บ + proofread', status:'review', prio:'med', assignee:2, start:'2026-10-15', due:'2026-10-24', est:12, tags:['Content'], subtasks:[{t:'แปล 18 หน้า',d:true},{t:'proofread',d:false}] },
  { project:9,  title:'UAT กับลูกค้า SGI (รอบสุดท้าย)', status:'todo', prio:'high', assignee:6, start:'2026-10-29', due:'2026-10-30', est:8, tags:['QA','UAT'], subtasks:[{t:'test script 32 เคส',d:false}] },
  { project:9,  title:'CMS: จัดการเมนู + banner + SEO meta', status:'doing', prio:'high', assignee:4, start:'2026-10-12', due:'2026-10-26', est:22, tags:['Frontend','CMS'], subtasks:[{t:'menu manager',d:true},{t:'banner',d:true},{t:'SEO meta',d:false}] },
  { project:12, title:'เก็บ feedback หลัง go-live + แก้ minor bug 6 จุด', status:'done', prio:'med', assignee:4, start:'2026-10-16', due:'2026-10-18', est:8, tags:['Fix'], progress:100 },
  { project:12, title:'v3 Grand Restaurant — wireframe เมนู + จองโต๊ะ', status:'todo', prio:'med', assignee:2, start:'2026-10-26', due:'2026-11-02', est:16, tags:['Design'] },
  { project:3,  title:'Kickoff + เก็บ requirement APH ครั้งถัดไป', status:'todo', prio:'high', assignee:1, start:'2026-10-27', due:'2026-10-27', est:4, tags:['Meeting'] },
  { project:3,  title:'เขียน QA checklist รูปที่กู้กลับมา 70 รายการ', status:'todo', prio:'med', assignee:6, start:'2026-10-28', due:'2026-10-30', est:5, tags:['QA'] },
  { project:18, title:'Client Portal — สำรวจ pain point ลูกค้า 6 ราย', status:'todo', prio:'med', assignee:1, start:'2026-11-10', due:'2026-11-20', est:12, tags:['Research'] },
  { project:18, title:'Wireframe Client Portal (low-fi ~12 หน้า)', status:'todo', prio:'low', assignee:2, start:'2026-11-16', due:'2026-11-27', est:16, tags:['Design'] },
  { project:2,  title:'FDVS — เพิ่มโหมด compare 3 โฟลเดอร์พร้อมกัน', status:'todo', prio:'low', assignee:3, start:'2026-11-03', due:'2026-11-14', est:14, tags:['Feature'] },
  { project:1,  title:'TPS-Project — sprint planning พ.ย.', status:'todo', prio:'med', assignee:1, start:'2026-11-02', due:'2026-11-02', est:3, tags:['Planning','Meeting'] },
  { project:13, title:'PlayDigital — รีวิว UI หน้าแคมเปญ + A/B copy', status:'todo', prio:'med', assignee:4, start:'2026-10-24', due:'2026-10-31', est:10, tags:['Frontend'] },
];

const EVENTS = [
  { title:'Daily stand-up ทีม dev',        cat:'meeting', date:'2026-10-19', start:'09:30', end:'09:50', members:[1,3,4,5,6], loc:'Google Meet', desc:'อัปเดตงานรายวัน 15 นาที' },
  { title:'Daily stand-up ทีม dev',        cat:'meeting', date:'2026-10-26', start:'09:30', end:'09:50', members:[1,3,4,5,6], loc:'Google Meet', desc:'อัปเดตงานรายวัน 15 นาที' },
  { title:'Sprint Review MNG Dashboard',   cat:'meeting', date:'2026-10-20', start:'14:00', end:'15:30', project:5, members:[1,2,3,5], loc:'ห้องประชุม 1', desc:'รีวิว sprint 7 + retro' },
  { title:'Demo ระบบแชตให้ Calmat ดูรอบที่ 2', cat:'meeting', date:'2026-10-22', start:'10:00', end:'11:30', project:10, task:1, members:[1,3,4], loc:'Zoom กับลูกค้า', desc:'demo flow LINE → โทรศัพท์ + เก็บ feedback' },
  { title:'เดดไลน์: แชตรวม 3 ช่องทาง (QA gate)', cat:'deadline', date:'2026-10-21', start:'18:00', end:'18:30', project:10, task:1, members:[3] },
  { title:'วันปิยมหาราช (วันหยุดนักขัตฤกษ์)', cat:'holiday', date:'2026-10-23', allday:1, desc:'บริษัทหยุด 1 วัน — on-call เฉพาะ incident' },
  { title:'วางบิลงวด 2 — Chef-jeed v2',    cat:'finance', date:'2026-10-26', start:'10:00', end:'10:30', project:12, members:[1], desc:'ติดตามชำระ INV-2026-038 มูลค่า 128,400 บาท' },
  { title:'Kickoff APH ครั้งถัดไป @ บางนา', cat:'meeting', date:'2026-10-27', start:'13:00', end:'16:00', project:3, members:[1,5], loc:'APH Logistics บางนา กม.18', desc:'เก็บ requirement + เยี่ยมชม warehouse' },
  { title:'ส่งมอบ LoveIT + อบรมทีม content', cat:'deadline', date:'2026-10-28', start:'09:00', end:'12:00', project:4, members:[2,4], loc:'ออฟฟิศ LoveIT อารีย์' },
  { title:'จ่ายเงินเดือนทีมงาน',            cat:'finance', date:'2026-10-30', start:'15:00', end:'15:30', members:[1], desc:'โอนผ่าน KBiz ก่อน 15:00' },
  { title:'UAT เว็บ SGI รอบสุดท้าย',         cat:'deadline', date:'2026-10-30', start:'10:00', end:'12:00', project:9, members:[6,2] },
  { title:'อบรม UX writing ให้ทีม',          cat:'meeting', date:'2026-11-04', start:'15:00', end:'17:00', members:[2,4], loc:'ห้องประชุม 2' },
  { title:'นัดทานข้าวกับเชฟจี๊ด (ดูแลลูกค้าเก่า)', cat:'personal', date:'2026-10-24', start:'12:00', end:'13:30', members:[1], loc:'ลาดพร้าว 101' },
  { title:'ตรวจสุขภาพประจำปี',               cat:'personal', date:'2026-10-31', start:'08:00', end:'11:00', members:[1] },
  { title:'รีวิวดีไซน์การ์ดข่าว LoveIT',      cat:'meeting', date:'2026-10-20', start:'16:30', end:'17:15', project:4, members:[1,2], desc:'ตัดสินใจแบบ 3 หรือ 5' },
  { title:'ต่อใบอนุญาตซอฟต์แวร์ Figma ทีม',     cat:'finance', date:'2026-11-02', start:'11:00', end:'11:30', members:[1], desc:'4 seat × 4,500 บาท/ปี' },
  { title:'Retro + ปาร์ตี้ปิดเดือน ต.ค.',        cat:'personal', date:'2026-10-30', start:'18:30', end:'21:00', members:[1,2,3,4,5,6], loc:'ร้านชาบูอารีย์' },
  { title:'ส่งใบเสนอราคา APH phase ถัดไป',     cat:'deadline', date:'2026-11-06', start:'17:00', end:'17:30', project:3, members:[1] },
];

const INVOICES = [
  { no:'INV-2026-038', client:2, title:'Chef-jeed v2 — งวดส่งมอบ',        amount:120000, issue:'2026-10-15', due:'2026-10-22', status:'pending', items:[{d:'ค่าพัฒนาระบบ v2 งวด 2',q:1,p:120000}] },
  { no:'INV-2026-039', client:3, title:'Pool Dashboard — งวด 1 (50%)',    amount:60000,  issue:'2026-10-02', due:'2026-10-09', status:'paid', paid:'2026-10-08', items:[{d:'ค่าออกแบบ+พัฒนา งวด 1',q:1,p:60000}] },
  { no:'INV-2026-040', client:4, title:'LoveIT — ข่าว 5 การ์ด + Cron',    amount:95000,  issue:'2026-10-10', due:'2026-10-25', status:'pending', items:[{d:'ค่าออกแบบการ์ดข่าว',q:1,p:40000},{d:'cron ดึงข่าว',q:1,p:55000}] },
  { no:'INV-2026-041', client:1, title:'Calmat — Chat งวด 1 (40%)',       amount:72000,  issue:'2026-10-05', due:'2026-10-10', status:'paid', paid:'2026-10-11', items:[{d:'ค่าพัฒนางวด 1',q:1,p:72000}] },
  { no:'INV-2026-042', client:6, title:'SGI Website — งวด 2 (40%)',       amount:84000,  issue:'2026-09-30', due:'2026-10-14', status:'overdue', items:[{d:'ค่าพัฒนางวด 2',q:1,p:84000}] },
  { no:'INV-2026-043', client:1, title:'Calmat — retainer ต.ค.',          amount:35000,  issue:'2026-10-01', due:'2026-10-31', status:'pending', items:[{d:'ค่าดูแลระบบรายเดือน',q:1,p:35000}] },
  { no:'INV-2026-044', client:3, title:'Pool Dashboard — งวด 2 (40%)',    amount:48000,  issue:'2026-10-26', due:'2026-11-02', status:'draft',   items:[{d:'ค่าพัฒนางวด 2',q:1,p:48000}] },
  { no:'INV-2026-045', client:5, title:'APH Interface — งวดเปิดงาน (30%)', amount:45000, issue:'2026-10-28', due:'2026-11-07', status:'draft',   items:[{d:'ค่าเปิดงาน 30%',q:1,p:45000}] },
  { no:'INV-2026-033', client:2, title:'Chef-jeed — ค่าโฮสติ้งรายปี',     amount:18000,  issue:'2026-09-20', due:'2026-09-30', status:'paid', paid:'2026-09-28', items:[{d:'VPS + backup 1 ปี',q:1,p:18000}] },
];

const ACTIVITY = [
  [1,'ปรับโจทย์ระบบใหม่ — ลูกค้าอยากได้<b>ปฏิทินใหญ่เต็มจอ</b> สไตล์ ERP'],
  [1,'คอมเมนต์งาน LoveIT: ขอดูการ์ดข่าวแบบ 3 กับ 5 อีกรอบ'],
  [5,'push commit <b>pool-auto-reset</b> ขึ้น staging'],
  [3,'เริ่มเชื่อมฐานข้อมูลจริง MariaDB แยก pool auth/works'],
  [4,'ส่งหน้า chat 29 หน้าเข้า <b>รีวิว</b>'],
  [2,'อัปโหลดการ์ดข่าว 5 แบบพร้อม dark mode'],
  [1,'สร้างโปรเจกต์ <b>APH Interface</b> และนัด kickoff 27 ต.ค.'],
  [5,'ปิดงาน <b>Chef-jeed v2 deploy</b> — production verified'],
];

async function seed(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`INSERT INTO erp_settings (id, data) VALUES (1, ?)
      ON DUPLICATE KEY UPDATE data = JSON_SET(data, '$.seedVersion', ${SEED_VERSION})`,
      [JSON.stringify({ seedVersion: SEED_VERSION, theme:'#6C5CE7', n1:true, n2:true, n3:false })]);

    // team
    let [rows] = await conn.query('SELECT COUNT(*) c FROM erp_team');
    if (!rows[0].c) {
      for (const t of TEAM) await conn.query(
        'INSERT INTO erp_team (name, role, color, email, phone, is_me, auth_user_id) VALUES (?,?,?,?,?,?,?)',
        [t.name, t.role, t.color, t.email, t.phone, t.is_me, t.auth || null]);
      console.log('[seed] erp_team:', TEAM.length);
    }
    // clients
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_clients');
    if (!rows[0].c) {
      for (const c of CLIENTS) await conn.query(
        'INSERT INTO erp_clients (name, short, color, contact, phone, email, addr, since) VALUES (?,?,?,?,?,?,?,?)',
        [c.name, c.short, c.color, c.contact, c.phone, c.email, c.addr, c.since]);
      console.log('[seed] erp_clients:', CLIENTS.length);
    }
    // invoices
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_invoices');
    if (!rows[0].c) {
      for (const i of INVOICES) await conn.query(
        'INSERT INTO erp_invoices (no, client_id, title, amount, vat, issue, due, paid, status, items) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [i.no, i.client, i.title, i.amount, Math.round(i.amount * .07), i.issue, i.due, i.paid || null, i.status, JSON.stringify(i.items)]);
      console.log('[seed] erp_invoices:', INVOICES.length);
    }
    // events
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_events');
    if (!rows[0].c) {
      for (const e of EVENTS) await conn.query(
        'INSERT INTO erp_events (title, cat, date, start, end, allday, loc, descp, members, project_id, task_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [e.title, e.cat, e.date, e.allday ? '00:00' : e.start, e.allday ? '23:59' : e.end, e.allday ? 1 : 0, e.loc || null, e.desc || null, JSON.stringify(e.members || []), e.project || null, e.task || null]);
      console.log('[seed] erp_events:', EVENTS.length);
    }
    // activity
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_activity');
    if (!rows[0].c) {
      for (const [u, text] of ACTIVITY) await conn.query('INSERT INTO erp_activity (team_id, text) VALUES (?,?)', [u, text]);
      console.log('[seed] erp_activity:', ACTIVITY.length);
    }

    // project metadata by hub_id
    for (const [hub, m] of Object.entries(PROJ_META)) {
      await conn.query(`UPDATE projects SET
          erp_client_id=?, erp_client=?, erp_budget=?, erp_spent=?, erp_color=?, erp_grad=?,
          erp_status=?, erp_start=?, erp_end=?, erp_members=?, description=COALESCE(description, ?)
        WHERE hub_id=? AND erp_color IS NULL`,
        [m.client ?? null, m.clientName ?? null, m.budget ?? null, m.spent ?? null, m.color, m.grad,
         m.status, m.start, m.end, JSON.stringify(m.members || []), m.desc ?? null, hub]);
    }
    console.log('[seed] projects metadata:', Object.keys(PROJ_META).length);

    // real tasks enrichment
    for (const [id, m] of Object.entries(REAL_TASK_META)) {
      if (!m) continue;
      await conn.query(`UPDATE tasks SET
          erp_assignee=?, erp_prio=?, erp_start=?, due_date=?, erp_est=?, erp_tags=?, erp_subtasks=?, erp_comments=?,
          description = CASE WHEN description IS NULL OR description='' THEN ? ELSE description END
        WHERE id=? AND erp_code IS NULL`,
        [m.assignee, m.prio, m.start, m.due, m.est, JSON.stringify(m.tags || []),
         JSON.stringify(m.subtasks || []), JSON.stringify(m.comments || []), m.desc ?? '', id]);
    }
    console.log('[seed] real tasks enriched');

    // extra tasks (insert only if not already there — marker by title prefix match)
    const [exCnt] = await conn.query("SELECT COUNT(*) c FROM tasks WHERE erp_code LIKE 'MNG-%'");
    if (!exCnt[0].c) {
      for (const t of EXTRA_TASKS) {
        await conn.query(`INSERT INTO tasks (project_id, title, description, status, priority, due_date, progress,
            erp_start, erp_assignee, erp_est, erp_prio, erp_tags, erp_subtasks, erp_comments)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [t.project, t.title, t.desc || '', t.status, (t.prio === 'urgent' || t.prio === 'high') ? 'high' : 'normal',
           t.due, t.progress || 0, t.start, t.assignee, t.est, t.prio,
           JSON.stringify(t.tags || []), JSON.stringify(t.subtasks || []), '[]']);
      }
      console.log('[seed] extra tasks:', EXTRA_TASKS.length);
    }

    // backfill codes + progress sync
    await conn.query("UPDATE tasks SET erp_code = CONCAT('MNG-', 1000 + id) WHERE erp_code IS NULL");
    await conn.query("UPDATE tasks SET progress = 100 WHERE status = 'done' AND progress < 100");

    // ---- Agency OS v4 additive enrichments (idempotent) ----
    for (const [email, meta] of Object.entries(TEAM_ENRICH)) {
      await conn.query(
        'UPDATE erp_team SET nickname = COALESCE(nickname, ?), skills = COALESCE(skills, ?), state = COALESCE(NULLIF(state, \'\'), ?) WHERE email = ?',
        [meta.nickname, JSON.stringify(meta.skills), meta.state, email]
      );
    }

    const [aiCnt] = await conn.query("SELECT COUNT(*) c FROM erp_team WHERE kind = 'ai'");
    if (!aiCnt[0].c) {
      for (const a of AI_AGENTS) {
        await conn.query(
          `INSERT INTO erp_team (name, nickname, role, kind, state, color, email, skills, model, paused, autonomy, runs, success_rate, tokens_today, capacity, is_me)
           VALUES (?,?,?, 'ai', ?,?,?,?,?,?,?,?,?,?, 40, 0)`,
          [a.name, a.nickname, a.role, a.state, a.color, a.email, JSON.stringify(a.skills), a.model, a.paused, a.autonomy, a.runs, a.success_rate, a.tokens_today]
        );
      }
      const [agents] = await conn.query("SELECT id, name FROM erp_team WHERE kind = 'ai' ORDER BY id");
      const [sampleTasks] = await conn.query('SELECT id, erp_code, title FROM tasks WHERE archived = 0 ORDER BY id LIMIT 3');
      if (agents.length && sampleTasks.length) {
        await conn.query(
          'INSERT INTO erp_ai_runs (agent_id, task_id, action, detail, output, duration_sec, tokens, status) VALUES (?,?,?,?,?,?,?,?)',
          [agents[0].id, sampleTasks[0].id, 'วิเคราะห์โครงสร้างและแตก Subtasks', `${sampleTasks[0].erp_code} — ${sampleTasks[0].title}`, 'ตรวจสอบรายการงานและเตรียมแผนการทดสอบเรียบร้อย', 11, 1840, 'success']
        );
        if (agents[1] && sampleTasks[1]) {
          await conn.query(
            'INSERT INTO erp_ai_runs (agent_id, task_id, action, detail, output, duration_sec, tokens, status) VALUES (?,?,?,?,?,?,?,?)',
            [agents[1].id, sampleTasks[1].id, 'สรุปความคืบหน้าและแจ้งเตือนเดดไลน์', `${sampleTasks[1].erp_code} — ${sampleTasks[1].title}`, 'รวบรวมสถานะล่าสุดพร้อมข้อเสนอแนะสำหรับทีมรีวิว', 8, 1320, 'success']
          );
        }
      }
      console.log('[seed] AI Workforce agents:', AI_AGENTS.length);
    }

    // Backfill short project codes (e.g. CHEF, LOVE, SGI, APH, MNG)
    await conn.query(`
      UPDATE projects
      SET erp_code = UPPER(LEFT(REGEXP_REPLACE(COALESCE(NULLIF(hub_id,''), title), '[^A-Za-z0-9]', ''), 4))
      WHERE erp_code IS NULL OR erp_code = ''
    `).catch(async () => {
      await conn.query("UPDATE projects SET erp_code = CONCAT('PRJ', id) WHERE erp_code IS NULL OR erp_code = ''");
    });

    // Rooms seed
    const [rmCnt] = await conn.query('SELECT COUNT(*) c FROM erp_rooms');
    if (!rmCnt[0].c) {
      for (const r of DEFAULT_ROOMS) {
        await conn.query(
          'INSERT INTO erp_rooms (name, kind, capacity, floor, color, equipment) VALUES (?,?,?,?,?,?)',
          [r.name, r.kind, r.capacity, r.floor, r.color, JSON.stringify(r.equipment)]
        );
      }
      console.log('[seed] erp_rooms:', DEFAULT_ROOMS.length);
    }

    // Channels & initial welcome messages seed
    const [chCnt] = await conn.query('SELECT COUNT(*) c FROM erp_channels');
    if (!chCnt[0].c) {
      const [allMembers] = await conn.query('SELECT id FROM erp_team ORDER BY id');
      const memberIds = allMembers.map(m => m.id);
      for (const ch of DEFAULT_CHANNELS) {
        const [ins] = await conn.query(
          'INSERT INTO erp_channels (name, emoji, type, topic, members, pinned) VALUES (?,?,?,?,?,?)',
          [ch.name, ch.emoji, ch.type, ch.topic, JSON.stringify(memberIds), ch.pinned]
        );
        await conn.query(
          'INSERT INTO erp_messages (channel_id, author_id, text, kind, pinned) VALUES (?,?,?,?,?)',
          [ins.insertId, memberIds[0] || 1, `ยินดีต้อนรับสู่ห้อง #${ch.name} — ${ch.topic}`, 'system', 1]
        );
      }
      console.log('[seed] erp_channels:', DEFAULT_CHANNELS.length);
    }

    // Default Agency OS settings (announce, work hours, office GPS, aiEnabled)
    const [setRow] = await conn.query('SELECT data FROM erp_settings WHERE id = 1');
    let curSettings = {};
    try { curSettings = JSON.parse(setRow[0]?.data || '{}') || {}; } catch {}
    const mergedSettings = {
      orgName: 'MNG Groups Co., Ltd.',
      announce: 'โฟกัสสัปดาห์นี้: ส่งมอบงานลูกค้าตามสปรินต์ + อัปเกรดระบบ MNG Workspace & AI Workforce 🚀',
      workStart: '09:30',
      workEnd: '18:30',
      aiEnabled: true,
      office: { name: 'MNG Groups Office — กรุงเทพฯ', lat: 13.7563, lng: 100.5018, radius: 250 },
      ...curSettings,
      seedVersion: SEED_VERSION,
    };
    await conn.query('UPDATE erp_settings SET data = ? WHERE id = 1', [JSON.stringify(mergedSettings)]);

    console.log('[seed] done');
  } finally { conn.release(); }
}

async function run() {
  const { ensureSchema, workPool } = require('./db');
  await ensureSchema();
  await seed(workPool);
  const [[{ c }]] = await workPool.query('SELECT COUNT(*) c FROM tasks');
  console.log('total tasks now:', c);
  await workPool.end();
  process.exit(0);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
module.exports = { seed };
