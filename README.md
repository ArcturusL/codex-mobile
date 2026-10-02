# 🔥 codexapp

### 🚀 Run Codex App UI Anywhere: Linux, macOS, or Windows 🚀

[![npm](https://img.shields.io/npm/v/codexapp?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/codexapp)
[![platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-blue?style=for-the-badge)](#-quick-start)
[![node](https://img.shields.io/badge/Node-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![license](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)

> **Codex UI in your browser. No drama. One command.**
>  
> **Yes, that is your Codex desktop app experience exposed over web UI. Yes, it runs cross-platform.**

```text
 ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗██╗   ██╗██╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝██║   ██║██║
██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ██║   ██║██║
██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ██║   ██║██║
╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗╚██████╔╝██║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝
```

---
<img width="1366" height="900" alt="image" src="https://github.com/user-attachments/assets/1a3578ba-add8-49a2-88b4-08195a7f0140" />

## 🤯 What Is This?
**`codexapp`** is a lightweight bridge that gives you a desktop browser UI for Codex app-server workflows.

This fork supports desktop web access. Telegram, mobile layouts, installable PWA, and Android/Termux runtimes are no longer supported. Build this fork from source to use these changes; the upstream npm package may differ.

You run one command. It starts a local web server. You open it from your machine, your LAN, or wherever your setup allows.  

**TL;DR 🧠: Codex app UI, unlocked for Linux, macOS, and Windows.**

---

## ⚡ Quick Start
> **The main event.**

```bash
# 🔓 Run instantly (recommended)
npx codexapp

# 🌐 Then open in browser
# http://localhost:18923
```

By default, `codexapp` now also starts:

```bash
cloudflared tunnel --url http://localhost:<port>
```

It prints the tunnel URL and password file location in startup output.
Use `--no-tunnel` to disable this behavior.

If you are using a provider or AI gateway that is already authenticated and do not want `codexapp` to force `codex login` during startup, use:

```bash
npx codexapp --no-login
```

### Linux 🐧
```bash
node -v   # should be 18+
npx codexapp
```

### Windows 🪟 (PowerShell)
```powershell
node -v   # 18+
npx codexapp
```

## ✨ Features
> **The payload.**

- 🚀 One-command launch with `npx codexapp`
- 🌍 Cross-platform support for Linux, macOS, and Windows
- 🖥️ Browser-first Codex UI flow on `http://localhost:18923`
- 🌐 LAN-friendly access from other devices on the same network
- 🧪 Remote/headless-friendly setup for server-based Codex usage
- 🔌 Works with reverse proxies and tunneling setups
- ⚡ No global install required for quick experimentation
- 🎙️ Built-in hold-to-dictate voice input with transcription to composer draft
- 💾 Project portability: export a project as a ZIP from project or thread menus, including matching Codex chat JSONL history under `.codex-project/chats/`
- 📦 Project import: restore exported project ZIPs from the browser via `Import Project`
- 🔁 Imported chats are rewritten for the destination `CODEX_HOME`, project path, and currently selected provider/model so they can be resumed in the new environment
- ⚙️ Project ZIP performance: exports stream ZIP bytes with response backpressure handling and skip generated/git-ignored folders; imports still buffer the selected ZIP once because the browser upload arrives as a single file

## 🧩 Recent Product Features (from main commits)
> **Not just launch. Actual UX upgrades.**

- 🗂️ Searchable project picker in new-thread flow
- ➕ "Create Project" button next to "Select folder" with browser prompt
- 📌 New projects get pinned to top automatically
- 🧠 Smart default new-project name suggestion via server-side free-directory scan (`New Project (N)`)
- 🔄 Project order persisted globally to workspace roots state
- 🧵 Optimistic in-progress threads preserved during refresh/poll cycles
- 🧪 Skills Hub event typing fix for `SkillCard` select emit compatibility
- 🎙️ Voice dictation flow in composer (`hold to dictate` -> transcribe -> append text)

---

## 🌍 What Can You Do With This?

| 🔥 Use Case | 💥 What You Get |
|---|---|
| 💻 Linux workstation | Run Codex UI in browser without depending on desktop shell |
| 🪟 Windows machine | Launch web UI and access from Chrome/Edge quickly |
| 🧪 Remote dev box | Keep Codex process on server, view UI from client device |
| 🌐 LAN sharing | Open UI from another device on same network |
| 🧰 Headless workflows | Keep terminal + browser split for productivity |
| 🔌 Custom routing | Put behind reverse proxy/tunnel if needed |
| ⚡ Fast experiments | `npx` run without full global setup |

---

## 🖼️ Screenshots

### Skills Hub
![Skills Hub](docs/screenshots/skills-hub.png)

### Chat
![Chat](docs/screenshots/chat.png)

---

## 🏗️ Architecture

```text
┌─────────────────────────────┐
│  Browser (Desktop)          │
└──────────────┬──────────────┘
               │ HTTP/WebSocket
┌──────────────▼──────────────┐
│         codexapp            │
│  (Express + Vue UI bridge)  │
└──────────────┬──────────────┘
               │ RPC/Bridge calls
┌──────────────▼──────────────┐
│      Codex App Server       │
└─────────────────────────────┘
```

---

## 🎯 Requirements
- ✅ Node.js `18+`
- ✅ Codex app-server environment available
- ✅ Browser access to host/port
- ✅ Microphone permission (only for voice dictation)

---

## 🐛 Troubleshooting

| ❌ Problem | ✅ Fix |
|---|---|
| Port already in use | Run on a free port or stop old process |
| `npx` fails | Update npm/node, then retry |
| Can’t open from other device | Check firewall, bind address, and LAN routing |

---

## 🤝 Contributing
Issues and PRs are welcome.  
Bring bug reports, platform notes, and setup improvements.

---

## ⭐ Star This Repo
If you believe Codex UI should be accessible from **desktop browsers across platforms**, star this project and share it. ⭐

<div align="center">
Built for speed, portability, and a little bit of chaos 😏
</div>

---

Forked from [pavel-voronin/codex-web-local](https://github.com/pavel-voronin/codex-web-local) by Pavel Voronin.

### Persistent custom login password

The default random password is regenerated on each start. You can also set a
second, persistent password: both passwords use the same login form and sessions.
Create `codexui-custom-password` in the service's `CODEX_HOME` (default
`~/.codex`), or set `CODEX_WEB_CUSTOM_PASSWORD_FILE` to an absolute file path
outside your release directories. Keep that file and the service environment
configuration across upgrades; restart the service after setting or changing it.
An explicitly configured missing/unreadable file, or an empty/multiline file,
prevents startup. The optional default file may be absent.

Run this as the service user to enter a password without putting it in shell
history or command arguments:

```bash
python3 - <<'PY'
import getpass, os
from pathlib import Path
path = Path(os.environ.get('CODEX_WEB_CUSTOM_PASSWORD_FILE') or
            str(Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex') / 'codexui-custom-password'))
password = getpass.getpass('Custom login password: ')
if not password or '\n' in password or '\r' in password:
    raise SystemExit('Password must be one non-empty line')
if password != getpass.getpass('Confirm password: '):
    raise SystemExit('Passwords do not match')
path.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as stream:
    os.fchmod(stream.fileno(), 0o600)
    stream.write(password + '\n')
print('Custom password saved. Restart the service to apply.')
PY
```

This file is a plaintext credential: restrict it to the service user (`0600`),
keep it out of Git, and do not print it in deployment logs. Remove the file and
unset the override, then restart to disable the custom password. Existing login
sessions keep their normal lifetime. `--password` remains the primary password;
`--no-password` still disables authentication entirely.
