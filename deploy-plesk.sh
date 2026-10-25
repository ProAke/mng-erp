#!/usr/bin/env bash
# deploy-plesk.sh — สคริปต์อัปเดตและรีสตาร์ท MNG ERP บน Plesk แบบทั้งก้อน (ไม่แตะ server/.env และ server/uploads)
# วิธีใช้บน Plesk Git (Enable additional deploy actions) หรือรันผ่าน SSH:
#   bash deploy-plesk.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "=== [1/4] ตรวจสอบและลบ index.html เก่าที่ root (กัน Nginx เสิร์ฟทับหน้าแรก /) ==="
if [ -f "$ROOT_DIR/index.html" ]; then
  mv -f "$ROOT_DIR/index.html" "$ROOT_DIR/legacy-spa.html"
  echo "  -> ย้าย index.html เก่าไปเป็น legacy-spa.html เรียบร้อย"
fi

echo "=== [2/4] ติดตั้ง dependencies ฝั่ง Backend (server/) ==="
(cd "$ROOT_DIR/server" && npm install --omit=dev --no-audit --no-fund)

echo "=== [3/4] ตรวจสอบไฟล์ Static Export (server/public/) ==="
for p in "index.html" "login/index.html" "dashboard/index.html" "ai/index.html" "chat/index.html" "hr/index.html" "rooms/index.html"; do
  if [ ! -f "$ROOT_DIR/server/public/$p" ]; then
    echo "ERROR: ไม่พบไฟล์ $ROOT_DIR/server/public/$p" >&2
    exit 1
  fi
done
echo "  -> ไฟล์ Static Export ครบถ้วนพร้อมเสิร์ฟ"

echo "=== [4/4] สั่ง Phusion Passenger / Plesk Node.js รีสตาร์ทโปรเซส ==="
mkdir -p "$ROOT_DIR/tmp" "$ROOT_DIR/server/tmp"
touch "$ROOT_DIR/tmp/restart.txt" "$ROOT_DIR/server/tmp/restart.txt"
echo "  -> แตะไฟล์ restart.txt เรียบร้อย (Node.js จะโหลดโค้ดใหม่ทันที)"
echo "=== DEPLOY COMPLETE ==="
