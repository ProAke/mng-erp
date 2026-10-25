# ระเบียบการทำงานและ Deploy — MNG ERP

> เอกสารนี้คือกฎขาว อนุมัติโดยพี่เอก
> ใช้ควบคู่กับ `AGENTS.md` — ซ้ำเสริมกัน ไม่ขัดกัน
> **ห้ามใครแก้เอกสารนี้โดยไม่ผ่านพี่เอก**

---

## สารบัญ

1. [หลักการ 4 ข้อ (สรุปสั้น)](#1-หลักการ-4-ข้อสรุปสั้น)
2. [ขั้นตอนทำงาน — ทุกงานต้องมี git ย้อนได้](#2-ขั้นตอนทำงาน--ทุกงานต้องมี-git-ย้อนได้)
3. [ขั้นตอน Deploy — ต้องอนุมัติก่อนเสมอ](#3-ขั้นตอน-deploy--ต้องอนุมัติก่อนเสมอ)
4. [แบบฟอร์มขออนุมัติ (ต้องแนบทุกครั้ง)](#4-แบบฟอร์มขออนุมัติ-ต้องแนบทุกครั้ง)
5. [ตารางสถานนะงานปัจจุบัน](#5-ตารางสถานนะงานปัจจุบัน)
6. [บัญชีสี — ธีม light จาก i.playdigital.co.th](#6-บัญชีสี--ธีม-light-จาก-iplaydigitalcoth)
7. [สถาปัตยกรรมระบบ](#7-สถาปัตยกรรมระบบ)
8. [เครื่องมือที่ใช้](#8-เครื่องมือที่ใช้)
9. [แหล่งอ้างอิง](#9-แหล่งอ้างอิง)

---

## 1. หลักการ 4 ข้อ (สรุปสั้น)

| # | กฎ | ความหมาย | ผลหากละเมิด |
|---|---|---|---|
| 1 | **ห้าม FTP ก่อนอนุมัติ** | ไม่มีใครแตะ production จนกว่าพี่เอกกดอนุมัติ | production พัง = งานถูก reject |
| 2 | **ต้องแสดง localhost และตรวจก่อนทุกครั้ง** | ทำงานให้เสร็จใน local ก่อนเสมอ เปิดดูจริงใน browser | หน้าขาว/ค้าง spinner = ตกไปเลย |
| 3 | **มีเอกสารขออนุมัติ** | ทุกครั้งที่จะ deploy ต้องมีเอกสารแนบให้พี่เอกลงนาม | ไม่มีเอกสาร = ไม่มีการ deploy |
| 4 | **ทุกงานต้องมี git local ย้อนได้** | ทุกงานที่ทำ ต้อง commit เป็นจุดย้อนกลับได้ | ทำพังแล้วย้อนไม่ได้ = ผิดกฎข้อ 4 |

**หลักเพิ่ม (สรุปจากที่พี่เอกสั่ง):**

- **สร้างระบบใหม่ → ห้ามทับระบบออนไลน์ผ่าน GitHub** — ต้องเข้า branch/feature แยก ทดสอบครบ แล้วค่อย merge
- **งานทุกอย่างเป็นภาษาไทย** — คอมเมนต์, ข้อความ UI, commit message, เอกสาร ต้องเป็นไทย (คำทางเทคนิคอังกฤษได้ เช่น `commit`, `deploy`)
- **ระบบที่ไม่มีอะไรให้ตรวจ = ไม่ควร deploy**

---

## 2. ขั้นตอนทำงาน — ทุกงานต้องมี git ย้อนได้

### 2.1 ก่อนเริ่มงาน

```bash
# 1) ดึง main ล่าสุดมาก่อนเสมอ
git fetch origin
git status                  # ต้องเห็น "nothing to commit, working tree clean"

# 2) ถ้า main ทันแล้ว → เริ่มงานบน branch ของตัวเอง
git checkout -b feat/<ชื่องาน>
```

### 2.2 ตอนทำงาน

```bash
# ตรวจความถูกต้องทุกครั้งก่อน commit (AGENTS.md ข้อ 1)
npm run verify              # lint + test + build ต้องผ่านครบ 4/4
```

**เกณฑ์ผ่าน (ต้องครบ):**

| ขั้น | คำสั่ง | ผ่านเมื่อ |
|---|---|---|
| 1 | `npm run lint` | exit 0 |
| 2 | `npm run test` | exit 0 ไม่มี fail |
| 3 | `npm run build` | exit 0 |
| 4 | `npm run verify` | "ผ่านทั้งหมด" |

### 2.3 ตอนจะ commit

```bash
# commit แบบย่อย ๆ เพื่อให้ย้อนง่าย (ทุก commit = จุดย้อนกลับ)
git add <ไฟล์ที่แตะจริง>
git commit -m "<ประเภท>: <สรุปงาน>"

# ประเภท commit ที่ใช้
#   feat:    ฟีเจอร์ใหม่
#   fix:     แก้บั๊ก
#   style:   ปรับสี/หน้าตา ไม่เปลี่ยนพฤติกรรม
#   chore:   งานเล็ก เช่น อัปเดต dependency
#   docs:    เอกสาร
```

**ห้าม:**
- `git reset --hard` บน branch ที่ deploy แล้ว (ข้อ 5 ของ AGENTS.md)
- commit `.env` — มี secret จริง

### 2.4 ตรวจว่าทำมาถูกจริงไหม (ย้อนได้)

```bash
git log --oneline -10        # ดูจุดย้อนกลับ
git diff HEAD~1              # ดูว่า commit ล่าสุดแตะอะไรบ้าง
```

**ถ้าทำผิด → ย้อนได้ใน 1 commit:**

```bash
git checkout <commit> -- .
git commit -m "chore: rollback to <commit> (สาเหตุสั้นๆ)"
git push origin main
```

---

## 3. ขั้นตอน Deploy — ต้องอนุมัติก่อนเสมอ

### 3.1 ขั้นที่ 1 — ทำให้เสร็จใน LOCAL ก่อนเสมอ

```bash
# 1) รัน local server (port ต้องตรงกับที่จะ deploy)
cd server && PORT=4050 node index.js
# ควรเห็น: [mng-erp] listening on http://0.0.0.0:4050

# 2) ตรวจทุกหน้าจริงใน browser (ห้ามใช้ curl อย่างเดียว)
npm run deploy:local         # รัน local + ตรวจทุกหน้าอัตโนมัติ
```

**ตารางหน้าที่ต้องตรวจ (ตาม `AGENTS.md` ข้อ 2):**

| หน้า | URL | ต้องเห็น |
|---|---|---|
| หน้าหลัก | `/` | redirect ไป `/login/` หรือ `/dashboard/` |
| Login | `/login/` | ฟอร์มเข้าสู่ระบบ ธีมอ่อน อ่านข้อความได้ |
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
- หน้าไหนยังขาว (สีขาวพื้นเปล่า)
- หน้าไหนค้าง spinner "กำลังตรวจสอบสถานะ…" ไม่ต่อ
- API health ไม่ใช่ `{"ok":true,"auth":true,"work":true}`
- CSS ไม่โหลด (content_type ไม่ใช่ `text/css`)

### 3.2 ขั้นที่ 2 — เขียนเอกสารขออนุมัติ

**ทุกครั้งที่จะ deploy ต้องมีเอกสาร** — ใช้แบบฟอร์มในข้อ 4

### 3.3 ขั้นที่ 3 — รอพี่เอกอนุมัติ

**ห้าม FTP จนกว่าจะได้รับการอนุมัติจากพี่เอกชัดเจน**

### 3.4 ขั้นที่ 4 — Deploy (หลังอนุมัติแล้วเท่านั้น)

```bash
# 1) build ใหม่ → sync ไป server/public
rm -rf server/public && mkdir -p server/public
cp -r web/out/* server/public/

# 2) commit แยก 2 commit (ตาม AGENTS.md ข้อ 4)
git commit -m "fix: <สรุปโค้ดที่แก้>"       # โค้ด
git commit -m "chore(deploy): <สรุป artifact>"  # build output

# 3) push git
git push origin main

# 4) FTP (เฉพาะหลังอนุมัติ)
lftp -u '<user>' <host> -e "set ssl:verify-certificate no; set ftp:ssl-allow no; \
  rm -r server/public; mkdir server/public; \
  mirror -R server/public server/public; bye"
```

### 3.5 ขั้นที่ 5 — ตรวจซ้ำบน production จริง

**ห้ามตรวจแค่ local** — ต้องเปิด `https://mng.uarea.in/` จริงทุกหน้าตามตาราง 3.1

---

## 4. แบบฟอร์มขออนุมัติ (ต้องแนบทุกครั้ง)

เขียนที่ `docs/deploy/approval-<วันที่>.md` แล้วแนบในข้อความขออนุมัติ

```markdown
# ขออนุมัติ Deploy — <วันที่>

## สิ่งที่จะ deploy
- Branch: `main`
- Commit: `<hash>` — <สรุป>
- ไฟล์ที่เปลี่ยน: <รายการ>

## สาเหตุ
<ทำไมต้อง deploy ตอนนี้>

## ผลการตรวจใน LOCAL (ต้องแนบหลักฐานจริง)

| ขั้น | ผล |
|---|---|
| `npm run lint` | ✅ exit 0 |
| `npm run test` | ✅ N ผ่าน / 0 ล้มเหลว |
| `npm run build` | ✅ exit 0 |
| `npm run verify` | ✅ ผ่านทั้งหมด |

## หน้าที่ตรวจใน browser

| หน้า | URL | ผล |
|---|---|---|
| หน้าหลัก | `/` | ✅ redirect ไป `/login/` |
| ... | ... | ... |
| ข้อผิดพลาด | `/api/health` | ✅ `{"ok":true,"auth":true,"work":true}` |

## สิ่งที่เปลี่ยน (สรุปให้พี่เอกอ่าน)
- ...

## จุดย้อนกลับ
- Rollback commit: `<hash>`
- วิธี: `git checkout <commit> -- . && git commit && git push origin main`

## คำขอ
รบกวนพี่เอกตรวจและกดอนุมัติ deploy ด้วยครับ
```

---

## 5. ตารางสถานนะงานปัจจุบัน

### 5.1 สถานนะ production (ตรวจล่าสุด)

| จุด | ผลตรวจ | สถานะ |
|---|---|---|
| `/` | 200 text/html | ✅ |
| `/login/` | 200 text/html | ✅ |
| `/dashboard/` | 200 text/html | ✅ |
| `/api/health` | **500** text/html | ⛔ **พัง** |

**สาเหตุที่รู้:** `server/index.js` มีบรรทัด
`app.use('/api/hermes-mini', auth.middleware, require('./hermes-mini/routes'))`
แต่ไฟล์ `server/hermes-mini/routes.js` **ไม่ถูกอัปโหลดขึ้น production** →
`MODULE_NOT_FOUND` ตอน boot → Node ตาย → Passenger ขึ้นหน้า error

**ต้องทำ:** อัปโหลด `server/hermes-mini/` ทั้งโฟลเดอร์ (หรือตัดบรรทัดนั้นออก)
**ต้องอนุมัติก่อน** — ยังไม่แตะ production

### 5.2 งานที่เสร็จแล้ว (commit บน main)

| Commit | ประเภท | สรุป | ตรวจแล้ว |
|---|---|---|---|
| `0336b10` | chore(deploy) | build output ธีม light | — |
| `9ddf8ad` | style | ธีม light ตาม playdigital | ✅ ทุกหน้า body bg = `rgb(246,247,252)` |
| `6850375` | chore(deploy) | build output | — |
| `00857d5` | feat | logout ไม่ติด cache + hermes-mini | ✅ |
| `2391c18` | fix | React #185 infinite loop | ✅ |

### 5.3 งานที่ยังไม่เข้า main (untracked)

| ไฟล์ | สถานะ | หมายเหตุ |
|---|---|---|
| `server/hermes-mini/run.js` | modified | ยังไม่ commit |
| `server/hermes-mini/README.md` | untracked | ยังไม่ commit |
| `server/hermes-mini/public/` | untracked | ยังไม่ commit |
| `server/hermes-mini/` ทั้งโฟลเดอร์ | ยังขาดบน production | **ต้องอัปเดต** |

### 5.4 งานค้างที่ต้องตัดสิน

| # | งาน | สถานนะ | ต้องตัดสิน |
|---|---|---|---|
| 1 | กู้ production `/api/health` 500 | รออนุมัติ | อัป `hermes-mini/` หรือตัดบรรทัด |
| 2 | commit งานค้าง (hermes-mini) | รอ | ใครเป็นเจ้าของ |
| 3 | ธีม light deploy ขึ้น production | รออนุมัติ | รอพี่เอกกด |
| 4 | หน้า Tasks/Projects ยังเขียน "กำลังพัฒนา" | รอ | ใครทำต่อ |

---

## 6. บัญชีสี — ธีม light จาก i.playdigital.co.th

**แหล่งอ้างอิง:** `https://i.playdigital.co.th/` (ดึง CSS variables โดยตรง)

**หลักการ:** ธีมเป็น **light เท่านั้น** — ลบ dark mode ที่แฝงมาทับออกแล้ว

### 6.1 ตัวแปรหลัก (อยู่ใน `web/src/app/globals.css`)

| กลุ่ม | ตัวแปร | ค่า | ใช้ที่ |
|---|---|---|---|
| **พื้นหลัง** | `--bg` / `--background` | `#f6f7fc` | พื้นหลัก |
| | `--bg-2` | `#fbfbfe` | พื้นรอง (input) |
| | `--card` | `#ffffff` | การ์ด |
| | `--tint-1..3` | `#f3f4fb` / `#eef0f8` / `#e6e8f6` | โทนพื้น |
| | `--panel` / `--panel-2` | `#f6f7fc` / `#f1f2fa` | แผง |
| **ตัวอักษร** | `--ink` | `#23264d` | หลัก |
| | `--ink-2` | `#454a75` | รอง |
| | `--muted` | `#8a8fb1` | หมายเหตุ |
| **เส้นขอบ** | `--line` | `#e9ebf6` | หลัก |
| | `--line-2` | `#dfe2f2` | รอง |
| **สีหลัก** | `--violet` | `#6c5ce7` | **สีแบรนด์ (เด่นสุด)** |
| | `--violet-2` | `#8e7cf3` | hover |
| | `--violet-soft` | `#efedfd` | พื้นสี |
| | `--pink` | `#ff6b9d` | จุดสีชมพู |
| | `--blue` / `--blue-2` | `#3ba7ff` / `#2f7bf0` | ฟ้า |
| | `--mint` | `#22c793` | เขียว (สำเร็จ) |
| | `--teal` | `#14c4b2` | เขียวหัว |
| | `--amber` | `#ffb020` | เหลืองส้ม (เตือน) |
| | `--orange` | `#ff9a5a` | ส้ม |
| | `--red` | `#ff5c7a` | แดง (ผิดพลาด) |
| **เงา** | `--shadow-sm` | `0 1px 3px #2e32660f` | เล็ก |
| | `--shadow-soft` | `0 8px 24px #4c42a814` | กลาง |
| | `--shadow` | `0 24px 60px #3c348c2e` | ใหญ่ |
| **มุมโค้ง** | `--r-sm` / `--r` / `--r-lg` | `10px` / `14px` / `18px` | — |

### 6.2 Gradient

| ตัวแปร | ค่า | ใช้ที่ |
|---|---|---|
| `--grad-violet` | `linear-gradient(135deg,#8e7cf3,#6c5ce7 60%,#4a3fd1)` | ปุ่มหลัก, โลโก้ |
| `--grad-pink` | `linear-gradient(135deg,#ff8fb8,#b950f0)` | จุดแต่ง |
| `--grad-cyan` | `linear-gradient(135deg,#3ba7ff,#2f7bf0)` | — |
| `--grad-mint` | `linear-gradient(135deg,#22c793,#14c4b2)` | — |
| `--grad-amber` | `linear-gradient(135deg,#ffb020,#ff9a5a)` | — |

### 6.3 ฟอนต์

```css
--font-sans: "Prompt","Kanit","Sarabun","IBM Plex Sans Thai","Segoe UI",system-ui,sans-serif;
```

**Prompt เป็นตัวแรก** (ตามเว็บอ้างอิง)

### 6.4 การใช้งาน (ห้ามใช้สี hardcode)

```tsx
// ✅ ถูก — ใช้ตัวแปรธีม
<div className="bg-card border border-line text-ink">
  <button className="bg-violet text-white">บันทึก</button>
</div>

// ✅ ถูก — ใช้ inline style กับ gradient
<div style={{ background: 'var(--grad-violet)' }}>โลโก้</div>

// ⛔ ผิด — ห้ามใช้สีเข้ม/สี hardcode
<div className="bg-slate-900 text-white">…</div>
<div className="bg-amber-500">…</div>
```

### 6.5 การเปลี่ยนธีมในอนาคต

ถ้าจะเปลี่ยนสี ให้แก้ **เฉพาะ `globals.css`** — ไม่ต้องแก้ไฟล์หน้า
เพราะทุกหน้าอ้างตัวแปร ไม่ hardcode

---

## 7. สถาปัตยกรรมระบบ

### 7.1 โครงสร้าง

```
mng-erp/
├── web/                    # Frontend — Next.js 16 + React + TypeScript
│   └── src/
│       ├── app/            # App Router
│       │   ├── (auth)/login/      # หน้า login
│       │   ├── (app)/             # หน้าที่ต้อง auth (dashboard, tasks, …)
│       │   ├── globals.css        # ★ ธีมหลัก (ตัวแปรสีทั้งหมด)
│       │   └── layout.tsx         # โครงหลัก
│       ├── components/shell/      # Sidebar + AppShell
│       ├── lib/
│       │   ├── api/client.ts      # API client (zod)
│       │   └── stores/            # Zustand: auth.ts, app.ts
├── server/                 # Backend — Express 4 + MariaDB
│   ├── index.js            # entry (API + static)
│   ├── auth.js             # login/session (Bearer token)
│   ├── db.js               # connection pool + schema
│   ├── routes.js           # protected API
│   ├── users.js            # จัดการผู้ใช้
│   ├── drive-routes.js     # Google Drive OAuth
│   ├── hermes-mini/        # AI assistant (routes.js, run.js, hermes-mini.js)
│   ├── public/             # ★ build output ของ Next.js (deploy ที่นี่)
│   ├── .env                # secret (ห้าม commit)
│   └── .env.example
├── scripts/                # ตรวจ/ทดสอบ
├── tests/                  # vitest
├── docs/                   # เอกสาร
└── AGENTS.md               # กฎบังคับ
```

### 7.2 ฐานข้อมูลจริง (เชื่อมผ่าน IP)

| ฐานข้อมูล | เจ้าของ | ตาราง | จำนวนแถว (ตรวจล่าสุด) |
|---|---|---|---|
| `pacific_mng` | auth | users | 15 |
| `pacific_mngworks` | work | projects | 23 |
| | | tasks | 34 |

- **Host:** `203.146.252.149:3306`
- **MariaDB:** 10.11.19
- **Connection:** ใช้ pool แยก 2 ตัว (auth / work) — ไม่ต้อง cross-DB grant
- **ตั้งค่า:** `server/config.js` + `server/.env`

### 7.3 การรัน (ต้องรันจาก `server/`)

```bash
cd server && PORT=4051 node index.js
```

**สำคัญ:** `dotenv` โหลด `.env` ตาม **cwd** ไม่ใช่ตำแหน่งไฟล์
→ รันจาก root จะขึ้น `[config] missing env DB_AUTH_PASS`
→ **ต้อง `cd server` ก่อนเสมอ**

### 7.4 ระบบ auth

- **แบบ:** Bearer token (`erp_sessions` table)
- **เก็บที่:** `localStorage['mng_token']`
- **logout ที่ทำ:** เรียก `/api/auth/logout` (ลบ session ฝั่ง DB) → ล้างทุกคีย์ auth
  (รวมคีย์เก่า `mng_erp_token`, `mng_user`, `mng_session` + `sessionStorage`) →
  `window.location.replace('/login/?_t=<ts>')`
- **ป้องกัน cache:** ทุก `/api` ตอบ `Cache-Control: no-store`

---

## 8. เครื่องมือที่ใช้

| เครื่องมือ | เวอร์ชัน | ใช้ที่ |
|---|---|---|
| Next.js | 16.4.2 | frontend (static export) |
| React + TypeScript | — | UI |
| Tailwind CSS | ^4 | styling (ตัวแปรใน globals.css) |
| Zustand | v5 | state (auth, app) |
| zod | — | validate API |
| Express | ^4.19.2 | backend |
| MariaDB | 10.11.19 | database |
| mysql2 | ^3.11.0 | driver |
| vitest | ^3.2.7 | ทดสอบ |
| ESLint | ^8.57.0 | lint |
| lftp | — | deploy (ห้ามใช้ก่อนอนุมัติ) |

---

## 9. แหล่งอ้างอิง

| ที่ | ใช้กับ |
|---|---|
| `https://i.playdigital.co.th/` | ธีมสี (ดึง CSS variables โดยตรง) |
| `https://mng.uarea.in/` | production |
| `AGENTS.md` | กฎบังคับ commit/deploy |
| `docs/migration/nextjs-plan.md` | แผน migration |
| `server/.env.example` | ตัวแปรที่จำเป็น |
| `scripts/verify.sh` | ตรวจความถูกต้องก่อน commit |
| `scripts/deploy-local.sh` | รัน local + ตรวจทุกหน้า |

---

**หมายเหตุ:** เอกสารนี้เขียนเป็นภาษาไทยทั้งหมดตามที่พี่เอกสั่ง
ถ้ามีข้อสงสัย ให้ถามก่อนทำ ไม่ใช่ทำแล้วมาถูกหลัง
