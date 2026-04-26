const { ipcMain, app, Notification, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const { getBackendUrl } = require('./python-bridge');
const { toggleMiniWindow, togglePanelAlwaysOnTop, toggleMiniAlwaysOnTop, getPanelWindow, getMiniWindow, getQuickAddWindow, showQuickAdd } = require('./windows');
const { getShortcuts, validateShortcut, reregisterShortcuts, DEFAULT_SHORTCUTS } = require('./shortcuts');

const store = new Store();

// Track which reminders we've already notified about (by recordName)
const notifiedReminders = new Set();
// Track the last date we sent the daily summary notification (YYYY-MM-DD)
let lastDailySummaryDate = null;

function setupIpcHandlers() {
  const backendUrl = getBackendUrl();

  async function backendFetch(endpoint, options = {}) {
    const response = await fetch(`${backendUrl}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return response.json();
  }

  ipcMain.handle('auth:status', async () => {
    return backendFetch('/api/auth/status');
  });

  ipcMain.handle('auth:login', async (_event, email, password, remember, useInternational) => {
    return backendFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember, use_international: useInternational }),
    });
  });

  ipcMain.handle('auth:2fa', async (_event, code) => {
    return backendFetch('/api/auth/2fa', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  });

  ipcMain.handle('auth:send-sms', async () => {
    return backendFetch('/api/auth/2fa/send-sms', { method: 'POST' });
  });

  ipcMain.handle('auth:logout', async () => {
    return backendFetch('/api/auth/logout', { method: 'POST' });
  });

  ipcMain.handle('reminders:complete', async (_event, recordName, recordChangeTag) => {
    return backendFetch('/api/reminders/complete', {
      method: 'POST',
      body: JSON.stringify({ recordName, recordChangeTag }),
    });
  });

  ipcMain.handle('reminders:uncomplete', async (_event, recordName, recordChangeTag) => {
    return backendFetch('/api/reminders/uncomplete', {
      method: 'POST',
      body: JSON.stringify({ recordName, recordChangeTag }),
    });
  });

  function checkDueNotifications(result) {
    if (!result || !result.lists) return;

    const now = new Date();
    const iconPath = require('path').join(__dirname, '..', 'renderer', 'assets', 'app-icon.ico');

    // --- Per-item due notifications ---
    if (store.get('notificationsEnabled', true)) {
      Object.entries(result.lists).forEach(([listName, items]) => {
        items.forEach((item) => {
          if (item.completed || !item.due_date || !item.recordName) return;
          if (notifiedReminders.has(item.recordName)) return;

          const dueDate = new Date(item.due_date);
          const diffMs = dueDate - now;

          // Notify if due within next 5 minutes or already overdue (within last 24h)
          if (diffMs <= 5 * 60 * 1000 && diffMs > -24 * 60 * 60 * 1000) {
            notifiedReminders.add(item.recordName);
            const notification = new Notification({
              title: '提醒事项到期',
              body: item.title + (listName ? ` (${listName})` : ''),
              icon: iconPath,
            });
            notification.show();
          }
        });
      });
    }

    // --- Daily summary notification ---
    if (store.get('dailySummaryEnabled', true)) {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (lastDailySummaryDate !== todayStr) {
        // Collect all items due today (not completed)
        const todayItems = [];
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        Object.entries(result.lists).forEach(([listName, items]) => {
          items.forEach((item) => {
            if (item.completed || !item.due_date) return;
            const dueDate = new Date(item.due_date);
            if (dueDate >= todayStart && dueDate <= todayEnd) {
              todayItems.push({ ...item, listName });
            }
          });
        });

        if (todayItems.length > 0) {
          lastDailySummaryDate = todayStr;
          const titles = todayItems.slice(0, 3).map((i) => i.title);
          let body = titles.join('、');
          if (todayItems.length > 3) {
            body += ` 等 ${todayItems.length} 项`;
          }
          const notification = new Notification({
            title: `今日有 ${todayItems.length} 项提醒事项到期`,
            body,
            icon: iconPath,
          });
          notification.show();
        }
      }
    }
  }

  ipcMain.handle('reminders:create', async (_event, title, listName) => {
    return backendFetch('/api/reminders/create', {
      method: 'POST',
      body: JSON.stringify({ title, listName }),
    });
  });

  ipcMain.handle('reminders:reorder', async (_event, listName, reminderIds) => {
    return backendFetch('/api/reminders/reorder', {
      method: 'POST',
      body: JSON.stringify({ listName, reminderIds }),
    });
  });

  ipcMain.handle('reminders:move', async (_event, recordName, sourceListName, targetListName) => {
    return backendFetch('/api/reminders/move', {
      method: 'POST',
      body: JSON.stringify({ recordName, sourceListName, targetListName }),
    });
  });

  ipcMain.handle('reminders:lists', async () => {
    return backendFetch('/api/reminders/lists');
  });

  ipcMain.handle('reminders:fetch', async () => {
    const result = await backendFetch('/api/reminders');
    // Check for due reminders and notify
    checkDueNotifications(result);
    // Also send to mini window if it exists
    const miniWin = getMiniWindow();
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.webContents.send('reminders:update', result);
    }
    return result;
  });

  ipcMain.handle('window:toggle-mini', async () => {
    toggleMiniWindow();
    return { ok: true };
  });

  ipcMain.handle('window:close', async () => {
    const panel = getPanelWindow();
    if (panel) panel.hide();
    return { ok: true };
  });

  ipcMain.handle('window:minimize-mini', async () => {
    const miniWin = getMiniWindow();
    if (miniWin) miniWin.minimize();
    return { ok: true };
  });

  ipcMain.handle('window:close-mini', async () => {
    const miniWin = getMiniWindow();
    if (miniWin) miniWin.hide();
    return { ok: true };
  });

  ipcMain.handle('window:show-quick-add', async () => {
    showQuickAdd();
    return { ok: true };
  });

  ipcMain.handle('window:close-quick-add', async () => {
    const qaWin = getQuickAddWindow();
    if (qaWin) qaWin.hide();
    // Notify panel to refresh
    const panel = getPanelWindow();
    if (panel && !panel.isDestroyed()) {
      panel.webContents.send('reminders:refresh');
    }
    const miniWin = getMiniWindow();
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.webContents.send('reminders:refresh');
    }
    return { ok: true };
  });

  ipcMain.handle('window:toggle-panel-pin', async () => {
    const pinned = togglePanelAlwaysOnTop();
    return { ok: true, pinned };
  });

  ipcMain.handle('window:toggle-mini-pin', async () => {
    const pinned = toggleMiniAlwaysOnTop();
    return { ok: true, pinned };
  });

  // --- Settings ---
  ipcMain.handle('settings:get', async () => {
    const loginSettings = app.getLoginItemSettings();
    return {
      autoLaunch: loginSettings.openAtLogin,
      notificationsEnabled: store.get('notificationsEnabled', true),
      dailySummaryEnabled: store.get('dailySummaryEnabled', true),
      darkMode: store.get('darkMode', 'system'),
      refreshInterval: store.get('refreshInterval', 5),
    };
  });

  ipcMain.handle('settings:set', async (_event, settings) => {
    if (typeof settings.autoLaunch === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: settings.autoLaunch });
    }
    if (typeof settings.notificationsEnabled === 'boolean') {
      store.set('notificationsEnabled', settings.notificationsEnabled);
    }
    if (typeof settings.dailySummaryEnabled === 'boolean') {
      store.set('dailySummaryEnabled', settings.dailySummaryEnabled);
    }
    if (typeof settings.darkMode === 'string') {
      store.set('darkMode', settings.darkMode);
    }
    if (typeof settings.refreshInterval === 'number') {
      store.set('refreshInterval', settings.refreshInterval);
    }
    return { ok: true };
  });

  ipcMain.handle('settings:get-system-theme', async () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  // --- Shortcuts ---
  ipcMain.handle('shortcuts:get', async () => {
    return {
      current: getShortcuts(),
      defaults: DEFAULT_SHORTCUTS,
    };
  });

  ipcMain.handle('shortcuts:set', async (_event, { action, accelerator }) => {
    const validation = validateShortcut(accelerator, action);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }

    const previous = getShortcuts();
    const updated = { ...previous, [action]: accelerator };
    store.set('shortcuts', updated);

    const result = reregisterShortcuts();
    if (!result[action]) {
      // Registration failed, revert
      store.set('shortcuts', previous);
      reregisterShortcuts();
      return { ok: false, error: '该快捷键已被其他应用占用' };
    }

    return { ok: true };
  });

  ipcMain.handle('shortcuts:reset', async () => {
    store.delete('shortcuts');
    reregisterShortcuts();
    return { ok: true, shortcuts: DEFAULT_SHORTCUTS };
  });

  // --- Update ---
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { status: 'checking' };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  function sendUpdateStatus(data) {
    const panel = getPanelWindow();
    if (panel && !panel.isDestroyed()) {
      panel.webContents.send('update:status', data);
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus({ status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({ status: 'downloading', percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', () => {
    sendUpdateStatus({ status: 'downloaded' });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateStatus({ status: 'error', message: err.message });
  });

  // Broadcast system theme changes to all windows
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    const panel = getPanelWindow();
    if (panel && !panel.isDestroyed()) {
      panel.webContents.send('theme-changed', theme);
    }
    const miniWin = getMiniWindow();
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.webContents.send('theme-changed', theme);
    }
  });
}

module.exports = { setupIpcHandlers };
