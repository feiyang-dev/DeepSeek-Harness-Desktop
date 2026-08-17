<div align="center">

# DeepSeek Harness Desktop

**English** · [简体中文](./README.zh.md)

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

Choose an install method when the app launches:

| Mode | Description | Best For |
|---|---|---|
| Instant Start | Local fixed-directory runtime, second-level launch, auto-checks official updates with one-click update (replaces Quick Start) | Most users, recommended |
| Full Source Build | `git clone` + `pnpm install` + `pnpm run build` | Developers who want to modify/debug the source |
| Local Repair | Uninstall global `@deepseek-ai/dsh`, clean residue, reinstall | Fix broken installs, version issues, or koffi load failures |

### Friendly Startup Guide

- **Large percentage progress bar** + stage hints, fully replacing log spam
- **Expandable command-line log panel**: one click to view real output (install/build process), auto-expands on errors
- Stage text adapts intelligently: detecting environment → downloading → extracting → installing → building → starting

### Plugin Management (Dedicated Page + Custom Install)

The home screen has a "Plugin Management" entry (left navigation) that opens a dedicated plugin page:

- **Recommended plugins** — one-click install/uninstall of community-built plugins (install progress shows in the "Custom Install" card's command log; click "Restart Service Now" after finishing):
  - **[Usage & Cost Tracker (dsh-usage-plugin)](https://github.com/feiyang-dev/dsh-usage-plugin)**: per-call token/cache-hit stats, peak/off-peak billing, a usage calendar heatmap, balance query, and CSV/JSON/PNG export.
  - **[Data Vault (dsh-vault)](https://github.com/feiyang-dev/dsh-vault)**: auto-backups `~/.dsh` data to `~/.dsh-backups`, detects data wipe, and restores chat history and workspace data with one click.
- **Custom install** — enter any npm package name or install command (e.g. `@scope/plugin-name` or `npm install @scope/plugin-name`); the client installs it and registers it in the runtime profile. Command-line output is shown live in the custom-install card.
- **Installed list** — shows all installed plugins (version / registration status) with per-plugin uninstall.
- The install logic is equivalent to the official `dsh plugin add` (npm into profile + register `dsh.profile.bundles`); **restart the service to take effect**.

> Prefer the command line? The equivalent commands work too:
> ```bash
> dsh plugin --profile web add @feiyang666/dsh-usage-plugin
> dsh plugin --profile web add @feiyang666/dsh-vault
> ```

### Plugin Market (Scan GitHub Community Plugins)

A "Plugin Market" entry in the left navigation scans GitHub public repos tagged with `dsh-plugin` (the officially recommended way to discover community plugins):

- **List view**: each plugin shows name, author, description, star count, primary language, and license; official recommended plugins are pinned and marked "Official".
- **Search / pagination**: keyword search across plugin name / description / author, with paginated results.
- **One-click install**: once the repo's npm package name is detected from its `package.json`, you can install it with one click (reuses the custom-install flow with automatic mirror switching); repos without a detectable npm package are marked "Not an npm package" for reference.
- **Installed status**: already-installed plugins are marked "Installed" with their version directly in the market.
- The scan uses the public GitHub API and is subject to GitHub rate limits without login (~60 requests/hour); the market page shows failure hints and a retry entry.

### Settings & Online Updates

The "Settings" entry (left navigation) opens the settings page:

- **About**: app version, changelog
- **Appearance**: interface theme with three options — **Dark / Light / Follow System** (persisted, takes effect immediately, **synced across the desktop client and the official Web UI — change it on either side and the other follows**)
- **Notifications**: toggle for new-version system notifications (persisted)
- **Developer options**: toggle "Developer options mode" (persisted, applies on next launch)
- **Check for updates**: auto-checks when entering settings; supports manual check, one-click download & install, live progress display, and SHA256 verification on completion

### Developer Options Mode (for frontend development)

After enabling "Developer options mode", choosing "Quick Start" no longer runs a single-process npx; instead it **splits startup into two processes** for easier iteration on the DSH browser side:

| Process | Description |
|---|---|
| Service backend | Starts `dsh web` from the source repo (`%APPDATA%/dsh-desktop/deepseek-harness`), serves the API and hosts the frontend at the same address |
| Browser-side hot-reload watcher | `pnpm run dev:web`, watches all `dsh.client` plugin sources; rebuilds the bundle automatically on changes, hot-reloads in the browser without refresh |

- Requires a completed "Full Source Build" first (a hint is shown if not ready)
- The WebUI window still opens `http://127.0.0.1:3080`; the home console shows a "Developer Mode" badge, and stop/restart manages both processes
- Choosing "Full Source Build" while the mode is on also starts the hot-reload watcher after the build
- Turning the switch off returns to the original single-process npx Quick Start

### Other Features

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
| Node.js ≥ 18 | Required for Instant Start mode; the client guides installation if missing |
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

## Project Structure

```
dsh-desktop/
├── main.js              # Main process (mode selection/progress state machine/install/start/window/tray/cleanup/update service/plugin market IPC)
├── preload.js           # Secure bridge (mode/progress/log/status/settings/update/plugin market IPC)
├── plugin-manager.js    # Plugin manager (install/uninstall/status, pure Node logic)
├── plugin-market.js     # Plugin market (scans GitHub topic:dsh-plugin, pure Node logic)
├── boot/                # Bootstrap page (home + left nav + plugin management + plugin market + settings + progress bar + log panel)
│   ├── boot.html
│   ├── boot.css
│   └── boot.js
├── assets/              # Packaging resources (icons, etc.)
├── pack.js              # Interactive packaging script
├── start.bat            # Dev startup script
└── package.json         # Dependencies & build config
```

## Startup Flow (State Machine)

```
[Home: Mode Selection] --user chooses (no auto-enter)-->
    Quick: detect node → npx downloads deps → start service
    Quick + Developer mode: detect node → check source repo → start service backend + browser hot-reload watcher (two processes)
    Source: detect git/pnpm → clone → pnpm install --ignore-scripts → pnpm run build → start service (with dev mode on, also starts the watcher)
    Repair: stop service → force-clear local data → official quick-start launch
        │
        ▼
[Progress] 8% detect env → 25-90% install/build/repair → 60-95% start service → 100% ready
        │
        ▼
[Home: Running] --opens WebUI in a separate window (http://127.0.0.1:3080)-->
   [Stop] → home shows "Stopped"; re-run or switch mode
   [Restart] → re-runs the startup flow with the last chosen mode
[Plugin Management] left nav → recommended one-click install / custom package install / uninstall from installed list
[Plugin Market] left nav → scans GitHub topic:dsh-plugin → search / browse / one-click install
[Settings] home → About / Notifications / Developer options / Check for updates (auto-check + download & install)
```

Key implementation details:

### How Instant Start works (why it is second-level and offline-capable)

**Why was the old "Quick Start" slow?** Quick Start ran `npm exec --yes -- @deepseek-ai/dsh web` (npx). The official dsh package is split into **150+ interdependent sub-packages** (`@deepseek-ai/dsh-*`), and `npm exec` does the following on every startup:

1. Resolves `latest` from the registry (one HTTP round-trip);
2. Sends an HTTP request for **each sub-package** to revalidate its version (`cache revalidated`), even when the local cache already exists;
3. Unpacks each tarball into a fresh npx sandbox directory.

Serializing the validation + unpacking of those 150+ packages takes **100~200 seconds** even with a fully warm cache (especially on domestic networks) — that is the root cause of a 200+ second service startup. **It is not a slow network; npm is re-resolving the whole dependency tree every time.**

**What Instant Start does:** it fully separates "install" from "launch" — **install once, launch many times**:

- **First run (needs network once)**: runs `npm install @deepseek-ai/dsh --prefix <userData>/dsh-local --ignore-scripts`, fully unpacking dsh and all 150+ dependencies into a local fixed directory (`%APPDATA%\dsh-desktop\dsh-local\node_modules`), forming a "ready" dependency tree on disk. Uses the domestic mirror (npmmirror) with automatic fallback.
- **Every subsequent launch (fully offline)**: `spawn(node, [<dsh-local>/node_modules/@deepseek-ai/dsh/lib/bin.js, 'web', ...])` — the Node.js process loads the locally unpacked `bin.js` entry directly. **No npm involved**: no `latest` resolution, no HTTP requests, no tarball validation, no unpacking. Node's `require` hits the local `node_modules` directly, and the service is ready within seconds.
- The working directory matches Quick/Repair modes (`resolveWorkspaceDir()`), so session-history ownership is unchanged.

**How do updates work?** Instead of forcing "latest on every start", Instant Start **silently checks in the background**: about 8 seconds after startup (avoiding first-load bandwidth contention), it runs `npm view @deepseek-ai/dsh version` to query the latest official version. When a new version is found, the home status bar shows a "Update Now" banner — click to auto "stop service → reinstall the local runtime to the latest → auto restart", all through the domestic mirror with automatic fallback. When offline the check is skipped and startup is unaffected.

**Mirror speed-test skip when local runtime is ready**: `ensureRegistrySelected()` (concurrent mirror speed test) in `run()` only executes for Instant Start when the local runtime is not yet installed — once installed it starts directly, so fully-offline scenarios need no network probing.

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

**Q: How do I use Developer Options mode?**
A: Enable "Developer options mode" in Settings (a "Full Source Build" must be done first), then choose "Quick Start". The client runs the "service backend" and the "browser-side hot-reload watcher (`pnpm dev:web`)" as two processes; the browser still opens on 3080. Changes to `dsh.client` plugin sources rebuild automatically and hot-reload without a refresh.

**Q: How does the desktop app update when DeepSeek releases a new official version?**
A: Instant Start **auto-checks for updates in the background**: after startup it silently queries the latest official version, and when a new version is found the home status bar shows a "Update Now" banner — click to auto "stop service → reinstall the local runtime to the latest → auto restart", all through the domestic mirror with automatic fallback. The home screen shows the current dsh version; Settings → "Runtime (dsh)" can compare "current version vs latest version" with one click. When offline the check is skipped and startup is unaffected.

**Q: Is "Local Repair" still available in Developer Options mode?**
A: Yes. "Local Repair" always runs the official quick-start npx single process and is unaffected by Developer Options (repair also cleans up any leftover watcher processes).

## Tech Stack

- [Electron](https://www.electronjs.org/) 31 — desktop shell
- [electron-builder](https://www.electronjs.org/app-builder) — packaging (NSIS)
- Native Web APIs — bootstrap page (no frontend framework dependencies)

## License

[MIT](./LICENSE) © dsh-desktop

## Related Projects

| Project | Description | Installation |
| --- | --- | --- |
| [Usage & Cost Tracker (dsh-usage-plugin)](https://github.com/feiyang-dev/dsh-usage-plugin) | Per-call token/cache-hit stats, peak/off-peak billing, balance query, CSV/JSON/PNG export | One-click from the desktop app's recommended plugins, or `dsh plugin add @feiyang666/dsh-usage-plugin` |
| [Data Vault (dsh-vault)](https://github.com/feiyang-dev/dsh-vault) | Auto backup / wipe detection / one-click restore — protects chat history and workspace data | One-click from the desktop app's recommended plugins, or `dsh plugin add @feiyang666/dsh-vault` |
| [DeepSeek-Harness](https://github.com/deepseek-ai/DeepSeek-Harness) | Official CLI / Web service | — |

---

<div align="center">

If you find this helpful, feel free to Star ⭐

</div>
