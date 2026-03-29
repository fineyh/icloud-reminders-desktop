const { app } = require('electron');
const { startBackend, stopBackend } = require('./python-bridge');
const { createPanelWindow, togglePanel, getPanelWindow, showQuickAdd } = require('./windows');
const { createTray, getTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');
const { setupIpcHandlers } = require('./ipc-handlers');
const { toggleMiniWindow } = require('./windows');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  const tray = getTray();
  if (tray) togglePanel(tray);
});

app.whenReady().then(async () => {
  try {
    // Start Python backend and wait for it to be ready
    console.log('Starting Python backend...');
    await startBackend();
    console.log('Python backend started successfully.');
  } catch (err) {
    console.error('Failed to start backend:', err.message);
    // Continue anyway - user can see error in UI
  }

  // Setup IPC handlers
  setupIpcHandlers();

  // Create panel window (hidden initially)
  createPanelWindow();

  // Create system tray
  const onTogglePanel = () => {
    const tray = getTray();
    if (tray) togglePanel(tray);
  };

  const onRefresh = () => {
    const panel = getPanelWindow();
    if (panel && !panel.isDestroyed()) {
      panel.webContents.send('reminders:refresh');
    }
  };

  createTray({
    onTogglePanel,
    onToggleMini: toggleMiniWindow,
    onRefresh,
    onQuit: () => app.quit(),
  });

  // Register global shortcuts
  registerShortcuts({ onTogglePanel, onQuickAdd: showQuickAdd });

  console.log('iCloud Reminders app is ready. Look for the tray icon.');
});

// Keep app running when all windows are closed (tray app behavior)
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', async () => {
  unregisterAll();
  await stopBackend();
});
