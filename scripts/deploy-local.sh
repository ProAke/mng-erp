#!/usr/bin/env bash
# scripts/deploy-local.sh — รัน local + ตรวจทุกหน้า ก่อน deploy (AGENTS.md ข้อ 2 & 4)
# ใช้: npm run deploy:local
# ขั้นตอน: verify → build → start server → check pages → stop server
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-4050}"
BASE="http://127.0.0.1:$PORT"
PID=""

hr() { echo "════════════════════════════════════════════"; }

hr
echo "  MNG ERP — deploy local pre-flight"
hr
echo ""

# 1) verify (lint + test + build)
echo "[1/4] ตรวจสอบความถูกต้อง (lint / test / build)"
if ! npm run verify; then
  hr
  echo "⛔ หยุด — ยังไม่ผ่านการตรวจสอบ (AGENTS.md ข้อ 1)"
  hr
  exit 1
fi
echo ""

# 2) build ลง server/public
echo "[2/4] sync build output → server/public"
rm -rf server/public
mkdir -p server/public
cp -r web/out/* server/public/
if [ ! -f server/public/index.html ]; then
  echo "⛔ build output ไม่สำเร็จ (ไม่พบ server/public/index.html)"
  exit 1
fi
echo "  ✅ server/public/index.html พร้อม"
echo ""

# 3) start server
echo "[3/4] เริ่ม local server ที่ $BASE"
# ถ้า port ไม่ว่าง ให้ใช้ port อื่น
if lsof -ti:"$PORT" > /dev/null 2>&1; then
  echo "  ⚠ port $PORT ไม่ว่าง — กำลังหา port ว่าง"
  PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')
  BASE="http://127.0.0.1:$PORT"
fi
(cd server && PORT="$PORT" node index.js > /tmp/mng-local-server.log 2>&1) &
PID=$!
sleep 5

if ! kill -0 "$PID" 2>/dev/null; then
  echo "⛔ server ตายก่อนทันรัน — ดู /tmp/mng-local-server.log"
  cat /tmp/mng-local-server.log | tail -20
  exit 1
fi
echo "  ✅ server รันอยู่ (pid $PID) ที่ $BASE"
echo ""

# 4) check pages
echo "[4/4] ตรวจทุกหน้า"
bash scripts/check-pages.sh "$BASE"
RC=$?

# cleanup
kill "$PID" 2>/dev/null
wait "$PID" 2>/dev/null

hr
if [ "$RC" -eq 0 ]; then
  echo "  ✅ pre-flight ผ่าน — พร้อม deploy"
else
  echo "  ⛔ pre-flight ล้มเหลว — ห้าม deploy"
fi
hr
exit $RC
