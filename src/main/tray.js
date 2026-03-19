const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function createTray({ onTogglePanel, onToggleMini, onRefresh, onQuit }) {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'tray-icon.ico');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示提醒',
      click: onTogglePanel,
    },
    {
      label: '迷你窗口',
      click: onToggleMini,
    },
    { type: 'separator' },
    {
      label: '刷新',
      click: onRefresh,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: onQuit,
    },
  ]);

  tray.setToolTip('iCloud 提醒事项');
  tray.setContextMenu(contextMenu);

  // Left click toggles panel
  tray.on('click', () => {
    onTogglePanel();
  });

  return tray;
}

function getTray() {
  return tray;
}

module.exports = { createTray, getTray };
