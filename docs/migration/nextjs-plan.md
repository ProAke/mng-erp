# MNG ERP — Next.js Migration Plan (Strangler Pattern)

> เป้าหมาย: migrate frontend จาก vanilla SPA (hash routing + localStorage) ไป **Next.js 16 + React + TypeScript**
> โดย **ไม่ต้องหยุดระบบเดิม** — Express API ที่มีอยู่ทำงานต่อไป และใช้เป็น API หลัก

**หลักการ:** Strangler Fig — frontend ใหม่ทับทีละหน้าจอ ระบบเดิมยังรันอยู่ ทุกขั้นมี rollback path

---

## 0. สถานะต้นทาง (baseline วันที่ 2026-10-21)

### API surface (Express, ยังรันจริงบน mng.uarea.in)
| Method | Path | File |
|--------|------|------|
| GET | `/api/health` | index.js:16 |
| POST | `/api/auth/login` | index.js:18 |
| POST | `/api/auth/logout` | index.js:31 |
| GET | `/api/bootstrap` | routes.js:94 |
| POST/PATCH/DELETE | `/api/tasks[/:id]` | routes.js:154,172,201 |
| POST/PATCH/DELETE | `/api/events[/:id]` | routes.js:210,225,251 |
| POST | `/api/invoices` | routes.js:268 |
| POST | `/api/invoices/:id/pay` | routes.js:259 |
| POST/PATCH/DELETE | `/api/projects[/:id]` | routes.js:285,303,336 |
| POST | `/api/projects/:id/restore` | routes.js:350 |
| GET | `/api/projects/archived` | routes.js:363 |
| POST/PATCH/DELETE | `/api/teams[/:id]` | routes.js:378,394,422 |
| PUT | `/api/settings` | routes.js:438 |
| GET | `/api/users/me` | users.js:50 |
| GET/POST | `/api/users[/:id]` | users.js:56,66 |
| POST | `/api/users/:id/password` | users.js:146 |
| POST | `/api/users/me/password` | users.js:30 |

### ข้อจำกัดที่พบ (ต้องแก้ก่อน migration)
1. ไม่มี tests (`tests/` ว่าง)
2. ไม่มี CI (ไม่มี `.github/workflows/`)
3. ไม่มี input validation (deps: bcryptjs, dotenv, express, mysql2 เท่านั้น)
4. Error shape ไม่เป็นมาตรฐาน (`{error}` / `{detail}` / `{error,detail}`)
5. Auth middleware เช็คสถานะจาก auth DB ทุก request (ดี) แต่ไม่มี session rotation / rate-limit login
6. `pacific_mng.users` ถูกสร้างนอกโค้ดนี้ (seed.js ไม่แตะ users) — ต้องทราบ schema ก่อน

---

## 1. เหตุผลที่เลือก Next.js 16

| เกณฑ์ | Next.js 16 | Nuxt 4 | Vanilla (ปัจจุบัน) |
|-------|-----------|--------|-------------------|
| Support window | **2 ปี/major** (Active LTS) | 6 เดือน/major | ไม่มี |
| Hiring pool | **ใหญ่สุด** | กลาง | ไม่มี framework |
| TypeScript | ✅ first-class | ✅ | ❌ |
| SSR/SSG | ✅ | ✅ | ❌ (CSR ล้วน) |
| Plesk auto-detect | ✅ | ✅ | ✅ |
| Enterprise ecosystem | **ครบ** | กลาง | — |

**หมายเหตุสำคัญ:** Nuxt 3 EOL แล้ว (2026-07-31) และ Nuxt 4 จะ EOL เมื่อ Nuxt 5 ออก (คาด Q4 2026) — นโยบาย support 6 เดือน vs Next.js 2 ปี = ต่าง 4 เท่า

---

## 2. สถาปัตยกรรมเป้าหมาย

```
mng-erp/
├── web/                      ← Next.js 16 (App Router) + TypeScript
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/dashboard/page.tsx
│   │   ├── (app)/calendar/page.tsx
│   │   ├── (app)/tasks/page.tsx
│   │   ├── (app)/projects/page.tsx
│   │   ├── (app)/finance/page.tsx
│   │   ├── (app)/team/page.tsx
│   │   ├── (app)/clients/page.tsx
│   │   ├── (app)/reports/page.tsx
│   │   └── (app)/settings/page.tsx
│   ├── components/           ← UI components (แยกจาก views.js)
│   ├── lib/
│   │   ├── api/              ← typed client (แทน Remote.req)
│   │   │   ├── schema.ts     ← zod schemas
│   │   │   └── client.ts     ← fetch wrapper + error handling
│   │   ├── auth/             ← session store (แทน localStorage token)
│   │   └── stores/           ← zustand/pinia แทน global Store
│   ├── middleware.ts         ← route guard
│   └── next.config.js
├── api/                      ← Express (ย้ายจาก server/) — คงไว้ก่อน
└── docs/
    └── api/openapi.yaml      ← typed API contract
```

---

## 3. ขั้นตอน (แต่ละขั้น = 1 PR + rollback path)

### Phase 0 — Foundation (ทำบน stack เดิม ก่อนแตะ Next.js)
- [ ] 0.1 สร้าง OpenAPI spec จาก routes.js/users.js ที่มีอยู่ (เป็นสัญญา API)
- [ ] 0.2 เพิ่ม vitest + regression test สำหรับ logout (ป้องกันพังกลับมา)
- [ ] 0.3 GitHub Actions: lint + test + build ทุก PR
- [ ] 0.4 เพิ่ม zod validation ทุก input endpoint
- [ ] 0.5 มาตรฐาน error shape (`{code, message, detail?}`)
- [ ] 0.6 เอา demo mode ออก (สองทาง state = หายนะ)
- [ ] 0.7 nginx cache headers ใน Plesk

### Phase 1 — Next.js scaffold (parallel ไม่แตะระบบเดิม)
- [ ] 1.1 สร้าง `web/` — Next.js 16 + TS + App Router
- [ ] 1.2 typed API client + zod schema จาก OpenAPI spec
- [ ] 1.3 Auth: session cookie (httpOnly) แทน localStorage token
- [ ] 1.4 route guard middleware
- [ ] 1.5 หน้า login แรก (ยังไม่ตัดเส้นเดิม)

### Phase 2 — Migrate ทีละหน้าจอ
- [ ] 2.1 dashboard
- [ ] 2.2 calendar
- [ ] 2.3 tasks (board + timeline)
- [ ] 2.4 projects
- [ ] 2.5 finance
- [ ] 2.6 team
- [ ] 2.7 clients
- [ ] 2.8 reports
- [ ] 2.9 settings (user mgmt, profile, theme)

### Phase 3 — Cutover
- [ ] 3.1 nginx route: `/` → Next.js, `/api/*` → Express
- [ ] 3.2 ปิด SPA fallback ของ Express
- [ ] 3.3 ลบ `assets/`, `index.html` เก่า (หลัง verify)

### Phase 4 — Enterprise hardening
- [ ] 4.1 RBAC + audit log
- [ ] 4.2 rate limiting
- [ ] 4.3 session rotation
- [ ] 4.4 E2E tests (Playwright)
- [ ] 4.5 monitoring

---

## 4. Rollback plan แต่ละขั้น

| ขั้น | Rollback |
|------|----------|
| Phase 0 | revert commit (ไม่กระทบ production) |
| Phase 1 | ยังไม่ route — ไม่มีผล |
| Phase 2 | nginx location toggle กลับไป SPA เดิม |
| Phase 3 | nginx revert → Express รันเดิมทันที |

---

## 5. ความเสี่ยงที่รู้ล่วงหน้า

1. **nginx หน้า Node.js** — cache headers จาก Express ไม่แผ่น → ต้องตั้งที่ nginx layer
2. **localStorage token** → ต้อง migrate เป็น httpOnly cookie (ผู้ใช้ที่ login อยู่ต้อง login ใหม่ครั้งเดียว)
3. **Express static + SPA fallback** — ต้องยกเว้น `/hub`, `/workspace` (ของ MNG Hub เดิม)
4. **`pacific_mng.users`** — seed.js ไม่แตะ ต้องทราบ schema จริงก่อน
5. **No tests** — ทุกขั้นต้องมี test ก่อน merge

---

## 6. สรุปต้นทุน (ประมาณการ)

| ขั้น | งาน | ทีม |
|------|-----|-----|
| Phase 0 | 1-2 วัน | backend + dev |
| Phase 1 | 2-3 วัน | frontend |
| Phase 2 | 5-8 วัน (9 หน้าจอ) | frontend 2 ทีม |
| Phase 3 | 0.5 วัน | dev |
| Phase 4 | 3-5 วัน | backend + dev |

**รวม ~12-19 วัน** — โดยที่ระบบเดิมยังรันตลอด

---

*Maintained by @dev (กวิน) · สร้าง 2026-10-21*
