// Shared i18n runtime for all renderer pages.
// Loaded before page-specific scripts via <script src="js/i18n.js">.
(function () {
  const DICTS = {
    'zh-CN': {
      appTitle: 'iCloud 提醒事项',
      close: '关闭',
      minimize: '最小化',
      pin: '置顶',
      miniWindow: '迷你窗口',
      refresh: '刷新',
      menu: '菜单',
      back: '返回',

      loginTitle: '登录 iCloud',
      loginSubtitle: '使用 Apple ID 查看您的提醒事项',
      appleIdLabel: 'Apple ID（邮箱或手机号）',
      appleIdPlaceholder: '手机号 / example@icloud.com',
      passwordLabel: '密码',
      passwordPlaceholder: '输入密码',
      rememberMe: '记住我',
      useInternational: '使用国际端点（手机号账号被风控/503 时勾选）',
      login: '登录',
      loginInProgress: '登录中...',
      loginFailed: '登录失败',
      backendConnectFailed: '连接后端服务失败',

      twofaTitle: '双重认证',
      twofaSubtitle: '请输入发送到您受信任设备上的验证码',
      verify: '验证',
      verifying: '验证中...',
      verifyFailed: '验证失败',
      completeCode6: '请输入完整的 6 位验证码',
      sendSmsDefault: '收不到弹窗？发送短信验证码',
      sendingSms: '发送中...',
      smsSendFailed: '发送短信失败',
      smsRequestedTail: '尾号 {tail}',
      smsRequestedTrusted: '受信任手机号',
      smsRequestedInfo: '已请求发送短信验证码到{target}，请在下方输入收到的 6 位数字',
      smsCountdown: '请等待 {seconds}s 后重试',
      backToLogin: '返回登录',

      settings: '设置',
      autoLaunch: '开机自启动',
      autoLaunchDesc: '登录 Windows 时自动启动应用',
      notifications: '到期提醒通知',
      notificationsDesc: '提醒事项到期时弹出桌面通知',
      dailySummary: '今日待办汇总',
      dailySummaryDesc: '每天首次加载时通知当天到期的事项',
      themeMode: '外观模式',
      themeModeDesc: '切换亮色 / 暗色主题',
      themeSystem: '跟随系统',
      themeLight: '浅色',
      themeDark: '深色',
      refreshInterval: '自动刷新间隔',
      refreshIntervalDesc: '定时从 iCloud 同步最新提醒事项',
      refresh1m: '1 分钟',
      refresh5m: '5 分钟',
      refresh15m: '15 分钟',
      refreshManual: '仅手动刷新',
      shortcutsSection: '快捷键',
      shortcutTogglePanel: '显示/隐藏面板',
      shortcutTogglePanelDesc: '全局快捷键，在任意位置切换面板窗口',
      shortcutQuickAdd: '快速添加',
      shortcutQuickAddDesc: '全局快捷键，打开快速添加提醒窗口',
      resetDefault: '恢复默认',
      currentVersion: '当前版本',
      checkUpdate: '检查更新',
      checkingUpdate: '检查中...',
      downloadUpdate: '下载更新',
      installUpdate: '立即安装',
      language: '语言',
      languageDesc: '选择应用界面语言',
      localeSystem: '跟随系统',

      quickAddTooltip: '快速添加 ({shortcut})',
      reminders: '提醒事项',
      logout: '退出登录',
      searchPlaceholder: '搜索提醒事项...',
      completed: '已完成',
      details: '详细信息',

      smartToday: '今天',
      smartUpcoming: '即将到期',
      smartFlagged: '已标旗',

      noMatch: '没有匹配的提醒事项',
      noReminders: '没有提醒事项',
      allCompleted: '所有事项已完成',
      searchResults: '搜索结果',

      updatedAt: '更新于 {time}',
      itemsPending: '{count} 项待办',

      detailTitle: '标题',
      detailNotes: '备注',
      detailDueDate: '截止日期',
      detailPriority: '优先级',
      detailFlag: '标旗',
      detailList: '所属列表',
      detailStatus: '状态',
      statusCompleted: '已完成',
      statusPending: '待完成',
      flaggedYes: '⚑ 已标旗',
      flaggedNo: '未标旗',
      none: '无',
      priorityHigh: '高',
      priorityMedium: '中',
      priorityLow: '低',

      today: '今天',
      tomorrow: '明天',
      yesterday: '昨天',
      daysLater: '{n} 天后',
      daysAgo: '{n} 天前',

      updateChecking: '正在检查更新...',
      updateAvailable: '发现新版本 v{version}',
      upToDate: '已是最新版本',
      updateDownloading: '正在下载更新... {percent}%',
      updateDownloaded: '更新已下载，重启后生效',
      updateError: '检查更新失败',

      recordShortcut: '请按下快捷键...',
      requireModifier: '快捷键必须包含修饰键（Ctrl、Alt、Shift）',
      shortcutTaken: '该快捷键已被其他应用占用',
      shortcutDuplicate: '该快捷键已被其他功能使用',

      miniLoginPrompt: '请先在主面板登录 iCloud',
      miniEmpty: '没有待办事项',

      quickAddTitle: '快速添加提醒',
      quickAddEsc: 'Esc 关闭',
      quickAddPlaceholder: '输入提醒事项...',
      listLoading: '加载中...',
      listLoadFailed: '无法加载列表',
      listEmpty: '无可用列表',
      listLoadError: '加载失败',
      creating: '正在创建...',
      added: '已添加',
      createFailed: '创建失败: {message}',
      addBtn: '添加',
    },

    'en': {
      appTitle: 'iCloud Reminders',
      close: 'Close',
      minimize: 'Minimize',
      pin: 'Pin',
      miniWindow: 'Mini window',
      refresh: 'Refresh',
      menu: 'Menu',
      back: 'Back',

      loginTitle: 'Sign in to iCloud',
      loginSubtitle: 'Use your Apple ID to view your reminders',
      appleIdLabel: 'Apple ID (email or phone number)',
      appleIdPlaceholder: 'phone / example@icloud.com',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter password',
      rememberMe: 'Remember me',
      useInternational: 'Use international endpoint (check if phone-number account hits 503)',
      login: 'Sign in',
      loginInProgress: 'Signing in...',
      loginFailed: 'Sign in failed',
      backendConnectFailed: 'Failed to connect to backend service',

      twofaTitle: 'Two-factor authentication',
      twofaSubtitle: 'Enter the verification code sent to your trusted device',
      verify: 'Verify',
      verifying: 'Verifying...',
      verifyFailed: 'Verification failed',
      completeCode6: 'Please enter the complete 6-digit code',
      sendSmsDefault: 'Did not receive prompt? Send SMS code',
      sendingSms: 'Sending...',
      smsSendFailed: 'Failed to send SMS',
      smsRequestedTail: 'number ending in {tail}',
      smsRequestedTrusted: 'trusted phone number',
      smsRequestedInfo: 'SMS code sent to {target}. Enter the 6-digit code below.',
      smsCountdown: 'Wait {seconds}s before retrying',
      backToLogin: 'Back to sign in',

      settings: 'Settings',
      autoLaunch: 'Launch on startup',
      autoLaunchDesc: 'Start the app automatically when you sign in to Windows',
      notifications: 'Due-date notifications',
      notificationsDesc: 'Show a desktop notification when a reminder is due',
      dailySummary: "Today's summary",
      dailySummaryDesc: 'Notify on first load each day about items due today',
      themeMode: 'Appearance',
      themeModeDesc: 'Switch between light and dark themes',
      themeSystem: 'Follow system',
      themeLight: 'Light',
      themeDark: 'Dark',
      refreshInterval: 'Auto-refresh interval',
      refreshIntervalDesc: 'Periodically sync reminders from iCloud',
      refresh1m: '1 minute',
      refresh5m: '5 minutes',
      refresh15m: '15 minutes',
      refreshManual: 'Manual only',
      shortcutsSection: 'Keyboard shortcuts',
      shortcutTogglePanel: 'Show/hide panel',
      shortcutTogglePanelDesc: 'Global shortcut to toggle the panel window from anywhere',
      shortcutQuickAdd: 'Quick add',
      shortcutQuickAddDesc: 'Global shortcut to open the quick-add reminder window',
      resetDefault: 'Reset to default',
      currentVersion: 'Current version',
      checkUpdate: 'Check for updates',
      checkingUpdate: 'Checking...',
      downloadUpdate: 'Download update',
      installUpdate: 'Install now',
      language: 'Language',
      languageDesc: 'Choose the application interface language',
      localeSystem: 'Follow system',

      quickAddTooltip: 'Quick add ({shortcut})',
      reminders: 'Reminders',
      logout: 'Sign out',
      searchPlaceholder: 'Search reminders...',
      completed: 'Completed',
      details: 'Details',

      smartToday: 'Today',
      smartUpcoming: 'Upcoming',
      smartFlagged: 'Flagged',

      noMatch: 'No matching reminders',
      noReminders: 'No reminders',
      allCompleted: 'All items completed',
      searchResults: 'Search results',

      updatedAt: 'Updated {time}',
      itemsPending: '{count} pending',

      detailTitle: 'Title',
      detailNotes: 'Notes',
      detailDueDate: 'Due date',
      detailPriority: 'Priority',
      detailFlag: 'Flag',
      detailList: 'List',
      detailStatus: 'Status',
      statusCompleted: 'Completed',
      statusPending: 'Pending',
      flaggedYes: '⚑ Flagged',
      flaggedNo: 'Not flagged',
      none: 'None',
      priorityHigh: 'High',
      priorityMedium: 'Medium',
      priorityLow: 'Low',

      today: 'Today',
      tomorrow: 'Tomorrow',
      yesterday: 'Yesterday',
      daysLater: 'In {n} days',
      daysAgo: '{n} days ago',

      updateChecking: 'Checking for updates...',
      updateAvailable: 'New version available: v{version}',
      upToDate: 'You are up to date',
      updateDownloading: 'Downloading update... {percent}%',
      updateDownloaded: 'Update downloaded — applies on restart',
      updateError: 'Update check failed',

      recordShortcut: 'Press a shortcut...',
      requireModifier: 'Shortcut must include a modifier (Ctrl, Alt, Shift)',
      shortcutTaken: 'Shortcut is in use by another application',
      shortcutDuplicate: 'Shortcut is already used by another action',

      miniLoginPrompt: 'Please sign in to iCloud in the main panel',
      miniEmpty: 'No pending items',

      quickAddTitle: 'Quick add reminder',
      quickAddEsc: 'Esc to close',
      quickAddPlaceholder: 'Enter a reminder...',
      listLoading: 'Loading...',
      listLoadFailed: 'Cannot load lists',
      listEmpty: 'No lists available',
      listLoadError: 'Load failed',
      creating: 'Creating...',
      added: 'Added',
      createFailed: 'Failed to create: {message}',
      addBtn: 'Add',
    },
  };

  let current = 'zh-CN';

  function normalize(locale) {
    if (!locale) return 'zh-CN';
    if (locale === 'en' || locale.toLowerCase().startsWith('en')) return 'en';
    return 'zh-CN';
  }

  function t(key, params) {
    const dict = DICTS[current] || DICTS['zh-CN'];
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

  function setLocale(locale) {
    current = normalize(locale);
    document.documentElement.lang = current;
    applyTranslations();
    // Allow page scripts to refresh dynamic content.
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: current }));
  }

  function getLocale() {
    return current;
  }

  function applyTranslations(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
  }

  async function resolve(setting) {
    if (setting === 'en' || setting === 'zh-CN') return setting;
    try {
      const sys = await window.api.app.getSystemLocale();
      return normalize(sys);
    } catch {
      return 'zh-CN';
    }
  }

  async function init() {
    try {
      const settings = await window.api.settings.get();
      const locale = await resolve(settings.locale || 'system');
      setLocale(locale);
    } catch {
      setLocale('zh-CN');
    }
  }

  window.i18n = { t, setLocale, getLocale, applyTranslations, resolve, init };
})();
