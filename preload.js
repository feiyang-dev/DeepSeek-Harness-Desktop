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
  // 界面主题切换（'dark' | 'light'），持久化保存
  setTheme: (theme) => ipcRenderer.invoke('settings:set-theme', theme),
  // 开发者选项模式开关（对下次启动生效）
  setDeveloperMode: (enabled) => ipcRenderer.invoke('settings:set-developer-mode', enabled),
  // dsh 运行环境版本信息（当前运行版本 + registry 最新版本）
  getDshVersionInfo: () => ipcRenderer.invoke('dsh:version-info'),

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

  // ---- 插件管理（推荐插件 + 自定义包名安装） ----
  // 查询推荐插件列表安装状态（[{ pkg, title, desc, installed, version, bundled }]）
  getPluginStatus: () => ipcRenderer.invoke('plugin:status'),
  // 列出 profile 中所有已安装插件
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  // 一键安装推荐插件（pkg 缺省为 @feiyang666/deepseekharnessdesktop）
  installPlugin: (pkg) => ipcRenderer.invoke('plugin:install', { pkg: pkg || null }),
  // 自定义包名 / 安装命令安装插件
  installCustomPlugin: (pkg) => ipcRenderer.invoke('plugin:install-custom', { pkg }),
  // 卸载插件（pkg 缺省为推荐插件）
  uninstallPlugin: (pkg) => ipcRenderer.invoke('plugin:uninstall', { pkg: pkg || null }),
  // 插件安装/卸载进度事件（installing/uninstalling/done/error）
  onPluginEvent: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('plugin:event', listener);
    return () => ipcRenderer.removeListener('plugin:event', listener);
  },
});
