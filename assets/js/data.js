/* ============================================================
   MNG ERP — Seed data (demo dataset synced from MNG Hub style)
   ============================================================ */
window.SEED = (() => {

  const team = [
    { id:'u1', name:'Worapot',       nickname:'เอก',   presence:'online',  skills:['PM','Strategy','ERP'],     role:'Founder / PM',   color:'#FF8A5C', email:'worapot@outlook.com', phone:'081-234-5678', me:true },
    { id:'u2', name:'Nuna Sirima',   nickname:'นุ่น',  presence:'working', skills:['UX/UI','Figma','Brand'],    role:'UX/UI Designer', color:'#8E7CF3', email:'nuna@mnggroups.co',   phone:'089-111-2233' },
    { id:'u3', name:'Bank Kritsada', nickname:'แบงก์', presence:'working', skills:['Node.js','React','DevOps'], role:'Full-stack Dev', color:'#3BA7FF', email:'bank@mnggroups.co',   phone:'086-555-8899' },
    { id:'u4', name:'May Thanyarat', nickname:'เมย์',  presence:'focus',   skills:['Frontend','CSS','UI'],      role:'Front-end Dev',  color:'#FF6B9D', email:'may@mnggroups.co',    phone:'092-777-1144' },
    { id:'u5', name:'Art Pongsakorn',nickname:'อาร์ต', presence:'online',  skills:['MariaDB','API','Cron'],     role:'Back-end Dev',   color:'#22C793', email:'art@mnggroups.co',    phone:'095-888-2211' },
    { id:'u6', name:'Fah Chanya',    nickname:'ฟ้า',   presence:'away',    skills:['QA','E2E','UAT'],           role:'QA Tester',      color:'#FFB020', email:'fah@mnggroups.co',    phone:'097-333-4455' },
  ];

  const projects = [
    { id:'p1', code:'CAL', name:'Calmat — Chat โทรศัพท์/Facebook/LINE', short:'Calmat', client:'Calmat Co., Ltd.', grad:'g-blue',
      color:'#2F6BF0', status:'doing', progress:62, budget:180000, spent:111000, start:'2026-10-05', end:'2026-11-06',
      owner:'u1', members:['u1','u3','u4','u6'], desc:'ระบบแชตรวม 3 ช่องทาง (โทรศัพท์ / Facebook / LINE OA) ครบ 29 หน้า พร้อม live browser verified' },
    { id:'p2', code:'CFJ', name:'Chef-jeed v1 + v2 — deploy + upload images', short:'Chef-jeed', client:'Chef-jeed', grad:'g-purple',
      color:'#6C5CE7', status:'done', progress:100, budget:240000, spent:228000, start:'2026-09-10', end:'2026-10-15',
      owner:'u3', members:['u3','u5'], desc:'Deploy production + upload รูปภาพสินค้า v1 และ v2' },
    { id:'p3', code:'POL', name:'Pool Dashboard — table layout + auto-reset', short:'Pool Dashboard', client:'168 Pool Villa', grad:'g-green',
      color:'#14B890', status:'doing', progress:78, budget:120000, spent:86000, start:'2026-10-01', end:'2026-10-31',
      owner:'u4', members:['u4','u5'], desc:'โต๊ะพูล layout + auto-reset รอบคิว + หน้าจอสาธารณะ' },
    { id:'p4', code:'LVT', name:'LoveIT — ข่าว 5 การ์ด + Cron 2 ชั่วโมง', short:'LoveIT', client:'LoveIT Thailand', grad:'g-pink',
      color:'#F25C8B', status:'review', progress:90, budget:95000, spent:74000, start:'2026-10-08', end:'2026-10-27',
      owner:'u2', members:['u2','u4','u6'], desc:'ออกแบบการ์ดข่าว 5 แบบ + cron ดึงข่าวทุก 2 ชั่วโมง' },
    { id:'p5', code:'ERP', name:'MNG Smart Dashboard v2', short:'MNG Dashboard', client:'Internal — MNG Groups', grad:'g-orange',
      color:'#F2762E', status:'doing', progress:35, budget:0, spent:0, start:'2026-10-15', end:'2026-12-15',
      owner:'u1', members:['u1','u2','u3','u4','u5','u6'], desc:'อัปเกรด Smart Dashboard: Work Tracking + Calendar ERP เต็มจอ + Agency OS' },
    { id:'p6', code:'APH', name:'APH Interface — API Connector', short:'APH Interface', client:'APH Logistics', grad:'g-teal',
      color:'#17A2B8', status:'todo', progress:8, budget:150000, spent:9000, start:'2026-10-27', end:'2026-12-04',
      owner:'u5', members:['u5','u3'], desc:'เชื่อม API ขนส่ง APH: booking, tracking, webhook สถานะ' },
    { id:'p7', code:'SGI', name:'SGI Corporate Website', short:'SGI Website', client:'SGI Group', grad:'g-indigo',
      color:'#4B5ED9', status:'review', progress:84, budget:210000, spent:152000, start:'2026-09-21', end:'2026-10-30',
      owner:'u2', members:['u2','u4'], desc:'เว็บไซต์องค์กร SGI หลายภาษา TH/EN + CMS' },
    { id:'p8', code:'PRT', name:'Client Portal + Billing', short:'Client Portal', client:'Internal — MNG Groups', grad:'g-slate',
      color:'#5A6280', status:'todo', progress:0, budget:0, spent:0, start:'2026-11-10', end:'2027-01-29',
      owner:'u1', members:['u1','u3','u5'], desc:'พอร์ทัลลูกค้า: ติดตามโปรเจกต์ + ใบแจ้งหนี้ + แจ้งซ่อม' },
  ];

  const clients = [
    { id:'c1', name:'Calmat Co., Ltd.',  short:'Calmat',  color:'#2F6BF0', contact:'คุณแพรว — Marketing Manager', phone:'02-111-3344', email:'praew@calmat.co.th',  addr:'อาคารใจฟู่ ชั้น 12 สุขุมวิท กรุงเทพฯ', since:'2025-03-01' },
    { id:'c2', name:'Chef-jeed',         short:'Chef-jeed',color:'#6C5CE7', contact:'เชฟจี๊ด — เจ้าของกิจการ',    phone:'081-900-1122', email:'jeed@chefjeed.com',   addr:'ลาดพร้าว 101 กรุงเทพฯ', since:'2025-06-15' },
    { id:'c3', name:'168 Pool Villa',    short:'168 Pool', color:'#14B890', contact:'คุณโอ๋ — ผู้จัดการรีสอร์ท', phone:'038-555-168', email:'oh@168poolvilla.com', addr:'พัทยา ชลบุรี', since:'2025-11-20' },
    { id:'c4', name:'LoveIT Thailand',   short:'LoveIT',   color:'#F25C8B', contact:'คุณเลิฟ — Editor',          phone:'02-555-8899', email:'love@loveit.co.th',    addr:'อารีย์ กรุงเทพฯ', since:'2024-09-01' },
    { id:'c5', name:'APH Logistics',     short:'APH',      color:'#17A2B8', contact:'คุณอาร์ม — IT Director',    phone:'02-777-6655', email:'arm@aphlogistics.com', addr:'บางนา-ตราด กม.18', since:'2026-08-10' },
    { id:'c6', name:'SGI Group',         short:'SGI',      color:'#4B5ED9', contact:'คุณนิดา — Corporate Comms', phone:'02-333-2211', email:'nida@sgigroup.co.th',  addr:'สาทร กรุงเทพฯ', since:'2025-01-08' },
  ];

  // statuses: todo | doing | review | done   priorities: low | med | high | urgent
  const tasks = [
    { id:'t1',  code:'MNG-1031', project:'p1', title:'เชื่อม LINE OA webhook + fallback queue', status:'doing',  priority:'urgent', assignee:'u3', start:'2026-10-18', due:'2026-10-21', progress:70, est:16, tags:['Backend','API'], subtasks:[{t:'ตั้งค่า webhook',d:true},{t:'retry queue',d:true},{t:'load test',d:false}], comments:[{u:'u1',at:'2026-10-19 14:20',text:'ฝาก load test ที่ 200 msg/s ด้วยนะ'}], desc:'รองรับข้อความพร้อมกันสูงสุดและ fallback เมื่อ LINE down' },
    { id:'t2',  code:'MNG-1032', project:'p1', title:'หน้า Chat UI รวม 3 ช่องทาง (29 หน้า)', status:'review', priority:'high',   assignee:'u4', start:'2026-10-10', due:'2026-10-23', progress:92, est:40, tags:['Frontend','Chat'], subtasks:[{t:'layout 29 หน้า',d:true},{t:'dark mode',d:true},{t:'RTL quick reply',d:false}], comments:[], desc:'ทำครบทุก state: empty, typing, error, attachment' },
    { id:'t3',  code:'MNG-1033', project:'p1', title:'ทดสอบส่งข้อความข้ามช่องทาง (E2E)', status:'todo',   priority:'high',   assignee:'u6', start:'2026-10-22', due:'2026-10-28', progress:0, est:12, tags:['QA'], subtasks:[], comments:[], desc:'E2E: FB → LINE, LINE → โทรศัพท์, broadcast' },
    { id:'t4',  code:'MNG-1021', project:'p2', title:'Deploy production v2 + SSL auto-renew', status:'done',   priority:'high',   assignee:'u3', start:'2026-10-12', due:'2026-10-14', progress:100, est:10, tags:['DevOps'], subtasks:[{t:'CI pipeline',d:true},{t:'SSL certbot',d:true}], comments:[{u:'u1',at:'2026-10-14 18:02',text:'deploy ผ่าน verified บน browser แล้ว ✅'}], desc:'zero-downtime deploy' },
    { id:'t5',  code:'MNG-1022', project:'p2', title:'Upload รูปสินค้า 1,240 รูป + crop อัตโนมัติ', status:'done',   priority:'med',    assignee:'u5', start:'2026-10-13', due:'2026-10-15', progress:100, est:14, tags:['Backend','Media'], subtasks:[], comments:[], desc:'batch upload + resize 3 ขนาด' },
    { id:'t6',  code:'MNG-1011', project:'p3', title:'Table layout โต๊ะพูล 16 โต๊ะแบบลากวาง', status:'doing',  priority:'high',   assignee:'u4', start:'2026-10-09', due:'2026-10-22', progress:80, est:24, tags:['Frontend','Canvas'], subtasks:[{t:'drag & drop',d:true},{t:'snap grid',d:true},{t:'zoom/pan',d:false}], comments:[], desc:'canvas ลากวางโต๊ะ พร้อมสถานะ real-time' },
    { id:'t7',  code:'MNG-1012', project:'p3', title:'Auto-reset คิวเมื่อครบรอบ + แจ้งเตือน LINE', status:'doing', priority:'med', assignee:'u5', start:'2026-10-14', due:'2026-10-24', progress:55, est:18, tags:['Backend','Cron'], subtasks:[{t:'cron spec',d:true},{t:'reset logic',d:true},{t:'LINE notify',d:false},{t:'edge 23:59',d:false}], comments:[], desc:'reset คิวทุกเที่ยงคืน + สรุปยอดส่ง LINE กลุ่มร้าน' },
    { id:'t8',  code:'MNG-1013', project:'p3', title:'หน้าจอสาธารณะ (TV board) อัปเดตทุก 5 วิ', status:'todo', priority:'low', assignee:'u4', start:'2026-10-25', due:'2026-10-30', progress:0, est:8, tags:['Frontend'], subtasks:[], comments:[], desc:'สำหรับติด TV หน้าร้าน ไม่ต้อง login' },
    { id:'t9',  code:'MNG-1007', project:'p4', title:'ออกแบบการ์ดข่าว 5 แบบ + dark mode', status:'review', priority:'med',    assignee:'u2', start:'2026-10-08', due:'2026-10-21', progress:95, est:16, tags:['Design'], subtasks:[{t:'5 style',d:true},{t:'dark mode',d:true},{t:'แบบ skeleton',d:true}], comments:[{u:'u1',at:'2026-10-20 09:12',text:'ขอดูแบบที่ 3 กับ 5 อีกรอบก่อน approve'}], desc:'การ์ดแนวนอน/แนวตั้ง/รูปใหญ่/มินิมอล/วิดีโอ' },
    { id:'t10', code:'MNG-1008', project:'p4', title:'Cron ดึงข่าวทุก 2 ชม. + dedupe บทความ', status:'doing',  priority:'high',   assignee:'u5', start:'2026-10-12', due:'2026-10-23', progress:65, est:20, tags:['Backend','Cron'], subtasks:[{t:'scraper 6 แหล่ง',d:true},{t:'dedupe hash',d:true},{t:'image proxy',d:false}], comments:[], desc:'กันข่าวซ้ำด้วย simhash + fallback image' },
    { id:'t11', code:'MNG-1009', project:'p4', title:'QA รอบแรก: ความเร็วโหลดข่าว < 1.5s', status:'todo',  priority:'med',    assignee:'u6', start:'2026-10-26', due:'2026-10-27', progress:0, est:6, tags:['QA','Perf'], subtasks:[], comments:[], desc:'Lighthouse + real device test' },
    { id:'t12', code:'MNG-1041', project:'p5', title:'ออกแบบระบบ Work Tracking + ปฏิทิน ERP เต็มจอ', status:'doing',  priority:'urgent', assignee:'u1', start:'2026-10-19', due:'2026-10-23', progress:45, est:30, tags:['Design','ERP'], subtasks:[{t:'layout ตาม reference',d:true},{t:'calendar engine',d:false},{t:'kanban',d:false},{t:'รายงาน',d:false}], comments:[{u:'u1',at:'2026-10-20 10:00',text:'ลูกค้าอยากได้ปฏิทินใหญ่ๆ เต็มจอ layout คล้าย dribbble ที่ส่งมา'}], desc:'ทำ UX ทั้งระบบตามภาพ reference' },
    { id:'t13', code:'MNG-1042', project:'p5', title:'ปฏิทินใหญ่เต็มจอ: month/week/day/agenda + ลากย้ายอีเวนต์', status:'doing', priority:'urgent', assignee:'u3', start:'2026-10-20', due:'2026-10-27', progress:40, est:36, tags:['Frontend','Calendar'], subtasks:[{t:'month grid',d:true},{t:'week grid',d:false},{t:'drag & drop',d:false},{t:'mini cal',d:false}], comments:[], desc:'calendar engine ทั้งหมดรวมถึง recurring meeting' },
    { id:'t14', code:'MNG-1043', project:'p5', title:'โมดูลการเงิน: ใบแจ้งหนี้ + VAT 7% + รายงานรายรับ', status:'todo', priority:'high', assignee:'u5', start:'2026-10-28', due:'2026-11-10', progress:0, est:28, tags:['Backend','Finance'], subtasks:[], comments:[], desc:'สร้าง PDF ใบแจ้งหนี้ + สถานะ paid/pending/overdue' },
    { id:'t15', code:'MNG-1044', project:'p5', title:'ระบบสิทธิ์ผู้ใช้ (role: admin/member/viewer)', status:'todo', priority:'med', assignee:'u3', start:'2026-11-02', due:'2026-11-13', progress:0, est:20, tags:['Backend','Auth'], subtasks:[], comments:[], desc:'RBAC + audit log' },
    { id:'t16', code:'MNG-1051', project:'p6', title:'Kickoff + เก็บ requirement กับ APH', status:'todo', priority:'high', assignee:'u1', start:'2026-10-27', due:'2026-10-27', progress:0, est:4, tags:['Meeting'], subtasks:[], comments:[], desc:'ประชุม onsite บางนา + ทำ MoM' },
    { id:'t17', code:'MNG-1052', project:'p6', title:'ออกแบบ schema API booking/tracking', status:'todo', priority:'med', assignee:'u5', start:'2026-10-28', due:'2026-11-06', progress:0, est:16, tags:['API','Design'], subtasks:[], comments:[], desc:'OpenAPI spec v1' },
    { id:'t18', code:'MNG-0991', project:'p7', title:'แปลเนื้อหา EN ทั้งเว็บ + proofread', status:'review', priority:'med', assignee:'u2', start:'2026-10-15', due:'2026-10-24', progress:85, est:12, tags:['Content'], subtasks:[{t:'แปล 18 หน้า',d:true},{t:'proofread',d:false}], comments:[], desc:'ใช้ glossary ของลูกค้า' },
    { id:'t19', code:'MNG-0992', project:'p7', title:'CMS: จัดการเมนู + banner + SEO meta', status:'doing', priority:'high', assignee:'u4', start:'2026-10-12', due:'2026-10-26', progress:70, est:22, tags:['Frontend','CMS'], subtasks:[{t:'menu manager',d:true},{t:'banner',d:true},{t:'SEO meta',d:false}], comments:[], desc:'drag-sort เมนู + preview' },
    { id:'t20', code:'MNG-0993', project:'p7', title:'UAT กับลูกค้า SGI (รอบสุดท้าย)', status:'todo', priority:'high', assignee:'u6', start:'2026-10-29', due:'2026-10-30', progress:0, est:8, tags:['QA','UAT'], subtasks:[], comments:[], desc:'เตรียม test script 32 เคส' },
    { id:'t21', code:'MNG-1034', project:'p1', title:'รายงานสรุปแชตรายวันให้ผู้บริหาร Calmat', status:'todo', priority:'low', assignee:'u3', start:'2026-10-29', due:'2026-11-02', progress:0, est:10, tags:['Report'], subtasks:[], comments:[], desc:'PDF auto ทุก 08:00' },
    { id:'t22', code:'MNG-1045', project:'p5', title:'ออกแบบฐานข้อมูล ERP (ERD ทั้งระบบ)', status:'doing', priority:'high', assignee:'u5', start:'2026-10-19', due:'2026-10-24', progress:60, est:12, tags:['Database'], subtasks:[{t:'core tables',d:true},{t:'finance',d:true},{t:'HR',d:false}], comments:[], desc:'12 module, ~60 tables' },
    { id:'t23', code:'MNG-1061', project:'p8', title:'สำรวจ pain point ลูกค้า 6 ราย (interview)', status:'todo', priority:'med', assignee:'u1', start:'2026-11-10', due:'2026-11-20', progress:0, est:12, tags:['Research'], subtasks:[], comments:[], desc:'สัมภาษณ์ + สรุป insight' },
    { id:'t24', code:'MNG-1062', project:'p8', title:'Wireframe Client Portal (low-fi)', status:'todo', priority:'low', assignee:'u2', start:'2026-11-16', due:'2026-11-27', progress:0, est:16, tags:['Design'], subtasks:[], comments:[], desc:'~12 หน้า' },
    { id:'t25', code:'MNG-1023', project:'p2', title:'เก็บ feedback หลัง go-live + แก้ minor bug 6 จุด', status:'done', priority:'med', assignee:'u4', start:'2026-10-16', due:'2026-10-18', progress:100, est:8, tags:['Fix'], subtasks:[], comments:[], desc:'ปิด ticket ทั้งหมดจาก LINE กลุ่ม' },
    { id:'t26', code:'MNG-1014', project:'p3', title:'เชื่อมเครื่องพิมพ์ใบเสร็จหน้าร้าน (thermal)', status:'todo', priority:'low', assignee:'u5', start:'2026-11-01', due:'2026-11-06', progress:0, est:10, tags:['Hardware'], subtasks:[], comments:[], desc:'ESC/POS via QZ Tray' },
    { id:'t27', code:'MNG-1035', project:'p1', title:'เพิ่มช่องทาง WhatsApp (phase 2 scoping)', status:'todo', priority:'med', assignee:'u1', start:'2026-11-03', due:'2026-11-06', progress:0, est:6, tags:['Planning'], subtasks:[], comments:[], desc:'ประเมิน effort + cost ก่อนเสนอลูกค้า' },
    { id:'t28', code:'MNG-1010', project:'p4', title:'ส่งมอบ + อบรมทีม content ของ LoveIT', status:'todo', priority:'high', assignee:'u2', start:'2026-10-27', due:'2026-10-28', progress:0, est:6, tags:['Training'], subtasks:[], comments:[], desc:'อบรม 2 ชม. + คู่มือ PDF' },
  ];

  const eventCats = {
    task:     { label:'งาน/เดดไลน์',  cls:'ev-task',     color:'#3BA7FF', on:true },
    meeting:  { label:'ประชุม',        cls:'ev-meeting',  color:'#8E7CF3', on:true },
    deadline: { label:'ส่งมอบ',        cls:'ev-deadline', color:'#FF5C7A', on:true },
    finance:  { label:'การเงิน',       cls:'ev-finance',  color:'#FFB020', on:true },
    holiday:  { label:'วันหยุด',       cls:'ev-holiday',  color:'#22C793', on:true },
    personal: { label:'ส่วนตัว',       cls:'ev-personal', color:'#B39EF0', on:true },
  };

  const events = [
    { id:'e1',  title:'Daily stand-up ทีม dev',        cat:'meeting',  date:'2026-10-19', start:'09:30', end:'09:50', recur:'weekly-mon', members:['u1','u3','u4','u5','u6'], loc:'Google Meet', desc:'อัปเดตงานรายวัน 15 นาที' },
    { id:'e2',  title:'Daily stand-up ทีม dev',        cat:'meeting',  date:'2026-10-26', start:'09:30', end:'09:50', recur:'weekly-mon', members:['u1','u3','u4','u5','u6'], loc:'Google Meet', desc:'อัปเดตงานรายวัน 15 นาที' },
    { id:'e3',  title:'Sprint Review MNG Dashboard',   cat:'meeting',  date:'2026-10-20', start:'14:00', end:'15:30', members:['u1','u2','u3','u5'], loc:'ห้องประชุม 1', desc:'รีวิว sprint 7 + retro' },
    { id:'e4',  title:'Demo ระบบแชตให้ Calmat ดูรอบที่ 2', cat:'meeting', date:'2026-10-22', start:'10:00', end:'11:30', project:'p1', members:['u1','u3','u4'], loc:'Zoom กับลูกค้า', desc:'demo flow LINE → โทรศัพท์ + เก็บ feedback' },
    { id:'e5',  title:'เดดไลน์: LINE webhook + fallback', cat:'deadline', date:'2026-10-21', start:'18:00', end:'18:30', project:'p1', task:'t1', members:['u3'], desc:'ส่ง build staging ให้ QA ภายในวัน' },
    { id:'e6',  title:'วันปิยมหาราช (วันหยุดนักขัตฤกษ์)', cat:'holiday', date:'2026-10-23', start:'00:00', end:'23:59', allday:true, desc:'บริษัทหยุด 1 วัน — on-call เฉพาะ incident' },
    { id:'e7',  title:'วางบิลงวด 2 — Pool Dashboard',  cat:'finance',  date:'2026-10-26', start:'10:00', end:'10:30', project:'p3', members:['u1'], desc:'ออก INV-2026-044 มูลค่า 48,000 บาท' },
    { id:'e8',  title:'Kickoff APH Interface @ บางนา',  cat:'meeting',  date:'2026-10-27', start:'13:00', end:'16:00', project:'p6', members:['u1','u5'], loc:'APH Logistics บางนา กม.18', desc:'เก็บ requirement + เยี่ยมชม warehouse' },
    { id:'e9',  title:'ส่งมอบ LoveIT + อบรมทีม content', cat:'deadline', date:'2026-10-28', start:'09:00', end:'12:00', project:'p4', task:'t28', members:['u2','u4'], loc:'ออฟฟิศ LoveIT อารีย์', desc:'ส่งมอบงาน + อบรม 2 ชม.' },
    { id:'e10', title:'จ่ายเงินเดือนทีมงาน',            cat:'finance',  date:'2026-10-30', start:'15:00', end:'15:30', members:['u1'], desc:'โอนผ่าน KBiz ก่อน 15:00' },
    { id:'e11', title:'UAT เว็บ SGI รอบสุดท้าย',         cat:'deadline', date:'2026-10-30', start:'10:00', end:'12:00', project:'p7', task:'t20', members:['u6','u2'], desc:'ปิด UAT 32 เคสก่อนส่งมอบ' },
    { id:'e12', title:'อบรม UX writing ให้ทีม',          cat:'meeting',  date:'2026-11-04', start:'15:00', end:'17:00', members:['u2','u4'], loc:'ห้องประชุม 2', desc:'workshop ภาษาในระบบ' },
    { id:'e13', title:'นัดทานข้าวกับเชฟจี๊ด (ดูแลลูกค้าเก่า)', cat:'personal', date:'2026-10-24', start:'12:00', end:'13:30', members:['u1'], loc:'ลาดพร้าว 101', desc:'คุย phase 3 + loyalty program' },
    { id:'e14', title:'ตรวจสุขภาพประจำปี',               cat:'personal', date:'2026-10-31', start:'08:00', end:'11:00', members:['u1'], desc:'รพ. เปาโล เกษตร' },
    { id:'e15', title:'รีวิวดีไซน์การ์ดข่าว LoveIT กับ u1',  cat:'meeting', date:'2026-10-20', start:'16:30', end:'17:15', project:'p4', members:['u1','u2'], desc:'ตัดสินใจแบบ 3 หรือ 5' },
    { id:'e16', title:'ต่อใบอนุญาตซอฟต์แวร์ Figma ทีม',     cat:'finance', date:'2026-11-02', start:'11:00', end:'11:30', members:['u1'], desc:'4 seat × 4,500 บาท/ปี' },
    { id:'e17', title:'Retro + ปาร์ตี้ปิดเดือน ต.ค.',        cat:'personal', date:'2026-10-30', start:'18:30', end:'21:00', members:['u1','u2','u3','u4','u5','u6'], loc:'ร้านชาบูอารีย์', desc:'ฉลองปิด sprint' },
    { id:'e18', title:'ส่งใบเสนอราคา WhatsApp phase 2',     cat:'deadline',  date:'2026-11-06', start:'17:00', end:'17:30', project:'p1', task:'t27', members:['u1'], desc:'ส่งให้คุณแพรวทางอีเมล' },
  ];

  const invoices = [
    { id:'i1', no:'INV-2026-038', client:'c2', title:'Chef-jeed v2 — งวดส่งมอบ',        amount:120000, vat:8400,  issue:'2026-10-15', due:'2026-10-22', status:'pending', items:[{d:'ค่าพัฒนาระบบ v2 งวด 2',q:1,p:120000}] },
    { id:'i2', no:'INV-2026-039', client:'c3', title:'Pool Dashboard — งวด 1 (50%)',    amount:60000,  vat:4200,  issue:'2026-10-02', due:'2026-10-09', status:'paid',    paid:'2026-10-08', items:[{d:'ค่าออกแบบ+พัฒนา งวด 1',q:1,p:60000}] },
    { id:'i3', no:'INV-2026-040', client:'c4', title:'LoveIT — ข่าว 5 การ์ด + Cron',    amount:95000,  vat:6650,  issue:'2026-10-10', due:'2026-10-25', status:'pending', items:[{d:'ค่าออกแบบการ์ดข่าว',q:1,p:40000},{d:'cron ดึงข่าว',q:1,p:55000}] },
    { id:'i4', no:'INV-2026-041', client:'c1', title:'Calmat — Chat งวด 1 (40%)',       amount:72000,  vat:5040,  issue:'2026-10-05', due:'2026-10-10', status:'paid',    paid:'2026-10-11', items:[{d:'ค่าพัฒนางวด 1',q:1,p:72000}] },
    { id:'i5', no:'INV-2026-042', client:'c6', title:'SGI Website — งวด 2 (40%)',       amount:84000,  vat:5880,  issue:'2026-09-30', due:'2026-10-14', status:'overdue', items:[{d:'ค่าพัฒนางวด 2',q:1,p:84000}] },
    { id:'i6', no:'INV-2026-043', client:'c1', title:'Calmat — retainer ต.ค.',          amount:35000,  vat:2450,  issue:'2026-10-01', due:'2026-10-31', status:'pending', items:[{d:'ค่าดูแลระบบรายเดือน',q:1,p:35000}] },
    { id:'i7', no:'INV-2026-044', client:'c3', title:'Pool Dashboard — งวด 2 (40%)',    amount:48000,  vat:3360,  issue:'2026-10-26', due:'2026-11-02', status:'draft',   items:[{d:'ค่าพัฒนางวด 2',q:1,p:48000}] },
    { id:'i8', no:'INV-2026-045', client:'c5', title:'APH Interface — งวดเปิดงาน (30%)', amount:45000,  vat:3150,  issue:'2026-10-28', due:'2026-11-07', status:'draft',   items:[{d:'ค่าเปิดงาน 30%',q:1,p:45000}] },
    { id:'i9', no:'INV-2026-033', client:'c2', title:'Chef-jeed — ค่าโฮสติ้งรายปี',     amount:18000,  vat:1260,  issue:'2026-09-20', due:'2026-09-30', status:'paid',    paid:'2026-09-28', items:[{d:'VPS + backup 1 ปี',q:1,p:18000}] },
  ];

  const activity = [
    { at:'2026-10-20 10:24', u:'u1', text:'ปรับโจทย์ <b>MNG-1042</b> — ลูกค้าอยากได้<b>ปฏิทินใหญ่เต็มจอ</b> สไตล์ ERP' },
    { at:'2026-10-20 09:12', u:'u1', text:'คอมเมนต์ใน <b>MNG-1007</b>: ขอดูการ์ดข่าวแบบ 3 กับ 5 อีกรอบ' },
    { at:'2026-10-19 18:40', u:'u5', text:'push commit <b>pool-auto-reset</b> ขึ้น staging' },
    { at:'2026-10-19 15:05', u:'u3', text:'ย้าย <b>MNG-1031</b> ไปกำลังทำ + เปิด branch line-webhook' },
    { at:'2026-10-18 11:32', u:'u4', text:'ส่งหน้า chat 29 หน้าเข้า <b>รีวิว</b>' },
    { at:'2026-10-17 16:48', u:'u2', text:'อัปโหลดการ์ดข่าว 5 แบบพร้อม dark mode' },
    { at:'2026-10-16 09:20', u:'u1', text:'สร้างโปรเจกต์ <b>APH Interface</b> และนัด kickoff 27 ต.ค.' },
    { at:'2026-10-15 17:02', u:'u5', text:'ปิดงาน <b>Chef-jeed v2 deploy</b> — production verified' },
  ];

  // chart series: tasks created vs completed per month (2026)
  const trend = {
    months:['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'],
    created:[9,12,11,14,10,13,16,14,17,18,0,0],
    completed:[7,10,12,11,12,12,14,15,13,9,0,0],
    revenue:[220,260,240,300,265,310,340,330,395,412,0,0], // k THB
    workload:[['Calmat',46,'#2F6BF0'],['Chef-jeed',14,'#6C5CE7'],['Pool Dash',31,'#14B890'],['LoveIT',27,'#F25C8B'],['MNG Dash',52,'#F2762E'],['APH',4,'#17A2B8'],['SGI',33,'#4B5ED9']],
  };

  // Upgrade task keys to <PROJ_CODE>-10xx + logged hours + sample AI co-pilots
  const pCodeMap = Object.fromEntries(projects.map(p => [p.id, p.code || 'MNG']));
  const aiSamples = { t1:'ai3', t3:'ai1', t4:'ai2', t8:'ai1', t11:'ai3', t15:'ai2', t19:'ai4' };
  tasks.forEach((t, idx) => {
    const num = (t.code || '').split('-')[1] || String(1001 + idx);
    t.code = `${pCodeMap[t.project] || 'MNG'}-${num}`;
    if (t.spent == null) t.spent = Math.round((t.est || 6) * ((t.progress || 0) / 100) * 10) / 10;
    if (!t.aiAgentId && aiSamples[t.id]) t.aiAgentId = aiSamples[t.id];
  });

  const td = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const relDate = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const aiAgents = [
    { id:'ai1', code:'NOVA',  name:'NOVA',  role:'AI Project & Sprint Planner', model:'Claude 3.7 Sonnet', color:'#6C5CE7', autonomy:92, paused:false, runs:148, successRate:99.2, tokensToday:18420, skills:['Sprint Plan','Risk Alert','Stand-up Summary'], prompt:'วิเคราะห์ความเสี่ยงเดดไลน์และกระจายภาระงานให้สมดุล' },
    { id:'ai2', code:'PIXEL', name:'PIXEL', role:'AI Creative & UX Copywriter', model:'GPT-4.1',           color:'#FF6B9D', autonomy:88, paused:false, runs:112, successRate:98.4, tokensToday:14200, skills:['UX Microcopy','Campaign Copy','TH/EN Copy'], prompt:'ช่วยร่าง UX writing และข้อความแคมเปญสองภาษา' },
    { id:'ai3', code:'BYTE',  name:'BYTE',  role:'AI Code & QA Reviewer',       model:'Claude 3.7 Sonnet', color:'#3BA7FF', autonomy:90, paused:false, runs:204, successRate:99.5, tokensToday:26850, skills:['Code Review','SQL Audit','Test Cases'], prompt:'ตรวจเช็กโค้ด API และสร้างชุดทดสอบ QA อัตโนมัติ' },
    { id:'ai4', code:'ECHO',  name:'ECHO',  role:'AI Client Comms & MoM',       model:'Gemini 2.5 Pro',    color:'#22C793', autonomy:84, paused:false, runs:89,  successRate:97.8, tokensToday:11300, skills:['Meeting Minutes','Client Update','Proposal Draft'], prompt:'สรุปรายงานการประชุมและร่างอัปเดตรายสัปดาห์ส่งลูกค้า' },
    { id:'ai5', code:'ORBIT', name:'ORBIT', role:'AI Finance & Ops Analyst',    model:'GPT-4.1 Mini',      color:'#FFB020', autonomy:86, paused:false, runs:67,  successRate:99.0, tokensToday:8940,  skills:['Invoice Follow-up','Budget Burn','Cashflow'], prompt:'ติดตามบิลค้างชำระและวิเคราะห์งบประมาณโปรเจกต์' },
  ];

  const aiRuns = [
    { id:'run1', agentId:'ai1', taskId:'t1', action:'วิเคราะห์ความเสี่ยง Sprint & เดดไลน์', detail:'ตรวจพบงานเร่งด่วนใกล้เดดไลน์ แนะนำเกลี่ยโหลดงานช่วงบ่ายให้สมดุล', durationSec:4, tokens:940, status:'ok', at:`${td} 09:42` },
    { id:'run2', agentId:'ai3', taskId:'t1', action:'Code & Webhook Queue Audit', detail:'ตรวจ retry queue ของ LINE OA webhook รองรับ burst 250 msg/s ผ่านเกณฑ์ QA', durationSec:6, tokens:1280, status:'ok', at:`${td} 09:15` },
    { id:'run3', agentId:'ai2', taskId:'t4', action:'ร่าง UX Copy การ์ดข่าว LoveIT 5 สไตล์', detail:'สรุปหัวข้อและ microcopy ทั้งโหมดสว่างและมืดครบ 5 รูปแบบ', durationSec:3, tokens:760, status:'ok', at:`${relDate(-1)} 16:30` },
    { id:'run4', agentId:'ai5', taskId:null, action:'ตรวจสอบใบแจ้งหนี้ค้างชำระประจำสัปดาห์', detail:'แจ้งเตือน INV-2026-042 เกินกำหนดชำระ พร้อมร่างอีเมลติดตามลูกค้า SGI', durationSec:3, tokens:610, status:'ok', at:`${relDate(-1)} 11:05` },
  ];

  const channels = [
    { id:'ch1', slug:'general',        name:'general',        emoji:'📢', topic:'ประกาศกลางและอัปเดตประจำวันของทีม MNG Groups' },
    { id:'ch2', slug:'dev-ops',        name:'dev-ops',        emoji:'💻', topic:'พูดคุยงานพัฒนา API, Deploy, Database และแก้บั๊ก' },
    { id:'ch3', slug:'design-review',  name:'design-review',  emoji:'🎨', topic:'ส่งดราฟต์ UI/UX, การ์ดข่าว และตรวจงานดีไซน์' },
    { id:'ch4', slug:'client-updates', name:'client-updates', emoji:'🤝', topic:'สรุปความคืบหน้าลูกค้า นัดหมาย Demo และ UAT' },
    { id:'ch5', slug:'ai-feed',        name:'ai-feed',        emoji:'✨', topic:'รายงานผลการทำงานอัตโนมัติจากทีม AI Workforce' },
  ];

  const messages = [
    { id:'m1', channelId:'ch1', senderId:'u1', senderName:'Worapot (เอก)', kind:'text', body:'สวัสดีตอนเช้าทีม MNG! วันนี้เรามี Sprint Review บ่ายสอง และเตรียมส่งมอบการ์ดข่าว LoveIT นะครับ 🚀', pinned:true, reactions:{'🔥':['u2','u3'],'👍':['u4','u5']}, at:`${td} 09:05` },
    { id:'m2', channelId:'ch1', senderId:'u3', senderName:'Bank Kritsada', kind:'text', body:'รับทราบครับพี่เอก ตอนนี้ระบบ webhook retry เทสต์ผ่านแล้ว เดี๋ยวอัปขึ้น staging ก่อนเที่ยงครับ', pinned:false, reactions:{'✅':['u1']}, at:`${td} 09:12` },
    { id:'m3', channelId:'ch2', senderId:'u5', senderName:'Art Pongsakorn', kind:'text', body:'อัปเดตฐานข้อมูล MariaDB แยก 2 pool (auth + works) พร้อม health latency เรียบร้อยครับ ⚡', pinned:true, reactions:{'🎉':['u1','u3']}, at:`${td} 09:20` },
    { id:'m4', channelId:'ch3', senderId:'u2', senderName:'Nuna Sirima', kind:'text', body:'ส่งดราฟต์การ์ดข่าว LoveIT แบบที่ 3 และ 5 ปรับโทนสีให้คมขึ้นแล้ว รบกวนพี่เอกช่วยดูหน่อยนะคะ 🎨', pinned:false, reactions:{'❤️':['u1','u4']}, at:`${td} 09:35` },
    { id:'m5', channelId:'ch4', senderId:'u6', senderName:'Fah Chanya', kind:'text', body:'เตรียมสคริปต์ UAT เว็บ SGI ครบ 32 เคสแล้ว พร้อมรันรอบสุดท้ายกับลูกค้าวันพฤหัสนี้ค่ะ', pinned:false, reactions:{'👍':['u1','u2']}, at:`${td} 09:40` },
    { id:'m6', channelId:'ch5', senderId:'ai1', senderName:'NOVA (AI)', kind:'ai', body:'✨ <b>สรุปภาพรวมเช้าวันนี้</b> — มีงานกำลังทำ 8 ชิ้น ใกล้ครบกำหนดใน 3 วัน 2 ชิ้น แนะนำโฟกัส CAL-1031 และ ERP-1042 ก่อนเที่ยง', pinned:false, reactions:{'👍':['u1']}, at:`${td} 09:45` },
  ];

  const rooms = [
    { id:'rm1', name:'Boardroom ชั้น 4 (ห้องประชุมใหญ่)',   kind:'room',   zone:'ชั้น 4 · โซนหน้า', capacity:12, color:'#6C5CE7', equip:['จอ 4K 75"','กล้อง Conference','Whiteboard'] },
    { id:'rm2', name:'Creative Studio A (ถ่ายภาพ/ไฟ)',      kind:'studio', zone:'ชั้น 2 · สตูดิโอ', capacity:8,  color:'#FF6B9D', equip:['ฉาก Cyclorama','ไฟ Aputure 300d','ไมค์ไร้สาย'] },
    { id:'rm3', name:'Podcast & Sound Booth',               kind:'studio', zone:'ชั้น 2 · ห้องอัด', capacity:4,  color:'#3BA7FF', equip:['Rodecaster Pro','ไมค์ Shure SM7B x3','เก็บเสียง'] },
    { id:'rm4', name:'Focus Pod 1 (ห้องคุยงานด่วน)',         kind:'room',   zone:'ชั้น 3 · โซน Dev', capacity:4,  color:'#22C793', equip:['จอ Monitor 27"','ปลั๊ก USB-C'] },
    { id:'rm5', name:'ชุดออกกอง Sony FX3 + เลนส์ G-Master', kind:'gear',   zone:'ตู้เก็บอุปกรณ์',    capacity:1,  color:'#FFB020', equip:['Sony FX3','24-70mm GM II','Gimbal RS4'] },
  ];

  const bookings = [
    { id:'bk1', roomId:'rm1', title:'Sprint Planning & Review ทีม MNG',          date:td,          start:'10:00', end:'11:30', hostId:'u1', members:['u1','u2','u3','u5'], note:'เตรียมสไลด์สรุปความคืบหน้า' },
    { id:'bk2', roomId:'rm2', title:'ถ่ายภาพสินค้าโปรเจกต์ Chef-jeed Set ใหม่', date:td,          start:'13:30', end:'16:00', hostId:'u2', members:['u2','u4'],           note:'เซ็ตไฟ Warm Daylight' },
    { id:'bk3', roomId:'rm4', title:'Pair Programming — LINE Webhook Retry',     date:td,          start:'15:00', end:'16:30', hostId:'u3', members:['u3','u5'],           note:'ทดสอบโหลด 250 msg/s' },
    { id:'bk4', roomId:'rm1', title:'Demo ระบบแชตให้ลูกค้า Calmat รอบถัดไป',     date:relDate(1),  start:'10:30', end:'12:00', hostId:'u1', members:['u1','u3','u4'],      note:'ประชุมผ่าน Zoom + จอใหญ่' },
  ];

  const checkins = [
    { id:'ck1', memberId:'u1', date:td,         clockIn:'09:02', clockOut:'',      mode:'office', note:'เข้าออฟฟิศ ประชุมเช้า' },
    { id:'ck2', memberId:'u2', date:td,         clockIn:'09:15', clockOut:'',      mode:'wfh',    note:'WFH ปั่นงานดีไซน์การ์ดข่าว LoveIT' },
    { id:'ck3', memberId:'u3', date:td,         clockIn:'08:54', clockOut:'',      mode:'office', note:'เตรียมเทสต์ระบบ LINE OA' },
    { id:'ck4', memberId:'u4', date:td,         clockIn:'09:22', clockOut:'',      mode:'office', note:'ทำหน้า UI 29 หน้า' },
    { id:'ck5', memberId:'u5', date:td,         clockIn:'09:10', clockOut:'',      mode:'wfh',    note:'ดูแลเซิร์ฟเวอร์และฐานข้อมูล' },
    { id:'ck6', memberId:'u1', date:relDate(-1),clockIn:'08:58', clockOut:'18:15', mode:'office', note:'สรุปแผน Sprint' },
    { id:'ck7', memberId:'u1', date:relDate(-2),clockIn:'09:04', clockOut:'18:30', mode:'wfh',    note:'รีวิวงานลูกค้า' },
  ];

  const leaves = [
    { id:'lv1', memberId:'u6', kind:'personal', startDate:relDate(2), endDate:relDate(2), days:1, reason:'ติดต่อธุระราชการช่วงเช้า-บ่าย', status:'pending',  approvedBy:'' },
    { id:'lv2', memberId:'u2', kind:'wfh',      startDate:relDate(3), endDate:relDate(4), days:2, reason:'ขอปฏิบัติงาน WFH โฟกัสงานออกแบบ UI ชุดใหญ่', status:'approved', approvedBy:'Worapot' },
    { id:'lv3', memberId:'u4', kind:'annual',   startDate:relDate(9), endDate:relDate(10),days:2, reason:'ลาพักร้อนประจำปี', status:'approved', approvedBy:'Worapot' },
  ];

  return {
    team, projects, clients, tasks, eventCats, events, invoices, activity, trend,
    aiAgents, aiRuns, channels, messages, rooms, bookings, checkins, leaves,
  };
})();
