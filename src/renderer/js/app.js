// Main panel application logic
(function () {
  // State
  let remindersData = null;
  let currentList = null;
  let refreshTimer = null;
  let showCompleted = false;
  let searchQuery = '';
  let dragSourceList = null;

  const t = (key, params) => window.i18n.t(key, params);

  // Smart Lists definition (label resolved at render time via t())
  const SMART_LISTS = [
    { id: '@today', key: 'smartToday', icon: '☆' },
    { id: '@upcoming', key: 'smartUpcoming', icon: '⧖' },
    { id: '@flagged', key: 'smartFlagged', icon: '⚑' },
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
    return sl ? t(sl.key) : listId;
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
    btnLogin.textContent = t('loginInProgress');

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
        loginError.textContent = result.message || t('loginFailed');
      }
    } catch (err) {
      loginError.textContent = t('backendConnectFailed');
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = t('login');
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
      twofaError.textContent = t('completeCode6');
      return;
    }

    twofaError.textContent = '';
    btnVerify.disabled = true;
    btnVerify.textContent = t('verifying');

    try {
      const result = await window.api.auth.verify2fa(code);
      if (result.status === 'ok') {
        await loadReminders();
        showView('reminders');
        startAutoRefresh();
      } else {
        twofaError.textContent = result.message || t('verifyFailed');
        focusFirstCodeInput();
      }
    } catch (err) {
      twofaError.textContent = t('backendConnectFailed');
    } finally {
      btnVerify.disabled = false;
      btnVerify.textContent = t('verify');
    }
  });

  const btnSendSms = document.getElementById('btn-send-sms');
  const twofaInfo = document.getElementById('twofa-info');
  let smsCountdownTimer = null;

  function startSmsCountdown(seconds) {
    if (smsCountdownTimer) clearInterval(smsCountdownTimer);
    btnSendSms.disabled = true;
    btnSendSms.textContent = t('smsCountdown', { seconds });
    smsCountdownTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(smsCountdownTimer);
        smsCountdownTimer = null;
        btnSendSms.disabled = false;
        btnSendSms.textContent = t('sendSmsDefault');
      } else {
        btnSendSms.textContent = t('smsCountdown', { seconds });
      }
    }, 1000);
  }

  btnSendSms.addEventListener('click', async () => {
    twofaError.textContent = '';
    twofaInfo.textContent = '';
    btnSendSms.disabled = true;
    btnSendSms.textContent = t('sendingSms');
    try {
      const result = await window.api.auth.sendSmsCode();
      if (result.status === 'ok') {
        const target = result.phone_tail
          ? t('smsRequestedTail', { tail: result.phone_tail })
          : t('smsRequestedTrusted');
        twofaInfo.textContent = t('smsRequestedInfo', { target });
        focusFirstCodeInput();
        startSmsCountdown(60);
        return;
      }
      twofaError.textContent = result.message || t('smsSendFailed');
      // For cooldown, Apple will reject re-sends for ~1 minute. Lock
      // the button locally so the user doesn't keep tapping.
      // Other rate-limit codes (too_many_*, sms_locked) need much
      // longer waits than a UI countdown can usefully show.
      if (result.code === 'cooldown') {
        startSmsCountdown(60);
        return;
      }
      btnSendSms.disabled = false;
      btnSendSms.textContent = t('sendSmsDefault');
    } catch (err) {
      twofaError.textContent = t('backendConnectFailed');
      btnSendSms.disabled = false;
      btnSendSms.textContent = t('sendSmsDefault');
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
      createTab(smartContainer, sl.id, sl.icon + ' ' + t(sl.key), true);
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
      const msg = searchQuery ? t('noMatch') : t('noReminders');
      const icon = searchQuery ? '&#x1F50D;' : '&#x1F4CB;';
      listContainer.innerHTML = `<div class="empty-state"><div class="icon">${icon}</div><p>${msg}</p></div>`;
      completedSection.style.display = 'none';
      return;
    }

    const pending = items.filter((r) => !r.completed);
    const completed = items.filter((r) => r.completed);

    if (pending.length === 0 && completed.length === 0) {
      listContainer.innerHTML = `<div class="empty-state"><div class="icon">&#x2705;</div><p>${t('allCompleted')}</p></div>`;
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

    const displayName = searchQuery ? t('searchResults') : (isSmartList(currentList) ? getSmartListDisplayName(currentList) : currentList);
    document.getElementById('current-list-title').textContent = displayName || t('reminders');
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
        flag.textContent = '⚑';
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
      if (dateOnly.getTime() === today.getTime()) label = t('today');
      else if (dateOnly.getTime() === tomorrow.getTime()) label = t('tomorrow');
      else {
        const diff = Math.round((dateOnly - today) / 86400000);
        if (diff === -1) label = t('yesterday');
        else if (diff > 1 && diff <= 7) label = t('daysLater', { n: diff });
        else if (diff < -1 && diff >= -7) label = t('daysAgo', { n: Math.abs(diff) });
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
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    lastUpdated.textContent = t('updatedAt', { time });

    if (remindersData && currentList) {
      let pending;
      if (isSmartList(currentList)) {
        pending = getFilteredItems().filter((r) => !r.completed).length;
      } else if (remindersData[currentList]) {
        pending = remindersData[currentList].filter((r) => !r.completed).length;
      } else {
        pending = 0;
      }
      itemCount.textContent = t('itemsPending', { count: pending });
    }
  }

  // --- Detail Panel ---
  function priorityInfo(p) {
    if (p === 1) return { label: t('priorityHigh'), cls: 'priority-high' };
    if (p === 5) return { label: t('priorityMedium'), cls: 'priority-medium' };
    if (p === 9) return { label: t('priorityLow'), cls: 'priority-low' };
    return null;
  }

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
    rows.push(makeDetailRow(t('detailTitle'), escapeHtml(reminder.title)));

    // Notes
    if (reminder.description) {
      rows.push(makeDetailRow(t('detailNotes'), `<div class="detail-value description">${escapeHtml(reminder.description)}</div>`, true));
    } else {
      rows.push(makeDetailRow(t('detailNotes'), `<span class="detail-value empty">${t('none')}</span>`, true));
    }

    // Due date
    const dueDateVal = reminder.due_date ? formatDate(reminder.due_date) : t('none');
    const dueClass = reminder.due_date ? '' : ' empty';
    rows.push(makeDetailRow(t('detailDueDate'), `<span class="detail-value${dueClass}">${escapeHtml(dueDateVal)}</span>`, true));

    // Priority
    const pri = priorityInfo(reminder.priority);
    if (pri) {
      rows.push(makeDetailRow(t('detailPriority'), `<span class="detail-priority-badge ${pri.cls}">${pri.label}</span>`, true));
    } else {
      rows.push(makeDetailRow(t('detailPriority'), `<span class="detail-value empty">${t('none')}</span>`, true));
    }

    // Flagged
    if (reminder.flagged) {
      rows.push(makeDetailRow(t('detailFlag'), `<span class="detail-flag">${t('flaggedYes')}</span>`, true));
    } else {
      rows.push(makeDetailRow(t('detailFlag'), `<span class="detail-value empty">${t('flaggedNo')}</span>`, true));
    }

    // List
    if (listName) {
      rows.push(makeDetailRow(t('detailList'), escapeHtml(listName)));
    }

    // Status
    const statusText = isCompleted ? t('statusCompleted') : t('statusPending');
    rows.push(makeDetailRow(t('detailStatus'), statusText));

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
  let cachedQuickAddShortcut = 'Ctrl+Alt+N';
  function updateAddButtonTooltip(shortcut) {
    if (shortcut) cachedQuickAddShortcut = shortcut;
    const btn = document.getElementById('btn-add');
    btn.title = t('quickAddTooltip', { shortcut: cachedQuickAddShortcut });
  }

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
    const localeSelect = document.getElementById('select-locale');
    if (localeSelect) localeSelect.value = settings.locale || 'system';
    // Show app version
    const version = await window.api.app.getVersion();
    document.getElementById('app-version').textContent = 'v' + version;
    // Load shortcuts
    const shortcutData = await window.api.shortcuts.get();
    document.getElementById('shortcut-toggle-panel').querySelector('.shortcut-key-text').textContent = shortcutData.current.togglePanel;
    document.getElementById('shortcut-quick-add').querySelector('.shortcut-key-text').textContent = shortcutData.current.quickAdd;
    document.getElementById('shortcut-error').textContent = '';
    updateAddButtonTooltip(shortcutData.current.quickAdd);
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

  document.getElementById('select-locale').addEventListener('change', async (e) => {
    const locale = e.target.value;
    await window.api.settings.set({ locale });
    const resolved = await window.i18n.resolve(locale);
    window.i18n.setLocale(resolved);
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
    btn.querySelector('.shortcut-key-text').textContent = t('recordShortcut');
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
      document.getElementById('shortcut-error').textContent = t('requireModifier');
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
      if (action === 'quickAdd') updateAddButtonTooltip(accelerator);
    } else {
      // Server may return either translated text or an i18n key.
      document.getElementById('shortcut-error').textContent = result.errorKey ? t(result.errorKey) : (result.error || '');
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
      updateAddButtonTooltip(result.shortcuts.quickAdd);
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
    btnCheckUpdate.textContent = t('checkingUpdate');
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
        updateStatusText.textContent = t('updateChecking');
        break;
      case 'available':
        updateStatusText.textContent = t('updateAvailable', { version: data.version });
        btnUpdateDownload.style.display = 'inline-block';
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = t('checkUpdate');
        break;
      case 'up-to-date':
        updateStatusText.textContent = t('upToDate');
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = t('checkUpdate');
        break;
      case 'downloading':
        updateStatusText.textContent = t('updateDownloading', { percent: data.percent });
        updateProgress.style.display = 'block';
        updateProgressBar.style.width = data.percent + '%';
        break;
      case 'downloaded':
        updateStatusText.textContent = t('updateDownloaded');
        updateProgress.style.display = 'none';
        btnUpdateInstall.style.display = 'inline-block';
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = t('checkUpdate');
        break;
      case 'error':
        updateStatusText.textContent = t('updateError');
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = t('checkUpdate');
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

  // Re-render dynamic content when locale changes.
  window.addEventListener('locale-changed', () => {
    updateAddButtonTooltip();
    if (remindersData) {
      renderListTabs();
      renderReminders();
      updateStatusBar();
    }
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
    await window.i18n.init();
    await initTheme();
    // Prime the quick-add tooltip with the current shortcut.
    try {
      const shortcutData = await window.api.shortcuts.get();
      updateAddButtonTooltip(shortcutData.current.quickAdd);
    } catch {
      updateAddButtonTooltip();
    }
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
