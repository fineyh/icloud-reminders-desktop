// Main panel application logic
(function () {
  // State
  let remindersData = null;
  let currentList = null;
  let refreshTimer = null;
  let showCompleted = false;

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
      if (listNames.length > 0 && (!currentList || !remindersData[currentList])) {
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
    const tabsContainer = document.getElementById('list-tabs');
    tabsContainer.innerHTML = '';
    if (!remindersData) return;

    Object.keys(remindersData).forEach((name) => {
      const tab = document.createElement('button');
      tab.className = 'list-tab' + (name === currentList ? ' active' : '');
      tab.textContent = name;
      tab.addEventListener('click', () => {
        currentList = name;
        renderListTabs();
        renderReminders();
        updateStatusBar();
      });
      tabsContainer.appendChild(tab);
    });
  }

  function renderReminders() {
    const listContainer = document.getElementById('reminders-list');
    const completedSection = document.getElementById('completed-section');
    const completedItems = document.getElementById('completed-items');
    const completedCount = document.getElementById('completed-count');

    listContainer.innerHTML = '';
    completedItems.innerHTML = '';

    if (!remindersData || !currentList || !remindersData[currentList]) {
      listContainer.innerHTML = '<div class="empty-state"><div class="icon">&#x1F4CB;</div><p>没有提醒事项</p></div>';
      completedSection.style.display = 'none';
      return;
    }

    const items = remindersData[currentList];
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

    document.getElementById('current-list-title').textContent = currentList;
  }

  function createReminderElement(reminder, isCompleted) {
    const el = document.createElement('div');
    el.className = 'reminder-item';

    const checkbox = document.createElement('div');
    checkbox.className = 'reminder-checkbox' + (isCompleted ? ' completed' : '');

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

    if (remindersData && currentList && remindersData[currentList]) {
      const pending = remindersData[currentList].filter((r) => !r.completed).length;
      itemCount.textContent = `${pending} 项待办`;
    }
  }

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
  });

  document.getElementById('btn-settings-back').addEventListener('click', () => {
    showView('reminders');
  });

  document.getElementById('toggle-auto-launch').addEventListener('change', async (e) => {
    await window.api.settings.set({ autoLaunch: e.target.checked });
  });

  // Close button
  document.getElementById('btn-close').addEventListener('click', () => {
    window.api.window.close();
  });

  // Listen for refresh events from main process
  window.api.on('reminders:refresh', async () => {
    await loadReminders();
  });

  // --- Init ---
  async function init() {
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
