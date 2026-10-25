#!/usr/bin/env bash
# scripts/install-hook.sh — ติดตั้ง pre-commit hook ตาม AGENTS.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p .git/hooks
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✅ ติดตั้ง pre-commit hook แล้ว (.git/hooks/pre-commit)"
echo "   ต่อไปทุกครั้งที่ commit ไฟล์โค้ด จะถูกตรวจ lint/test/build อัตโนมัติ"
