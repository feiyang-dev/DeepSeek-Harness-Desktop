'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 主进程在启动时通过 additionalArguments 传入已保存的主题（'--dsh-theme=light'），
// 渲染进程可在 DOM 渲染前同步拿到，避免浅色主题时首帧闪黑。
const DSK_THEME = (() => {
  const arg = (process.argv || []).find((a) => a && a.indexOf('--dsh-theme=') === 0);
  return arg ? arg.slice('--dsh-theme='.length) : 'dark';
})();

contextBridge.exposeInMainWorld('dsh', {
  // 启动时主进程传入的主题（'dark' | 'light'），同步可用，避免首帧闪烁
  theme: DSK_THEME,

  // ---- 模式选择 ----
  selectMode: (mode) => ipcRenderer.invoke('boot:select-mode', mode),
  // 倒计时事件（已停用自动进入，保留通道兼容）
  onModeCountdown: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('boot:mode-countdown', listener);
    return () => ipcRenderer.removeListener('boot:mode-countdown', listener);
  },
  // 阶段切换（mode/detect/install/start/ready/error）
  onPhase: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('boot:phase', listener);
    return () => ipcRenderer.removeListener('boot:phase', listener);
  },

  // ---- 进度条 ----
  onProgress: (cb) => {
    const listener = (_e, progress) => cb(progress);
    ipcRenderer.on('boot:progress', listener);
    return () => ipcRenderer.removeListener('boot:progress', listener);
  },

  // ---- 命令行日志 ----
  onLog: (cb) => {
    const listener = (_e, text) => cb(text);
    ipcRenderer.on('boot:log', listener);
    return () => ipcRenderer.removeListener('boot:log', listener);
  },

  // ---- 错误状态 ----
  onStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('boot:status', listener);
    return () => ipcRenderer.removeListener('boot:status', listener);
  },

  // ---- 操作 ----
  retry: () => ipcRenderer.invoke('boot:retry'),
  quit: () => ipcRenderer.invoke('boot:quit'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),

  // ---- 服务控制（首页"正在运行中"控制台） ----
  // 查询服务状态（phase + 运行信息）
  getServiceState: () => ipcRenderer.invoke('service:get-state'),
  // 插件数据桥接快照：用量 / 余额 / 备份 / 远程状态（服务运行期间有效，插件未装时 available:false）
  getPluginSnapshot: (port) => ipcRenderer.invoke('plugin-bridge:snapshot', { port }),
  // 数据中心完整快照：用量明细 / 余额与凭据 / 备份列表 / 远程设备详情
  getDataCenter: (port) => ipcRenderer.invoke('plugin-bridge:data-center', { port }),
  // 数据中心：立即手动备份
  triggerBackup: (port) => ipcRenderer.invoke('plugin-bridge:trigger-backup', { port }),
  // 订阅「插件数据已变化」推送（主进程检测到数据变化时触发），返回取消订阅函数
  onDataCenterChanged: (cb) => {
    const listener = (_e, payload) => { if (typeof cb === 'function') cb(payload); };
    ipcRenderer.on('data-center:changed', listener);
    return () => ipcRenderer.removeListener('data-center:changed', listener);
  },
  // 停止运行（终止服务 + 关闭 WebUI 窗口）
  stopService: () => ipcRenderer.invoke('service:stop'),
  // 重新运行（用上次所选模式重新启动）
  restartService: () => ipcRenderer.invoke('service:restart'),
  // 打开 / 聚焦 WebUI 主窗口
  showMain: () => ipcRenderer.invoke('service:show-main'),
  // 运行状态增量更新（如 dsh 版本晚到，不切换界面）
  onServiceUpdate: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('service:update', listener);
    return () => ipcRenderer.removeListener('service:update', listener);
  },

  // ---- 关于 ----
  getAboutInfo: () => ipcRenderer.invoke('app:about-info'),

  // ---- 设置 ----
  // 获取设置页初始数据（版本 / 更新日志 / 通知开关 / 开发者选项 / 更新服务地址 / 设备标识）
  getSettings: () => ipcRenderer.invoke('settings:get'),
  // 通知开关
  setNotifications: (enabled) => ipcRenderer.invoke('settings:set-notifications', enabled),
  // 界面主题切换（'dark' | 'light' | 'system'），持久化保存并同步官方 WebUI
  setTheme: (theme) => ipcRenderer.invoke('settings:set-theme', theme),
  // dsh 工作目录（决定会话/工作区数据归属，重启服务后生效；传空字符串恢复自动检测）
  setWorkspaceDir: (dir) => ipcRenderer.invoke('settings:set-workspace-dir', dir),
  // 界面语言切换（'zh' | 'en'），持久化保存
  setLanguage: (language) => ipcRenderer.invoke('settings:set-language', language),
  // 主题变化事件（主进程推送：控制面板 / 官方 UI / 系统深浅色变化时触发）
  onThemeChanged: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('theme:changed', listener);
    return () => ipcRenderer.removeListener('theme:changed', listener);
  },
  // 开发者选项模式开关（对下次启动生效）
  setDeveloperMode: (enabled) => ipcRenderer.invoke('settings:set-developer-mode', enabled),
  // 移动端远程控制开关（开启后 dsh web 以 --host 0.0.0.0 启动，手机扫码/局域网可远程控制；对下次启动生效）
  setRemoteControl: (enabled) => ipcRenderer.invoke('settings:set-remote-control', enabled),
  // 查看日志：读取最近日志内容（{ ok, content, file, logDir }）
  getLogs: () => ipcRenderer.invoke('settings:get-logs'),
  // 打开日志文件（系统默认文本编辑器）
  openLogFile: () => ipcRenderer.invoke('settings:open-log-file'),
  // 打开日志目录（系统文件管理器）
  openLogFolder: () => ipcRenderer.invoke('settings:open-log-folder'),
  // dsh 运行环境版本信息（当前运行版本 + registry 正式版/预发布版）
  getDshVersionInfo: () => ipcRenderer.invoke('dsh:version-info'),
  // 离线启动模式：一键更新本地运行环境（停止服务 → 重装 → 自动重启）
  // tag: 'latest' 正式版（默认）| 'next' 预发布版
  updateLocalDsh: (tag) => ipcRenderer.invoke('dsh:update-local', tag),
  // 清除本地运行环境（极速启动固定目录）：停止服务 → 删除目录
  clearLocalRuntime: () => ipcRenderer.invoke('dsh:clear-local'),
  // 本地运行环境信息（路径与是否已安装，即时返回不查网络）
  getLocalRuntimeInfo: () => ipcRenderer.invoke('dsh:local-runtime-info'),
  // ---- 更新 ----
  // 检查更新（返回当前状态）
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  // 下载新版本安装包
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  // 打开已下载的安装包（开始安装）
  installUpdate: () => ipcRenderer.invoke('update:install'),
  // 更新状态事件（检查结果 / 下载进度 / 错误）
  onUpdateStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  // 「打开更新入口」事件：系统通知被点击后，主进程把窗口拉到前台并让界面定位到更新区域
  onUpdateFocus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('update:focus', listener);
    return () => ipcRenderer.removeListener('update:focus', listener);
  },

  // ---- 插件管理（推荐插件 + 自定义包名安装） ----
  // 查询推荐插件列表安装状态（[{ pkg, title, desc, installed, version, bundled }]）
  getPluginStatus: () => ipcRenderer.invoke('plugin:status'),
  // 列出 profile 中所有已安装插件
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  // 检测已安装插件的更新（对比 npm registry 最新版本）
  checkPluginUpdates: () => ipcRenderer.invoke('plugin:check-updates'),
  // 一键安装推荐插件（pkg 缺省为 @feiyang666/dsh-usage-plugin）
  // acceptRisk=true 表示用户已确认「与当前 dsh 运行时版本不兼容」的风险
  installPlugin: (pkg, acceptRisk) => ipcRenderer.invoke('plugin:install', { pkg: pkg || null, acceptRisk: acceptRisk === true }),
  // 自定义包名 / 安装命令安装插件
  installCustomPlugin: (pkg, acceptRisk) => ipcRenderer.invoke('plugin:install-custom', { pkg, acceptRisk: acceptRisk === true }),
  // 卸载插件（pkg 缺省为推荐插件）
  uninstallPlugin: (pkg) => ipcRenderer.invoke('plugin:uninstall', { pkg: pkg || null }),
  // 插件与当前 dsh 运行时的兼容性总览（运行时版本 / 精确版本例外 / 不兼容清单）
  getPluginCompat: () => ipcRenderer.invoke('plugin:compat'),
  // 授予或撤销「精确版本例外」（写入 profile 的 compatibility.json）
  setVersionExemption: (payload) => ipcRenderer.invoke('plugin:set-exemption', payload || {}),
  // 插件安装/卸载进度事件（installing/uninstalling/done/warn/error）
  onPluginEvent: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('plugin:event', listener);
    return () => ipcRenderer.removeListener('plugin:event', listener);
  },

  // ---- 插件市场（扫描 GitHub topic:dsh-plugin） ----
  // 获取插件市场列表（{ keyword, page, perPage }）
  listMarket: (payload) => ipcRenderer.invoke('plugin:market-list', payload || {}),
  // 一键安装市场插件（按 npm 包名）；acceptRisk=true 表示已确认不兼容风险
  installMarketPlugin: (pkg, acceptRisk) => ipcRenderer.invoke('plugin:market-install', { pkg, acceptRisk: acceptRisk === true }),
});
