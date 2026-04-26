// i18n for the main process: tray menu, notifications, shortcut error messages.
const { app } = require('electron');
const Store = require('electron-store');

const store = new Store();

const DICTS = {
  'zh-CN': {
    appTitle: 'iCloud 提醒事项',
    trayShow: '显示提醒',
    trayMini: '迷你窗口',
    trayRefresh: '刷新',
    trayQuit: '退出',
    notifyDueTitle: '提醒事项到期',
    notifyDailyTitle: '今日有 {count} 项提醒事项到期',
    notifyDailyEtc: ' 等 {count} 项',
    notifyDailySeparator: '、',
    requireModifier: '快捷键必须包含修饰键（Ctrl、Alt、Shift）',
    shortcutTaken: '该快捷键已被其他应用占用',
    shortcutDuplicate: '该快捷键已被其他功能使用',
  },
  'en': {
    appTitle: 'iCloud Reminders',
    trayShow: 'Show reminders',
    trayMini: 'Mini window',
    trayRefresh: 'Refresh',
    trayQuit: 'Quit',
    notifyDueTitle: 'Reminder due',
    notifyDailyTitle: '{count} reminders due today',
    notifyDailyEtc: ' and {count} more',
    notifyDailySeparator: ', ',
    requireModifier: 'Shortcut must include a modifier (Ctrl, Alt, Shift)',
    shortcutTaken: 'Shortcut is in use by another application',
    shortcutDuplicate: 'Shortcut is already used by another action',
  },
};

function normalize(locale) {
  if (!locale) return 'zh-CN';
  if (locale === 'en' || locale.toLowerCase().startsWith('en')) return 'en';
  return 'zh-CN';
}

function getLocale() {
  const setting = store.get('locale', 'system');
  if (setting === 'en' || setting === 'zh-CN') return setting;
  return normalize(app.getLocale());
}

function t(key, params) {
  const locale = getLocale();
  const dict = DICTS[locale] || DICTS['zh-CN'];
  let str = dict[key];
  if (str === undefined) str = DICTS['zh-CN'][key];
  if (str === undefined) return key;
  if (params) {
    for (const k of Object.keys(params)) {
      str = str.split('{' + k + '}').join(params[k]);
    }
  }
  return str;
}

module.exports = { t, getLocale };
