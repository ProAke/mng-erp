# คู่มือการใช้งาน MNG ERP REST API & การเชื่อมต่อ Hermes AI (ฉบับสมบูรณ์)

เอกสารฉบับนี้อธิบายวิธีเชื่อมต่อใช้งาน **MNG ERP REST API** (`https://mng.uarea.in/api`) จากภายนอก สำหรับ **Hermes Agent**, ระบบ AI อัตโนมัติ, n8n, Webhook, และสคริปต์ Python / Node.js โดยออกแบบตามหลักความปลอดภัย **Mandatory User/Password + 20-Slot Rotating Token Pool**

---

## 1. หลักการทำงานและความปลอดภัย (Security Architecture)

1. **บังคับยืนยันตัวตนด้วย `email` + `password` เท่านั้น**:
   - ทุกการเชื่อมต่อ API จะต้องมีบัญชีผู้ใช้งานจริงในฐานข้อมูล **`pacific_mng.users`** ที่มีสถานะ `active`
   - ไม่อนุญาตให้ดึงหรือแก้ไขข้อมูลแบบไม่ระบุตัวตน (Anonymous Access จะถูกปฏิเสธด้วย `401 Unauthorized` ทันที)
   - ทุกครั้งที่เรียก API เซิร์ฟเวอร์จะตรวจสอบสถานะบัญชีสดจาก `pacific_mng.users` หากผู้ดูแลระบบระงับบัญชี (`suspended`/`inactive`) Token ทั้ง 20 ตัวจะถูกบล็อกทันทีในวินาทีนั้น
2. **AI ล็อกอินด้วยบัญชีตัวเอง + หมุนเวียน 20 API Tokens (Round-Robin Pool)**:
   - เมื่อ AI เรียก `POST /api/hermes/login` ด้วย `email` และ `password` ของตนเอง ระบบจะออกชุด **API Token จำนวน 20 ตัว (`Slot #01` ถึง `Slot #20`)** ในรูปแบบ `mng_s01_<48hex>` .. `mng_s20_<48hex>`
   - AI หรือ Sub-agent สามารถนำ Token ทั้ง 20 ตัวไป **วนใช้งานสลับกันแบบ Round-Robin (`1 → 2 → 3 → ... → 20 → 1`)**
   - หากมี Sub-agent หลายตัวล็อกอินด้วยบัญชีเดียวกันพร้อมกัน ระบบจะคืนชุด 20 Tokens ที่ยังใช้งานอยู่ชุดเดิมให้ (ไม่เตะ Sub-agent ตัวอื่นหลุด) ยกเว้นสั่ง `"rotate": true` เพื่อบังคับเปลี่ยนชุดใหม่ทั้ง 20 ตัว
   - ทุก Response ที่เรียกด้วย Token Pool จะแนบ Header ตอบกลับมาด้วยเสมอ:
     - `X-Token-Slot`: หมายเลข Slot ที่เพิ่งใช้งาน (`1`–`20`)
     - `X-Next-Recommended-Slot`: หมายเลข Slot ถัดไปที่แนะนำให้ใช้ (`(slot % 20) + 1`)
3. **โหมดความปลอดภัยขั้นสูง Strict Dual-Auth (เปิด/ปิดได้ในหน้าตั้งค่า)**:
   - หากเปิดโหมด **Strict Dual-Auth** ในเมนู `#/settings` (หรือผ่าน `POST /api/hermes/tokens/policy`) ทุก API Request จะต้องแนบทั้ง **API Token** คู่กับ **`X-Auth-Email` + `X-Auth-Password`** (หรือ `Authorization: Basic ...`) พร้อมกันทุกครั้ง

---

## 2. การเตรียมบัญชีสำหรับ Hermes / AI Agent

แนะนำให้ผู้ดูแลระบบ (`admin` หรือ `super_admin`) สร้างบัญชีเฉพาะสำหรับ AI แยกจากบัญชีคนจริง เพื่อตรวจสอบประวัติการทำงาน (`erp_activity`) และจำกัดสิทธิ์ได้อย่างละเอียด:

1. เข้าสู่เว็บ **MNG ERP** (`https://mng.uarea.in/#/settings`)
2. ในการ์ด **🛡 ผู้ใช้และสิทธิ์ (Admin เท่านั้น)** กดปุ่ม **`+ เพิ่มผู้ใช้`**
3. กรอกข้อมูลบัญชีสำหรับ AI เช่น:
   - **ชื่อ-สกุล**: `Hermes AI Agent`
   - **อีเมล**: `hermes@mng.co.th` (หรืออีเมลที่ต้องการ)
   - **สิทธิ์ (Role)**:
     - เลือก `user` — หากต้องการให้สร้าง/อัปเดตการ์ดงาน แชต ปฏิทิน และใบแจ้งหนี้ทั่วไป
     - เลือก `manager` หรือ `admin` — หากต้องการให้แก้ไขโครงสร้างโปรเจกต์ ลบข้อมูลลูกค้า หรือจัดการทีม
   - **รหัสผ่านเริ่มต้น**: ตั้งรหัสผ่านที่คาดเดายาก (อย่างน้อย 8–16 ตัวอักษร)
4. นำ `email` และ `password` นี้ไปตั้งค่าใน Hermes Agent หรือสคริปต์ภายนอกได้ทันที

---

## 3. การล็อกอินและจัดการชุด 20 API Tokens

### 3.1 ล็อกอินด้วยบัญชีตัวเองเพื่อรับ 20 Rotating Tokens
**`POST /api/hermes/login`** *(Public Endpoint — ต้องส่ง `email` + `password`)*

**Request:**
```bash
curl -X POST "https://mng.uarea.in/api/hermes/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hermes@mng.co.th",
    "password": "YOUR_AI_PASSWORD",
    "poolSize": 20,
    "rotate": false,
    "label": "hermes-prod"
  }'
```

**Response (`200 OK`):**
```json
{
  "ok": true,
  "user": {
    "id": "u9",
    "authId": 9,
    "name": "Hermes AI Agent",
    "email": "hermes@mng.co.th",
    "role": "manager"
  },
  "poolSize": 20,
  "rotationPolicy": "round-robin",
  "usageHint": "นำ tokens[0..19] ไปวนใช้งานสลับกันแบบ Round-Robin ใน Header Authorization: Bearer <token> หรือ X-API-Token: <token>",
  "tokens": [
    { "slot": 1, "token": "mng_s01_8f4c...a91b", "expiresAt": "2026-12-26T08:00:00.000Z" },
    { "slot": 2, "token": "mng_s02_2d19...77e0", "expiresAt": "2026-12-26T08:00:00.000Z" },
    "... จนครบ slot 20 ..."
  ]
}
```

### 3.2 วิธีแนบ Token เวลาเรียกใช้งาน API
รองรับทั้ง 2 รูปแบบ Header (เลือกใช้อย่างใดอย่างหนึ่ง หรือส่งคู่กันก็ได้):
- มาตรฐาน Bearer: `Authorization: Bearer mng_s01_...`
- Header เฉพาะ: `X-API-Token: mng_s01_...`
- *(กรณีเปิดโหมด Strict Dual-Auth)* แนบเพิ่ม:
  - `X-Auth-Email: hermes@mng.co.th`
  - `X-Auth-Password: YOUR_AI_PASSWORD`

### 3.3 Endpoint จัดการ Token Pool อื่นๆ (ต้องแนบ Token)
| Method | Endpoint | คำอธิบาย |
|---|---|---|
| `GET` | `/api/hermes/me` | ตรวจสอบตัวตนผู้เรียก สิทธิ์ (`role`) และหมายเลข `tokenSlot` ที่ใช้ใน Request นี้ |
| `GET` | `/api/hermes/tokens` | ดูสถิติการใช้งาน (`useCount`, `lastUsedAt`, `lastAgent`) ของทั้ง 20 Slots (ไม่แสดงค่า Token เต็มเพื่อความปลอดภัย) |
| `POST` | `/api/hermes/tokens/reveal` | ส่ง `{ "password": "..." }` เพื่อขอดูค่าเต็มของทั้ง 20 Tokens |
| `POST` | `/api/hermes/tokens/rotate` | ส่ง `{ "password": "...", "poolSize": 20 }` เพื่อยกเลิกชุดเก่าและสร้างใหม่ทั้ง 20 ตัวทันที |
| `POST` | `/api/hermes/tokens/policy` | ส่ง `{ "password": "...", "strictDualAuth": true }` เพื่อเปิด/ปิดโหมดบังคับรหัสผ่านทุก Request |
| `DELETE` | `/api/hermes/tokens` | เพิกถอน (Revoke) Token ทั้ง 20 ตัวของบัญชีนี้ทันที |

---

## 4. ตัวอย่างโค้ดหมุนเวียน 20 Tokens อัตโนมัติ (Round-Robin)

### 4.1 ตัวอย่างภาษา Python (ไม่ต้องลงไลบรารีเพิ่ม)
หรือดาวน์โหลดสคริปต์สำเร็จรูปของระบบได้โดยตรงที่ `https://mng.uarea.in/api/hermes/client.py`

```python
import os, json, urllib.request

BASE_URL = os.environ.get("MNG_ERP_URL", "https://mng.uarea.in")
EMAIL = os.environ["MNG_ERP_EMAIL"]
PASSWORD = os.environ["MNG_ERP_PASSWORD"]

# 1) AI ล็อกอินด้วยบัญชีตัวเอง รับ Token 20 ตัว
login_req = urllib.request.Request(
    f"{BASE_URL}/api/hermes/login",
    data=json.dumps({"email": EMAIL, "password": PASSWORD, "poolSize": 20}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(login_req) as resp:
    tokens = [item["token"] for item in json.loads(resp.read().decode())["tokens"]]

# 2) ตัวหมุนเวียน Token ทั้ง 20 ตัวแบบ Round-Robin (1 -> 2 -> ... -> 20 -> 1)
cursor = 0
def mng_api(method: str, path: str, payload=None):
    global cursor
    tok = tokens[cursor % len(tokens)]
    cursor += 1
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {tok}",
            "X-Auth-Email": EMAIL,
            "X-Auth-Password": PASSWORD,
        },
        method=method,
    )
    with urllib.request.urlopen(req) as r:
        print("Used Slot:", r.headers.get("X-Token-Slot"), "-> Next:", r.headers.get("X-Next-Recommended-Slot"))
        return json.loads(r.read().decode())

# ทดสอบดึงภาพรวมผู้บริหาร และสร้างการ์ดงานใหม่
summary = mng_api("GET", "/api/hermes/overview")
created = mng_api("POST", "/api/tasks", {
    "title": "สรุปรายงานแคมเปญประจำสัปดาห์โดย Hermes",
    "project": "p1",
    "priority": "high",
    "status": "doing",
    "due": "2026-11-05"
})
print(created)
```

### 4.2 ตัวอย่างภาษา Node.js / TypeScript (Fetch มาตรฐาน)
```javascript
class MngErpRotatingClient {
  constructor({ baseUrl = 'https://mng.uarea.in', email, password }) {
    if (!email || !password) throw new Error('ต้องระบุ email และ password');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.email = email;
    this.password = password;
    this.tokens = [];
    this.idx = 0;
  }

  async login(rotate = false) {
    const res = await fetch(`${this.baseUrl}/api/hermes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password, poolSize: 20, rotate }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
    this.tokens = data.tokens.map(t => t.token);
    return data;
  }

  async request(method, path, body) {
    if (!this.tokens.length) await this.login(false);
    const token = this.tokens[this.idx % this.tokens.length];
    this.idx = (this.idx + 1) % this.tokens.length;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Auth-Email': this.email,
        'X-Auth-Password': this.password,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      await this.login(false);
      return this.request(method, path, body);
    }
    return res.json();
  }
}
```

---

## 5. รายละเอียด REST API Endpoints ทั้งหมดของ MNG ERP

> **รูปแบบรหัสอ้างอิง (Prefixed IDs):**
> - โปรเจกต์: `p1`, `p2`, ...
> - การ์ดงาน: `t1`, `t2`, ...
> - สมาชิกทีม: `u1`, `u2`, ...
> - ห้องแชต: `ch1`, `ch2`, ... / ข้อความแชต: `m1`, `m2`, ...
> - ลูกค้า CRM: `c1`, `c2`, ... / ใบแจ้งหนี้: `i1`, `i2`, ...
> - นัดหมายปฏิทิน: `e1`, `e2`, ... / ห้องประชุม: `rm1`, `rm2`, ... / AI Agent: `ai1`, `ai2`, ...

### 5.1 ภาพรวมระบบ & ข้อมูลหลัก (Overview & System)
| Method | Endpoint | รายละเอียด |
|---|---|---|
| `GET` | `/api/health` | *(Public)* ตรวจสถานะเซิร์ฟเวอร์และ MariaDB (`dbReady`, `hermesApi`) |
| `GET` | `/api/hermes/overview` | **แนะนำสำหรับ AI**: สรุปยอดโปรเจกต์ งานค้าง งานด่วน บิลรอเก็บ นัดหมาย และข้อความล่าสุดใน Payload ขนาดกะทัดรัด |
| `GET` | `/api/hermes/endpoints` | ดึงรายการ API Catalog ทั้งหมดในรูปแบบ JSON |
| `GET` | `/api/bootstrap` | ดึงข้อมูลดิบครบทั้ง 13 โมดูลของระบบในครั้งเดียว |
| `GET` | `/api/db/audit` | ตรวจสอบการเชื่อมต่อและนับจำนวนแถวสดของตาราง MariaDB ทั้ง 19 ตาราง |

### 5.2 การ์ดงาน Kanban & Sprint (Tasks)
- **`GET /api/tasks`**
  - Query Filters (ไม่บังคับ): `?status=todo|doing|review|done`, `?priority=urgent|high|med|low`, `?project=p1`, `?assignee=u1`, `?q=คำค้นหา`
- **`POST /api/tasks`** — สร้างงานใหม่
  ```json
  {
    "title": "ออกแบบหน้า Landing Page แคมเปญ Q4",
    "project": "p1",
    "status": "todo",
    "priority": "high",
    "assignee": "u1",
    "aiAgentId": "ai2",
    "start": "2026-10-27",
    "due": "2026-11-05",
    "est": 8,
    "tags": ["design", "q4"],
    "subtasks": [{ "t": "วาง Wireframe", "d": false }],
    "desc": "รายละเอียดบรีฟจากลูกค้า"
  }
  ```
  - คืนค่า: `{ "id": "t42", "code": "MNG-1042" }`
- **`PATCH /api/tasks/:id`** — อัปเดตงาน (ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน เช่น `status`, `progress`, `priority`, `due`, `assignee`, `subtasks`, `comments`)
- **`DELETE /api/tasks/:id`** — เก็บงานเข้าคลัง (Soft-archive `archived = 1`)

### 5.3 โปรเจกต์ (Projects)
- **`GET /api/projects`** — ดึงรายการโปรเจกต์ทั้งหมด (รองรับ `?status=doing|done` และ `?q=คำค้น`)
- **`POST /api/projects`** — สร้างโปรเจกต์ใหม่
  ```json
  {
    "name": "MNG Omni-Channel Launch",
    "code": "OMN",
    "clientName": "บริษัท สยามดิจิทัล จำกัด",
    "budget": 350000,
    "start": "2026-11-01",
    "end": "2027-01-31",
    "desc": "แคมเปญเปิดตัวแพลตฟอร์มใหม่"
  }
  ```
- **`PATCH /api/projects/:id`** *(สิทธิ์ Manager/Admin)* — แก้ไขชื่อ รหัส งบประมาณ ลูกค้า สถานะ หรือสมาชิกโปรเจกต์
- **`DELETE /api/projects/:id`** *(สิทธิ์ Manager/Admin)* — เก็บโปรเจกต์เข้าคลังถาวร (กู้คืนได้ที่ `POST /api/projects/:id/restore`)

### 5.4 แชตทีม, DM 1-ต่อ-1 และไฟล์แนบ / Google Drive (Chat & Drive)
- **`GET /api/chat/sync`** — ดึงห้องแชตทั้งหมด (`channels`), ข้อความล่าสุด (`messages`), และไฟล์ที่แชร์ (`files`) รองรับ `?channelId=ch1`
- **`POST /api/channels`** — สร้างห้องแชตกลุ่มใหม่ `{ "name": "campaign-warroom", "emoji": "🚀", "topic": "ห้องเกาะติดแคมเปญ", "projectId": "p1" }`
- **`POST /api/channels/dm`** — เปิดหรือสร้างห้องสนทนาส่วนตัว 1-ต่อ-1 `{ "targetId": "u2" }` (หรือ `"ai1"`)
- **`POST /api/channels/:id/messages`** — ส่งข้อความเข้าห้องแชตหรือ DM (หากพิมพ์ `@NOVA`, `@PIXEL`, `@BYTE`, `@ORBIT` AI Co-pilot ในห้องจะตอบกลับอัตโนมัติด้วย)
  ```json
  {
    "body": "อัปเดตสถานะงาน MNG-1042 เสร็จเรียบร้อย 100% ครับ",
    "replyTo": "m15"
  }
  ```
- **`GET /api/drive`** — ดูรายการไฟล์และลิงก์โฟลเดอร์ Google Drive ของทีม
- **`POST /api/files/drive-link`** — แชร์ลิงก์ Google Drive เข้าห้องแชต `{ "channelId": "ch1", "name": "Deck Q4.pdf", "url": "https://drive.google.com/..." }`
- **`POST /api/files/upload`** — อัปโหลดไฟล์/รูปภาพ (Data URL Base64 ไม่เกิน 8 MB) `{ "channelId": "ch1", "name": "report.png", "dataUrl": "data:image/png;base64,..." }`

### 5.5 ปฏิทินนัดหมาย (Calendar Events)
- **`GET /api/events`** — ดึงนัดหมาย (รองรับ `?date=2026-11-01`, `?from=2026-11-01&to=2026-11-30`, `?cat=meeting|task|deadline|finance|holiday|personal`)
- **`POST /api/events`** — สร้างนัดหมายใหม่
  ```json
  {
    "title": "ประชุมรีวิว Sprint กับทีมลูกค้า",
    "cat": "meeting",
    "date": "2026-11-03",
    "start": "14:00",
    "end": "15:30",
    "loc": "Google Meet",
    "project": "p1",
    "members": ["u1", "u2"],
    "desc": "ตรวจรับมอบงานเฟส 1"
  }
  ```
- **`PATCH /api/events/:id`** และ **`DELETE /api/events/:id`** — แก้ไขหรือลบนัดหมาย

### 5.6 ลูกค้า CRM & ใบแจ้งหนี้ VAT 7% (Clients & Billing)
- **`GET /api/clients`** (`?q=...`), **`POST /api/clients`**, **`PATCH /api/clients/:id`**, **`DELETE /api/clients/:id`**
- **`GET /api/invoices`** (`?status=draft|sent|paid|overdue&client=c1`)
- **`POST /api/invoices`** — สร้างใบแจ้งหนี้ใหม่ (ออกเลข `INV-2026-0XX` และคำนวณ VAT 7% อัตโนมัติ)
  ```json
  {
    "client": "c1",
    "title": "บริการดูแลระบบและแคมเปญรายเดือน พ.ย. 2026",
    "amount": 65000,
    "due": "2026-11-30",
    "status": "sent",
    "items": [{ "d": "Retainer Package", "q": 1, "p": 65000 }]
  }
  ```
- **`POST /api/invoices/:id/pay`** — บันทึกรับชำระเงิน (`status = 'paid'`)

### 5.7 AI Workforce, HR เช็กอิน/ใบลา & จองห้องประชุม (Agency OS)
- **`POST /api/ai/dispatch`** — สั่งรัน AI Agent ภายใน ERP (`{ "agentId": "ai1", "prompt": "วิเคราะห์งานคอขวดสัปดาห์นี้", "postToFeed": true }`)
- **`GET /api/teams`** — ดูรายชื่อทีมงานและสถานะออนไลน์ (`online`, `working`, `focus`, `away`)
- **`POST /api/teams/presence`** — อัปเดตสถานะการทำงาน (`{ "presence": "working" }`)
- **`POST /api/checkins/clock`** — ลงเวลาเข้างาน (`{ "mode": "office", "note": "พร้อมลุยงาน" }`)
- **`POST /api/leaves`** — ยื่นใบลา/WFH (`{ "kind": "wfh", "startDate": "2026-11-04", "endDate": "2026-11-04", "days": 1, "reason": "ทำงานที่บ้าน" }`)
- **`POST /api/bookings`** — จองห้องประชุม/สตูดิโอ/อุปกรณ์ พร้อมระบบตรวจคิวชนอัตโนมัติ (`{ "roomId": "rm1", "title": "ถ่ายทำสินค้า", "date": "2026-11-05", "startTime": "13:00", "endTime": "16:00" }`)

---

## 6. รหัสสถานะ HTTP และการแก้ไขปัญหา (Troubleshooting)

| HTTP Code | Error Key | สาเหตุและวิธีแก้ไข |
|---|---|---|
| `200` / `201` | — | สำเร็จ พร้อมแนบ Header `X-Token-Slot` บอกหมายเลข Token ที่ใช้งาน |
| `400` | `missing_credentials` / `*_required` | ลืมส่ง `email`/`password` ตอนล็อกอิน หรือส่งฟิลด์บังคับไม่ครบ |
| `401` | `unauthorized` / `invalid_api_token` | ไม่ได้แนบ Token หรือ Token ถูก Rotate/หมดอายุ → ให้เรียก `POST /api/hermes/login` ด้วย `email`/`password` เพื่อรับชุดใหม่ |
| `401` | `strict_dual_auth_required` | บัญชีเปิดโหมด Strict Dual-Auth ไว้ → ต้องแนบ Header `X-Auth-Email` และ `X-Auth-Password` มาพร้อมกับ Token |
| `403` | `บัญชีนี้ถูกระงับการใช้งาน` / `สิทธิ์ไม่พอ` | บัญชีไม่ได้มีสถานะ `active` ใน `pacific_mng.users` หรือต้องการสิทธิ์ `manager`/`admin` |
| `409` | `ช่วงเวลาดังกล่าวมีการจองแล้ว` | คิวจองห้องประชุม/สตูดิโอทับซ้อนกับรายการอื่น |
| `503` | `db_unavailable` | เซิร์ฟเวอร์ฐานข้อมูล MariaDB กำลังเชื่อมต่อใหม่ ให้เว้นจังหวะ 2–3 วินาทีแล้วลองอีกครั้ง |

---

## 7. ลิงก์เอกสารสำหรับให้ AI อ่านจาก URL โดยตรง
เซิร์ฟเวอร์เปิดให้ Hermes หรือ AI ภายนอกดึงไฟล์คู่มือและสคริปต์ล่าสุดจาก URL ได้ทันที:
- คู่มือ API ฉบับเต็ม (Markdown): `https://mng.uarea.in/api/hermes/manual.md`
- ไฟล์ Hermes Skill (`SKILL.md`): `https://mng.uarea.in/api/hermes/skill.md`
- Python CLI Client (20-Token Round-Robin): `https://mng.uarea.in/api/hermes/client.py`
