#!/usr/bin/env bash
# scripts/verify.sh — ตรวจสอบความถูกต้องก่อน commit (ตาม AGENTS.md ข้อ 1)
# ใช้: npm run verify
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
PASS=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

hr()   { echo "────────────────────────────────────────────"; }

echo "== 1. lint =="
hr
if [ -x node_modules/.bin/eslint ]; then
  if npm run lint > /tmp/verify-lint.log 2>&1; then
    ok "eslint ผ่าน (exit 0)"
  else
    bad "eslint ล้มเหลว — ดู /tmp/verify-lint.log"
    grep -E "error|Error" /tmp/verify-lint.log | head -10
  fi
else
  bad "ยังไม่ได้ติดตั้ง dependencies — รัน npm ci ก่อน"
fi
hr

echo "== 2. test =="
hr
if [ -x node_modules/.bin/vitest ]; then
  if ./node_modules/.bin/vitest run > /tmp/verify-test.log 2>&1; then
    ok "vitest ผ่านทั้งหมด"
  else
    bad "vitest ล้มเหลว — ดู /tmp/verify-test.log"
    grep -E "×|FAIL|failed" /tmp/verify-test.log | head -10
  fi
else
  bad "ไม่พบ vitest — รัน npm ci ก่อน"
fi
hr

echo "== 3. build =="
hr
if [ -d web/node_modules ]; then
  if (cd web && npm run build) > /tmp/verify-build.log 2>&1; then
    ok "next build สำเร็จ"
  else
    bad "next build ล้มเหลว — ดู /tmp/verify-build.log"
    grep -E "Error|error|failed" /tmp/verify-build.log | head -10
  fi
else
  bad "web/node_modules ยังไม่มี — รัน npm ci ใน web/ ก่อน"
fi
hr

echo ""
echo "ผลลัพธ์: ${PASS} ผ่าน / ${FAIL} ล้มเหลว"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "⛔ ห้าม commit — ต้องแก้ให้ผ่านทั้งหมดก่อน (AGENTS.md ข้อ 1)"
  exit 1
fi
echo "✅ ผ่านทั้งหมด — ขอบาทสามารถ commit ได้"
exit 0
