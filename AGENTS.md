# AGENTS.md — กฎบังคับสำหรับทุก commit และ deploy

> ไฟล์นี้คือกฎขาว — ห้ามข้าม ห้าม "รอทำทีหลัง" ห้ามอ้างว่า "รุ่นนี้ก็เล็กน้อย"
> ผู้ละเลยกฎนี้ = งานต้องถูก reject/rollback ไม่มีข้อยกเว้น

---

## 1. ก่อน commit — ต้องผ่านการตรวจสอบความถูกต้องเสมอ

โหมดผิดต้องแก้ก่อน commit เท่านั้น ไม่ใช่ commit ไว้ก่อนแล้วค่อยแก้ทีหลัง

```bash
npm run lint     # ESLint ผ่าน, error = 0
npm run test     # vitest ผ่านทั้งหมด
npm run build    # build สำเร็จ, exit 0
```

**เกณฑ์ผ่าน (ต้องครบทั้ง 3):**

| คำสั่ง | เกณฑ์ | ผลลัพธ์ต้องไม่มี |
|---|---|---|
| `npm run lint` | exit 0 | error, ไม่มี warning ใหม่ |
| `npm run test` | exit 0 | test case ที่ fail |
| `npm run build` | exit 0 | build error, unhandled exception |

**ห้ามสาธิต:** commit ที่ยังมี test fail หรือ lint error อยู่ใน log

## 2. ก่อน deploy — ต้องรันใน local และตรวจทุกหน้า

local = **ทุกหน้า ทุกสถานนะ** ต้องถูกเปิดจริงใน browser และยืนยันว่า render ถูกต้อง

```bash
# 1) รัน server ที่ port ตรงกับที่จะ deploy
cd server && node index.js          # ควรเห็น [mng-erp] listening on http://0.0.0.0:<port>
# 2) ตรวจทุกหน้า ตาม scripts/local-check.sh
```

**ตารางหน้าที่ต้องตรวจ (ต้องครบทุกแถว):**

| หน้า | URL | ต้องเห็น |
|---|---|---|
| หน้าหลัก | `/` | redirect ไป `/login/` หรือ `/dashboard/` (ไม่ค้าง spinner) |
| Login | `/login/` | ฟอร์มเข้าสู่ระบบ ธีมเข้ม อ่านข้อความได้ |
| Dashboard | `/dashboard/` | KPI card + activity feed ไม่ใช่หน้าขาว |
| Tasks | `/tasks/` | รายการงาน |
| Projects | `/projects/` | รายการโปรเจกต์ |
| Project detail | `/projects/detail/` | หน้ารายละเอียด |
| Team | `/team/` | รายชื่อสมาชิก |
| Finance | `/finance/` | ข้อมูลการเงิน |
| Calendar | `/calendar/` | ปฏิทิน |
| Reports | `/reports/` | รายงาน |
| Clients | `/clients/` | รายชื่อลูกค้า |
| Settings | `/settings/` | tab โปรไฟล์ / สมาชิก / ระบบ |
| ข้อผิดพลาด | `/api/health` | `{"ok":true,"auth":true,"work":true}` |

**ห้าม deploy ถ้า:**
- หน้าไหนยังขาว (เป็นสีขาวพื้นเปล่า ไม่มี content)
- หน้าไหนค้าง spinner "กำลังตรวจสอบสถานะ…" ไม่ต่อ
- API health ไม่ใช่ `{"ok":true,"auth":true,"work":true}`
- CSS ไม่โหลด (content_type ไม่ใช่ `text/css`)

## 3. สิ่งที่ทำให้เกิดหน้าขาว — ห้ามทำซ้ำ

1. **สลับ `static root` ขณะที่ JS bundle ยังโหลดไม่ได้** — ต้องชี้ให้ตรงกับที่ build ไว้จริง
2. **ใช้ `router.replace()` ใน client component ของ static export** — `output: 'export'` ไม่รองรับ; ใช้ `window.location.href`
3. **ลืม upload `_next/static` ไป server** — CSS/JS จะได้ HTML แทน
4. **ลบ `server/node_modules` บน production** — API จะตาย (`/api/health` คืน HTML)
5. **ยังไม่ได้ test ก็ deploy ขึ้น production**

## 4. deploy — ขั้นตอนบังคับ

```bash
npm run deploy:local   # รัน local + ตรวจทุกหน้าอัตโนมัติ
```

หลังผ่านแล้วจึง:
- build ใหม่ → อัปโหลด `server/public` + ไฟล์ server ที่เปลี่ยน
- **ตรวจซ้ำบน production จริง** (ไม่ใช่แค่ local) ทุกหน้า ตามตารางข้อ 2
- commit แยกเป็น 2 commit: `fix:` สำหรับโค้ด, `chore(deploy):` สำหรับ artifact

## 5. rollback — ต้องเป็น commit เดียว ไม่ใช่ reset ทิ้งทุกอย่าง

ย้อนกลับใช้:
```bash
git checkout <commit> -- .
git commit -m "chore: rollback to <commit> (<สาเหตุสั้นๆ>)"
git push origin main
```
ห้าม `git reset --hard` บน branch ที่ deploy แล้วโดยไม่ผู้อนุมัติ

## 6. เอกสาร

- `docs/PROCEDURE.md` — **ระเบียบการทำงานและ Deploy** (อ่านก่อนทำงานทุกครั้ง)
- `docs/migration/nextjs-plan.md` — แผน migration (strangler fig)
- `server/.env.example` —ตัวแปรที่จำเป็น
- **ห้าม commit `.env`** — มี secret จริง

## 7. การขออนุมัติ (สรุป — รายละเอียดใน `docs/PROCEDURE.md` ข้อ 4)

| ขั้น | ต้องทำ |
|---|---|
| 1 | รัน local + ตรวจทุกหน้าจริงใน browser (`npm run deploy:local`) |
| 2 | เขียนเอกสารขออนุมัติที่ `docs/deploy/approval-<วันที่>.md` (ใช้แบบฟอร์มใน PROCEDURE.md) |
| 3 | **รอพี่เอกอนุมัติ** — ห้าม FTP ก่อนได้รับอนุมัติ |
| 4 | deploy + commit แยก 2 commit (`fix:` / `chore(deploy):`) + push git |
| 5 | ตรวจซ้ำบน production จริงทุกหน้า |

**ห้าม:** สร้างระบบใหม่แล้วทับระบบออนไลน์ผ่าน GitHub โดยไม่ผ่านขั้นตอนนี้
