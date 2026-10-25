#!/usr/bin/env bash
# scripts/install-hook.sh — ติดตั้ง pre-commit hook ตาม AGENTS.md
# ใช้ core.hooksPath=.githooks แทนการ cp เข้า .git/hooks เพื่อให้ hook อยู่ใน version-control
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x .githooks/pre-commit scripts/*.sh 2>/dev/null || true

if [ ! -f .githooks/pre-commit ]; then
  echo "⛔ ไม่พบ .githooks/pre-commit"
  exit 1
fi

git config core.hooksPath .githooks

echo "✅ ติดตั้ง pre-commit hook แล้ว (core.hooksPath=.githooks)"
echo "   ทุกครั้งที่ commit ไฟล์โค้ด จะถูกตรวจ lint/test/build อัตโนมัติ"
echo "   ตรวจสอบ: git config core.hooksPath"
