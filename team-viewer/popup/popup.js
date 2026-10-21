// Team Viewer — Popup Script

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const teamList = document.getElementById('team-list');
  const newMemberName = document.getElementById('new-member-name');
  const newMemberRole = document.getElementById('new-member-role');
  const addMemberBtn = document.getElementById('add-member-btn');
  const commandInput = document.getElementById('command-input');
  const sendCommandBtn = document.getElementById('send-command-btn');
  const startShareBtn = document.getElementById('start-share-btn');
  const stopShareBtn = document.getElementById('stop-share-btn');
  const captureBtn = document.getElementById('capture-btn');
  const shareStatus = document.getElementById('share-status');
  const tabsList = document.getElementById('tabs-list');
  const logList = document.getElementById('log-list');

  // Load initial data
  loadTeam();
  loadTabs();
  loadLog();

  // Add member
  addMemberBtn.addEventListener('click', () => {
    const name = newMemberName.value.trim();
    const role = newMemberRole.value.trim();
    if (!name) return;

    chrome.runtime.sendMessage({
      type: 'ADD_MEMBER',
      member: { name, role: role || 'Member' }
    }, (res) => {
      if (res?.member) {
        newMemberName.value = '';
        newMemberRole.value = '';
        renderTeam(res.team);
      }
    });
  });

  // Send command
  sendCommandBtn.addEventListener('click', sendCommand);
  commandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCommand();
  });

  // Quick commands
  document.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      commandInput.value = btn.dataset.cmd;
      sendCommand();
    });
  });

  // Screen share
  startShareBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_SCREEN_SHARE' }, (res) => {
      shareStatus.textContent = res?.success ? '✅ กำลังแชร์หน้าจอ...' : '❌ ' + res?.error;
    });
  });

  stopShareBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_SCREEN_SHARE' }, (res) => {
      shareStatus.textContent = '⏹️ หยุดแชร์แล้ว';
    });
  });

  // Capture
  captureBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }, (res) => {
      if (res?.success) {
        shareStatus.textContent = '📸 จับภาพสำเร็จ';
      } else {
        shareStatus.textContent = '❌ ' + res?.error;
      }
    });
  });

  function sendCommand() {
    const cmd = commandInput.value.trim();
    if (!cmd) return;

    chrome.runtime.sendMessage({
      type: 'SEND_COMMAND',
      command: cmd,
      targetId: null
    }, (res) => {
      if (res?.command) {
        commandInput.value = '';
        loadLog();
      }
    });
  }

  function loadTeam() {
    chrome.runtime.sendMessage({ type: 'GET_TEAM' }, (res) => {
      renderTeam(res?.team || []);
    });
  }

  function renderTeam(team) {
    if (team.length === 0) {
      teamList.innerHTML = '<div class="empty">ยังไม่มีสมาชิก</div>';
      return;
    }
    teamList.innerHTML = team.map(m => `
      <div class="member" data-id="${m.id}">
        <div class="member-avatar">${m.name.charAt(0).toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${m.name}</div>
          <div class="member-role">${m.role}</div>
        </div>
        <span class="member-status ${m.status}">${m.status}</span>
      </div>
    `).join('');
  }

  function loadTabs() {
    chrome.runtime.sendMessage({ type: 'GET_TABS' }, (res) => {
      const tabs = res?.tabs || [];
      if (tabs.length === 0) {
        tabsList.innerHTML = '<div class="empty">ไม่มี tab</div>';
        return;
      }
      tabsList.innerHTML = tabs.slice(0, 10).map(t => `
        <div class="tab-item" data-id="${t.id}">
          ${t.favIconUrl ? `<img src="${t.favIconUrl}" />` : '<span>🌐</span>'}
          <span class="tab-title">${t.title || t.url}</span>
        </div>
      `).join('');
    });
  }

  function loadLog() {
    chrome.runtime.sendMessage({ type: 'GET_LOG' }, (res) => {
      const log = res?.log || [];
      if (log.length === 0) {
        logList.innerHTML = '<div class="empty">ยังไม่มี log</div>';
        return;
      }
      logList.innerHTML = log.slice(0, 20).map(l => {
        const time = new Date(l.timestamp).toLocaleTimeString('th-TH');
        return `<div class="log-item"><span class="log-time">${time}</span>${l.detail}</div>`;
      }).join('');
    });
  }
});
