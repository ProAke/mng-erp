# Team Viewer — Chrome Extension

> สำหรับดูงานและสั่งงานทีมแบบ transparent ทุกคนรู้และยินยอม

## Features

| Feature | Description |
|---------|-------------|
| 👥 Team Management | เพิ่ม/ลบสมาชิก ดูสถานะ (online/offline/busy) |
| 💬 Quick Commands | ส่งคำสั่งไปยังทีม (ดูหน้าจอ, ส่งรายงาน, เข้าร่วมประชุม) |
| 🖥️ Screen Share | แชร์หน้าจอ จับภาพ tab |
| 📋 Tab Viewer | ดู tabs ที่เปิดอยู่ทั้งหมด |
| 📝 Activity Log | บันทึกกิจกรรมทั้งหมด |
| ⚙️ Settings | ตั้งค่า server, notifications, profile |

## Installation

1. เปิด Chrome → `chrome://extensions/`
2. เปิด **Developer mode** (มุมขวาบน)
3. กด **Load unpacked**
4. เลือก folder `team-viewer/`
5. กด **Pin** เพื่อติดไอคอนไว้บน toolbar

## Usage

1. คลิกไอคอน Team Viewer บน toolbar
2. เพิ่มสมาชิกทีม (ชื่อ + บทบาท)
3. ส่งคำสั่งผ่าน Quick Commands
4. ดู Activity Log เพื่อติดตามกิจกรรม

## File Structure

```
team-viewer/
├── manifest.json          # Extension manifest (v3)
├── background/
│   └── background.js      # Service worker (team, commands, screen share)
├── content/
│   └── content.js         # Content script (page interaction)
├── popup/
│   ├── popup.html         # Popup UI
│   └── popup.js           # Popup logic
├── options/
│   ├── options.html       # Settings page
│   └── options.js         # Settings logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Permissions

- `activeTab` — เข้าถึง tab ที่ active
- `tabs` — ดู tabs ทั้งหมด
- `storage` — เก็บข้อมูลทีม
- `notifications` — แจ้งเตือน
- `desktopCapture` — จับภาพหน้าจอ
- `tabCapture` — จับภาพ tab

## Security

- ข้อมูลทั้งหมดเก็บใน `chrome.storage.local` (ไม่ sync ข้ามเครื่อง)
- ไม่ส่งข้อมูลไปยัง server ภายนอก
- ทุกคนในทีมรู้และยินยอมให้ดู/คุม

## Development

```bash
# Reload extension after code changes
chrome://extensions/ → Team Viewer → Reload

# View background console
chrome://extensions/ → Team Viewer → Inspect views: Service Worker

# View popup console
คลิกขวาที่ popup → Inspect
```

## License

Internal use only — MNG ERP Team
