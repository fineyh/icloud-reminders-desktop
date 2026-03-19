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
  },
  window: {
    toggleMini: () => ipcRenderer.invoke('window:toggle-mini'),
    close: () => ipcRenderer.invoke('window:close'),
    closeMini: () => ipcRenderer.invoke('window:close-mini'),
    minimizeMini: () => ipcRenderer.invoke('window:minimize-mini'),
  },
  on: (channel, callback) => {
    const validChannels = ['reminders:update', 'reminders:refresh'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
