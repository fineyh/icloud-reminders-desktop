const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    login: (email, password, remember) => ipcRenderer.invoke('auth:login', email, password, remember),
    verify2fa: (code) => ipcRenderer.invoke('auth:2fa', code),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  reminders: {
    fetch: () => ipcRenderer.invoke('reminders:fetch'),
    complete: (recordName, recordChangeTag) => ipcRenderer.invoke('reminders:complete', recordName, recordChangeTag),
    uncomplete: (recordName, recordChangeTag) => ipcRenderer.invoke('reminders:uncomplete', recordName, recordChangeTag),
  },
  window: {
    toggleMini: () => ipcRenderer.invoke('window:toggle-mini'),
    togglePanelPin: () => ipcRenderer.invoke('window:toggle-panel-pin'),
    toggleMiniPin: () => ipcRenderer.invoke('window:toggle-mini-pin'),
    close: () => ipcRenderer.invoke('window:close'),
    closeMini: () => ipcRenderer.invoke('window:close-mini'),
    minimizeMini: () => ipcRenderer.invoke('window:minimize-mini'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
    getSystemTheme: () => ipcRenderer.invoke('settings:get-system-theme'),
  },
  on: (channel, callback) => {
    const validChannels = ['reminders:update', 'reminders:refresh', 'theme-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
