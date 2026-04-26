const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    login: (email, password, remember, useInternational) => ipcRenderer.invoke('auth:login', email, password, remember, useInternational),
    verify2fa: (code) => ipcRenderer.invoke('auth:2fa', code),
    sendSmsCode: () => ipcRenderer.invoke('auth:send-sms'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  reminders: {
    fetch: () => ipcRenderer.invoke('reminders:fetch'),
    complete: (recordName, recordChangeTag) => ipcRenderer.invoke('reminders:complete', recordName, recordChangeTag),
    uncomplete: (recordName, recordChangeTag) => ipcRenderer.invoke('reminders:uncomplete', recordName, recordChangeTag),
    create: (title, listName) => ipcRenderer.invoke('reminders:create', title, listName),
    lists: () => ipcRenderer.invoke('reminders:lists'),
    reorder: (listName, reminderIds) => ipcRenderer.invoke('reminders:reorder', listName, reminderIds),
    move: (recordName, sourceListName, targetListName) => ipcRenderer.invoke('reminders:move', recordName, sourceListName, targetListName),
  },
  window: {
    toggleMini: () => ipcRenderer.invoke('window:toggle-mini'),
    togglePanelPin: () => ipcRenderer.invoke('window:toggle-panel-pin'),
    toggleMiniPin: () => ipcRenderer.invoke('window:toggle-mini-pin'),
    close: () => ipcRenderer.invoke('window:close'),
    closeMini: () => ipcRenderer.invoke('window:close-mini'),
    showQuickAdd: () => ipcRenderer.invoke('window:show-quick-add'),
    closeQuickAdd: () => ipcRenderer.invoke('window:close-quick-add'),
    minimizeMini: () => ipcRenderer.invoke('window:minimize-mini'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
    getSystemTheme: () => ipcRenderer.invoke('settings:get-system-theme'),
  },
  shortcuts: {
    get: () => ipcRenderer.invoke('shortcuts:get'),
    set: (action, accelerator) => ipcRenderer.invoke('shortcuts:set', { action, accelerator }),
    reset: () => ipcRenderer.invoke('shortcuts:reset'),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    getSystemLocale: () => ipcRenderer.invoke('app:system-locale'),
  },
  on: (channel, callback) => {
    const validChannels = ['reminders:update', 'reminders:refresh', 'theme-changed', 'quick-add:show', 'update:status', 'locale-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
