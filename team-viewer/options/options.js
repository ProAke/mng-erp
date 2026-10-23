// Team Viewer — Options Script

document.addEventListener('DOMContentLoaded', () => {
  const serverUrl = document.getElementById('server-url');
  const apiKey = document.getElementById('api-key');
  const notifyCommands = document.getElementById('notify-commands');
  const notifyScreen = document.getElementById('notify-screen');
  const notifyJoin = document.getElementById('notify-join');
  const yourName = document.getElementById('your-name');
  const yourRole = document.getElementById('your-role');
  const saveBtn = document.getElementById('save-btn');
  const resetBtn = document.getElementById('reset-btn');
  const clearLogBtn = document.getElementById('clear-log-btn');

  // Load saved settings
  chrome.storage.local.get([
    'server_url', 'api_key', 'notify_commands', 'notify_screen',
    'notify_join', 'your_name', 'your_role'
  ], (data) => {
    serverUrl.value = data.server_url || '';
    apiKey.value = data.api_key || '';
    notifyCommands.checked = data.notify_commands !== false;
    notifyScreen.checked = data.notify_screen !== false;
    notifyJoin.checked = data.notify_join || false;
    yourName.value = data.your_name || '';
    yourRole.value = data.your_role || 'viewer';
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      server_url: serverUrl.value,
      api_key: apiKey.value,
      notify_commands: notifyCommands.checked,
      notify_screen: notifyScreen.checked,
      notify_join: notifyJoin.checked,
      your_name: yourName.value,
      your_role: yourRole.value
    }, () => {
      saveBtn.textContent = 'Saved!';
      setTimeout(() => saveBtn.textContent = 'Save', 1500);
    });
  });

  // Reset
  resetBtn.addEventListener('click', () => {
    serverUrl.value = '';
    apiKey.value = '';
    notifyCommands.checked = true;
    notifyScreen.checked = true;
    notifyJoin.checked = false;
    yourName.value = '';
    yourRole.value = 'viewer';
  });

  // Clear log
  clearLogBtn.addEventListener('click', () => {
    chrome.storage.local.set({ team_viewer_log: [] }, () => {
      clearLogBtn.textContent = 'Cleared!';
      setTimeout(() => clearLogBtn.textContent = 'Clear Log', 1500);
    });
  });
});
