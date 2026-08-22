# DeepSeek Harness 桌面版 v1.9.5

**DeepSeek Harness 官方 Web UI 的 Windows 桌面客户端** —— 自动检测环境、安装依赖、拉起服务，并支持在线检查更新，开箱即用。

## 安装方式

下载 **`DeepSeek Harness 桌面版-Setup-1.9.5.exe`**（NSIS 安装包），双击安装即可。

- 未安装 Node.js / git 时，客户端会自动下载官方安装包静默补齐

## 本版更新（v1.9.5）

> 本版修复「本地修复 / 快速启动」在 pnpm v11 下启动失败的问题：此前 `pnpm dlx` 命令传了它不支持的 `--ignore-scripts` 参数，报 `Unknown option: 'ignore-scripts'` 直接退出。

### 修复

- **修复本地修复模式无法启动服务**：清理坏插件引用后启动报 `Unknown option: 'ignore-scripts'`（pnpm v11 的 `dlx` 命令不接受该参数，且与清理后重新生成 profile 的新版桌面端冲突）。已移除命令行参数，改为环境变量 `npm_config_ignore_scripts` 设置（pnpm 兼容 npm 配置环境变量，跳过 koffi 源码编译的效果一致），本地修复流程恢复正常
- **修复快速启动模式启动失败**：`pnpm dlx` 不再传多余的 `--ignore-scripts` 参数，快速启动恢复可用

## 核心特性

### 三种安装模式

| 模式 | 说明 | 适合场景 |
| --- | --- | --- |
| **极速启动** | 本地固定目录秒级启动，后台自动检查更新，一键更新 | 大多数用户，推荐 |
| **源码完整安装** | `git clone` + `pnpm build` | 开发者，想改源码/调试 |
| **本地修复** | 一键卸载、清理残留并重装 | 安装损坏、koffi 加载失败时修复 |

### 插件系统
- **插件管理**：一键安装 / 卸载推荐插件（`@feiyang666/dsh-usage-plugin`、`@feiyang666/dsh-vault`、`@feiyang666/dsh-mobile-remote`），或自定义填写 npm 包名安装
- **插件市场**：扫描 GitHub 上带 `dsh-plugin` 话题的公开仓库，支持搜索与分页，一键安装
- **兼容性自动修补**：安装 / 升级插件时自动修正违反 JSON Schema 规范的 `required` 字段，消除启动告警

### 人性化体验
- **国内镜像加速**：依赖下载默认使用 npmmirror，可用环境变量 `DSH_NPM_REGISTRY` 切换任意镜像
- **中英文双语切换**：全界面支持简体中文 / English 一键切换
- 大百分比进度条 + 步骤指示器 + 可展开的命令行日志面板
- 界面主题切换：深色 / 浅色 / 跟随系统，与官方 WebUI 多端同步
- 系统托盘常驻、干净退出、在线检查更新

## 技术说明

- Electron 31，启用 `contextIsolation` 安全沙箱
- 打包：electron-builder + NSIS（Windows）
- 更新模块：`https` 下载 + SHA256 校验 + 系统通知

## 已知事项

- 极速启动首次需下载约数百 MB 依赖到本地固定目录（国内已默认走 npmmirror 镜像加速），之后启动秒级且完全离线
- 源码模式需已安装 git（pnpm 缺失时自动补齐）
