# iCloud Reminders Desktop

**[中文文档](README.zh-CN.md)**

A lightweight Windows desktop widget for viewing your iCloud Reminders — no Mac required.

Built with **Electron** + **Python (Flask)**, it lives in your system tray and connects to iCloud via Apple's CloudKit API.

## Features

- **System Tray App** — runs quietly in the background, click the tray icon to toggle the panel
- **Mini Widget Mode** — a compact always-on-top window for quick glance
- **Apple ID Login** — sign in with your Apple ID, with full 2FA/2SA support
- **Session Persistence** — remembers your login so you don't have to re-authenticate every time
- **Global Shortcut** — press `Ctrl+Alt+R` to quickly toggle the reminders panel
- **Reminders Sync** — fetches your reminders and lists directly from iCloud via CloudKit

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron |
| Backend | Python, Flask, Waitress |
| iCloud API | pyicloud, CloudKit |
| Credential Storage | keyring |

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.10
- An **Apple ID** with Reminders enabled

## Getting Started

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
pip install -r src/backend/requirements.txt
```

### 3. Run in development mode

```bash
npm run dev
```

### 4. Build for distribution

```bash
npm run build
```

The output will be generated in the `build/` directory.

## Project Structure

```
src/
├── backend/          # Python Flask server (iCloud auth & reminders API)
│   ├── server.py     # Flask app entry point
│   ├── auth.py       # Apple ID authentication & 2FA
│   ├── reminders_api.py  # CloudKit reminders queries
│   ├── config.py     # Backend configuration
│   └── credentials.py    # Credential management
├── main/             # Electron main process
│   ├── main.js       # App entry point
│   ├── python-bridge.js  # Python backend lifecycle
│   ├── windows.js    # Window management (panel & mini)
│   ├── tray.js       # System tray
│   ├── shortcuts.js  # Global shortcuts
│   └── ipc-handlers.js   # IPC communication
└── renderer/         # Frontend UI
    ├── index.html    # Main panel view
    ├── mini.html     # Mini widget view
    ├── css/          # Stylesheets
    ├── js/           # Renderer scripts
    └── assets/       # Icons
```

## License

[MIT](LICENSE)
