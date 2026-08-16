<div align="center">

# DeepSeek Harness 桌面版

[English](./README.md) | **简体中文**

**DeepSeek Harness 官方 Web UI 的 Windows 桌面客户端** —— 自动检测环境、安装依赖、拉起服务，开箱即用。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-31-47848F)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2B-0078D6)

</div>

---

## 简介

一个把官方 DeepSeek Harness Web UI 封装进桌面壳的 Electron 应用。启动时选择**安装模式**，之后环境检测、安装、服务启动全部自动完成，每个阶段都有**百分比进度条**；服务就绪后自动打开主界面。

无需记命令、无需手动启动服务——双击即可用。

## 功能特性

### 三种安装模式

启动时选择安装方式：

| 模式 | 说明 | 适合场景 |
| --- | --- | --- |
| **快速启动** | `npm install -g @deepseek-ai/dsh`（每次启动自动更新到官方最新版） | 大多数用户，最快开始使用 |
| **源码完整安装** | `git clone` + `pnpm install` + `pnpm run build` | 开发者，想改源码/调试 |
| **本地修复** | 卸载全局 `@deepseek-ai/dsh`、清理残留并重装 | 安装损坏、koffi 加载失败时修复 |

### 人性化启动引导

- **大百分比进度条** + 阶段提示，完全替代日志刷屏
- **可展开的命令行日志面板**：点一下即可查看真实输出（安装/构建过程），出错时自动展开
- 阶段文案随输出智能变化：检测环境 → 下载中 → 解压中 → 安装中 → 构建中 → 启动中

### 插件管理（独立页面 + 自定义安装）

首页提供「插件管理」入口（左侧导航），进入插件管理页：

- **推荐插件**：一键安装 / 卸载由开发者制作的插件（安装过程显示在「自定义安装」卡片的命令行日志中，完成后点「立即重启服务」即可生效）：
  - **[用量与消耗插件（dsh-usage-plugin）](https://github.com/feiyang-dev/dsh-usage-plugin)**：记录每次调用的 token 用量与缓存命中、按 DeepSeek 峰谷/基础价格计费、用量日历热力图、余额查询、CSV/JSON/PNG 导出
  - **[数据保险箱（dsh-vault）](https://github.com/feiyang-dev/dsh-vault)**：自动备份 `~/.dsh` 数据到 `~/.dsh-backups`、清空检测、一键恢复，保护聊天记录与工作区数据
- **自定义安装**：填写任意 npm 包名或安装命令（如 `@scope/plugin-name` 或 `npm install @scope/plugin-name`），客户端自动执行安装并注册到运行环境；命令行日志在「自定义安装」卡片内实时展示
- **已安装列表**：展示全部已安装插件（版本 / 注册状态），可逐个卸载
- 安装逻辑与官方 `dsh plugin add` 等价（npm 装入 profile + 注册 `dsh.profile.bundles`），**重新运行服务后生效**

> 不喜欢桌面端也可以直接在命令行安装，效果等价：
> ```bash
> dsh plugin --profile web add @feiyang666/dsh-usage-plugin
> dsh plugin --profile web add @feiyang666/dsh-vault
> ```

### 插件市场（扫描 GitHub 社区插件）

左侧导航新增「插件市场」，扫描 GitHub 上带 `dsh-plugin` 话题的公开仓库（官方推荐的社区插件发现方式）：

- **列表展示**：每个插件展示名称、作者、描述、star 数、主要语言、许可证，官方推荐插件置顶并标注「官方」
- **搜索 / 分页**：支持按关键词搜索插件名称 / 描述 / 作者，结果分页浏览
- **一键安装**：识别到仓库 `package.json` 的 npm 包名后即可一键安装（复用自定义安装的国内镜像自动切换流程）；未能识别到 npm 包的仓库标注「非 npm 包」，仅供参考
- **已安装状态**：已安装的插件在市场中直接标记「已安装」及版本号
- 扫描范围为 GitHub 公开 API，未登录时受 GitHub 限流限制（约 60 次/小时），市场页有失败提示与重试入口

### 设置与在线更新

左侧导航「设置」进入设置页面：

- **关于**：应用版本、更新日志、更新服务状态
- **外观**：界面主题 **深色 / 浅色 / 跟随系统** 三档一键切换（持久化保存，选择后立即生效；与官方 WebUI 多端同步，任意一端切换另一端自动跟随）
- **通知**：新版本系统通知开关（持久化保存）
- **开发者选项**：「开启开发者选项模式」开关（持久化保存，对下次启动生效）
- **检查更新**：进入设置页自动检查，支持手动检查、一键下载并安装，下载过程显示实时进度，完成后校验 SHA256

### 开发者选项模式（前端开发专用）

开启「开发者选项模式」后，选择「快速启动」时不再走单进程 npx，而是把启动**分离为两个进程**，便于迭代 DSH 浏览器端：

| 进程 | 说明 |
|---|---|
| 服务端后端 | 源码仓库方式启动 `dsh web`（`%APPDATA%/dsh-desktop/deepseek-harness`），提供 API 并托管前端，地址不变 |
| 浏览器端热更 watcher | `pnpm run dev:web`，监听全部 `dsh.client` 插件源码，改动后自动重建 bundle，浏览器免刷新热更 |

- 需先完成一次「源码完整安装」构建好源码仓库（未就绪时启动会给出引导提示）
- WebUI 窗口仍打开 `http://127.0.0.1:3080`；首页控制台显示「开发者模式」标识，停止/重新运行会同时管理两个进程
- 选择「源码完整安装」时若已开启该模式，安装完成后也会自动附带启动热更 watcher
- 关闭开关后回到原来的单进程 npx 快速启动

### 其他特性

- **无终端窗口**：所有子进程用 `node` 直接执行，不弹命令行窗口
- **环境自动检测**：Node.js/git/pnpm 缺失时给出对应引导（Node 缺失显示下载按钮；git 缺失提示下载；pnpm 缺失自动安装）
- **服务自动拉起**：优先复用已有 3080 服务；否则启动 dsh web
- **系统托盘**：关闭窗口最小化到托盘，服务保持运行；托盘菜单可退出
- **干净退出**：退出时自动 `taskkill` 终止 dsh 子进程树
- **可打包分发**：`electron-builder` 生成 Windows 安装包

## 系统要求

| 依赖 | 说明 |
|---|---|
| Windows 10 / 11（x64） | 应用运行平台 |
| Node.js ≥ 18 | 快速启动模式依赖，缺失时客户端引导下载 |
| git | 仅源码模式需要（pnpm 缺失时自动安装） |
| 网络 | 首次安装需下载依赖（约数百 MB） |

> 均可在客户端内自动引导补齐，无需提前手动安装。

## 快速开始

### 开发运行

```bat
start.bat
```

或手动：

```bat
npm install
npm start
```

自定义端口：`npm start -- --port 8090`（默认 3080；若端口已有 dsh web 在运行会直接复用）。

## 目录结构

```
dsh-desktop/
├── main.js              # 主进程（模式选择/进度状态机/安装/启动/窗口/托盘/清理/更新服务/插件市场 IPC）
├── preload.js           # 安全桥接（模式/进度/日志/状态/设置/更新/插件市场 IPC）
├── plugin-manager.js    # 插件管理器（安装/卸载/查询，纯 Node 逻辑）
├── plugin-market.js     # 插件市场（扫描 GitHub topic:dsh-plugin，纯 Node 逻辑）
├── boot/                # 启动引导页（首页 + 左侧导航 + 插件管理页 + 插件市场页 + 设置页 + 进度条 + 日志面板）
│   ├── boot.html
│   ├── boot.css
│   └── boot.js
├── assets/              # 打包资源（图标等）
├── pack.js              # 交互式打包脚本
├── start.bat            # 开发启动脚本
└── package.json         # 依赖与打包配置
```

## 启动流程（状态机）

```
[首页：模式选择] --用户自行选择（无自动进入）-->
   快速：检测 node → npx 下载依赖 → 启动服务
   快速+开发者选项：检测 node → 检查源码仓库 → 启动服务端后端 + 浏览器端热更 watcher（双进程）
   源码：检测 git/pnpm → clone → pnpm install --ignore-scripts → pnpm run build → 启动服务（开启开发者选项时附带启动热更 watcher）
   修复：停止服务 → 强力清除本地数据 → 官方快速版启动
        │
        ▼
[进度] 8%检测环境 → 25-90%安装/构建/修复 → 60-95%启动服务 → 100%就绪
        │
        ▼
[首页：正在运行中] --独立新窗口打开 WebUI（http://127.0.0.1:3080）-->
   [停止运行] → 首页显示"已停止"，可重新运行或改选模式
   [重新运行] → 用上次所选模式重新走启动流程
[插件管理页] 左侧导航「插件管理」→ 推荐插件一键安装 / 自定义包名安装 / 已安装列表卸载
[插件市场页] 左侧导航「插件市场」→ 扫描 GitHub topic:dsh-plugin → 搜索 / 浏览 / 一键安装
[设置页] 首页「设置」→ 关于 / 通知 / 开发者选项 / 检查更新（自动检查 + 下载安装）
```

关键实现：

- 快速模式：`node <npm>/bin/npm-cli.js exec --yes -- @deepseek-ai/dsh web`，环境变量 `npm_config_ignore_scripts=true`（跳过 koffi 源码编译，避免缺 CMake 失败，与 `start-web.bat` 一致）
- **版本策略**：`npm exec` 每次启动都会向 registry 解析 `latest`（npx 缓存按 resolved tarball 比对，发现新版自动下载），所以官方发布新版后**下次快速启动自动就是最新版**；registry 不可达时自动改用 `--prefer-offline` 回退到 npx 缓存中已有的版本，避免断网时无法启动
- 源码模式：仓库 clone 到 `%APPDATA%/dsh-desktop/deepseek-harness`（不污染工作区）；`pnpm install --ignore-scripts` 后 `pnpm run build`；启动用 `node --import tsx/esm apps/cli/src/bin.ts web`
- 启动服务均不经过 cmd.exe，无终端弹窗

## 常见问题（FAQ）

**Q: 安装过程中卡在某个百分比？**
A: 点击"命令行日志"面板查看真实输出。多数情况是网络下载慢，耐心等待即可；若长时间无进展，可用"本地修复"模式重装。

**Q: koffi 加载失败 / 版本异常怎么办？**
A: 在启动页选择"本地修复"模式，客户端会自动卸载全局包、清理残留并重装最新版。

**Q: 端口 3080 被占用？**
A: 客户端会优先复用已运行的 dsh web 服务；也可用 `npm start -- --port <port>` 指定其他端口。

**Q: 想调试 / 改源码？**
A: 选择"源码完整安装"模式，源码会 clone 到 `%APPDATA%/dsh-desktop/deepseek-harness`，构建后自动启动。

**Q: 开发者选项模式怎么用？**
A: 设置页开启「开发者选项模式」（需先完成一次"源码完整安装"），然后选择"快速启动"。客户端会分离运行「服务端后端」与「浏览器端热更 watcher（pnpm dev:web）」两个进程，浏览器仍打开 3080；修改 `dsh.client` 插件源码会自动重建并免刷新热更。

**Q: DeepSeek 官方发布了新版本，桌面端要怎么更新？**
A: 不用手动处理。快速启动使用 `npm exec`（npx）方式：**每次启动都会向 registry 解析最新版并自动下载**，官方发布新版后，下次选择「快速启动」自动就是新版。首页运行状态会显示当前 dsh 版本（如 `dsh v0.1.0-rc.6`）；设置 →「运行环境（dsh）」可一键查看「当前版本 vs 最新版本」。若启动时恰好断网，客户端会自动回退到上次缓存的版本启动，联网后再启动即恢复最新版。

**Q: 开发者选项模式下"本地修复"还可用吗？**
A: 可用。"本地修复"始终走官方快速版 npx 单进程启动，不受开发者选项影响（修复时会同时清理残留的 watcher 进程）。

## 技术栈

- [Electron](https://www.electronjs.org/) 31 — 桌面壳
- [electron-builder](https://www.electronjs.org/app-builder) — 打包分发（NSIS）
- 原生 Web API — 启动引导页（无前端框架依赖）

## 许可证

[MIT](./LICENSE) © dsh-desktop

## 相关项目

| 项目 | 说明 | 安装方式 |
| --- | --- | --- |
| [用量与消耗插件（dsh-usage-plugin）](https://github.com/feiyang-dev/dsh-usage-plugin) | 每次调用的 token 用量/缓存命中统计、峰谷计费、余额查询、CSV/JSON/PNG 导出 | 桌面端推荐插件一键安装，或 `dsh plugin add @feiyang666/dsh-usage-plugin` |
| [数据保险箱（dsh-vault）](https://github.com/feiyang-dev/dsh-vault) | 自动备份 / 清空检测 / 一键恢复，保护聊天记录与工作区数据 | 桌面端推荐插件一键安装，或 `dsh plugin add @feiyang666/dsh-vault` |
| [DeepSeek-Harness](https://github.com/deepseek-ai/DeepSeek-Harness) | 官方 CLI / Web 服务 | — |

---

<div align="center">

如果觉得有帮助，欢迎 Star ⭐

</div>
