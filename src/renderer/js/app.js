// Main panel application logic
(function () {
  // State
  let remindersData = null;
  let currentList = null;
  let refreshTimer = null;
  let showCompleted = false;
  let searchQuery = '';
  let dragSourceList = null;

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
    const useInternational = document.getElementById('use-international').checked;

    if (!email || !password) return;

    loginError.textContent = '';
    btnLogin.disabled = true;
    btnLogin.textContent = '登录中...';

    try {
      const result = await window.api.auth.login(email, password, remember, useInternational);
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

  const btnSendSms = document.getElementById('btn-send-sms');
  const twofaInfo = document.getElementById('twofa-info');
  const SMS_RESEND_DEFAULT = '收不到弹窗？发送短信验证码';
  let smsCountdownTimer = null;

  function startSmsCountdown(seconds) {
    if (smsCountdownTimer) clearInterval(smsCountdownTimer);
    btnSendSms.disabled = true;
    btnSendSms.textContent = `请等待 ${seconds}s 后重试`;
    smsCountdownTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(smsCountdownTimer);
        smsCountdownTimer = null;
        btnSendSms.disabled = false;
        btnSendSms.textContent = SMS_RESEND_DEFAULT;
      } else {
        btnSendSms.textContent = `请等待 ${seconds}s 后重试`;
      }
    }, 1000);
  }

  btnSendSms.addEventListener('click', async () => {
    twofaError.textContent = '';
    twofaInfo.textContent = '';
    btnSendSms.disabled = true;
    btnSendSms.textContent = '发送中...';
    try {
      const result = await window.api.auth.sendSmsCode();
      if (result.status === 'ok') {
        const tail = result.phone_tail ? `尾号 ${result.phone_tail}` : '受信任手机号';
        twofaInfo.textContent = `已请求发送短信验证码到${tail}，请在下方输入收到的 6 位数字`;
        focusFirstCodeInput();
        startSmsCountdown(60);
        return;
      }
      twofaError.textContent = result.message || '发送短信失败';
      // For cooldown, Apple will reject re-sends for ~1 minute. Lock
      // the button locally so the user doesn't keep tapping.
      // Other rate-limit codes (too_many_*, sms_locked) need much
      // longer waits than a UI countdown can usefully show.
      if (result.code === 'cooldown') {
        startSmsCountdown(60);
        return;
      }
      btnSendSms.disabled = false;
      btnSendSms.textContent = SMS_RESEND_DEFAULT;
    } catch (err) {
      twofaError.textContent = '连接后端服务失败';
      btnSendSms.disabled = false;
      btnSendSms.textContent = SMS_RESEND_DEFAULT;
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

      // Drop target for moving reminders between lists (regular tabs only)
      if (!isSmartTab) {
        tab.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          tab.classList.add('drop-target');
        });
        tab.addEventListener('dragleave', () => {
          tab.classList.remove('drop-target');
        });
        tab.addEventListener('drop', (e) => {
          e.preventDefault();
          tab.classList.remove('drop-target');

          const recordName = e.dataTransfer.getData('text/plain');
          if (!recordName || !dragSourceList || dragSourceList === id) return;

          // Optimistic UI update: move item between arrays
          const sourceItems = remindersData[dragSourceList];
          const targetItems = remindersData[id];
          if (!sourceItems || !targetItems) return;

          const itemIndex = sourceItems.findIndex((r) => r.recordName === recordName);
          if (itemIndex === -1) return;

          const [moved] = sourceItems.splice(itemIndex, 1);
          targetItems.push(moved);

          renderListTabs();
          renderReminders();
          updateStatusBar();

          // Sync to server
          window.api.reminders.move(recordName, dragSourceList, id).then((result) => {
            if (result.error) {
              console.error('[MOVE] Server error:', result.error);
              loadReminders(); // rollback
            }
          }).catch((err) => {
            console.error('[MOVE] Failed:', err);
            loadReminders(); // rollback
          });
        });
      }

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

    // Drag support: only for pending items in regular lists, not in search mode
    const canDrag = !isCompleted && !searchQuery && !isSmartList(currentList) && reminder.recordName;
    if (canDrag) {
      el.setAttribute('draggable', 'true');
      el.dataset.recordName = reminder.recordName;

      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', reminder.recordName);
        dragSourceList = currentList;
        el.classList.add('dragging');
        document.getElementById('reminders-list').classList.add('drag-active');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        document.getElementById('reminders-list').classList.remove('drag-active');
        clearDragIndicators();
      });
    }

    const checkbox = document.createElement('div');
    checkbox.className = 'reminder-checkbox' + (isCompleted ? ' completed' : '');
    checkbox.setAttribute('draggable', 'false');

    if (reminder.recordName) {
      checkbox.addEventListener('click', () => toggleReminder(reminder, isCompleted));
    }

    const content = document.createElement('div');
    content.className = 'reminder-content';
    content.style.cursor = 'pointer';
    content.addEventListener('click', () => showDetailPanel(reminder, isCompleted));

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

  // --- Drag and Drop ---
  function clearDragIndicators() {
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    document.querySelectorAll('.drop-target').forEach((el) => {
      el.classList.remove('drop-target');
    });
  }

  function getDragAfterElement(container, y) {
    const items = [...container.querySelectorAll('.reminder-item:not(.dragging)')];
    return items.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Reorder within list: dragover and drop on #reminders-list
  const remindersList = document.getElementById('reminders-list');

  remindersList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDragIndicators();

    const afterElement = getDragAfterElement(remindersList, e.clientY);
    if (afterElement) {
      afterElement.classList.add('drag-over-top');
    } else {
      // Dropping at the end
      const items = remindersList.querySelectorAll('.reminder-item:not(.dragging)');
      if (items.length > 0) {
        items[items.length - 1].classList.add('drag-over-bottom');
      }
    }
  });

  remindersList.addEventListener('dragleave', (e) => {
    // Only clear if leaving the container entirely
    if (!remindersList.contains(e.relatedTarget)) {
      clearDragIndicators();
    }
  });

  remindersList.addEventListener('drop', (e) => {
    e.preventDefault();
    clearDragIndicators();

    const recordName = e.dataTransfer.getData('text/plain');
    if (!recordName || !currentList || isSmartList(currentList) || !remindersData[currentList]) return;

    const items = remindersData[currentList];
    const dragIndex = items.findIndex((r) => r.recordName === recordName);
    if (dragIndex === -1) return;

    // Determine insertion index
    const afterElement = getDragAfterElement(remindersList, e.clientY);
    let targetIndex;
    if (afterElement) {
      const targetRecordName = afterElement.dataset.recordName;
      // Find among pending items only (since completed items are in a separate section)
      const pendingItems = items.filter((r) => !r.completed);
      const pendingTargetIdx = pendingItems.findIndex((r) => r.recordName === targetRecordName);
      // Map back to full array index
      targetIndex = items.indexOf(pendingItems[pendingTargetIdx]);
    } else {
      // Drop at end of pending items
      const lastPending = [...items].reverse().find((r) => !r.completed);
      targetIndex = lastPending ? items.indexOf(lastPending) + 1 : items.length;
    }

    if (targetIndex === -1) targetIndex = items.length;

    // Reorder the array
    const [moved] = items.splice(dragIndex, 1);
    const insertAt = targetIndex > dragIndex ? targetIndex - 1 : targetIndex;
    items.splice(insertAt, 0, moved);

    // Optimistic render
    renderReminders();

    // Extract UUIDs and sync to server
    const reminderIds = items.map((r) => r.recordName.replace('Reminder/', ''));
    window.api.reminders.reorder(currentList, reminderIds).then((result) => {
      if (result.error) {
        console.error('[REORDER] Server error:', result.error);
        loadReminders(); // rollback
      }
    }).catch((err) => {
      console.error('[REORDER] Failed:', err);
      loadReminders(); // rollback
    });
  });

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

  // --- Detail Panel ---
  const PRIORITY_MAP = {
    1: { label: '高', cls: 'priority-high' },
    5: { label: '中', cls: 'priority-medium' },
    9: { label: '低', cls: 'priority-low' },
  };

  function findListForReminder(reminder) {
    if (!isSmartList(currentList) && !searchQuery) return currentList;
    if (!remindersData || !reminder.recordName) return null;
    for (const [listName, items] of Object.entries(remindersData)) {
      if (items.some((item) => item.recordName === reminder.recordName)) return listName;
    }
    return null;
  }

  function showDetailPanel(reminder, isCompleted) {
    const body = document.getElementById('detail-body');
    const listName = findListForReminder(reminder);

    const rows = [];

    // Title
    rows.push(makeDetailRow('标题', escapeHtml(reminder.title)));

    // Notes
    if (reminder.description) {
      rows.push(makeDetailRow('备注', `<div class="detail-value description">${escapeHtml(reminder.description)}</div>`, true));
    } else {
      rows.push(makeDetailRow('备注', '<span class="detail-value empty">无</span>', true));
    }

    // Due date
    const dueDateVal = reminder.due_date ? formatDate(reminder.due_date) : '无';
    const dueClass = reminder.due_date ? '' : ' empty';
    rows.push(makeDetailRow('截止日期', `<span class="detail-value${dueClass}">${escapeHtml(dueDateVal)}</span>`, true));

    // Priority
    const pri = PRIORITY_MAP[reminder.priority];
    if (pri) {
      rows.push(makeDetailRow('优先级', `<span class="detail-priority-badge ${pri.cls}">${pri.label}</span>`, true));
    } else {
      rows.push(makeDetailRow('优先级', '<span class="detail-value empty">无</span>', true));
    }

    // Flagged
    if (reminder.flagged) {
      rows.push(makeDetailRow('标旗', '<span class="detail-flag">\u2691 已标旗</span>', true));
    } else {
      rows.push(makeDetailRow('标旗', '<span class="detail-value empty">未标旗</span>', true));
    }

    // List
    if (listName) {
      rows.push(makeDetailRow('所属列表', escapeHtml(listName)));
    }

    // Status
    const statusText = isCompleted ? '已完成' : '待完成';
    rows.push(makeDetailRow('状态', statusText));

    body.innerHTML = rows.join('');
    document.getElementById('detail-panel').classList.add('visible');
  }

  function makeDetailRow(label, value, rawValue) {
    const valHtml = rawValue ? value : `<div class="detail-value">${value}</div>`;
    return `<div class="detail-row"><div class="detail-label">${label}</div>${valHtml}</div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function hideDetailPanel() {
    document.getElementById('detail-panel').classList.remove('visible');
  }

  document.getElementById('detail-back').addEventListener('click', hideDetailPanel);

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
  async function startAutoRefresh(intervalMinutes) {
    stopAutoRefresh();
    if (intervalMinutes === undefined) {
      const settings = await window.api.settings.get();
      intervalMinutes = settings.refreshInterval ?? 5;
    }
    if (intervalMinutes > 0) {
      refreshTimer = setInterval(loadReminders, intervalMinutes * 60 * 1000);
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // --- Header Actions ---
  document.getElementById('btn-add').addEventListener('click', () => {
    window.api.window.showQuickAdd();
  });

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
    const refreshSelect = document.getElementById('select-refresh-interval');
    if (refreshSelect) refreshSelect.value = String(settings.refreshInterval ?? 5);
    // Show app version
    const version = await window.api.app.getVersion();
    document.getElementById('app-version').textContent = 'v' + version;
    // Load shortcuts
    const shortcutData = await window.api.shortcuts.get();
    document.getElementById('shortcut-toggle-panel').querySelector('.shortcut-key-text').textContent = shortcutData.current.togglePanel;
    document.getElementById('shortcut-quick-add').querySelector('.shortcut-key-text').textContent = shortcutData.current.quickAdd;
    document.getElementById('shortcut-error').textContent = '';
  });

  document.getElementById('btn-settings-back').addEventListener('click', () => {
    cancelRecording();
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

  document.getElementById('select-refresh-interval').addEventListener('change', async (e) => {
    const interval = Number(e.target.value);
    await window.api.settings.set({ refreshInterval: interval });
    startAutoRefresh(interval);
  });

  // --- Shortcuts ---
  let recordingButton = null;
  let previousShortcutText = '';

  function mapKeyToAccelerator(e) {
    const key = e.key;
    // Letter keys
    if (key.length === 1 && /[a-zA-Z]/.test(key)) return key.toUpperCase();
    // Number keys
    if (key.length === 1 && /[0-9]/.test(key)) return key;
    // Function keys
    if (/^F\d+$/.test(key)) return key;
    // Special key mappings
    const specialMap = {
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      ' ': 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
      Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      Insert: 'Insert', Escape: 'Escape',
    };
    if (specialMap[key]) return specialMap[key];
    // Fallback: use key code for punctuation etc.
    if (e.code.startsWith('Key')) return e.code.replace('Key', '');
    if (e.code.startsWith('Digit')) return e.code.replace('Digit', '');
    return key;
  }

  function startRecording(btn) {
    if (recordingButton && recordingButton !== btn) {
      cancelRecording();
    }
    recordingButton = btn;
    previousShortcutText = btn.querySelector('.shortcut-key-text').textContent;
    btn.classList.add('recording');
    btn.querySelector('.shortcut-key-text').textContent = '请按下快捷键...';
    document.getElementById('shortcut-error').textContent = '';
    document.addEventListener('keydown', handleShortcutCapture, true);
  }

  function cancelRecording() {
    if (!recordingButton) return;
    recordingButton.classList.remove('recording');
    recordingButton.querySelector('.shortcut-key-text').textContent = previousShortcutText;
    document.removeEventListener('keydown', handleShortcutCapture, true);
    recordingButton = null;
    previousShortcutText = '';
  }

  async function handleShortcutCapture(e) {
    e.preventDefault();
    e.stopPropagation();

    // Ignore lone modifier presses
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    // Escape cancels recording
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      cancelRecording();
      return;
    }

    // Build accelerator string
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    if (parts.length === 0) {
      document.getElementById('shortcut-error').textContent = '快捷键必须包含修饰键（Ctrl、Alt、Shift）';
      return;
    }

    const keyName = mapKeyToAccelerator(e);
    parts.push(keyName);
    const accelerator = parts.join('+');
    const action = recordingButton.dataset.action;

    const btn = recordingButton;
    document.removeEventListener('keydown', handleShortcutCapture, true);
    btn.classList.remove('recording');
    recordingButton = null;

    const result = await window.api.shortcuts.set(action, accelerator);
    if (result.ok) {
      btn.querySelector('.shortcut-key-text').textContent = accelerator;
      document.getElementById('shortcut-error').textContent = '';
      previousShortcutText = '';
    } else {
      document.getElementById('shortcut-error').textContent = result.error;
      btn.querySelector('.shortcut-key-text').textContent = previousShortcutText;
      previousShortcutText = '';
    }
  }

  document.querySelectorAll('.shortcut-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      startRecording(btn);
    });
  });

  document.getElementById('btn-shortcut-reset').addEventListener('click', async () => {
    cancelRecording();
    const result = await window.api.shortcuts.reset();
    if (result.ok) {
      document.getElementById('shortcut-toggle-panel').querySelector('.shortcut-key-text').textContent = result.shortcuts.togglePanel;
      document.getElementById('shortcut-quick-add').querySelector('.shortcut-key-text').textContent = result.shortcuts.quickAdd;
      document.getElementById('shortcut-error').textContent = '';
    }
  });

  // --- Update ---
  const btnCheckUpdate = document.getElementById('btn-check-update');
  const btnUpdateDownload = document.getElementById('btn-update-download');
  const btnUpdateInstall = document.getElementById('btn-update-install');
  const updateStatusEl = document.getElementById('update-status');
  const updateStatusText = document.getElementById('update-status-text');
  const updateProgress = document.getElementById('update-progress');
  const updateProgressBar = document.getElementById('update-progress-bar');

  btnCheckUpdate.addEventListener('click', async () => {
    btnCheckUpdate.disabled = true;
    btnCheckUpdate.textContent = '检查中...';
    await window.api.update.check();
  });

  btnUpdateDownload.addEventListener('click', () => {
    btnUpdateDownload.style.display = 'none';
    window.api.update.download();
  });

  btnUpdateInstall.addEventListener('click', () => {
    window.api.update.install();
  });

  window.api.on('update:status', (data) => {
    updateStatusEl.style.display = 'block';
    btnUpdateDownload.style.display = 'none';
    btnUpdateInstall.style.display = 'none';
    updateProgress.style.display = 'none';

    switch (data.status) {
      case 'checking':
        updateStatusText.textContent = '正在检查更新...';
        break;
      case 'available':
        updateStatusText.textContent = '发现新版本 v' + data.version;
        btnUpdateDownload.style.display = 'inline-block';
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '检查更新';
        break;
      case 'up-to-date':
        updateStatusText.textContent = '已是最新版本';
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '检查更新';
        break;
      case 'downloading':
        updateStatusText.textContent = '正在下载更新... ' + data.percent + '%';
        updateProgress.style.display = 'block';
        updateProgressBar.style.width = data.percent + '%';
        break;
      case 'downloaded':
        updateStatusText.textContent = '更新已下载，重启后生效';
        updateProgress.style.display = 'none';
        btnUpdateInstall.style.display = 'inline-block';
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '检查更新';
        break;
      case 'error':
        updateStatusText.textContent = '检查更新失败';
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '检查更新';
        break;
    }
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
