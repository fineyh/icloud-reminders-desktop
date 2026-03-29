// Main panel application logic
(function () {
  // State
  let remindersData = null;
  let currentList = null;
  let refreshTimer = null;
  let showCompleted = false;
  let searchQuery = '';

  // Smart Lists definition
  const SMART_LISTS = [
    { id: '@today', label: '今天', icon: '\u2606' },
    { id: '@upcoming', label: '即将到期', icon: '\u29D6' },
    { id: '@flagged', label: '已标旗', icon: '\u2691' },
  ];

  function isSmartList(listId) {
    return listId && listId.startsWith('@');
  }

  function getAllItems() {
    if (!remindersData) return [];
    const all = [];
    Object.values(remindersData).forEach((items) => {
      items.forEach((item) => all.push(item));
    });
    return all;
  }

  function getSmartListItems(listId) {
    const allItems = getAllItems();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    switch (listId) {
      case '@today':
        return allItems.filter((item) => {
          if (!item.due_date) return false;
          const d = new Date(item.due_date);
          return d <= todayEnd; // due today or already overdue
        });
      case '@upcoming': {
        const sevenDays = new Date(todayStart);
        sevenDays.setDate(sevenDays.getDate() + 7);
        return allItems.filter((item) => {
          if (item.completed || !item.due_date) return false;
          const d = new Date(item.due_date);
          return d > todayEnd && d <= sevenDays;
        });
      }
      case '@flagged':
        return allItems.filter((item) => item.flagged);
      default:
        return [];
    }
  }

  function getSmartListDisplayName(listId) {
    const sl = SMART_LISTS.find((s) => s.id === listId);
    return sl ? sl.label : listId;
  }

  // DOM elements
  const views = {
    login: document.getElementById('login-view'),
    twofa: document.getElementById('twofa-view'),
    reminders: document.getElementById('reminders-view'),
    settings: document.getElementById('settings-view'),
  };
  const loadingOverlay = document.getElementById('loading-overlay');

  // --- View Management ---
  function showView(name) {
    Object.values(views).forEach((v) => (v.classList.remove('active')));
    if (views[name]) views[name].classList.add('active');
  }

  function showLoading(show) {
    loadingOverlay.classList.toggle('hidden', !show);
  }

  // --- Login ---
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    if (!email || !password) return;

    loginError.textContent = '';
    btnLogin.disabled = true;
    btnLogin.textContent = '登录中...';

    try {
      const result = await window.api.auth.login(email, password, remember);
      if (result.status === 'ok') {
        await loadReminders();
        showView('reminders');
        startAutoRefresh();
      } else if (result.status === '2fa_required') {
        showView('twofa');
        focusFirstCodeInput();
      } else {
        loginError.textContent = result.message || '登录失败';
      }
    } catch (err) {
      loginError.textContent = '连接后端服务失败';
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = '登录';
    }
  });

  // --- 2FA ---
  const codeInputs = document.querySelectorAll('#code-inputs input');
  const twofaError = document.getElementById('twofa-error');
  const btnVerify = document.getElementById('btn-verify');

  function focusFirstCodeInput() {
    codeInputs[0].focus();
    codeInputs.forEach((input) => (input.value = ''));
  }

  function getCode() {
    return Array.from(codeInputs).map((i) => i.value).join('');
  }

  // Auto-advance code inputs
  codeInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val && index < codeInputs.length - 1) {
        codeInputs[index + 1].focus();
      }
      // Auto-submit when all 6 digits entered
      if (getCode().length === 6) {
        btnVerify.click();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        codeInputs[index - 1].focus();
      }
    });

    // Handle paste
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{6}$/.test(pasted)) {
        codeInputs.forEach((inp, i) => (inp.value = pasted[i] || ''));
        codeInputs[5].focus();
        btnVerify.click();
      }
    });
  });

  btnVerify.addEventListener('click', async () => {
    const code = getCode();
    if (code.length !== 6) {
      twofaError.textContent = '请输入完整的 6 位验证码';
      return;
    }

    twofaError.textContent = '';
    btnVerify.disabled = true;
    btnVerify.textContent = '验证中...';

    try {
      const result = await window.api.auth.verify2fa(code);
      if (result.status === 'ok') {
        await loadReminders();
        showView('reminders');
        startAutoRefresh();
      } else {
        twofaError.textContent = result.message || '验证失败';
        focusFirstCodeInput();
      }
    } catch (err) {
      twofaError.textContent = '连接后端服务失败';
    } finally {
      btnVerify.disabled = false;
      btnVerify.textContent = '验证';
    }
  });

  document.getElementById('btn-back-login').addEventListener('click', () => {
    showView('login');
  });

  // --- Reminders ---
  async function loadReminders() {
    try {
      const result = await window.api.reminders.fetch();
      if (result.error) {
        if (result.error.includes('Not authenticated')) {
          showView('login');
          stopAutoRefresh();
        }
        return;
      }
      remindersData = result.lists || {};
      const listNames = Object.keys(remindersData);
      if (listNames.length > 0 && (!currentList || (!isSmartList(currentList) && !remindersData[currentList]))) {
        currentList = listNames[0];
      }
      renderListTabs();
      renderReminders();
      updateStatusBar();
    } catch (err) {
      console.error('Failed to load reminders:', err);
    }
  }

  function renderListTabs() {
    const smartContainer = document.getElementById('smart-tabs');
    const tabsContainer = document.getElementById('list-tabs');
    smartContainer.innerHTML = '';
    tabsContainer.innerHTML = '';
    if (!remindersData) return;

    function createTab(container, id, label, isSmartTab) {
      const tab = document.createElement('button');
      tab.className = 'list-tab' + (id === currentList ? ' active' : '') + (isSmartTab ? ' smart' : '');
      tab.textContent = label;
      tab.addEventListener('click', () => {
        currentList = id;
        renderListTabs();
        renderReminders();
        updateStatusBar();
      });
      container.appendChild(tab);
    }

    // Smart lists — separate row
    SMART_LISTS.forEach((sl) => {
      createTab(smartContainer, sl.id, sl.icon + ' ' + sl.label, true);
    });

    // Regular lists
    Object.keys(remindersData).forEach((name) => {
      createTab(tabsContainer, name, name, false);
    });
  }

  function getFilteredItems() {
    if (!remindersData) return [];

    let items;
    if (searchQuery) {
      // Search across all lists
      items = [];
      Object.values(remindersData).forEach((listItems) => {
        listItems.forEach((item) => {
          if (item.title.toLowerCase().includes(searchQuery) ||
              (item.description && item.description.toLowerCase().includes(searchQuery))) {
            items.push(item);
          }
        });
      });
    } else if (isSmartList(currentList)) {
      items = getSmartListItems(currentList);
    } else if (currentList && remindersData[currentList]) {
      items = remindersData[currentList];
    } else {
      items = [];
    }
    return items;
  }

  function renderReminders() {
    const listContainer = document.getElementById('reminders-list');
    const completedSection = document.getElementById('completed-section');
    const completedItems = document.getElementById('completed-items');
    const completedCount = document.getElementById('completed-count');

    listContainer.innerHTML = '';
    completedItems.innerHTML = '';

    const items = getFilteredItems();

    if (items.length === 0) {
      const msg = searchQuery ? '没有匹配的提醒事项' : '没有提醒事项';
      const icon = searchQuery ? '&#x1F50D;' : '&#x1F4CB;';
      listContainer.innerHTML = `<div class="empty-state"><div class="icon">${icon}</div><p>${msg}</p></div>`;
      completedSection.style.display = 'none';
      return;
    }

    const pending = items.filter((r) => !r.completed);
    const completed = items.filter((r) => r.completed);

    if (pending.length === 0 && completed.length === 0) {
      listContainer.innerHTML = '<div class="empty-state"><div class="icon">&#x2705;</div><p>所有事项已完成</p></div>';
      completedSection.style.display = 'none';
      return;
    }

    pending.forEach((reminder) => {
      listContainer.appendChild(createReminderElement(reminder, false));
    });

    if (completed.length > 0) {
      completedSection.style.display = 'flex';
      completedCount.textContent = completed.length;
      completed.forEach((reminder) => {
        completedItems.appendChild(createReminderElement(reminder, true));
      });
    } else {
      completedSection.style.display = 'none';
    }

    const displayName = searchQuery ? '搜索结果' : (isSmartList(currentList) ? getSmartListDisplayName(currentList) : currentList);
    document.getElementById('current-list-title').textContent = displayName;
  }

  async function toggleReminder(reminder, isCompleted) {
    if (!reminder.recordName) return;
    try {
      let result;
      if (isCompleted) {
        result = await window.api.reminders.uncomplete(reminder.recordName, reminder.recordChangeTag);
      } else {
        result = await window.api.reminders.complete(reminder.recordName, reminder.recordChangeTag);
      }
      console.log('[TOGGLE] result:', JSON.stringify(result));
      if (result.error) {
        console.error('[TOGGLE] Server error:', result.error);
        return;
      }
      if (result.status === 'ok') {
        // Reload from server to get fresh data (including updated recordChangeTag)
        await loadReminders();
      }
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  }

  function createReminderElement(reminder, isCompleted) {
    const el = document.createElement('div');
    el.className = 'reminder-item';

    const checkbox = document.createElement('div');
    checkbox.className = 'reminder-checkbox' + (isCompleted ? ' completed' : '');

    if (reminder.recordName) {
      checkbox.addEventListener('click', () => toggleReminder(reminder, isCompleted));
    }

    const content = document.createElement('div');
    content.className = 'reminder-content';

    const title = document.createElement('div');
    title.className = 'reminder-title' + (isCompleted ? ' completed' : '');
    title.textContent = reminder.title;
    content.appendChild(title);

    if (reminder.due_date || reminder.flagged) {
      const meta = document.createElement('div');
      meta.className = 'reminder-meta';

      if (reminder.due_date) {
        const due = document.createElement('span');
        due.className = 'reminder-due';

        const dueDate = new Date(reminder.due_date);
        const hasTime = reminder.due_date.includes('T');
        const now = new Date();

        if (hasTime) {
          if (dueDate < now && !isCompleted) due.classList.add('overdue');
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (dueDate < today && !isCompleted) due.classList.add('overdue');
        }

        due.textContent = formatDate(reminder.due_date);
        meta.appendChild(due);
      }

      if (reminder.flagged) {
        const flag = document.createElement('span');
        flag.className = 'reminder-flag';
        flag.textContent = '\u2691';
        meta.appendChild(flag);
      }

      content.appendChild(meta);
    }

    el.appendChild(checkbox);
    el.appendChild(content);
    return el;
  }

  function formatDate(dateStr) {
    try {
      const hasTime = dateStr.includes('T');
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);

      let label;
      if (dateOnly.getTime() === today.getTime()) label = '今天';
      else if (dateOnly.getTime() === tomorrow.getTime()) label = '明天';
      else {
        const diff = Math.round((dateOnly - today) / 86400000);
        if (diff === -1) label = '昨天';
        else if (diff > 1 && diff <= 7) label = `${diff} 天后`;
        else if (diff < -1 && diff >= -7) label = `${Math.abs(diff)} 天前`;
        else label = `${date.getMonth() + 1}/${date.getDate()}`;
      }

      if (hasTime) {
        const hh = date.getHours().toString().padStart(2, '0');
        const mm = date.getMinutes().toString().padStart(2, '0');
        return `${label} ${hh}:${mm}`;
      }
      return label;
    } catch {
      return dateStr;
    }
  }

  function updateStatusBar() {
    const lastUpdated = document.getElementById('last-updated');
    const itemCount = document.getElementById('item-count');

    const now = new Date();
    lastUpdated.textContent = `更新于 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (remindersData && currentList) {
      let pending;
      if (isSmartList(currentList)) {
        pending = getFilteredItems().filter((r) => !r.completed).length;
      } else if (remindersData[currentList]) {
        pending = remindersData[currentList].filter((r) => !r.completed).length;
      } else {
        pending = 0;
      }
      itemCount.textContent = `${pending} 项待办`;
    }
  }

  // --- Search ---
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    searchClear.style.display = searchQuery ? 'flex' : 'none';
    // In search mode, hide both tab rows and search across all lists
    document.getElementById('smart-tabs').style.display = searchQuery ? 'none' : '';
    document.getElementById('list-tabs').style.display = searchQuery ? 'none' : 'flex';
    renderReminders();
    updateStatusBar();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.style.display = 'none';
    document.getElementById('smart-tabs').style.display = '';
    document.getElementById('list-tabs').style.display = 'flex';
    renderReminders();
    updateStatusBar();
  });

  // Completed section toggle
  document.getElementById('completed-toggle').addEventListener('click', function () {
    showCompleted = !showCompleted;
    this.classList.toggle('expanded', showCompleted);
    document.getElementById('completed-items').classList.toggle('show', showCompleted);
  });

  // Auto refresh
  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(loadReminders, 5 * 60 * 1000); // 5 minutes
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // --- Header Actions ---
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    showLoading(true);
    await loadReminders();
    showLoading(false);
  });

  document.getElementById('btn-pin').addEventListener('click', async () => {
    const result = await window.api.window.togglePanelPin();
    document.getElementById('btn-pin').classList.toggle('active', result.pinned);
  });

  document.getElementById('btn-mini').addEventListener('click', () => {
    window.api.window.toggleMini();
  });

  // Dropdown menu
  const btnMenu = document.getElementById('btn-menu');
  const dropdownMenu = document.getElementById('dropdown-menu');

  btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dropdownMenu.classList.remove('show');
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    dropdownMenu.classList.remove('show');
    await window.api.auth.logout();
    remindersData = null;
    currentList = null;
    stopAutoRefresh();
    showView('login');
  });

  // --- Settings ---
  document.getElementById('btn-settings').addEventListener('click', async () => {
    dropdownMenu.classList.remove('show');
    showView('settings');
    const settings = await window.api.settings.get();
    document.getElementById('toggle-auto-launch').checked = settings.autoLaunch;
    document.getElementById('toggle-notifications').checked = settings.notificationsEnabled !== false;
    document.getElementById('toggle-daily-summary').checked = settings.dailySummaryEnabled !== false;
    // Dark mode: set select value
    const darkModeSelect = document.getElementById('select-dark-mode');
    if (darkModeSelect) darkModeSelect.value = settings.darkMode || 'system';
  });

  document.getElementById('btn-settings-back').addEventListener('click', () => {
    showView('reminders');
  });

  document.getElementById('toggle-auto-launch').addEventListener('change', async (e) => {
    await window.api.settings.set({ autoLaunch: e.target.checked });
  });

  document.getElementById('toggle-notifications').addEventListener('change', async (e) => {
    await window.api.settings.set({ notificationsEnabled: e.target.checked });
  });

  document.getElementById('toggle-daily-summary').addEventListener('change', async (e) => {
    await window.api.settings.set({ dailySummaryEnabled: e.target.checked });
  });

  // Close button
  document.getElementById('btn-close').addEventListener('click', () => {
    window.api.window.close();
  });

  // Listen for refresh events from main process
  window.api.on('reminders:refresh', async () => {
    await loadReminders();
  });

  // --- Dark Mode ---
  async function applyTheme(mode) {
    let theme;
    if (mode === 'dark') {
      theme = 'dark';
    } else if (mode === 'light') {
      theme = 'light';
    } else {
      // system
      const systemTheme = await window.api.settings.getSystemTheme();
      theme = systemTheme;
    }
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  }

  async function initTheme() {
    const settings = await window.api.settings.get();
    await applyTheme(settings.darkMode || 'system');
  }

  document.getElementById('select-dark-mode').addEventListener('change', async (e) => {
    const mode = e.target.value;
    await window.api.settings.set({ darkMode: mode });
    await applyTheme(mode);
  });

  window.api.on('theme-changed', async () => {
    const settings = await window.api.settings.get();
    if ((settings.darkMode || 'system') === 'system') {
      await applyTheme('system');
    }
  });

  // --- Init ---
  async function init() {
    await initTheme();
    showLoading(true);
    try {
      const result = await window.api.auth.status();
      console.log('[INIT DEBUG] auth status result:', JSON.stringify(result));
      if (result.status === 'authenticated') {
        await loadReminders();
        showView('reminders');
        startAutoRefresh();
      } else if (result.status === 'needs_2fa') {
        showView('twofa');
        focusFirstCodeInput();
      } else {
        showView('login');
      }
    } catch (err) {
      console.error('Init error:', err);
      showView('login');
    } finally {
      showLoading(false);
    }
  }

  init();
})();
