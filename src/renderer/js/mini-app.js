// Mini window application logic
(function () {
  const miniList = document.getElementById('mini-list');
  const miniEmpty = document.getElementById('mini-empty');
  const miniLoginPrompt = document.getElementById('mini-login-prompt');

  // Close and minimize buttons
  document.getElementById('btn-close').addEventListener('click', () => {
    window.api.window.closeMini();
  });

  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.api.window.minimizeMini();
  });

  function renderReminders(data) {
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

      const title = document.createElement('span');
      title.className = 'mini-title';
      title.textContent = reminder.title;
      title.title = reminder.title; // tooltip for truncated text

      el.appendChild(checkbox);
      el.appendChild(title);

      if (reminder.due_date) {
        const due = document.createElement('span');
        due.className = 'mini-due';

        const dueDate = new Date(reminder.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dueDate < today) {
          due.classList.add('overdue');
        }

        due.textContent = formatDate(reminder.due_date);
        el.appendChild(due);
      }

      miniList.appendChild(el);
    });
  }

  function formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);

      const diff = Math.round((dateOnly - today) / 86400000);
      if (diff === 0) return '今天';
      if (diff === 1) return '明天';
      if (diff === -1) return '昨天';

      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return dateStr;
    }
  }

  // Listen for data updates from main process
  window.api.on('reminders:update', (data) => {
    renderReminders(data);
  });

  // Initial load
  async function init() {
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
