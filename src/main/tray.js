const { Tray, Menu } = require('electron');
const path = require('path');
const { t } = require('./i18n');

let tray = null;
let trayCallbacks = null;

function buildContextMenu() {
  if (!trayCallbacks) return Menu.buildFromTemplate([]);
  return Menu.buildFromTemplate([
    { label: t('trayShow'), click: trayCallbacks.onTogglePanel },
    { label: t('trayMini'), click: trayCallbacks.onToggleMini },
    { type: 'separator' },
    { label: t('trayRefresh'), click: trayCallbacks.onRefresh },
    { type: 'separator' },
    { label: t('trayQuit'), click: trayCallbacks.onQuit },
  ]);
}

function createTray(callbacks) {
  trayCallbacks = callbacks;
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'tray-icon.ico');
  tray = new Tray(iconPath);

  tray.setToolTip(t('appTitle'));
  tray.setContextMenu(buildContextMenu());

  // Left click toggles panel
  tray.on('click', () => {
    callbacks.onTogglePanel();
  });

  return tray;
}

function rebuildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(t('appTitle'));
  tray.setContextMenu(buildContextMenu());
}

function getTray() {
  return tray;
}

module.exports = { createTray, getTray, rebuildTrayMenu };
