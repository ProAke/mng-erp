# คู่มือด่วน: เชื่อมต่อ Hermes Agent เข้ากับ MNG ERP (ภายใน 2 นาที)

ไฟล์นี้สรุปขั้นตอนติดตั้ง **Skill `mng-erp`** ให้กับ **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** หรือสั่งให้ AI Agent ใดๆ (Claude Code, Cursor, Codex, OpenClaw, n8n) เชื่อมต่อเข้าใช้งาน **MNG ERP** ด้วยบัญชีตัวเอง (`email` + `password`) พร้อมระบบหมุนเวียน **20 API Tokens** อัตโนมัติ

---

## วิธีที่ 1: ติดตั้งเป็น Skill มาตรฐานใน Hermes Agent (`~/.hermes/skills/mng-erp`)

รันคำสั่งด้านล่างบนเครื่องที่ติดตั้ง Hermes Agent เพื่อดึง `SKILL.md` และ `mng_erp_client.py` จากเซิร์ฟเวอร์ MNG ERP โดยตรง:

```bash
mkdir -p ~/.hermes/skills/mng-erp/scripts

curl -fsSL https://mng.uarea.in/api/hermes/skill.md \
  -o ~/.hermes/skills/mng-erp/SKILL.md

curl -fsSL https://mng.uarea.in/api/hermes/client.py \
  -o ~/.hermes/skills/mng-erp/scripts/mng_erp_client.py

chmod +x ~/.hermes/skills/mng-erp/scripts/mng_erp_client.py
```

จากนั้นตั้งค่าบัญชีของ AI ใน Environment (หรือใน `~/.hermes/.env`):

```bash
export MNG_ERP_URL="https://mng.uarea.in"
export MNG_ERP_EMAIL="hermes@mng.co.th"
export MNG_ERP_PASSWORD="รหัสผ่านของบัญชี_AI"
```

ทดสอบให้ Hermes ล็อกอินด้วยตัวเองและตรวจการหมุนเวียน 20 Tokens:

```bash
python3 ~/.hermes/skills/mng-erp/scripts/mng_erp_client.py login
python3 ~/.hermes/skills/mng-erp/scripts/mng_erp_client.py whoami   # ใช้ Token Slot #1
python3 ~/.hermes/skills/mng-erp/scripts/mng_erp_client.py overview # ใช้ Token Slot #2 (วนถึง #20 อัตโนมัติ)
```

เมื่อเริ่มคุยกับ Hermes สามารถสั่งเป็นภาษาไทยได้เลย เช่น:
- *"ช่วยดึงภาพรวมงานด่วนและบิลค้างชำระใน MNG ERP วันนี้ให้หน่อย"*
- *"สร้างการ์ดงานใหม่ในโปรเจกต์ p1 ชื่อ 'เตรียมสไลด์ประชุมลูกค้า Q4' ความสำคัญ high กำหนดส่ง 2026-11-10"*
- *"ส่งข้อความแจ้งความคืบหน้าเข้าห้องแชต ch1 ใน MNG ERP"*
- *"อ่านผังและรายการงานที่เชื่อมกับโปรเจกต์ p1 แล้วสรุปสถานะให้หน่อย"*

## Project Flow และการส่งออกอย่างปลอดภัย

Hermes ใช้คำสั่งทั่วไปอ่านผังได้ เช่น `python3 ~/.hermes/skills/mng-erp/scripts/mng_erp_client.py request GET /api/projects/p1/flow` ส่วน `/api/projects/:id/flow/actions` ต้องใช้บัญชี Manager/Admin อ่านคู่มือ [Project Flow AI & Webhook](FLOW-INTEGRATIONS.md) หรือเรียก `{MNG_ERP_URL}/api/hermes/flow-integrations.md`

การสั่ง AI จริงส่งข้อมูลไปผู้ให้บริการ และการส่ง webhook อาจนำข้อมูลไปเผยแพร่หรือส่งลูกค้าได้ ต้องขออนุญาตคนชัดเจนก่อน `generate`, `approve`, `send` หรือ `reconcile` โหลด revision ล่าสุดทุกครั้ง และไม่ retry เองเมื่อผลไม่แน่นอน `accepted` หมายถึง webhook ตอบรับ ไม่ยืนยันผลปลายทาง การสั่งงาน `/api/ai/dispatch` เดิมและคำตอบ @AI ใน Chat เป็นการจำลอง ไม่ได้เรียกโมเดลจริง

---

## วิธีที่ 2: Prompt สำเร็จรูปสำหรับโยนให้ AI ตัวใดก็ได้เชื่อมต่อทันที

หากคุณใช้งาน AI Agent ตัวอื่นที่มีเครื่องมือรัน Terminal/HTTP สามารถคัดลอกข้อความด้านล่างส่งให้ AI ได้ทันที:

```text
เชื่อมต่อกับระบบ MNG ERP ที่ https://mng.uarea.in โดยทำตามขั้นตอนนี้:
1. อ่านไฟล์ Skill และคู่มือ API จาก https://mng.uarea.in/api/hermes/skill.md และ https://mng.uarea.in/api/hermes/manual.md
2. ดาวน์โหลดไคลเอนต์ https://mng.uarea.in/api/hermes/client.py (รองรับการล็อกอินและวนใช้งาน 20 API Tokens แบบ Round-Robin อัตโนมัติ)
3. ใช้บัญชี MNG_ERP_EMAIL="<อีเมลบัญชี AI>" และ MNG_ERP_PASSWORD="<รหัสผ่านบัญชี AI>" ล็อกอินผ่านคำสั่ง login แล้วดึง overview มารายงานผล
```
