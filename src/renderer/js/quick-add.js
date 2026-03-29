/* Quick Add Reminder — renderer script */
(function () {
  const titleInput = document.getElementById('title-input');
  const listSelect = document.getElementById('list-select');
  const btnAdd = document.getElementById('btn-add');
  const statusMsg = document.getElementById('status-msg');

  let listsLoaded = false;
  let submitting = false;

  // --- Theme ---
  async function initTheme() {
    const settings = await window.api.settings.get();
    let theme = settings.darkMode || 'system';
    if (theme === 'system') {
      theme = await window.api.settings.getSystemTheme();
    }
    document.documentElement.setAttribute('data-theme', theme);
  }

  initTheme();

  window.api.on('theme-changed', (systemTheme) => {
    window.api.settings.get().then((s) => {
      const mode = s.darkMode || 'system';
      const theme = mode === 'system' ? systemTheme : mode;
      document.documentElement.setAttribute('data-theme', theme);
    });
  });

  // --- Load lists ---
  async function loadLists() {
    try {
      const result = await window.api.reminders.lists();
      if (result.error) {
        listSelect.innerHTML = '<option value="">无法加载列表</option>';
        return;
      }

      const names = result.names || [];
      if (names.length === 0) {
        listSelect.innerHTML = '<option value="">无可用列表</option>';
        return;
      }

      listSelect.innerHTML = '';
      names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        listSelect.appendChild(opt);
      });
      listsLoaded = true;
    } catch (err) {
      listSelect.innerHTML = '<option value="">加载失败</option>';
    }
  }

  loadLists();

  // --- Show event (refocus + reload) ---
  window.api.on('quick-add:show', () => {
    titleInput.value = '';
    titleInput.focus();
    setStatus('', '');
    if (!listsLoaded) loadLists();
  });

  // --- Submit ---
  async function submit() {
    const title = titleInput.value.trim();
    if (!title || submitting) return;

    const listName = listSelect.value;
    submitting = true;
    btnAdd.disabled = true;
    setStatus('正在创建...', 'loading');

    try {
      const result = await window.api.reminders.create(title, listName);
      if (result.error) {
        setStatus(result.error, 'error');
        submitting = false;
        btnAdd.disabled = false;
        return;
      }

      setStatus('已添加', 'success');
      titleInput.value = '';

      // Close after brief feedback
      setTimeout(async () => {
        submitting = false;
        btnAdd.disabled = false;
        await window.api.window.closeQuickAdd();
      }, 500);
    } catch (err) {
      setStatus('创建失败: ' + err.message, 'error');
      submitting = false;
      btnAdd.disabled = false;
    }
  }

  btnAdd.addEventListener('click', submit);

  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      window.api.window.closeQuickAdd();
    }
  });

  // Global Escape handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.api.window.closeQuickAdd();
    }
  });

  function setStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = 'quick-add-status' + (type ? ' ' + type : '');
  }
})();
