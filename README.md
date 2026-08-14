# DeepSeek Harness 桌面版

一个 Electron 桌面壳，内嵌官方 DeepSeek Harness Web UI。启动时让用户选择**安装模式**，自动完成环境检测、安装、服务拉起，以**百分比进度条**展示各阶段，服务就绪后打开主界面。

## 特性

### 安装模式选择
进入 App 后先让用户选择安装方式（**10 秒内未选择自动用快速启动**）：

| 模式 | 说明 | 适合场景 |
|---|---|---|
| 快速启动 | `npm install -g @deepseek-ai/dsh` 自动安装 | 大多数用户，最快开始使用 |
| 源码完整安装 | `git clone` + `pnpm install` + `pnpm run build` | 开发者，想改源码/调试 |
| 本地修复 | 卸载全局 `@deepseek-ai/dsh`、清除残留、重新安装 | 安装损坏、版本异常、koffi 加载失败时一键修复 |

### 人性化启动引导
- **大百分比进度条** + 阶段提示，完全替代日志刷屏
- **可展开的命令行日志面板**：点一下即可查看真实输出（安装/构建过程），出错时自动展开
- 阶段文案随输出智能变化：检测环境 → 下载中 → 解压中 → 安装中 → 构建中 → 启动中

### 其他特性
- **无终端窗口**：所有子进程用 `node` 直接执行，不弹命令行窗口
- **环境自动检测**：Node.js/git/pnpm 缺失时给出对应引导（Node 缺失显示下载按钮；git 缺失提示下载；pnpm 缺失自动安装）
- **服务自动拉起**：优先复用已有 3080 服务；否则启动 dsh web
- **系统托盘**：关闭窗口最小化到托盘，服务保持运行；托盘菜单可退出
- **干净退出**：退出时自动 `taskkill` 终止 dsh 子进程树
- **可打包分发**：`electron-builder` 生成 Windows 安装包

## 开发运行

```bat
start.bat
```

或手动：

```bat
npm install
npm start
```

自定义端口：`npm start -- --port 8090`（默认 3080；若端口已有 dsh web 在运行会直接复用）。

## 打包分发

```bat
npm run dist
```

生成 `release/DeepSeek Harness 桌面版-Setup-1.0.0.exe`（NSIS 安装包），可拷贝到其他 Windows 电脑安装。

> 注意：
> - 目标电脑需安装 Node.js（快速启动依赖）
> - 源码模式另需 git（pnpm 会自动安装）
> - 缺失时客户端会引导用户下载安装

## 目录结构

```
dsh-desktop/
├── main.js          # 主进程（模式选择/进度状态机/安装/启动/窗口/托盘/清理）
├── preload.js       # 安全桥接（模式/进度/日志/状态 IPC）
├── boot/            # 启动引导页（模式选择 + 进度条 + 日志面板）
│   ├── boot.html
│   ├── boot.css
│   └── boot.js
├── start.bat        # 开发启动脚本
└── package.json     # 依赖与打包配置
```

## 启动流程（状态机）

```
[模式选择] --10秒超时自动选快速-->
  快速：检测 node → 已有 dsh? → 安装(@deepseek-ai/dsh) → 启动服务
  源码：检测 git/pnpm → clone → pnpm install --ignore-scripts → pnpm run build → 启动服务
  修复：停止服务 → 卸载全局 dsh → 清除残留 → 重新安装 → 启动服务
        │
        ▼
[端口探测] 已有服务在 3080？ → 直接复用（修复模式跳过）
[进度] 8%检测环境 → 25-90%安装/构建/修复 → 60-95%启动服务 → 100%就绪
[打开主窗口] http://127.0.0.1:3080
```

关键实现：
- 快速模式：`node <npm>/bin/npm-cli.js install -g @deepseek-ai/dsh --no-audit --no-fund`，环境变量 `npm_config_ignore_scripts=true`（跳过 koffi 源码编译，避免缺 CMake 失败，与 `start-web.bat` 一致）
- 源码模式：仓库 clone 到 `%APPDATA%/dsh-desktop/deepseek-harness`（不污染工作区）；`pnpm install --ignore-scripts` 后 `pnpm run build`；启动用 `node --import tsx/esm apps/cli/src/bin.ts web`
- 启动服务均不经过 cmd.exe，无终端弹窗
