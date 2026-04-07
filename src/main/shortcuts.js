const { globalShortcut } = require('electron');
const Store = require('electron-store');

const store = new Store();

const DEFAULT_SHORTCUTS = {
  togglePanel: 'Ctrl+Alt+R',
  quickAdd: 'Ctrl+Alt+N',
};

// Store callbacks at module scope for re-registration
let storedCallbacks = null;

function getShortcuts() {
  return store.get('shortcuts', { ...DEFAULT_SHORTCUTS });
}

function registerShortcuts({ onTogglePanel, onQuickAdd }) {
  storedCallbacks = { onTogglePanel, onQuickAdd };

  const shortcuts = getShortcuts();

  const registered = globalShortcut.register(shortcuts.togglePanel, () => {
    onTogglePanel();
  });

  if (!registered) {
    console.warn(`Failed to register global shortcut ${shortcuts.togglePanel} (may be in use by another app).`);
  }

  if (onQuickAdd) {
    const registered2 = globalShortcut.register(shortcuts.quickAdd, () => {
      onQuickAdd();
    });

    if (!registered2) {
      console.warn(`Failed to register global shortcut ${shortcuts.quickAdd} (may be in use by another app).`);
    }
  }
}

/**
 * Re-register all shortcuts from current store values.
 * Returns an object indicating which shortcuts were successfully registered.
 */
function reregisterShortcuts() {
  if (!storedCallbacks) return { togglePanel: false, quickAdd: false };

  globalShortcut.unregisterAll();

  const shortcuts = getShortcuts();
  const result = {};

  result.togglePanel = globalShortcut.register(shortcuts.togglePanel, () => {
    storedCallbacks.onTogglePanel();
  });

  if (!result.togglePanel) {
    console.warn(`Failed to register global shortcut ${shortcuts.togglePanel}`);
  }

  if (storedCallbacks.onQuickAdd) {
    result.quickAdd = globalShortcut.register(shortcuts.quickAdd, () => {
      storedCallbacks.onQuickAdd();
    });

    if (!result.quickAdd) {
      console.warn(`Failed to register global shortcut ${shortcuts.quickAdd}`);
    }
  }

  return result;
}

/**
 * Validate an accelerator string for a given action.
 * Returns { valid: boolean, error?: string }
 */
function validateShortcut(accelerator, action) {
  // Check that it contains at least one modifier
  const modifiers = ['Ctrl', 'Alt', 'Shift', 'Super', 'Meta', 'Command', 'CmdOrCtrl'];
  const hasModifier = modifiers.some((mod) => accelerator.includes(mod));
  if (!hasModifier) {
    return { valid: false, error: '快捷键必须包含修饰键（Ctrl、Alt、Shift）' };
  }

  // Check for duplicate with other actions
  const shortcuts = getShortcuts();
  for (const [key, value] of Object.entries(shortcuts)) {
    if (key !== action && value.toLowerCase() === accelerator.toLowerCase()) {
      return { valid: false, error: '该快捷键已被其他功能使用' };
    }
  }

  return { valid: true };
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, reregisterShortcuts, getShortcuts, validateShortcut, unregisterAll, DEFAULT_SHORTCUTS };
