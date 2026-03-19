const { globalShortcut } = require('electron');

function registerShortcuts({ onTogglePanel }) {
  const registered = globalShortcut.register('Ctrl+Alt+R', () => {
    onTogglePanel();
  });

  if (!registered) {
    console.warn('Failed to register global shortcut Ctrl+Alt+R (may be in use by another app).');
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };
