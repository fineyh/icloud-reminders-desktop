const { globalShortcut } = require('electron');

function registerShortcuts({ onTogglePanel, onQuickAdd }) {
  const registered = globalShortcut.register('Ctrl+Alt+R', () => {
    onTogglePanel();
  });

  if (!registered) {
    console.warn('Failed to register global shortcut Ctrl+Alt+R (may be in use by another app).');
  }

  if (onQuickAdd) {
    const registered2 = globalShortcut.register('Ctrl+Alt+N', () => {
      onQuickAdd();
    });

    if (!registered2) {
      console.warn('Failed to register global shortcut Ctrl+Alt+N (may be in use by another app).');
    }
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };
