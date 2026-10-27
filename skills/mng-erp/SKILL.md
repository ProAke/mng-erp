---
name: mng-erp
description: Manage tasks, projects, chat, and billing via API.
version: 1.0.0
author: MNG Groups
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [erp, kanban, projects, chat, crm, invoicing, token-rotation]
    category: productivity
    requires_toolsets: [terminal]
    config:
      - key: url
        description: Base URL of MNG ERP instance
        default: "https://mng.uarea.in"
        env: MNG_ERP_URL
      - key: email
        description: Dedicated MNG ERP account email for Hermes Agent
        prompt: Enter the MNG ERP account email for Hermes
        env: MNG_ERP_EMAIL
      - key: password
        description: Account password in pacific_mng.users (required to use API)
        prompt: Enter the MNG ERP account password
        secret: true
        env: MNG_ERP_PASSWORD
---

# MNG ERP Skill

Connect Hermes Agent or any autonomous AI agent directly to MNG ERP (`https://mng.uarea.in`) using mandatory `email`/`password` self-authentication (`POST /api/hermes/login`). Upon login, MNG ERP issues a pool of **20 rotating API tokens (`Slot #01`..`Slot #20`)** and the bundled Python client cycles through all 20 tokens round-robin on every request.

## When to Use

- Reading executive overviews, urgent tasks, overdue milestones, or MariaDB live table audits in MNG ERP.
- Creating, filtering, or updating Kanban tasks (`todo`, `doing`, `review`, `done`), projects, and calendar events.
- Posting status updates, replies, or Google Drive links into MNG ERP team chat channels (`#general`, `#ai-feed`) or 1-on-1 DMs.
- Managing CRM clients, generating 7% VAT invoices, or dispatching internal AI Workforce runs (`@NOVA`, `@PIXEL`, `@BYTE`, `@ORBIT`).

## Prerequisites

1. **Active MNG ERP Account (`user` + `password` required)**: Create a dedicated account for the AI agent in `#/settings` → **ผู้ใช้และสิทธิ์** (`pacific_mng.users` with `status = active`). Anonymous API calls are rejected with `401 Unauthorized`.
2. **Environment Variables** set in Hermes configuration or shell environment:
   - `MNG_ERP_URL` (defaults to `https://mng.uarea.in`)
   - `MNG_ERP_EMAIL` (required — AI's own login email)
   - `MNG_ERP_PASSWORD` (required — AI's own login password)
3. **Python 3.8+** available via the `terminal` tool (uses standard library only; zero `pip` installs needed). If running on a remote host without this repo cloned, fetch the helper script directly from `{MNG_ERP_URL}/api/hermes/client.py`.

## How to Run

Execute `scripts/mng_erp_client.py` through the `terminal` tool. If the script is not yet present locally, download it once from `/api/hermes/client.py`:

```bash
python3 skills/mng-erp/scripts/mng_erp_client.py login
python3 skills/mng-erp/scripts/mng_erp_client.py overview
```

Every invocation after `login` automatically selects the next token slot (`1 -> 2 -> ... -> 20 -> 1`) from `~/.hermes/mng_erp/`, sends `Authorization: Bearer mng_sXX_...` (plus `X-Auth-Email`/`X-Auth-Password` for Strict Dual-Auth compatibility), and auto-reauthenticates if tokens were rotated or expired.

## Quick Reference

| Action | Command via `terminal` | Underlying REST Endpoint |
|---|---|---|
| Self-login & get 20 tokens | `python3 skills/mng-erp/scripts/mng_erp_client.py login` | `POST /api/hermes/login` |
| Force-rotate all 20 tokens | `python3 skills/mng-erp/scripts/mng_erp_client.py login --rotate` | `POST /api/hermes/login` |
| Check active identity & slot | `python3 skills/mng-erp/scripts/mng_erp_client.py whoami` | `GET /api/hermes/me` |
| Inspect 20-slot usage stats | `python3 skills/mng-erp/scripts/mng_erp_client.py tokens` | `GET /api/hermes/tokens` |
| Executive ERP summary | `python3 skills/mng-erp/scripts/mng_erp_client.py overview` | `GET /api/hermes/overview` |
| List/filter tasks | `python3 skills/mng-erp/scripts/mng_erp_client.py tasks --status doing` | `GET /api/tasks` |
| Create task | `python3 skills/mng-erp/scripts/mng_erp_client.py task-create --title "..." --project p1 --priority high` | `POST /api/tasks` |
| Update task status/progress | `python3 skills/mng-erp/scripts/mng_erp_client.py task-update t12 --status done --progress 100` | `PATCH /api/tasks/:id` |
| List projects | `python3 skills/mng-erp/scripts/mng_erp_client.py projects` | `GET /api/projects` |
| Sync chat rooms & messages | `python3 skills/mng-erp/scripts/mng_erp_client.py chat-channels` | `GET /api/chat/sync` |
| Send message to chat room | `python3 skills/mng-erp/scripts/mng_erp_client.py chat-send --channel ch1 --text "..."` | `POST /api/channels/:id/messages` |
| List/create calendar events | `python3 skills/mng-erp/scripts/mng_erp_client.py event-create --title "..." --date 2026-11-01` | `POST /api/events` |
| List/create 7% VAT invoices | `python3 skills/mng-erp/scripts/mng_erp_client.py invoice-create --title "..." --amount 50000` | `POST /api/invoices` |
| Arbitrary REST endpoint | `python3 skills/mng-erp/scripts/mng_erp_client.py request GET /api/endpoints` | Any `/api/*` route |

## Procedure

1. **Verify Credentials & Health**: Ensure `MNG_ERP_EMAIL` and `MNG_ERP_PASSWORD` are set. Use `terminal` to run `python3 skills/mng-erp/scripts/mng_erp_client.py login` so Hermes logs in with its own account and caches the 20-token pool (`mng_s01_...` through `mng_s20_...`).
2. **Gather Context First**: Before mutating ERP state, run `overview`, `projects`, or `tasks` to obtain valid prefixed IDs (`p1` for projects, `t12` for tasks, `ch1` for channels, `c1` for clients, `i1` for invoices, `u1` for team members). If you need full request/response schemas, inspect `docs/API-MANUAL.md` with `read_file` or fetch `{MNG_ERP_URL}/api/hermes/manual.md` with `web_extract`.
3. **Execute Operations with Round-Robin Tokens**: Invoke the specific subcommand (`task-create`, `task-update`, `chat-send`, `event-create`, `invoice-create`, or `request`) via `terminal`. Each call automatically advances `usedTokenSlot` (`1..20`) to distribute load cleanly across parallel Hermes sub-agents.
4. **Report Results Clearly**: Summarize created codes (such as `MNG-1042` or `INV-2026-047`), updated statuses, and the `usedTokenSlot` returned by the server.

## Pitfalls

- **Never omit `email` or `password`**: MNG ERP strictly enforces real `pacific_mng.users` authentication (`status = active`). Suspended accounts are blocked immediately on every request even if tokens were previously issued.
- **Use prefixed entity IDs in payloads**: MNG ERP REST endpoints expect prefixed string IDs (`p1`, `t5`, `ch1`, `c2`, `u1`, `ai1`) rather than bare database integers, though numeric IDs are tolerated on most routes.
- **Project & User mutations require Manager/Admin role**: `PATCH/DELETE /api/projects/:id`, `DELETE /api/clients/:id`, and `/api/users/*` require the AI account's role to be `manager`, `admin`, or `super_admin`.
- **Do not hardcode or commit tokens**: Token pools belong in `~/.hermes/mng_erp/` (mode `0600`), never inside Git-tracked files. Use `login --rotate` immediately if any token is exposed.

## Verification

Confirm both authentication and 20-token round-robin rotation work end-to-end by running two consecutive `whoami` calls via `terminal`:

```bash
python3 skills/mng-erp/scripts/mng_erp_client.py whoami
python3 skills/mng-erp/scripts/mng_erp_client.py whoami
```

Verify that both responses return `"httpStatus": 200`, `"authType": "api_token"`, and that `"usedTokenSlot"` increments (`1` on the first call, `2` on the second call, wrapping from `20` back to `1`).
