// Team Viewer — Background Service Worker
// จัดการ screen capture, commands, notifications

const TEAM_KEY = 'team_viewer_team';
const LOG_KEY = 'team_viewer_log';

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    [TEAM_KEY]: [],
    [LOG_KEY]: [],
    activeSession: null
  });
  console.log('[Team Viewer] Extension installed');
});

// Listen for messages from popup/content/options
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Team Viewer] Message:', msg);

  switch (msg.type) {
    case 'GET_TEAM':
      handleGetTeam(sendResponse);
      return true;

    case 'ADD_MEMBER':
      handleAddMember(msg.member, sendResponse);
      return true;

    case 'REMOVE_MEMBER':
      handleRemoveMember(msg.id, sendResponse);
      return true;

    case 'SEND_COMMAND':
      handleSendCommand(msg.command, msg.targetId, sendResponse);
      return true;

    case 'GET_LOG':
      handleGetLog(sendResponse);
      return true;

    case 'START_SCREEN_SHARE':
      handleStartScreenShare(sendResponse);
      return true;

    case 'STOP_SCREEN_SHARE':
      handleStopScreenShare(sendResponse);
      return true;

    case 'GET_TABS':
      handleGetTabs(sendResponse);
      return true;

    case 'CAPTURE_TAB':
      handleCaptureTab(msg.tabId, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// --- Team Management ---

async function handleGetTeam(sendResponse) {
  const data = await chrome.storage.local.get(TEAM_KEY);
  sendResponse({ team: data[TEAM_KEY] || [] });
}

async function handleAddMember(member, sendResponse) {
  const data = await chrome.storage.local.get(TEAM_KEY);
  const team = data[TEAM_KEY] || [];
  const newMember = {
    id: Date.now().toString(36),
    name: member.name,
    role: member.role,
    status: 'online',
    joinedAt: new Date().toISOString()
  };
  team.push(newMember);
  await chrome.storage.local.set({ [TEAM_KEY]: team });
  addLog('member_added', `เพิ่ม ${member.name} (${member.role})`);
  sendResponse({ member: newMember, team });
}

async function handleRemoveMember(id, sendResponse) {
  const data = await chrome.storage.local.get(TEAM_KEY);
  let team = data[TEAM_KEY] || [];
  const removed = team.find(m => m.id === id);
  team = team.filter(m => m.id !== id);
  await chrome.storage.local.set({ [TEAM_KEY]: team });
  if (removed) addLog('member_removed', `ลบ ${removed.name}`);
  sendResponse({ team });
}

// --- Commands ---

async function handleSendCommand(command, targetId, sendResponse) {
  const cmd = {
    id: Date.now().toString(36),
    command,
    targetId,
    from: 'admin',
    timestamp: new Date().toISOString(),
    status: 'sent'
  };

  // Store command
  const data = await chrome.storage.local.get('team_viewer_commands');
  const commands = data.team_viewer_commands || [];
  commands.push(cmd);
  await chrome.storage.local.set({ team_viewer_commands: commands });

  addLog('command_sent', `สั่ง: ${command} → ${targetId || 'ทุกคน'}`);

  // Notify
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Team Viewer — Command',
    message: `${command} → ${targetId || 'ทุกคน'}`
  });

  sendResponse({ command: cmd });
}

// --- Screen Share ---

async function handleStartScreenShare(sendResponse) {
  try {
    const stream = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
    await chrome.storage.local.set({ activeSession: { stream, startedAt: new Date().toISOString() } });
    addLog('screen_share_start', 'เริ่มแชร์หน้าจอ');
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStopScreenShare(sendResponse) {
  await chrome.storage.local.set({ activeSession: null });
  addLog('screen_share_stop', 'หยุดแชร์หน้าจอ');
  sendResponse({ success: true });
}

// --- Tab Management ---

async function handleGetTabs(sendResponse) {
  const tabs = await chrome.tabs.query({});
  sendResponse({ tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, favIconUrl: t.favIconUrl })) });
}

async function handleCaptureTab(tabId, sendResponse) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
    sendResponse({ success: true, dataUrl });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// --- Activity Log ---

async function handleGetLog(sendResponse) {
  const data = await chrome.storage.local.get(LOG_KEY);
  sendResponse({ log: data[LOG_KEY] || [] });
}

async function addLog(action, detail) {
  const data = await chrome.storage.local.get(LOG_KEY);
  const log = data[LOG_KEY] || [];
  log.unshift({
    id: Date.now().toString(36),
    action,
    detail,
    timestamp: new Date().toISOString()
  });
  // Keep last 100 entries
  if (log.length > 100) log.length = 100;
  await chrome.storage.local.set({ [LOG_KEY]: log });
}
