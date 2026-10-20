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
- ข้อมูลบันทึกใน `localStorage` — แก้แล้วไม่หาย, พร้อมปุ่มรีเซ็ตข้อมูลตัวอย่าง

## 🚀 วิธีใช้งาน

ไม่ต้อง build — เป็น static site ล้วน:

```bash
# เปิดตรงๆ หรือ serve ด้วยอะไรก็ได้
python3 -m http.server 8080
# แล้วเปิด http://localhost:8080
```

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
└── assets/
    ├── css/styles.css      # ดีไซน์ทั้งหมด (pastel + gradient ตาม reference)
    └── js/
        ├── data.js         # seed data: โปรเจกต์/งาน/อีเวนต์/บิล/ลูกค้า/ทีม
        ├── ui.js           # helpers, icons, charts (SVG), modal, toast
        ├── views.js        # หน้าจอทั้ง 9 โมดูล
        └── app.js          # store, router, topbar, forms, delegation
```

## 🎨 ดีไซน์

- Layout ตามภาพ reference: icon rail + แถบตัวกรอง (chips มีปุ่ม ×) + การ์ด gradient
- ฟอนต์ Prompt/Kanit (Google Fonts, มี fallback ภาษาไทยครบ)
- Zero-dependency: ไม่มี framework, ไม่มี chart library — SVG เขียนเองทั้งหมด

---

สร้างสำหรับ MNG Groups · เชื่อมข้อมูลเดิมจาก MNG Workspace (mng.uarea.in)
