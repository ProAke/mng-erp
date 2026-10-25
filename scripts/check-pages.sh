#!/usr/bin/env bash
# scripts/check-pages.sh — ตรวจว่าทุกหน้า render ถูกต้องบน local server (AGENTS.md ข้อ 2)
# ใช้: bash scripts/check-pages.sh [BASE_URL]
# ต้องรัน server ไว้ก่อน — สคริปต์นี้จะไม่ start server ให้
set -uo pipefail

BASE="${1:-http://127.0.0.1:8080}"

FAIL=0
PASS=0

ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
hr()  { echo "────────────────────────────────────────────"; }

# เกณฑ์ที่ใช้ได้จริงกับ Next.js static export:
#   หน้าทุกหน้า render เป็น HTML ที่มี <title> และ ธีมเข้ม (bg-slate-950) เสมอ
#   เนื้อหาจริงของหน้าที่อยู่ใน route group (app) จะถูกห่อด้วย <AppShell>
#   ซึ่ง SSR ได้แค่สถานะ "กำลังตรวจสอบสถานะ…" — เนื้อหาจริงต้อง hydrate ด้วย JS
#   ดังนั้นการเช็คจาก curl จึงต้องเช็ค "หน้าไม่ขาว / ไม่พัง" ไม่ใช่เนื้อหาจริง
# เนื้อหาจริงต้องตรวจด้วย browser (ดู scripts/browser-check.sh)

check_page() {
  local path="$1" title="$2"
  local body code
  body=$(curl -s "$BASE$path" 2>/dev/null)
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" 2>/dev/null)

  if [ "$code" != "200" ]; then
    bad "$path → HTTP $code (ต้องเป็น 200)"
    return
  fi
  if echo "$body" | grep -q "bg-slate-950"; then
    ok "$path → HTTP 200 + ธีมเข้ม"
  else
    bad "$path → HTTP 200 แต่ไม่ใช่ธีมเข้ม (ขาว?)"
  fi
  # หมายเหตุ: ห้ามเช็คว่า "ไม่มีคำว่า 404" — Next.js ฝัง 404 template ไว้ในทุกหน้า
  # จึงเจอ "404" ในทุกหน้าแม้หน้าจะโหลดถูกต้อง
}

echo "== ตรวจหน้าทั้งหมดที่ $BASE =="
hr
check_page "/login/"      "login"
check_page "/dashboard/"  "dashboard"
check_page "/tasks/"      "tasks"
check_page "/projects/"   "projects"
check_page "/team/"       "team"
check_page "/finance/"    "finance"
check_page "/calendar/"   "calendar"
check_page "/reports/"    "reports"
check_page "/clients/"    "clients"
check_page "/settings/"   "settings"
check_page "/projects/detail/" "project detail"
hr

echo "== ตรวจ root redirect =="
hr
ROOT_BODY=$(curl -s "$BASE/" 2>/dev/null)
if echo "$ROOT_BODY" | grep -q "login\|dashboard\|กำลังตรวจสอบสถานะ"; then
  ok "/ → มี redirect logic (login/dashboard)"
else
  bad "/ → ไม่พบ redirect logic — อาจค้างหรือหน้าขาว"
fi
if echo "$ROOT_BODY" | grep -q "bg-slate-950"; then
  ok "/ → ใช้ธีมเข้ม (bg-slate-950)"
else
  bad "/ → ไม่ใช่ธีมเข้ม"
fi
hr

echo "== ตรวจ static assets =="
hr
CSS_URL="$BASE/_next/static/chunks/$(ls server/public/_next/static/chunks 2>/dev/null | grep '\.css$' | head -1)"
CSS=$(curl -s -o /dev/null -w "%{content_type}" "$CSS_URL" 2>/dev/null)
# Express จะใส่ charset เพิ่ม (text/css; charset=UTF-8) — เช็คแบบ prefix
case "$CSS" in
  text/css*) ok "CSS → content_type = $CSS" ;;
  *)         bad "CSS → content_type = '$CSS' (ต้องขึ้นต้นด้วย text/css)" ;;
esac
hr

echo "== ตรวจ API =="
hr
HEALTH=$(curl -s "$BASE/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "/api/health → {\"ok\":true,...}"
else
  bad "/api/health → $HEALTH"
fi
hr

echo ""
echo "ผลลัพธ์: ${PASS} ผ่าน / ${FAIL} ล้มเหลว"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "⛔ ห้าม deploy — ต้องแก้ให้ผ่านทุกหน้าก่อน (AGENTS.md ข้อ 2)"
  exit 1
fi
echo "✅ ทุกหน้าผ่าน (ความหมายเชิงโครงสร้าง) — ยังต้องตรวจเนื้อหาจริงด้วย browser"
exit 0
