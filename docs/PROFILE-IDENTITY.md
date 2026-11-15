# โปรไฟล์ บัญชีผู้ใช้ และการเข้าสู่ระบบด้วย Google / LINE

ฟีเจอร์นี้ใช้ **Vanilla JS SPA + Express และฐาน MariaDB เดิม** ไม่สร้างบัญชี MNG Hub อัตโนมัติ และไม่ต้องใช้การเชื่อม Gmail ใน Arena เพื่อใช้งาน ERP

## การใช้งาน

1. ผู้ใช้ทุกสิทธิ์ (`user`, `manager`, `admin`, `super_admin`, `viewer`) เปิด **โปรไฟล์ของฉัน** จากรูปบัญชีบนแถบเมนู หรือรูปด้านล่างแถบไอคอน บันทึกชื่อจริง นามสกุล ประวัติ และความสามารถ (คั่นด้วยจุลภาค/ขึ้นบรรทัดใหม่ สูงสุด 20 รายการ) แยกจากการบันทึกข้อมูลบัญชี
2. เลือกภาพ JPG, PNG หรือ WebP ไม่เกิน 8 MB เบราว์เซอร์จะย่อและแปลงเป็น JPEG ก่อนบันทึกลง MariaDB (สูงสุด 256 KB และ 1024 × 1024 พิกเซลฝั่ง API) เปลี่ยนหรือลบได้ทันที รูปแสดงในโปรไฟล์และ avatar บัญชีของตัวเอง
3. ชื่อแสดงผลและอีเมลบันทึกใน `pacific_mng.users` จึงมีผลกับ MNG Hub ด้วย การเปลี่ยนอีเมลของตัวเองต้องยืนยันรหัสผ่าน ERP ปัจจุบัน เมื่อเจ้าของหรือ Admin เปลี่ยนอีเมล ระบบจะ **ล้างสถานะยืนยันอีเมลเดิม** แต่ ERP ยังไม่มีการส่งอีเมลยืนยันที่อยู่ใหม่ ควรตรวจที่อยู่ให้ถูกต้องและประสานผู้ดูแล Hub เรื่องการยืนยันก่อนใช้กับระบบที่บังคับยืนยันอีเมล การล็อกอิน ERP ด้วยอีเมล/รหัสผ่านยังใช้ได้ เมื่อมีสมาชิกทีมที่ตรงกัน ระบบพยายามผูกด้วย `auth_user_id` ก่อนเปลี่ยนเพื่อรักษาความสัมพันธ์เดิม หากมีหลายรายการจะให้ผู้ดูแลตรวจสอบก่อน และถ้าขั้นตอนซิงก์ทีมภายหลังไม่สำเร็จจะแจ้งเตือนให้ตรวจสอบ
4. รูป ประวัติ ชื่อจริง นามสกุล และความสามารถในหน้านี้อ่านและแก้ไขได้ผ่าน API ของ **เจ้าของบัญชีเท่านั้น** ไม่ได้เผยแพร่ไปยังหน้าทีมหรือซิงก์ทักษะของ `erp_team` โดยอัตโนมัติ ผู้ดูแลฐานข้อมูลและผู้เข้าถึง backup ยังอาจเข้าถึงข้อมูลได้ตามสิทธิ์โครงสร้างพื้นฐาน
5. **ผู้ใช้และสิทธิ์** เป็นหน้าแยกสำหรับ `admin` / `super_admin` เท่านั้น ส่วน Manager/User แม้พิมพ์ URL โดยตรงก็เรียก API รายชื่อหรือแก้ไขสิทธิ์ผู้อื่นไม่ได้ Admin สร้างบัญชี แก้ไขสิทธิ์/สถานะ รีเซ็ตรหัสผ่าน และดูเฉพาะสถานะ Google / LINE ของผู้ใช้ได้; ไม่เห็น subject หรือประวัติส่วนตัวจากหน้านี้

### ผูกบัญชีและเข้าสู่ระบบ

- เมื่อผู้ดูแลตั้งค่าผู้ให้บริการแล้ว ให้เข้าสู่ระบบ ERP ด้วย **อีเมลและรหัสผ่านเดิมก่อน** เปิดโปรไฟล์ → บัญชีที่เชื่อมต่อ → เลือก Google หรือ LINE → ยืนยันรหัสผ่าน ERP → เลือกบัญชีที่ผู้ให้บริการ เมื่อกลับมาสถานะจะแสดงว่าเชื่อมต่อแล้ว
- หลังจากผูกแล้ว ปุ่ม Google / LINE ที่หน้าเข้าสู่ระบบจะเข้าสู่บัญชี ERP เดิมได้ ระบบใช้ **subject ID ที่ผู้ให้บริการยืนยันแล้ว** ไม่จับคู่หรือสร้างบัญชีจากอีเมลที่ตรงกันโดยอัตโนมัติ ผู้ใช้แต่ละบัญชีผูกได้อย่างละหนึ่งบัญชี และบัญชีภายนอกหนึ่งบัญชีผูกกับ ERP ได้เพียงหนึ่งบัญชี
- Google ขอสิทธิ์ `openid email` เพื่อยืนยันตัวตนและแสดงอีเมลที่ Google ยืนยันแล้ว ไม่ขอสิทธิ์อ่าน/ส่ง Gmail; LINE ขอ `openid` เพื่อยืนยันตัวตน ไม่อ่านหรือส่งข้อความ LINE บริการนี้ไม่ส่งการแจ้งเตือนและไม่ได้เชื่อม LINE OA
- ยกเลิกการผูกจากโปรไฟล์โดยยืนยันรหัสผ่าน ERP ได้แม้ผู้ดูแลปิดการตั้งค่า provider แล้ว; อีเมลและรหัสผ่าน ERP เดิมยังใช้งานได้ คำขอผูกที่กำลังดำเนินการของ provider นั้นจะถูกยกเลิกด้วย แต่ session เว็บที่มีอยู่ยังใช้งานได้ การยกเลิกเป็นการตัดความสัมพันธ์ใน ERP ไม่ใช่การเพิกถอนสิทธิ์ในหน้าจัดการบัญชีของ Google/LINE
- **การเปลี่ยนหรือรีเซ็ตรหัสผ่านไม่ได้ยกเลิกบัญชีภายนอกที่ผูกไว้** หากบัญชีภายนอกถูกขโมย ให้ Admin ระงับบัญชี ERP ก่อน แล้วกดปุ่ม 🔗 ในหน้าผู้ใช้เพื่อยกเลิกการผูกของผู้ใช้นั้น โดยยืนยันรหัสผ่าน Admin การยกเลิกโดย Admin จะลบ session เว็บทั้งหมดของผู้ใช้ด้วย แม้บัญชีกำลังถูกระงับ แต่ **ไม่ลบ Hermes API token** ให้เพิกถอนชุด Hermes แยกต่างหากหากจำเป็น Admin ธรรมดาจัดการบัญชี Super Admin คนอื่นไม่ได้
- โหมดสาธิตไม่มีบัญชีจริงหรือการผูกจริง ต้องเชื่อมฐานข้อมูลและเข้าสู่ระบบก่อนใช้งาน

## ตั้งค่า Google และ LINE สำหรับผู้ดูแล

ฟีเจอร์ปิดโดยปริยายจนกว่าจะตั้งค่าฝั่งเซิร์ฟเวอร์ ต้องมีสิทธิ์สร้างตารางใหม่ในฐานงาน สำรองฐานข้อมูลก่อน deploy และตรวจ log/`/api/db/audit` หลังเริ่มระบบ อย่าใส่ client secret หรือรหัสผ่านจริงใน Git หรือ JavaScript

ก่อนเปิดใช้งานควรตรวจว่า `erp_team.auth_user_id` ที่มีอยู่ตรงกับเจ้าของบัญชีในฐาน auth และไม่มีสมาชิกหลายแถวผูกกับผู้ใช้เดียวกัน เพราะระบบใช้ ID นี้ก่อนจับคู่อีเมลเพื่อรักษาประวัติลงเวลาเมื่อเปลี่ยนอีเมล หากพบข้อมูลไม่ตรงกันให้ผู้ดูแลแก้ไขก่อน

1. กำหนด **HTTPS origin เดียวที่ผู้ใช้เข้าจริง** ใน `OAUTH_PUBLIC_URL` เช่น `https://erp.example.com` (ไม่มี path, query หรือ fragment) คำขอเริ่ม/รับผลต้องมาจาก origin นี้ ไม่อิง `Host` header สามารถใช้ `http://localhost` หรือ `http://127.0.0.1` เฉพาะเครื่องพัฒนาด้วย `OAUTH_ALLOW_HTTP_LOCAL=1` เท่านั้น ห้ามเปิดตัวเลือกนี้เพื่อใช้ HTTP ภายนอก
2. ใน Google Cloud Console สร้าง OAuth client ชนิด **Web application** ตั้ง consent screen และกำหนด redirect URI ให้ตรงทุกตัวอักษร:
   - `https://erp.example.com/api/oauth/google/callback`
   - ตั้งค่า `GOOGLE_OAUTH_CLIENT_ID` และ `GOOGLE_OAUTH_CLIENT_SECRET` ใน environment ที่เก็บเป็นความลับ หาก consent screen ยังเป็น Testing ต้องเพิ่มบัญชีทดสอบตามข้อกำหนดของ Google ก่อน
3. ใน LINE Developers สร้าง **LINE Login channel** (ไม่ใช่ Messaging API channel) ตั้ง callback URL:
   - `https://erp.example.com/api/oauth/line/callback`
   - ใช้ Channel ID เป็น `LINE_OAUTH_CLIENT_ID` และ Channel secret เป็น `LINE_OAUTH_CLIENT_SECRET` ตรวจสถานะการเผยแพร่และบัญชีที่อนุญาตตามการตั้งค่า LINE
4. รีสตาร์ต Express/Passenger ตามขั้นตอนของเซิร์ฟเวอร์ ให้เครื่องออก HTTPS ไปยัง `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `access.line.me` และ `api.line.me` ได้ ปุ่มจะเปิดเมื่อมี URL, ID และ secret ครบ **สถานะตั้งค่าแล้วไม่ได้ยืนยันว่า credential, callback, เครือข่าย หรือ consent ใช้งานได้จริง** ทดสอบด้วยบัญชีทดสอบขององค์กรก่อนเปิดให้ทุกคนใช้
5. ตรวจ HTTPS, reverse proxy และนาฬิกาเซิร์ฟเวอร์ให้ตรงเวลา (NTP) กำหนด access log ไม่ให้เก็บ query string ของ `/api/oauth/*/callback` เพราะมี authorization code และ state ชั่วคราว ควรตั้ง rate limit ที่ reverse proxy สำหรับการเข้าสู่ระบบและการยืนยันรหัสผ่าน และกำหนดนโยบายเก็บรักษาข้อมูลตามองค์กร

## API สำหรับหน้าเว็บ

ทุก `/api/users/...` ต้องผ่าน session ที่เข้าสู่ระบบแล้ว โดย `/me` ใช้ตัวตนจาก session ไม่รับ user ID หรือ role จาก body ส่วนหน้า Admin ตรวจสิทธิ์ซ้ำฝั่งเซิร์ฟเวอร์

| Method | Path | การใช้งาน |
|---|---|---|
| `GET` / `PATCH` | `/api/users/me` | อ่านบัญชี / แก้ `name`, `email`, `currentPassword` (ต้องมีรหัสผ่านเมื่อเปลี่ยนอีเมล) |
| `GET` / `PUT` | `/api/users/me/profile` | อ่าน/แทนค่ารายละเอียดส่วนตัว `firstName`, `lastName`, `biography`, `skills` (array) |
| `PUT` | `/api/users/me/profile/avatar` | `image` เป็น `data:image/jpeg;base64,...` หรือ `null` เพื่อลบ |
| `GET` | `/api/users/me/connections` | สถานะ provider ของตนเอง ไม่ส่ง subject |
| `POST` / `DELETE` | `/api/users/me/connections/{google\|line}/start`, `/api/users/me/connections/{google\|line}` | เริ่มผูก / ยกเลิกผูก โดยส่ง `{ "password": "รหัสผ่าน ERP ปัจจุบัน" }` ผ่าน HTTPS และใช้ web session |
| `GET` / `DELETE` | `/api/users/{id}/connections`, `/api/users/{id}/connections/{google\|line}` | เฉพาะ Admin ดูสถานะ / ยืนยันรหัสผ่าน Admin เพื่อยกเลิกของผู้อื่นและลบ web session ทั้งหมด |
| `GET` / `POST` | `/api/oauth/providers`, `/api/oauth/{google\|line}/start` | ตรวจว่า provider ตั้งค่าหรือไม่ / เริ่ม sign-in สำหรับบัญชีที่ผูกไว้แล้ว |

`/api/oauth/{provider}/callback` และ `/api/oauth/complete` เป็นส่วนของ redirect/cookie แบบใช้ครั้งเดียวสำหรับเบราว์เซอร์ ไม่ใช่ endpoint ให้คัดลอก code หรือ session token ไปใช้ด้วยตนเอง ดูข้อกำหนด Hermes ใน [API-MANUAL.md](API-MANUAL.md)

## ข้อมูล เทคนิค และข้อจำกัด

- เพิ่มเฉพาะตารางใน `pacific_mngworks`: `erp_user_profiles`, `erp_oauth_identities`, `erp_oauth_states`, `erp_oauth_results` ไม่มีการเพิ่มคอลัมน์ในฐาน auth เดิม ตาราง identity เก็บ provider, subject แบบ case-sensitive, auth user ID และอีเมล Google ที่ยืนยันแล้ว (ถ้ามี) **ไม่เก็บ provider access token หรือ refresh token** รูปเก็บเป็น BLOB ไม่เขียนลง `/uploads` การสำรองฐานงานจึงรวมข้อมูลส่วนตัวและรูปด้วย
- ใช้ OAuth authorization code + PKCE S256, state ผูกกับ HttpOnly SameSite cookie และ nonce แบบใช้ครั้งเดียว Google ตรวจลายเซ็น ID token ด้วย public key ของ Google พร้อมตรวจ issuer/audience/nonce/วันหมดอายุ ส่วน LINE ตรวจ ID token ที่ endpoint อย่างเป็นทางการพร้อมตรวจ claims ซ้ำ การเชื่อมต้องมี session เว็บที่ยังใช้ได้และรหัสผ่าน ERP
- callback ออกตั๋วสั้น ๆ ใน HttpOnly cookie แล้วหน้าเว็บแลก session ครั้งเดียวผ่าน same-origin POST โดยไม่ใส่ session token ใน URL โปรไฟล์ไม่เก็บใน localStorage แต่ระบบเดิมยังเก็บ **session bearer token** ใน localStorage ตามสถาปัตยกรรมปัจจุบัน จึงต้องป้องกัน XSS และใช้ HTTPS เสมอ ตั๋ว/สถานะหมดอายุถูกลบเมื่อมีคำขอครั้งถัดไป (อาจตั้งงานล้างข้อมูลหมดอายุเพิ่มเติมตามนโยบาย)
- Profile และ auth อยู่คนละฐาน ไม่มี distributed transaction การอัปเดตอีเมลจดความสัมพันธ์สมาชิกก่อน แล้วอัปเดตบัญชีและซิงก์ทีม หากขั้นซิงก์ภายหลังล้มเหลว บัญชีอาจเปลี่ยนแล้วและ UI จะแจ้งเตือน อย่ากดเปลี่ยนอีเมลซ้ำโดยไม่ตรวจข้อมูลทั้งสองฐาน; สำรองข้อมูลและให้ auth DB บังคับ unique index ของ email เพื่อกันคำขอพร้อมกัน
- OAuth ออก web session สำหรับ ERP เท่านั้น **Hermes API Login ยังต้องใช้ email/password** เพื่อรับชุด API token ตามสัญญาเดิม ไม่ส่ง Gmail หรือ LINE token ให้ Hermes
- รัน `npm test`; ชุดทดสอบ SQL ต้องเลือกใช้ MariaDB แยกด้วย `MNG_TEST_DB_ALLOW_CREATE=1` และ `MNG_TEST_DB_SOCKET` ตาม [PROJECT-FLOW.md](PROJECT-FLOW.md) การทดสอบใน repo ใช้ผู้ให้บริการ OAuth จำลอง ไม่ใช่หลักฐานว่า credential/บัญชี Google หรือ LINE ขององค์กรพร้อมใช้งานจริง

เอกสารผู้ให้บริการ: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [LINE Login และ PKCE](https://developers.line.biz/en/docs/line-login/integrate-pkce/), [LINE Verify ID token](https://developers.line.biz/en/reference/social-api/#verify-id-token)
