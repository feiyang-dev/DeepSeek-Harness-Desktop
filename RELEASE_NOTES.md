# DeepSeek Harness 桌面版 v1.8.1

**DeepSeek Harness 官方 Web UI 的 Windows 桌面客户端** —— 自动检测环境、安装依赖、拉起服务，并支持在线检查更新，开箱即用。

## 安装方式

下载 **`DeepSeek Harness 桌面版-Setup-1.8.1.exe`**（NSIS 安装包），双击安装即可。

- 未安装 Node.js / git 时，客户端会自动下载官方安装包静默补齐
- macOS 用户：可在 GitHub Actions 运行页的 Artifacts 中下载 `dsh-desktop-mac`（Intel / Apple Silicon 双架构）

## 本版更新（v1.8.1）

### 数据保险箱插件改名
- 数据保险箱插件包名由 `@feiyang666/deepseekharnessdesktop-vault` 统一更名为 `@feiyang666/dsh-vault`，已安装旧包名的插件会自动兼容识别，插件管理 / 首页 / 文档同步更新

### 插件卸载修复
- **卸载插件更快更干净**：此前卸载走 `npm uninstall`，在 pnpm 布局 + 清单与锁文件不同步时，会尝试重建整个依赖树并访问默认源，出现「卸载很慢 / 像卡住 / 残留目录删不干净」；现改为纯本地文件操作，秒级完成，残留实体目录与 pnpm 虚拟目录一并清理
- 目录被占用时以 `npm uninstall --offline` 离线兜底，全程不依赖网络

### 外观全面适配
- **侧边菜单栏浅色适配**：修复浅色模式下菜单栏仍为黑色的问题，背景 / 文字 / 高亮 / 边框 / hover 全部随主题切换
- **滚动条适配深浅色**：深色主题深色滑块、浅色主题浅色滑块，不再刺眼
- **更新日志 Markdown 渲染**：设置页 / 检查更新 / 更新弹窗中的日志以富文本展示（标题 / 列表 / 代码 / 粗体 / 链接），内容经 HTML 转义，杜绝注入风险

### 界面主题三档 + 多端同步
- 主题由「深色 / 浅色」扩展为「深色 / 浅色 / 跟随系统」三档
- **与官方 WebUI 多端同步**：控制面板或官方 UI 任意一端切换主题，另一端自动跟随；主题偏好持久化到官方 `~/.dsh/settings.yaml`，不修改任何官方代码，官方更新后依然兼容
- `system` 档跟随 Windows 系统深浅色实时变化，标题栏 / 系统弹窗 / 右键菜单统一联动

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
- 界面主题切换：深色 / 浅色 / 跟随系统，与官方 WebUI 多端同步
- 系统托盘常驻、干净退出、在线检查更新

## 技术说明

- Electron 31，启用 `contextIsolation` 安全沙箱
- 打包：electron-builder + NSIS（Windows）；dmg + zip（macOS，云端双架构构建）
- 更新模块：`https` 下载 + SHA256 校验 + 系统通知
- macOS 云打包由 `.github/workflows/build-mac.yml` 驱动（推送 `v*` 标签自动触发）

## 已知事项

- 快速启动首次需下载约数百 MB 依赖（国内已默认走 npmmirror 镜像加速）
- 源码模式需已安装 git（pnpm 缺失时自动补齐）
