/* MNG ERP — one-time seed into pacific_mngworks
   - Creates ERP module data (team, clients, invoices, events, activity, agency-os)
   - Enriches the REAL projects/tasks with erp_* metadata (additive only)
   - Guarded by erp_settings seedVersion — safe to run repeatedly         */

const SEED_VERSION = 4;

const TEAM = [
  { name:'Worapot',       nickname:'เอก',   presence:'online',  skills:['PM','Strategy','ERP'],     role:'Founder / PM',   color:'#FF8A5C', email:'worapot@outlook.com', phone:'081-234-5678', is_me:1, auth:2 },
  { name:'Nuna Sirima',   nickname:'นุ่น',  presence:'working', skills:['UX/UI','Figma','Brand'],    role:'UX/UI Designer', color:'#8E7CF3', email:'nuna@mnggroups.co',   phone:'089-111-2233', is_me:0 },
  { name:'Bank Kritsada', nickname:'แบงก์', presence:'working', skills:['Node.js','React','DevOps'], role:'Full-stack Dev', color:'#3BA7FF', email:'bank@mnggroups.co',   phone:'086-555-8899', is_me:0 },
  { name:'May Thanyarat', nickname:'เมย์',  presence:'focus',   skills:['Frontend','CSS','UI'],      role:'Front-end Dev',  color:'#FF6B9D', email:'may@mnggroups.co',    phone:'092-777-1144', is_me:0 },
  { name:'Art Pongsakorn',nickname:'อาร์ต', presence:'online',  skills:['MariaDB','API','Cron'],     role:'Back-end Dev',   color:'#22C793', email:'art@mnggroups.co',    phone:'095-888-2211', is_me:0 },
  { name:'Fah Chanya',    nickname:'ฟ้า',   presence:'away',    skills:['QA','E2E','UAT'],           role:'QA Tester',      color:'#FFB020', email:'fah@mnggroups.co',    phone:'097-333-4455', is_me:0 },
];

const AI_AGENTS = [
  { code:'NOVA',  name:'NOVA',  role:'AI Project & Sprint Planner', model:'Claude 3.7 Sonnet', color:'#6C5CE7', autonomy:92, runs:148, success:99.2, tokens:18420, skills:['Sprint Plan','Risk Alert','Stand-up Summary'], prompt:'วิเคราะห์ความเสี่ยงเดดไลน์และกระจายภาระงานให้สมดุล' },
  { code:'PIXEL', name:'PIXEL', role:'AI Creative & UX Copywriter', model:'GPT-4.1',           color:'#FF6B9D', autonomy:88, runs:112, success:98.4, tokens:14200, skills:['UX Microcopy','Campaign Copy','TH/EN Translation'], prompt:'ช่วยร่าง UX writing และข้อความแคมเปญสองภาษา' },
  { code:'BYTE',  name:'BYTE',  role:'AI Code & QA Reviewer',       model:'Claude 3.7 Sonnet', color:'#3BA7FF', autonomy:90, runs:204, success:99.5, tokens:26850, skills:['Code Review','SQL Audit','Test Cases'], prompt:'ตรวจเช็กโค้ด API และสร้างชุดทดสอบ QA อัตโนมัติ' },
  { code:'ECHO',  name:'ECHO',  role:'AI Client Comms & MoM',       model:'Gemini 2.5 Pro',    color:'#22C793', autonomy:84, runs:89,  success:97.8, tokens:11300, skills:['Meeting Minutes','Client Update','Proposal Draft'], prompt:'สรุปรายงานการประชุมและร่างอัปเดตรายสัปดาห์ส่งลูกค้า' },
  { code:'ORBIT', name:'ORBIT', role:'AI Finance & Ops Analyst',    model:'GPT-4.1 Mini',      color:'#FFB020', autonomy:86, runs:67,  success:99.0, tokens:8940,  skills:['Invoice Follow-up','Budget Burn','Cashflow'], prompt:'ติดตามบิลค้างชำระและวิเคราะห์งบประมาณโปรเจกต์' },
];

const CHANNELS = [
  { slug:'general',        name:'general',        emoji:'📢', topic:'ประกาศกลางและอัปเดตประจำวันของทีม MNG Groups' },
  { slug:'dev-ops',        name:'dev-ops',        emoji:'💻', topic:'พูดคุยงานพัฒนา API, Deploy, Database และแก้บั๊ก' },
  { slug:'design-review',  name:'design-review',  emoji:'🎨', topic:'ส่งดราฟต์ UI/UX, การ์ดข่าว และตรวจงานดีไซน์' },
  { slug:'client-updates', name:'client-updates', emoji:'🤝', topic:'สรุปความคืบหน้าลูกค้า นัดหมาย Demo และ UAT' },
  { slug:'ai-feed',        name:'ai-feed',        emoji:'✨', topic:'รายงานผลการทำงานอัตโนมัติจากทีม AI Workforce' },
];

const ROOMS = [
  { name:'Boardroom ชั้น 4 (ห้องประชุมใหญ่)', kind:'room',   zone:'ชั้น 4 · โซนหน้า', capacity:12, color:'#6C5CE7', equip:['จอ 4K 75"','กล้อง Conference','Whiteboard'] },
  { name:'Creative Studio A (ถ่ายภาพ/ไฟ)',    kind:'studio', zone:'ชั้น 2 · สตูดิโอ', capacity:8,  color:'#FF6B9D', equip:['ฉาก Cyclorama','ไฟ Aputure 300d','ไมค์ไร้สาย'] },
  { name:'Podcast & Sound Booth',             kind:'studio', zone:'ชั้น 2 · ห้องอัด', capacity:4,  color:'#3BA7FF', equip:['Rodecaster Pro','ไมค์ Shure SM7B x3','เก็บเสียง'] },
  { name:'Focus Pod 1 (ห้องคุยงานด่วน)',       kind:'room',   zone:'ชั้น 3 · โซน Dev', capacity:4,  color:'#22C793', equip:['จอ Monitor 27"','ปลั๊ก USB-C'] },
  { name:'ชุดออกกอง Sony FX3 + เลนส์ G-Master', kind:'gear',  zone:'ตู้เก็บอุปกรณ์',    capacity:1,  color:'#FFB020', equip:['Sony FX3','24-70mm GM II','Gimbal RS4'] },
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
        'INSERT INTO erp_team (name, nickname, presence, skills, role, color, email, phone, is_me, auth_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [t.name, t.nickname, t.presence, JSON.stringify(t.skills || []), t.role, t.color, t.email, t.phone, t.is_me, t.auth || null]);
      console.log('[seed] erp_team:', TEAM.length);
    } else {
      for (const t of TEAM) {
        await conn.query(
          'UPDATE erp_team SET nickname=COALESCE(nickname,?), presence=COALESCE(presence,?), skills=COALESCE(skills,?) WHERE email=?',
          [t.nickname, t.presence, JSON.stringify(t.skills || []), t.email]
        );
      }
    }

    // AI Workforce agents + runs
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_ai_agents');
    if (!rows[0].c) {
      for (const a of AI_AGENTS) await conn.query(
        `INSERT INTO erp_ai_agents (code, name, role, model, color, autonomy, paused, runs, success_rate, tokens_today, skills, prompt)
         VALUES (?,?,?,?,?,?,0,?,?,?,?,?)`,
        [a.code, a.name, a.role, a.model, a.color, a.autonomy, a.runs, a.success, a.tokens, JSON.stringify(a.skills), a.prompt]);
      await conn.query(
        `INSERT INTO erp_ai_runs (agent_id, task_id, action, detail, duration_sec, tokens, status) VALUES
         (1, 1, 'วิเคราะห์ความเสี่ยง Sprint & เดดไลน์', 'ตรวจพบงานใกล้เดดไลน์ 3 รายการ แนะนำเกลี่ยโหลดให้ u4 และ u5', 4, 940, 'ok'),
         (3, 1, 'Code & Webhook Queue Audit', 'ตรวจ retry queue ของ LINE OA webhook รองรับ burst 250 msg/s ผ่านเกณฑ์', 6, 1280, 'ok'),
         (2, 4, 'ร่าง UX Copy การ์ดข่าว LoveIT 5 สไตล์', 'สรุปหัวข้อและ microcopy ทั้งโหมดสว่างและมืดครบ 5 รูปแบบ', 3, 760, 'ok'),
         (5, null, 'ตรวจสอบใบแจ้งหนี้ค้างชำระประจำสัปดาห์', 'แจ้งเตือน INV-2026-042 เกินกำหนดชำระ พร้อมร่างอีเมลติดตาม', 3, 610, 'ok')`
      );
      console.log('[seed] erp_ai_agents:', AI_AGENTS.length);
    }

    // Team Channels + initial messages
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_channels');
    if (!rows[0].c) {
      for (const c of CHANNELS) await conn.query(
        'INSERT INTO erp_channels (slug, name, emoji, topic) VALUES (?,?,?,?)',
        [c.slug, c.name, c.emoji, c.topic]);
      await conn.query(
        `INSERT INTO erp_messages (channel_id, sender_id, sender_name, kind, body, pinned, reactions) VALUES
         (1, 'u1', 'Worapot (เอก)', 'text', 'ยินดีต้อนรับสู่ระบบแชตกลางของ MNG ERP! อัปเดตงานด่วนและไฟล์ส่งมอบในแต่ละห้องได้เลยครับ 🚀', 1, '{"🔥":["u2","u3"],"👍":["u4","u5"]}'),
         (2, 'u3', 'Bank Kritsada', 'text', 'อัปเดต: เชื่อมฐานข้อมูล MariaDB แยก 2 pool (auth + works) เรียบร้อย พร้อมทดสอบ load test บ่ายนี้ครับ', 0, '{"✅":["u1","u5"]}'),
         (3, 'u2', 'Nuna Sirima', 'text', 'ส่งดราฟต์การ์ดข่าว LoveIT แบบที่ 3 และ 5 ปรับโทนสีให้คมขึ้นแล้ว รบกวนพี่เอกช่วยดูหน่อยนะคะ 🎨', 0, '{"🎉":["u1"]}'),
         (5, 'ai1', 'NOVA (AI)', 'ai', '✨ <b>สรุปภาพรวมเช้าวันนี้</b> — มีงานกำลังทำ 8 ชิ้น ใกล้ครบกำหนดใน 3 วัน 2 ชิ้น แนะนำโฟกัส MNG-1031 ก่อนเที่ยง', 0, '{"👍":["u1"]}')`
      );
      console.log('[seed] erp_channels:', CHANNELS.length);
    }

    // Rooms & Studio + initial bookings
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_rooms');
    if (!rows[0].c) {
      for (const rm of ROOMS) await conn.query(
        'INSERT INTO erp_rooms (name, kind, zone, capacity, color, equip) VALUES (?,?,?,?,?,?)',
        [rm.name, rm.kind, rm.zone, rm.capacity, rm.color, JSON.stringify(rm.equip)]);
      const td = new Date().toISOString().slice(0, 10);
      await conn.query(
        `INSERT INTO erp_bookings (room_id, title, date, start, end, host_id, members, note) VALUES
         (1, 'Sprint Planning & Review ทีม MNG', ?, '10:00', '11:30', 'u1', '["u1","u2","u3","u5"]', 'เตรียมสไลด์สรุปความคืบหน้า'),
         (2, 'ถ่ายภาพสินค้าโปรเจกต์ Chef-jeed Set ใหม่', ?, '13:30', '16:00', 'u2', '["u2","u4"]', 'เซ็ตไฟ Warm Daylight'),
         (4, 'Pair Programming — LINE Webhook Retry', ?, '15:00', '16:30', 'u3', '["u3","u5"]', 'ทดสอบโหลด 200 msg/s')`,
        [td, td, td]
      );
      console.log('[seed] erp_rooms:', ROOMS.length);
    }

    // HR Check-ins + Leaves
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_checkins');
    if (!rows[0].c) {
      const td = new Date().toISOString().slice(0, 10);
      await conn.query(
        `INSERT INTO erp_checkins (member_id, date, clock_in, clock_out, mode, note) VALUES
         ('u1', ?, '09:05', NULL, 'office', 'เข้าออฟฟิศ ประชุมเช้า'),
         ('u2', ?, '09:18', NULL, 'wfh', 'WFH ปั่นงานดีไซน์ LoveIT'),
         ('u3', ?, '08:55', NULL, 'office', 'เตรียมเทสต์ระบบ LINE OA'),
         ('u4', ?, '09:25', NULL, 'office', 'ทำหน้า UI 29 หน้า'),
         ('u5', ?, '09:12', NULL, 'wfh', 'ดูแลเซิร์ฟเวอร์และฐานข้อมูล')`,
        [td, td, td, td, td]
      );
    }
    [rows] = await conn.query('SELECT COUNT(*) c FROM erp_leaves');
    if (!rows[0].c) {
      await conn.query(
        `INSERT INTO erp_leaves (member_id, kind, start_date, end_date, days, reason, status, approved_by) VALUES
         ('u6', 'personal', '2026-10-28', '2026-10-28', 1, 'ติดต่อธุระราชการช่วงเช้า-บ่าย', 'pending', NULL),
         ('u2', 'wfh', '2026-10-29', '2026-10-30', 2, 'ขอปฏิบัติงาน WFH โฟกัสงานออกแบบ UI ชุดใหญ่', 'approved', 'Worapot'),
         ('u4', 'annual', '2026-11-05', '2026-11-06', 2, 'ลาพักร้อนประจำปี', 'approved', 'Worapot')`
      );
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

    // backfill codes + progress sync (pure JS + standard SQL for maximum MariaDB compatibility)
    const [projRows] = await conn.query("SELECT id, hub_id, name, erp_code FROM projects WHERE erp_code IS NULL OR erp_code = ''");
    for (const pr of projRows) {
      const cleaned = String(pr.hub_id || pr.name || 'MNG').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3);
      const code = cleaned.length >= 2 ? cleaned : 'MNG';
      await conn.query('UPDATE projects SET erp_code=? WHERE id=?', [code, pr.id]);
    }
    await conn.query(`UPDATE tasks t LEFT JOIN projects p ON p.id = t.project_id
      SET t.erp_code = CONCAT(COALESCE(NULLIF(p.erp_code, ''), 'MNG'), '-', 1000 + t.id)
      WHERE t.erp_code IS NULL OR t.erp_code = ''`);
    await conn.query("UPDATE tasks SET progress = 100 WHERE status = 'done' AND progress < 100");
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
