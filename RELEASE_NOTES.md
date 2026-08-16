# DeepSeek Harness 桌面版 v1.7.0

**DeepSeek Harness 官方 Web UI 的 Windows 桌面客户端** —— 自动检测环境、安装依赖、拉起服务，并支持在线检查更新，开箱即用。

## 安装方式

下载 **`DeepSeek Harness 桌面版-Setup-1.7.0.exe`**（NSIS 安装包），双击安装即可。

- 未安装 Node.js / git 时，客户端会自动下载官方安装包静默补齐（见下方 v1.7.0 新特性）
- macOS 用户：可在 GitHub Actions 运行页的 Artifacts 中下载 `dsh-desktop-mac`（Intel / Apple Silicon 双架构）

## 本版更新（v1.7.0）

### 安装速度大幅提升
- **修复快速 / 修复模式安装极慢（500 秒装不上）**：npx 启动此前未指定 npm 镜像源，会退回默认源 npmjs.org，在国内网络下载 `@deepseek-ai/dsh` 卡到超时
- 现已为 npx / 版本查询显式指定国内镜像（默认 npmmirror），启动前先测速选择最快源，镜像失败自动切换重试
- 安装时长从"500 秒装不上"对齐到脚本 `start-web.bat` 的 1 分多钟

### 环境自动补齐（官方正版）
- 未检测到 Node.js / git 时，不再只给官网链接让引导断掉，而是自动下载官方安装包静默安装（Node.js LTS MSI 每用户安装、Git for Windows 每用户安装）
- 安装完成后自动定位 node.exe / git.exe 继续流程，修复「快速启动 / 本地修复 装不了」与「引导死循环」问题

### 界面与交互优化
- **侧栏常驻**：启动 / 进度页也始终显示左侧导航，不再全屏覆盖隐藏侧栏
- **托盘打开主界面**：直接恢复并聚焦已存在窗口，不再强制 reload，避免打开的不是用户初始进入的页面
- **退出 App 修复**：统一退出流程并加兜底（子进程清理卡住也保证 5 秒内强制退出），修复「停止运行有效但退出 App 无作用」

## 核心特性

### 三种安装模式

| 模式 | 说明 | 适合场景 |
| --- | --- | --- |
| **快速启动** | 自动 `npm install -g @deepseek-ai/dsh`（国内镜像加速） | 大多数用户，最快开始使用 |
| **源码完整安装** | `git clone` + `pnpm build` | 开发者，想改源码/调试 |
| **本地修复** | 一键卸载、清理残留并重装 | 安装损坏、koffi 加载失败时修复 |

### 插件系统
- **插件管理**：一键安装 / 卸载推荐插件（`@feiyang666/deepseekharnessdesktop`），或自定义填写 npm 包名安装
- **插件市场**：扫描 GitHub 上带 `dsh-plugin` 话题的公开仓库，支持搜索与分页，一键安装
- **兼容性自动修补**：安装 / 升级插件时自动修正违反 JSON Schema 规范的 `required` 字段，消除启动告警

### 人性化体验
- **国内镜像加速**：依赖下载默认使用 npmmirror，可用环境变量 `DSH_NPM_REGISTRY` 切换任意镜像
- 大百分比进度条 + 步骤指示器 + 可展开的命令行日志面板
- 界面主题切换：深色 / 浅色一键切换，立即生效并持久化保存
- 系统托盘常驻、干净退出、在线检查更新

## 技术说明

- Electron 31，启用 `contextIsolation` 安全沙箱
- 打包：electron-builder + NSIS（Windows）；dmg + zip（macOS，云端双架构构建）
- 更新模块：`https` 下载 + SHA256 校验 + 系统通知
- macOS 云打包由 `.github/workflows/build-mac.yml` 驱动（推送 `v*` 标签自动触发）

## 已知事项

- 快速启动首次需下载约数百 MB 依赖（国内已默认走 npmmirror 镜像加速）
- 源码模式需已安装 git（pnpm 缺失时自动补齐）
