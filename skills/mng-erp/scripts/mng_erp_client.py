#!/usr/bin/env python3
"""
MNG ERP — Hermes & External AI Client (Self-Login + 20-Token Round-Robin Pool)

Requirements:
- Python 3.8+ standard library only (zero third-party pip packages)
- Cross-platform: Linux, macOS, Windows
- Mandatory User/Password authentication against MNG ERP (`POST /api/hermes/login`)
- Automatic Round-Robin cycling across 20 API tokens (Slot #01 -> #02 -> ... -> #20 -> #01)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_BASE_URL = "https://mng.uarea.in"
POOL_SIZE = 20


def _state_dir() -> Path:
    custom = os.environ.get("MNG_ERP_STATE_DIR", "").strip()
    base = Path(custom) if custom else (Path.home() / ".hermes" / "mng_erp")
    base.mkdir(parents=True, exist_ok=True)
    return base


def _pool_file(base_url: str, email: str) -> Path:
    key = hashlib.sha256(f"{base_url.rstrip('/').lower()}|{email.strip().lower()}".encode("utf-8")).hexdigest()[:16]
    return _state_dir() / f"token_pool_{key}.json"


def _save_secure_json(path: Path, payload: Dict[str, Any]) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if os.name != "nt":
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
    tmp.replace(path)


def _load_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


class MngErpClient:
    """Self-authenticating MNG ERP API client with 20-slot round-robin token rotation."""

    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        agent_name: str = "hermes-mng-erp-skill/1.0",
    ) -> None:
        self.base_url = (base_url or DEFAULT_BASE_URL).strip().rstrip("/")
        self.email = (email or "").strip()
        self.password = password or ""
        self.agent_name = agent_name

        if not self.email or not self.password:
            raise ValueError(
                "ต้องระบุทั้งอีเมลและรหัสผ่านของบัญชีผู้ใช้งาน (MNG_ERP_EMAIL และ MNG_ERP_PASSWORD) "
                "เพื่อล็อกอินเข้าใช้งาน MNG ERP API"
            )
        self.cache_path = _pool_file(self.base_url, self.email)

    def _raw_http(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 30,
    ) -> Tuple[int, Dict[str, str], Any]:
        url = f"{self.base_url}{path if path.startswith('/') else '/' + path}"
        req_headers = {
            "Accept": "application/json",
            "User-Agent": self.agent_name,
            "X-Hermes-Agent": self.agent_name,
        }
        if headers:
            req_headers.update(headers)

        data_bytes = None
        if body is not None:
            data_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")
            req_headers["Content-Type"] = "application/json; charset=utf-8"

        req = urllib.request.Request(url=url, data=data_bytes, headers=req_headers, method=method.upper())
        host = urllib.parse.urlparse(url).hostname or ""
        opener = (
            urllib.request.build_opener(urllib.request.ProxyHandler({}))
            if host in ("127.0.0.1", "localhost", "::1")
            else urllib.request.build_opener()
        )
        try:
            with opener.open(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                parsed = json.loads(raw) if raw.strip().startswith(("{", "[")) else raw
                return resp.status, resp_headers, parsed
        except urllib.error.HTTPError as err:
            raw = err.read().decode("utf-8", errors="replace")
            resp_headers = {k.lower(): v for k, v in (err.headers.items() if err.headers else [])}
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = {"error": raw or f"HTTP {err.code}"}
            return err.code, resp_headers, parsed

    def login(self, rotate: bool = False) -> Dict[str, Any]:
        """Authenticate with own email + password and obtain/refresh the 20-token pool."""
        status, _, data = self._raw_http(
            "POST",
            "/api/hermes/login",
            body={
                "email": self.email,
                "password": self.password,
                "poolSize": POOL_SIZE,
                "rotate": bool(rotate),
                "label": "hermes-agent",
            },
        )
        if status >= 400 or not isinstance(data, dict) or not data.get("tokens"):
            msg = data.get("error") if isinstance(data, dict) else str(data)
            raise RuntimeError(f"ล็อกอิน MNG ERP ไม่สำเร็จ (HTTP {status}): {msg}")

        state = {
            "baseUrl": self.base_url,
            "email": self.email,
            "user": data.get("user"),
            "poolSize": len(data["tokens"]),
            "nextIndex": 0,
            "tokens": data["tokens"],
        }
        _save_secure_json(self.cache_path, state)
        return data

    def _next_token_entry(self) -> Dict[str, Any]:
        state = _load_json(self.cache_path)
        if not state or not isinstance(state.get("tokens"), list) or len(state["tokens"]) == 0:
            self.login(rotate=False)
            state = _load_json(self.cache_path) or {}

        tokens: List[Dict[str, Any]] = state.get("tokens", [])
        if not tokens:
            raise RuntimeError("ไม่พบชุด API Token ในระบบ กรุณาตรวจสอบบัญชีผู้ใช้งาน")

        idx = int(state.get("nextIndex", 0)) % len(tokens)
        chosen = tokens[idx]
        state["nextIndex"] = (idx + 1) % len(tokens)
        _save_secure_json(self.cache_path, state)
        return chosen

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        query: Optional[Dict[str, Optional[str]]] = None,
    ) -> Dict[str, Any]:
        """Send an authenticated request cycling through the 20-token pool round-robin."""
        full_path = path if path.startswith("/") else f"/{path}"
        if not full_path.startswith("/api/"):
            full_path = f"/api{full_path}"
        if query:
            clean_q = {k: v for k, v in query.items() if v is not None and v != ""}
            if clean_q:
                sep = "&" if "?" in full_path else "?"
                full_path = f"{full_path}{sep}{urllib.parse.urlencode(clean_q)}"

        for attempt in range(2):
            entry = self._next_token_entry()
            tok = entry["token"]
            headers = {
                "Authorization": f"Bearer {tok}",
                "X-API-Token": tok,
                "X-Auth-Email": self.email,
                "X-Auth-Password": self.password,
            }
            status, resp_headers, data = self._raw_http(method, full_path, body=body, headers=headers)
            if status == 401 and attempt == 0:
                # Token expired or rotated remotely -> re-login automatically once
                self.login(rotate=False)
                continue
            if status >= 400:
                err_msg = data.get("error") if isinstance(data, dict) else str(data)
                detail = data.get("detail") if isinstance(data, dict) else None
                raise RuntimeError(
                    f"API Error HTTP {status}: {err_msg}" + (f" ({detail})" if detail else "")
                )
            return {
                "httpStatus": status,
                "usedTokenSlot": int(resp_headers.get("x-token-slot") or entry.get("slot") or 0),
                "nextRecommendedSlot": int(resp_headers.get("x-next-recommended-slot") or 0),
                "data": data,
            }
        raise RuntimeError("ไม่สามารถยืนยันตัวตนกับ MNG ERP API ได้")


def _resolve_credentials(args: argparse.Namespace) -> Tuple[str, str, str]:
    base_url = (
        getattr(args, "url", None)
        or os.environ.get("MNG_ERP_URL")
        or DEFAULT_BASE_URL
    )
    email = getattr(args, "email", None) or os.environ.get("MNG_ERP_EMAIL") or ""
    password = getattr(args, "password", None) or os.environ.get("MNG_ERP_PASSWORD") or ""
    return base_url, email, password


def _print_json(obj: Any) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="MNG ERP CLI for Hermes Agent (Self-Login + 20-Token Round-Robin Rotation)"
    )
    p.add_argument("--url", help=f"Base URL ของ MNG ERP (ค่าเริ่มต้น: {DEFAULT_BASE_URL} หรือ MNG_ERP_URL)")
    p.add_argument("--email", help="อีเมลบัญชี AI/ผู้ใช้ (หรือกำหนดผ่าน MNG_ERP_EMAIL)")
    p.add_argument("--password", help="รหัสผ่านบัญชี AI/ผู้ใช้ (หรือกำหนดผ่าน MNG_ERP_PASSWORD)")

    sub = p.add_subparsers(dest="cmd", required=True)

    s_login = sub.add_parser("login", help="ล็อกอินด้วย User/Password เพื่อรับหรือหมุนเปลี่ยน 20 API Tokens")
    s_login.add_argument("--rotate", action="store_true", help="หมุนเปลี่ยน (Rotate) Token ใหม่ทั้ง 20 ตัว")

    sub.add_parser("whoami", help="ตรวจสอบตัวตนและดูหมายเลข Token Slot ที่ใช้ใน Request นี้")
    sub.add_parser("tokens", help="ดูสถานะและจำนวนครั้งการใช้งานของ Token ทั้ง 20 Slots")
    sub.add_parser("overview", help="ดึงภาพรวมผู้บริหาร (งานด่วน โปรเจกต์ แชต ปฏิทิน การเงิน)")
    sub.add_parser("audit", help="ตรวจสอบสถานะตารางฐานข้อมูล MariaDB ทั้งระบบ")

    s_tasks = sub.add_parser("tasks", help="ค้นหาหรือดูรายการงานในบอร์ด")
    s_tasks.add_argument("--status", choices=["todo", "doing", "review", "done"])
    s_tasks.add_argument("--priority", choices=["urgent", "high", "med", "low"])
    s_tasks.add_argument("--project", help="รหัสโปรเจกต์ เช่น p1")
    s_tasks.add_argument("--q", help="คำค้นหาชื่องานหรือรหัสงาน")

    s_tnew = sub.add_parser("task-create", help="สร้างการ์ดงานใหม่")
    s_tnew.add_argument("--title", required=True, help="ชื่องาน")
    s_tnew.add_argument("--project", default="p1", help="รหัสโปรเจกต์ เช่น p1")
    s_tnew.add_argument("--priority", default="med", choices=["urgent", "high", "med", "low"])
    s_tnew.add_argument("--status", default="todo", choices=["todo", "doing", "review", "done"])
    s_tnew.add_argument("--due", help="กำหนดส่ง YYYY-MM-DD")
    s_tnew.add_argument("--desc", default="", help="รายละเอียดงาน")

    s_tupd = sub.add_parser("task-update", help="อัปเดตสถานะหรือความคืบหน้าของงาน")
    s_tupd.add_argument("task_id", help="รหัสงาน เช่น t12")
    s_tupd.add_argument("--status", choices=["todo", "doing", "review", "done"])
    s_tupd.add_argument("--priority", choices=["urgent", "high", "med", "low"])
    s_tupd.add_argument("--progress", type=int, help="เปอร์เซ็นต์ความคืบหน้า 0-100")
    s_tupd.add_argument("--due", help="กำหนดส่ง YYYY-MM-DD")
    s_tupd.add_argument("--title", help="แก้ไขชื่องาน")

    s_proj = sub.add_parser("projects", help="ดูรายการโปรเจกต์ทั้งหมด")
    s_proj.add_argument("--q", help="คำค้นหาโปรเจกต์")

    s_pnew = sub.add_parser("project-create", help="สร้างโปรเจกต์ใหม่")
    s_pnew.add_argument("--name", required=True, help="ชื่อโปรเจกต์")
    s_pnew.add_argument("--code", default="", help="รหัสย่อโปรเจกต์ เช่น CAM")
    s_pnew.add_argument("--client", default="", help="ชื่อลูกค้า")
    s_pnew.add_argument("--budget", type=float, default=0, help="งบประมาณ (บาท)")

    sub.add_parser("chat-channels", help="ดูรายการห้องแชตและข้อความล่าสุด")

    s_csend = sub.add_parser("chat-send", help="ส่งข้อความเข้าห้องแชตหรือ DM")
    s_csend.add_argument("--channel", default="ch1", help="รหัสห้องแชต เช่น ch1")
    s_csend.add_argument("--text", required=True, help="ข้อความที่จะส่ง")
    s_csend.add_argument("--reply-to", dest="reply_to", help="รหัสข้อความที่ต้องการตอบกลับ เช่น m5")

    s_ev = sub.add_parser("events", help="ดูรายการนัดหมายในปฏิทิน")
    s_ev.add_argument("--date", help="วันที่ YYYY-MM-DD")
    s_ev.add_argument("--from", dest="from_date", help="ตั้งแต่วันที่ YYYY-MM-DD")
    s_ev.add_argument("--to", dest="to_date", help="ถึงวันที่ YYYY-MM-DD")

    s_enew = sub.add_parser("event-create", help="สร้างนัดหมายใหม่ในปฏิทิน")
    s_enew.add_argument("--title", required=True)
    s_enew.add_argument("--date", required=True, help="YYYY-MM-DD")
    s_enew.add_argument("--start", default="10:00")
    s_enew.add_argument("--end", default="11:00")
    s_enew.add_argument("--cat", default="meeting", choices=["task", "meeting", "deadline", "finance", "holiday", "personal"])
    s_enew.add_argument("--loc", default="")

    s_cli = sub.add_parser("clients", help="ดูรายชื่อลูกค้า CRM")
    s_cli.add_argument("--q", help="คำค้นหาลูกค้า")

    s_inv = sub.add_parser("invoices", help="ดูรายการใบแจ้งหนี้")
    s_inv.add_argument("--status", choices=["draft", "sent", "paid", "overdue"])

    s_inew = sub.add_parser("invoice-create", help="สร้างใบแจ้งหนี้ใหม่ (คำนวณ VAT 7%% อัตโนมัติ)")
    s_inew.add_argument("--title", required=True)
    s_inew.add_argument("--amount", type=float, required=True)
    s_inew.add_argument("--client", help="รหัสลูกค้า เช่น c1")
    s_inew.add_argument("--due", help="กำหนดชำระ YYYY-MM-DD")

    s_ai = sub.add_parser("ai-dispatch", help="บันทึกตัวอย่างคำสั่ง AI (จำลอง ไม่เรียกโมเดลจริง)")
    s_ai.add_argument("--agent", default="ai1", help="รหัส AI Agent เช่น ai1 (NOVA)")
    s_ai.add_argument("--prompt", required=True, help="คำสั่งงาน")
    s_ai.add_argument("--post-to-feed", action="store_true", help="โพสต์คำสั่งจำลองลงห้องแชต #ai-feed")

    s_req = sub.add_parser("request", help="เรียก API Endpoint ใดก็ได้ของ MNG ERP แบบกำหนดเอง")
    s_req.add_argument("method", choices=["GET", "POST", "PUT", "PATCH", "DELETE"])
    s_req.add_argument("path", help="เช่น /api/hermes/overview หรือ /api/tasks")
    s_req.add_argument("--json", dest="json_body", help="JSON Payload สำหรับ POST/PUT/PATCH")

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    base_url, email, password = _resolve_credentials(args)

    try:
        client = MngErpClient(base_url=base_url, email=email, password=password)

        if args.cmd == "login":
            res = client.login(rotate=args.rotate)
            _print_json({
                "ok": True,
                "user": res.get("user"),
                "poolSize": res.get("poolSize"),
                "rotated": bool(args.rotate),
                "cacheFile": str(client.cache_path),
                "slotsIssued": [
                    {"slot": t["slot"], "preview": f"{t['token'][:12]}...{t['token'][-6:]}"}
                    for t in res.get("tokens", [])
                ],
            })
            return 0

        if args.cmd == "whoami":
            _print_json(client.request("GET", "/api/hermes/me"))
            return 0
        if args.cmd == "tokens":
            _print_json(client.request("GET", "/api/hermes/tokens"))
            return 0
        if args.cmd == "overview":
            _print_json(client.request("GET", "/api/hermes/overview"))
            return 0
        if args.cmd == "audit":
            _print_json(client.request("GET", "/api/db/audit"))
            return 0
        if args.cmd == "tasks":
            _print_json(client.request("GET", "/api/tasks", query={
                "status": args.status,
                "priority": args.priority,
                "project": args.project,
                "q": args.q,
            }))
            return 0
        if args.cmd == "task-create":
            _print_json(client.request("POST", "/api/tasks", body={
                "title": args.title,
                "project": args.project,
                "priority": args.priority,
                "status": args.status,
                "due": args.due,
                "desc": args.desc,
            }))
            return 0
        if args.cmd == "task-update":
            payload: Dict[str, Any] = {}
            for k in ("status", "priority", "progress", "due", "title"):
                val = getattr(args, k, None)
                if val is not None:
                    payload[k] = val
            _print_json(client.request("PATCH", f"/api/tasks/{args.task_id}", body=payload))
            return 0
        if args.cmd == "projects":
            _print_json(client.request("GET", "/api/projects", query={"q": args.q}))
            return 0
        if args.cmd == "project-create":
            _print_json(client.request("POST", "/api/projects", body={
                "name": args.name,
                "code": args.code,
                "clientName": args.client,
                "budget": args.budget,
            }))
            return 0
        if args.cmd == "chat-channels":
            _print_json(client.request("GET", "/api/chat/sync"))
            return 0
        if args.cmd == "chat-send":
            _print_json(client.request("POST", f"/api/channels/{args.channel}/messages", body={
                "body": args.text,
                "replyTo": args.reply_to,
            }))
            return 0
        if args.cmd == "events":
            _print_json(client.request("GET", "/api/events", query={
                "date": args.date,
                "from": args.from_date,
                "to": args.to_date,
            }))
            return 0
        if args.cmd == "event-create":
            _print_json(client.request("POST", "/api/events", body={
                "title": args.title,
                "date": args.date,
                "start": args.start,
                "end": args.end,
                "cat": args.cat,
                "loc": args.loc,
            }))
            return 0
        if args.cmd == "clients":
            _print_json(client.request("GET", "/api/clients", query={"q": args.q}))
            return 0
        if args.cmd == "invoices":
            _print_json(client.request("GET", "/api/invoices", query={"status": args.status}))
            return 0
        if args.cmd == "invoice-create":
            _print_json(client.request("POST", "/api/invoices", body={
                "title": args.title,
                "amount": args.amount,
                "client": args.client,
                "due": args.due,
                "status": "sent",
            }))
            return 0
        if args.cmd == "ai-dispatch":
            _print_json(client.request("POST", "/api/ai/dispatch", body={
                "agentId": args.agent,
                "prompt": args.prompt,
                "postToFeed": bool(args.post_to_feed),
            }))
            return 0
        if args.cmd == "request":
            body = json.loads(args.json_body) if args.json_body else None
            _print_json(client.request(args.method, args.path, body=body))
            return 0

        parser.print_help()
        return 1
    except Exception as exc:
        sys.stderr.write(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False) + "\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
