# MNG ERP — Work Tracking Management

ระบบบริหารจัดการงาน (Work Tracking) แบบครบวงจรสไตล์ ERP สำหรับ **MNG Groups**
ออกแบบตาม reference layout ของแดชบอร์ดสมัยใหม่ — ไฮไลต์คือ **ปฏิทินใหญ่เต็มจอ** 📅

![Stack](https://img.shields.io/badge/stack-vanilla%20JS-blue)
![No build](https://img.shields.io/badge/build-none%20required-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## ✨ ฟีเจอร์หลัก

### 📅 ปฏิทินเต็มจอ (ตัวเด่นของระบบ)
- มุมมอง 4 แบบ: **เดือน / สัปดาห์ / วัน / กำหนดการ (Agenda)**
- **ลากย้ายอีเวนต์** ข้ามวันได้ทันที (Drag & Drop) — รวมถึงเดดไลน์งาน
- เดดไลน์ของงานทุกชิ้นขึ้นปฏิทินอัตโนมัติ
- หมวดอีเวนต์ 6 สี: งาน/เดดไลน์, ประชุม, ส่งมอบ, การเงิน, วันหยุด, ส่วนตัว
- Mini calendar + ตัวกรองหมวด + รายการ "กำลังจะมาถึง" ในแถบข้าง
- ปุ่มขยาย **Fullscreen** เต็มจอจริง (Fullscreen API)
- วันที่ภาษาไทย + ปี พ.ศ.

### ✅ งาน & Kanban
- บอร์ดลากวาง 4 สถานะ (รอดำเนินการ → กำลังทำ → ตรวจแก้ → เสร็จแล้ว) + มุมมองตาราง
- รายละเอียดครบสไตล์ ERP: รหัสงาน (MNG-xxxx), ผู้รับผิดชอบ, ความสำคัญ, ชั่วโมงประเมิน,
  งานย่อย (subtasks) แบบเช็กบ็อกซ์, แท็ก, คอมเมนต์, ประวัติกิจกรรม
- ตัวกรอง: สถานะ / ความสำคัญ / โปรเจกต์ + ค้นหา

### 📊 แดชบอร์ด
- KPI cards, โปรเจกต์เด่น (gradient cards), งานเร่งด่วน
- กราฟ SVG ล้วน (ไม่มี dependency): line / bar / donut / workload bars
- ปฏิทินสัปดาห์ย่อ + ฟีดกิจกรรมล่าสุด

### 🧩 โมดูล ERP ครบวงจร
| โมดูล | รายละเอียด |
|---|---|
| โปรเจกต์ | งบประมาณ vs ใช้จริง, ทีม, ความคืบหน้า, งานคงค้าง |
| การเงิน | ใบแจ้งหนี้ + **VAT 7%**, สถานะ ชำระ/รอชำระ/เกินกำหนด/ร่าง, บันทึกรับชำระ, กราฟรายได้ |
| ทีม (HR) | ภาระงานรายบุคคล, ชั่วโมงคงเหลือ, workload bar 3 ระดับ |
| ลูกค้า (CRM) | ผู้ติดต่อ, ที่อยู่, ยอดเก็บสะสม, โปรเจกต์ที่กำลังทำ |
| รายงาน | กราฟผู้บริหาร + **Export CSV / JSON** |
| ตั้งค่า | ธีมสี 6 แบบ, แจ้งเตือน, สำรอง/รีเซ็ตข้อมูล |

### 🛎️ อื่นๆ
- ค้นหารวมทั้งระบบ (งาน / อีเวนต์ / โปรเจกต์) จากแถบบน
- การแจ้งเตือนอัจฉริยะ: งานเกินกำหนด, เดดไลน์วันนี้, บิลเกินกำหนด, ประชุมวันนี้
- ข้อมูลจริงบันทึกลง **MariaDB** ทุกการกระทำ (มี localStorage เป็น cache/fallback โหมดสาธิต)

## 🚀 วิธีใช้งาน

### โหมดเต็ม (API + MariaDB) — แนะนำ

```bash
cd server
cp .env.example .env      # แล้วใส่รหัสผ่านฐานข้อมูลจริง (อย่า commit .env!)
npm install
npm start                 # เปิด http://localhost:4050
```

เซิร์ฟเวอร์จะ:
1. ต่อ MariaDB 2 ก้อน **แยก connection pool** (ห้าม cross-join — ตามข้อกำหนดเดิมของระบบ)
   - `pacific_mng` → **auth เท่านั้น** (ตาราง `users`, ตรวจ bcrypt)
   - `pacific_mngworks` → ข้อมูลทั้งหมด (projects/tasks จริง + ตาราง `erp_*` ที่สร้างเพิ่ม)
2. สร้าง schema เสริมแบบ additive-only (ไม่แตะ/ไม่ลบคอลัมน์เดิมของ MNG Workspace)
3. seed ข้อมูล ERP รอบแรกอัตโนมัติ (team/clients/invoices/events) — รันซ้ำได้ ไม่ซ้ำซ้อน

**Login:** ใช้บัญชีเดียวกับ MNG Hub เช่น `worapot@outlook.com` (sessions ออกอายุ 7 วัน)

### โหมดสาธิต (ไม่มี backend)

เปิด `index.html` ตรงๆ หรือ serve static ได้เลย (เช่น GitHub Pages) — ระบบจะ fallback
ไปใช้ localStorage อัตโนมัติ พร้อมปุ่ม "ใช้โหมดสาธิต" ในหน้า login

## 🗄️ สถาปัตยกรรมข้อมูล

```
┌─────────────┐   ┌──────────────┐         ┌────────────────────────┐
│  SPA (JS)   │──▶│ Express API  │─ pool1 ─▶│ pacific_mng            │
│  assets/js  │◀──│ server/      │         │  └ users (bcrypt auth) │
└─────────────┘   │              │─ pool2 ─▶│ pacific_mngworks       │
                  └──────────────┘         │  ├ projects (ของเดิม+erp_*)│
                                           │  ├ tasks    (ของเดิม+erp_*)│
                                           │  ├ erp_events  (ปฏิทิน)    │
                                           │  ├ erp_invoices(การเงิน)   │
                                           │  ├ erp_clients (CRM)      │
                                           │  ├ erp_team / erp_activity│
                                           │  └ erp_sessions/settings │
                                           └────────────────────────┘
```

คอลัมน์ที่เติมเข้าไปในตารางเดิมมี prefix `erp_` (nullable/default เสมอ) — แอป MNG Workspace เดิมยังทำงานได้ปกติ 100%

### API หลัก

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| POST | `/api/auth/login` | ตรวจ bcrypt จาก `pacific_mng.users` → คืน session token |
| GET | `/api/bootstrap` | ข้อมูลทั้งระบบครั้งเดียว (SPA hydrate) + trend คำนวณสด |
| POST/PATCH/DELETE | `/api/tasks/:id` | CRUD งาน (PATCH รองรับ status/progress/ย้ายวัน/งานย่อย/คอมเมนต์) |
| POST/PATCH/DELETE | `/api/events/:id` | CRUD อีเวนต์ปฏิทิน (ลากย้ายวันที่ = PATCH date) |
| POST | `/api/invoices/:id/pay` | บันทึกรับชำระ + ติด activity log |
| POST | `/api/invoices` `/api/projects` | สร้างใบแจ้งหนี้ (เลขที่ auto) / โปรเจกต์ |
| PUT | `/api/settings` | ธีม/การแจ้งเตือน |

ทุก mutation บันทึกลง `erp_activity` อัตโนมัติฝั่งเซิร์ฟเวอร์

## 🌐 Deploy บน GitHub Pages

```bash
git push origin main
# Settings → Pages → Source: main branch / (root)
# เปิด https://<user>.github.io/<repo>/
```

## 📁 โครงสร้าง

```
mng-erp/
├── index.html              # shell
├── assets/
│   ├── css/styles.css      # ดีไซน์ทั้งหมด (pastel + gradient ตาม reference)
│   └── js/
│       ├── data.js         # seed data สำหรับโหมดสาธิต (offline fallback)
│       ├── ui.js           # helpers, icons, charts (SVG), modal, toast
│       ├── views.js        # หน้าจอทั้ง 9 โมดูล
│       └── app.js          # store, router, Remote API, login, forms
└── server/                 # ★ backend — Node.js + Express + MariaDB
    ├── index.js            # entry: static SPA + /api/*
    ├── db.js               # 2 pools + schema bootstrap (additive-only)
    ├── seed.js             # seed ข้อมูล ERP + enrich ข้อมูลจริง (idempotent)
    ├── auth.js             # bcrypt login + session middleware
    ├── routes.js           # REST: bootstrap/tasks/events/invoices/projects/settings
    ├── .env.example        # template config (ห้าม commit .env จริง)
    └── package.json
```

## 🎨 ดีไซน์

- Layout ตามภาพ reference: icon rail + แถบตัวกรอง (chips มีปุ่ม ×) + การ์ด gradient
- ฟอนต์ Prompt/Kanit (Google Fonts, มี fallback ภาษาไทยครบ)
- Zero-dependency: ไม่มี framework, ไม่มี chart library — SVG เขียนเองทั้งหมด

---

สร้างสำหรับ MNG Groups · ใช้ข้อมูลร่วมกับ MNG Workspace (mng.uarea.in) บน MariaDB `pacific_mngworks` — ปลอดภัยกับระบบเดิมแบบ additive-only
