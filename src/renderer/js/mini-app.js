// Mini window application logic
(function () {
  const miniList = document.getElementById('mini-list');
  const miniEmpty = document.getElementById('mini-empty');
  const miniLoginPrompt = document.getElementById('mini-login-prompt');

  const t = (key, params) => window.i18n.t(key, params);

  let lastData = null;

  // Titlebar buttons
  document.getElementById('btn-pin').addEventListener('click', async () => {
    const result = await window.api.window.toggleMiniPin();
    document.getElementById('btn-pin').classList.toggle('active', result.pinned);
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.api.window.closeMini();
  });

  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.api.window.minimizeMini();
  });

  function renderReminders(data) {
    lastData = data;
    miniList.innerHTML = '';
    miniEmpty.style.display = 'none';
    miniLoginPrompt.style.display = 'none';

    if (!data || !data.lists) {
      miniLoginPrompt.style.display = 'flex';
      return;
    }

    // Collect all incomplete reminders from all lists
    const allPending = [];
    Object.entries(data.lists).forEach(([listName, items]) => {
      items.forEach((item) => {
        if (!item.completed) {
          allPending.push({ ...item, listName });
        }
      });
    });

    if (allPending.length === 0) {
      miniEmpty.style.display = 'flex';
      return;
    }

    // Sort: items with due dates first (by date), then items without
    allPending.sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });

    allPending.forEach((reminder) => {
      const el = document.createElement('div');
      el.className = 'mini-reminder';

      const checkbox = document.createElement('div');
      checkbox.className = 'mini-checkbox';

      if (reminder.recordName) {
        checkbox.addEventListener('click', async () => {
          try {
            const result = await window.api.reminders.complete(reminder.recordName, reminder.recordChangeTag);
            if (result.status === 'ok') {
              // Reload from server to get fresh data
              const fresh = await window.api.reminders.fetch();
              renderReminders(fresh);
            }
          } catch (err) {
            console.error('Failed to complete reminder:', err);
          }
        });
      }

      const title = document.createElement('span');
      title.className = 'mini-title';
      title.textContent = reminder.title;
      title.title = reminder.title; // tooltip for truncated text

      el.appendChild(checkbox);
      el.appendChild(title);

      if (reminder.flagged) {
        const flag = document.createElement('span');
        flag.className = 'mini-flag';
        flag.textContent = '⚑';
        el.appendChild(flag);
      }

      if (reminder.due_date) {
        const due = document.createElement('span');
        due.className = 'mini-due';

        const dueDate = new Date(reminder.due_date);
        const hasTime = reminder.due_date.includes('T');

        if (hasTime) {
          if (dueDate < new Date()) due.classList.add('overdue');
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (dueDate < today) due.classList.add('overdue');
        }

        due.textContent = formatDate(reminder.due_date);
        el.appendChild(due);
      }

      miniList.appendChild(el);
    });
  }

  function formatDate(dateStr) {
    try {
      const hasTime = dateStr.includes('T');
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);

      const diff = Math.round((dateOnly - today) / 86400000);
      let label;
      if (diff === 0) label = t('today');
      else if (diff === 1) label = t('tomorrow');
      else if (diff === -1) label = t('yesterday');
      else label = `${date.getMonth() + 1}/${date.getDate()}`;

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

  // Listen for data updates from main process
  window.api.on('reminders:update', (data) => {
    renderReminders(data);
  });

  // Re-render when locale changes.
  window.addEventListener('locale-changed', () => {
    if (lastData) renderReminders(lastData);
  });

  // --- Dark Mode ---
  async function applyTheme(mode) {
    let theme;
    if (mode === 'dark') {
      theme = 'dark';
    } else if (mode === 'light') {
      theme = 'light';
    } else {
      const systemTheme = await window.api.settings.getSystemTheme();
      theme = systemTheme;
    }
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  }

  window.api.on('theme-changed', async () => {
    const settings = await window.api.settings.get();
    if ((settings.darkMode || 'system') === 'system') {
      await applyTheme('system');
    }
  });

  // Listen for locale-changed pushed from main process.
  window.api.on('locale-changed', async () => {
    await window.i18n.init();
  });

  // Initial load
  async function init() {
    await window.i18n.init();
    // Apply theme first
    try {
      const settings = await window.api.settings.get();
      await applyTheme(settings.darkMode || 'system');
    } catch {}

    try {
      const status = await window.api.auth.status();
      if (status.status === 'authenticated') {
        const data = await window.api.reminders.fetch();
        renderReminders(data);
      } else {
        miniLoginPrompt.style.display = 'flex';
      }
    } catch {
      miniLoginPrompt.style.display = 'flex';
    }
  }

  init();
})();
