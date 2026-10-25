#!/usr/bin/env bash
# scripts/check-pages.sh — ตรวจว่าทุกหน้า render ถูกต้องบน local server (AGENTS.md ข้อ 2)
# ใช้: bash scripts/check-pages.sh [BASE_URL]
# ต้องรัน server ไว้ก่อน (npm run dev:server) — สคริปต์นี้จะไม่ start server ให้
set -uo pipefail

BASE="${1:-http://127.0.0.1:8080}"
PORT="${PORT:-8080}"

FAIL=0
PASS=0

ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
hr()  { echo "────────────────────────────────────────────"; }

# check_page "<path>" "<ข้อความที่ต้องเจอในหน้า>" "<ข้อความที่ต้องไม่เจอ>"
check_page() {
  local path="$1" must="$2" must_not="${3:-หน้าขาว}"
  local body code ctype
  body=$(curl -s "$BASE$path" 2>/dev/null)
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" 2>/dev/null)

  if [ "$code" != "200" ]; then
    bad "$path → HTTP $code (ต้องเป็น 200)"
    return
  fi
  if echo "$body" | grep -qF "$must"; then
    ok "$path → HTTP 200 + เจอ '$must'"
  else
    bad "$path → HTTP 200 แต่ไม่เจอ '$must'"
  fi
  if [ -n "$must_not" ] && echo "$body" | grep -qF "$must_not"; then
    bad "$path → ยังพบ '$must_not'"
  fi
}

echo "== ตรวจหน้าทั้งหมดที่ $BASE =="
hr
check_page "/login/"     "MNG"
check_page "/dashboard/" "dashboard"
check_page "/tasks/"     "งาน"
check_page "/projects/"  "โปรเจกต์"
check_page "/team/"      "ทีม"
check_page "/finance/"   "การเงิน"
check_page "/calendar/"  "ปฏิทิน"
check_page "/reports/"   "รายงาน"
check_page "/clients/"   "ลูกค้า"
check_page "/settings/"  "ตั้งค่า"
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
CSS=$(curl -s -o /dev/null -w "%{content_type}" "$BASE/_next/static/chunks/$(ls server/public/_next/static/chunks 2>/dev/null | grep '\.css$' | head -1)" 2>/dev/null)
if [ "$CSS" = "text/css" ]; then
  ok "CSS → content_type = text/css"
else
  bad "CSS → content_type = '$CSS' (ต้องเป็น text/css)"
fi
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
echo "✅ ทุกหน้าผ่าน — ขอบาทสามารถ deploy ได้"
exit 0
