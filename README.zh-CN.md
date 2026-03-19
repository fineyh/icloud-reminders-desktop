# iCloud Reminders Desktop

**[English](README.md)**

一款轻量级的 Windows 桌面小组件，用于查看你的 iCloud 提醒事项 — 无需 Mac。

基于 **Electron** + **Python (Flask)** 构建，常驻系统托盘，通过 Apple CloudKit API 连接 iCloud。

## 功能特性

- **系统托盘应用** — 静默运行在后台，点击托盘图标即可切换面板
- **迷你小组件模式** — 紧凑的置顶窗口，方便快速查看
- **Apple ID 登录** — 使用 Apple ID 登录，完整支持双重认证 (2FA/2SA)
- **会话持久化** — 记住登录状态，无需每次重新认证
- **全局快捷键** — 按 `Ctrl+Alt+R` 快速呼出/隐藏提醒事项面板
- **提醒事项同步** — 通过 CloudKit 直接从 iCloud 获取你的提醒事项和列表

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面外壳 | Electron |
| 后端服务 | Python、Flask、Waitress |
| iCloud API | pyicloud、CloudKit |
| 凭证存储 | keyring |

## 环境要求

- **Node.js** >= 18
- **Python** >= 3.10
- 启用了提醒事项的 **Apple ID**

## 快速开始

### 1. 安装 Node 依赖

```bash
npm install
```

### 2. 安装 Python 依赖

```bash
pip install -r src/backend/requirements.txt
```

### 3. 开发模式运行

```bash
npm run dev
```

### 4. 构建分发包

```bash
npm run build
```

输出将生成在 `build/` 目录下。

## 项目结构

```
src/
├── backend/          # Python Flask 服务（iCloud 认证 & 提醒事项 API）
│   ├── server.py     # Flask 应用入口
│   ├── auth.py       # Apple ID 认证 & 双重验证
│   ├── reminders_api.py  # CloudKit 提醒事项查询
│   ├── config.py     # 后端配置
│   └── credentials.py    # 凭证管理
├── main/             # Electron 主进程
│   ├── main.js       # 应用入口
│   ├── python-bridge.js  # Python 后端生命周期管理
│   ├── windows.js    # 窗口管理（面板 & 迷你窗口）
│   ├── tray.js       # 系统托盘
│   ├── shortcuts.js  # 全局快捷键
│   └── ipc-handlers.js   # IPC 通信
└── renderer/         # 前端界面
    ├── index.html    # 主面板视图
    ├── mini.html     # 迷你小组件视图
    ├── css/          # 样式表
    ├── js/           # 渲染进程脚本
    └── assets/       # 图标资源
```

## 许可证

[MIT](LICENSE)
