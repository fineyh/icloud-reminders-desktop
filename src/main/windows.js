const { BrowserWindow, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

let panelWindow = null;
let miniWindow = null;

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 380,
    height: 520,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: '#f5f5f7',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'js', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  panelWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  panelWindow.on('blur', () => {
    if (!panelWindow.isAlwaysOnTop()) {
      panelWindow.hide();
    }
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
  });

  return panelWindow;
}

function createMiniWindow() {
  const savedBounds = store.get('miniWindowBounds', {
    width: 300,
    height: 400,
    x: undefined,
    y: undefined,
  });

  miniWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    frame: false,
    alwaysOnTop: false,
    resizable: true,
    minimizable: true,
    skipTaskbar: false,
    show: false,
    transparent: false,
    backgroundColor: '#f5f5f7',
    minWidth: 200,
    minHeight: 200,
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'js', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  miniWindow.loadFile(path.join(__dirname, '..', 'renderer', 'mini.html'));

  // Save position and size on move/resize
  const saveBounds = () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      store.set('miniWindowBounds', miniWindow.getBounds());
    }
  };
  miniWindow.on('moved', saveBounds);
  miniWindow.on('resized', saveBounds);

  miniWindow.on('closed', () => {
    miniWindow = null;
  });

  return miniWindow;
}

function showPanelNearTray(tray) {
  if (!panelWindow) return;

  const trayBounds = tray.getBounds();
  const windowBounds = panelWindow.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const workArea = display.workArea;

  // Position above and right-aligned to tray icon
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  let y = Math.round(trayBounds.y - windowBounds.height - 4);

  // Keep within work area
  if (x + windowBounds.width > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - windowBounds.width;
  }
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) {
    // Tray is at the top, show below
    y = trayBounds.y + trayBounds.height + 4;
  }

  panelWindow.setPosition(x, y);
  panelWindow.show();
  panelWindow.focus();
}

function togglePanel(tray) {
  if (!panelWindow) return;
  if (panelWindow.isVisible()) {
    panelWindow.hide();
  } else {
    showPanelNearTray(tray);
  }
}

function toggleMiniWindow() {
  if (!miniWindow) {
    miniWindow = createMiniWindow();
  }
  if (miniWindow.isVisible()) {
    miniWindow.hide();
  } else {
    miniWindow.show();
    miniWindow.focus();
  }
}

function togglePanelAlwaysOnTop() {
  if (!panelWindow) return false;
  const pinned = !panelWindow.isAlwaysOnTop();
  panelWindow.setAlwaysOnTop(pinned, 'floating');
  return pinned;
}

function toggleMiniAlwaysOnTop() {
  if (!miniWindow) return false;
  const pinned = !miniWindow.isAlwaysOnTop();
  miniWindow.setAlwaysOnTop(pinned, 'floating');
  return pinned;
}

function getPanelWindow() {
  return panelWindow;
}

function getMiniWindow() {
  return miniWindow;
}

module.exports = {
  createPanelWindow,
  createMiniWindow,
  showPanelNearTray,
  togglePanel,
  toggleMiniWindow,
  togglePanelAlwaysOnTop,
  toggleMiniAlwaysOnTop,
  getPanelWindow,
  getMiniWindow,
};
