const { ipcMain, app } = require('electron');
const Store = require('electron-store');
const { getBackendUrl } = require('./python-bridge');
const { toggleMiniWindow, getPanelWindow, getMiniWindow } = require('./windows');

const store = new Store();

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

  ipcMain.handle('auth:login', async (_event, email, password, remember) => {
    return backendFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    });
  });

  ipcMain.handle('auth:2fa', async (_event, code) => {
    return backendFetch('/api/auth/2fa', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  });

  ipcMain.handle('auth:logout', async () => {
    return backendFetch('/api/auth/logout', { method: 'POST' });
  });

  ipcMain.handle('reminders:fetch', async () => {
    const result = await backendFetch('/api/reminders');
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

  // --- Settings ---
  ipcMain.handle('settings:get', async () => {
    const loginSettings = app.getLoginItemSettings();
    return {
      autoLaunch: loginSettings.openAtLogin,
    };
  });

  ipcMain.handle('settings:set', async (_event, settings) => {
    if (typeof settings.autoLaunch === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: settings.autoLaunch });
    }
    return { ok: true };
  });
}

module.exports = { setupIpcHandlers };
