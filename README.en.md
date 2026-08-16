<div align="center">

# DeepSeek Harness Desktop

**English** | [简体中文](./README.md)

**A Windows desktop client for the official DeepSeek Harness Web UI** — automatically detects your environment, installs dependencies, and starts the service. Works out of the box.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-31-47848F)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2B-0078D6)

</div>

---

## Overview

An Electron desktop shell that embeds the official DeepSeek Harness Web UI. On startup it lets you pick an **installation mode**, then automatically handles environment detection, installation, and service startup — with a **percentage progress bar** for every stage. When the service is ready, the main UI opens automatically.

No command-line memorization, no manual service startup — just double-click and go.

## Features

### Installation Modes

Choose an install method when the app launches (**auto-selects Quick Start if no choice within 10 seconds**):

| Mode | Description | Best For |
|---|---|---|
| Quick Start | `npm install -g @deepseek-ai/dsh` | Most users, fastest path to start |
| Full Source Build | `git clone` + `pnpm install` + `pnpm run build` | Developers who want to modify/debug the source |
| Local Repair | Uninstall global `@deepseek-ai/dsh`, clean residue, reinstall | Fix broken installs, version issues, or koffi load failures |

### Friendly Startup Guide

- **Large percentage progress bar** + stage hints, fully replacing log spam
- **Expandable command-line log panel**: one click to view real output (install/build process), auto-expands on errors
- Stage text adapts intelligently: detecting environment → downloading → extracting → installing → building → starting

### Plugin Management (Built-in)

The home screen has an "Install Plugins" entry that opens a dedicated plugin page:

- **Recommended plugins** — one-click install/uninstall of community-built plugins:
  - **[Usage & Cost Tracker (dsh-usage)](https://github.com/feiyang-dev/dsh-usage-plugin)**: per-call token/cache-hit stats, peak/off-peak billing, a usage calendar heatmap, balance query, and CSV/JSON/PNG export.
  - **[Data Vault (dsh-vault)](https://github.com/feiyang-dev/dsh-vault)**: auto-backups `~/.dsh` to `~/.dsh-backups`, detects data wipe, and restores chat history and workspace data with one click.
- **Custom install** — enter any npm package name or install command; the client installs it and registers it in the runtime profile. Command-line output is shown live in the custom-install card.
- **Installed list** — shows all installed plugins (version / registration status) with per-plugin uninstall.
- The install logic is equivalent to the official `dsh plugin add` (npm into profile + register `dsh.profile.bundles`); **restart the service to take effect**.

> Prefer the command line? The equivalent commands work too:
> ```bash
> dsh plugin --profile web add @feiyang666/deepseekharnessdesktop
> dsh plugin --profile web add @feiyang666/dsh-vault
> ```

### Other Features

- **Dark / light theme**: switch between dark and light UI from Settings → Appearance; applied instantly and saved persistently
- **No terminal windows**: all subprocesses run directly via `node`, no console popups
- **Automatic environment detection**: guides you when Node.js/git/pnpm are missing (download button for Node, download hint for git, auto-install for pnpm)
- **Automatic service startup**: reuses an existing service on port 3080 when available; otherwise starts `dsh web`
- **System tray**: closing the window minimizes to tray while the service keeps running; exit from tray menu
- **Clean exit**: automatically `taskkill`s the dsh process tree on quit
- **Packaging**: `electron-builder` generates a Windows installer

## System Requirements

| Dependency | Notes |
|---|---|
| Windows 10 / 11 (x64) | Runtime platform |
| Node.js ≥ 18 | Required for Quick Start mode; the client guides installation if missing |
| git | Only needed for source mode (pnpm auto-installs if missing) |
| Network | First install downloads dependencies (~hundreds of MB) |

> The client guides you through installing anything missing — no manual setup required.

## Getting Started

### Development

```bat
start.bat
```

Or manually:

```bat
npm install
npm start
```

Custom port: `npm start -- --port 8090` (default 3080; reuses an existing dsh web service on that port if present).

### Building the Installer

```bat
npm run dist
```

Produces `release/DeepSeek Harness 桌面版-Setup-<version>.exe` (NSIS installer) that can be copied to other Windows machines.

Interactive build (auto-increments version + writes changelog):

```bat
node pack.js
```

## Project Structure

```
dsh-desktop/
├── main.js          # Main process (mode selection/progress state machine/install/start/window/tray/cleanup)
├── preload.js       # Secure bridge (mode/progress/log/status IPC)
├── boot/            # Bootstrap page (mode selection + progress bar + log panel)
│   ├── boot.html
│   ├── boot.css
│   └── boot.js
├── assets/          # Packaging resources (icons, etc.)
├── pack.js          # Interactive packaging script
├── start.bat        # Dev startup script
└── package.json     # Dependencies & build config
```

## Startup Flow (State Machine)

```
[Mode Selection] --auto Quick Start after 10s-->
  Quick : detect node → dsh installed? → install(@deepseek-ai/dsh) → start service
  Source: detect git/pnpm → clone → pnpm install --ignore-scripts → pnpm run build → start service
  Repair: stop service → uninstall global dsh → clean residue → reinstall → start service
        │
        ▼
[Port Probe] Service on 3080? → reuse directly (skipped in Repair mode)
[Progress] 8% detect env → 25-90% install/build/repair → 60-95% start service → 100% ready
[Open Main Window] http://127.0.0.1:3080
```

Key implementation details:

- Quick mode: `node <npm>/bin/npm-cli.js install -g @deepseek-ai/dsh --no-audit --no-fund` with `npm_config_ignore_scripts=true` (skips koffi source compilation to avoid missing CMake failures, same as `start-web.bat`)
- Source mode: repo cloned to `%APPDATA%/dsh-desktop/deepseek-harness` (keeps the workspace clean); `pnpm install --ignore-scripts` then `pnpm run build`; starts via `node --import tsx/esm apps/cli/src/bin.ts web`
- All services start without going through `cmd.exe` — no terminal popups

## FAQ

**Q: Installation stuck at a percentage?**
A: Click the "command-line log" panel to see the real output. Usually it's just slow network downloads — be patient. If it makes no progress for a long time, use "Local Repair" mode to reinstall.

**Q: koffi load failure / version issues?**
A: Pick "Local Repair" mode on the startup page. The client uninstalls the global package, cleans residue, and reinstalls the latest version automatically.

**Q: Port 3080 is already in use?**
A: The client reuses a running dsh web service first; alternatively use `npm start -- --port <port>` to specify another port.

**Q: Want to debug or modify the source?**
A: Choose "Full Source Build" mode. The source is cloned to `%APPDATA%/dsh-desktop/deepseek-harness` and starts automatically after building.

## Tech Stack

- [Electron](https://www.electronjs.org/) 31 — desktop shell
- [electron-builder](https://www.electronjs.org/app-builder) — packaging (NSIS)
- Native Web APIs — bootstrap page (no frontend framework dependencies)

## License

[MIT](./LICENSE) © dsh-desktop

## Related Projects

| Project | Description | Installation |
| --- | --- | --- |
| [Usage & Cost Tracker (dsh-usage)](https://github.com/feiyang-dev/dsh-usage-plugin) | Per-call token/cache-hit stats, peak/off-peak billing, balance query, CSV/JSON/PNG export | One-click from the desktop app's recommended plugins, or `dsh plugin add @feiyang666/deepseekharnessdesktop` |
| [Data Vault (dsh-vault)](https://github.com/feiyang-dev/dsh-vault) | Auto backup / wipe detection / one-click restore — protects chat history and workspace data | One-click from the desktop app's recommended plugins, or `dsh plugin add @feiyang666/dsh-vault` |
| [DeepSeek-Harness](https://github.com/deepseek-ai/DeepSeek-Harness) | Official CLI / Web service | — |

---

<div align="center">

If you find this helpful, feel free to Star ⭐

</div>
