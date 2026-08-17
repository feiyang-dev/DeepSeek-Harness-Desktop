'use strict';

// ============ 元素引用 ============
const homeScreen = document.getElementById('homeScreen');
const progressScreen = document.getElementById('progressScreen');
const pluginScreen = document.getElementById('pluginScreen');
const marketScreen = document.getElementById('marketScreen');
const settingsScreen = document.getElementById('settingsScreen');
const shell = document.getElementById('shell');
const sidebar = document.getElementById('sidebar');
const appTitleHome = document.getElementById('appTitleHome');
const appTitleProgress = document.getElementById('appTitleProgress');
const homeSubtitle = document.getElementById('homeSubtitle');
const homeHint = document.getElementById('homeHint');
const modeCards = document.getElementById('modeCards');
const cardQuick = document.getElementById('cardQuick');
const cardSource = document.getElementById('cardSource');
const cardLocal = document.getElementById('cardLocal');
const cardRepair = document.getElementById('cardRepair');

// 首页运行状态控制台
const statusPanel = document.getElementById('statusPanel');
const statusDot = document.getElementById('statusDot');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const btnOpenMain = document.getElementById('btnOpenMain');
const btnStopService = document.getElementById('btnStopService');
const btnRestartService = document.getElementById('btnRestartService');
const statusUpdate = document.getElementById('statusUpdate');
const statusUpdateText = document.getElementById('statusUpdateText');
const btnUpdateLocal = document.getElementById('btnUpdateLocal');

const percentEl = document.getElementById('percent');
const barFillEl = document.getElementById('barFill');
const stageTextEl = document.getElementById('stageText');
const stageTagEl = document.getElementById('stageTag');
const stepIndicator = document.getElementById('stepIndicator');
const stepPill = document.getElementById('stepPill');
const stepTitle = document.getElementById('stepTitle');
const stageIconEl = document.getElementById('stageIcon');
const progressDetailEl = document.getElementById('progressDetail');
const progressHintEl = document.getElementById('progressHint');
const footer = document.getElementById('footer');
const btnOpenNode = document.getElementById('btnOpenNode');
const btnRetry = document.getElementById('btnRetry');
const btnRepair = document.getElementById('btnRepair');
const btnQuit = document.getElementById('btnQuit');
const errorTip = document.getElementById('errorTip');
const errorTipText = document.getElementById('errorTipText');

// 日志面板
const logPanel = document.getElementById('logPanel');
const logHeader = document.getElementById('logHeader');
const logToggle = document.getElementById('logToggle');
const logBody = document.getElementById('logBody');
const logBadge = document.getElementById('logBadge');

// 插件管理页
const pluginDefRefreshBtn = document.getElementById('pluginDefRefreshBtn');
const recPluginList = document.getElementById('recPluginList');
const customPkgInput = document.getElementById('customPkgInput');
const customInstallBtn = document.getElementById('customInstallBtn');
const customNote = document.getElementById('customNote');
const customLogPanel = document.getElementById('customLogPanel');
const customLogHeader = document.getElementById('customLogHeader');
const customLogBody = document.getElementById('customLogBody');
const customLogBadge = document.getElementById('customLogBadge');
const installedList = document.getElementById('installedList');
const pluginCheckUpdatesBtn = document.getElementById('pluginCheckUpdatesBtn');
const restartHintCard = document.getElementById('restartHintCard');
const pluginRestartBtn = document.getElementById('pluginRestartBtn');

// 插件市场页
const marketSearchInput = document.getElementById('marketSearchInput');
const marketSearchBtn = document.getElementById('marketSearchBtn');
const marketRefreshBtn = document.getElementById('marketRefreshBtn');
const marketTotal = document.getElementById('marketTotal');
const marketList = document.getElementById('marketList');
const marketLoading = document.getElementById('marketLoading');
const marketEmpty = document.getElementById('marketEmpty');
const marketPager = document.getElementById('marketPager');
const marketPrevBtn = document.getElementById('marketPrevBtn');
const marketNextBtn = document.getElementById('marketNextBtn');
const marketPageInfo = document.getElementById('marketPageInfo');

// 侧栏导航
const navHome = document.getElementById('navHome');
const navPlugin = document.getElementById('navPlugin');
const navMarket = document.getElementById('navMarket');
const navSettings = document.getElementById('navSettings');
const sidebarDot = document.getElementById('sidebarDot');
const sidebarStatusText = document.getElementById('sidebarStatusText');

// 更新弹窗
const updateMask = document.getElementById('updateMask');
const umNewVersion = document.getElementById('umNewVersion');
const umAppName = document.getElementById('umAppName');
const umNotes = document.getElementById('umNotes');
const umProgress = document.getElementById('umProgress');
const umFill = document.getElementById('umFill');
const umText = document.getElementById('umText');
const umLaterBtn = document.getElementById('umLaterBtn');
const umActionBtn = document.getElementById('umActionBtn');
const umActionText = document.getElementById('umActionText');

// 设置页
const setVersion = document.getElementById('setVersion');
const setAppName = document.getElementById('setAppName');
const setTagline = document.getElementById('setTagline');
const setChangelog = document.getElementById('setChangelog');
const setNotifyToggle = document.getElementById('setNotifyToggle');
const themeDarkBtn = document.getElementById('themeDarkBtn');
const themeLightBtn = document.getElementById('themeLightBtn');
const themeSystemBtn = document.getElementById('themeSystemBtn');
// 侧边栏快捷控件
const sidebarLangBtn = document.getElementById('sidebarLangBtn');
const sidebarLangText = document.getElementById('sidebarLangText');
const sidebarThemeBtn = document.getElementById('sidebarThemeBtn');
const sidebarThemeIcon = document.getElementById('sidebarThemeIcon');
const sidebarThemeText = document.getElementById('sidebarThemeText');
const sidebarRepo = document.getElementById('sidebarRepo');
const sidebarRepoText = document.getElementById('sidebarRepoText');
const setDevModeToggle = document.getElementById('setDevModeToggle');
const setWorkspaceInput = document.getElementById('setWorkspaceInput');
const setWorkspaceSaveBtn = document.getElementById('setWorkspaceSaveBtn');
const setWorkspaceDetectBtn = document.getElementById('setWorkspaceDetectBtn');
const setWorkspaceHint = document.getElementById('setWorkspaceHint');
const setDshVersion = document.getElementById('setDshVersion');
const setDshCheckBtn = document.getElementById('setDshCheckBtn');
const setDshVersionNote = document.getElementById('setDshVersionNote');
const setUpdateStatus = document.getElementById('setUpdateStatus');
const setUpdateHint = document.getElementById('setUpdateHint');
const setCheckBtn = document.getElementById('setCheckBtn');
const setUpdateInfo = document.getElementById('setUpdateInfo');
const setNewVersion = document.getElementById('setNewVersion');
const setNewNotes = document.getElementById('setNewNotes');
const setDownloadBtn = document.getElementById('setDownloadBtn');
const setDownloadBtnText = document.getElementById('setDownloadBtnText');
const setDownloadProgress = document.getElementById('setDownloadProgress');
const setDownloadFill = document.getElementById('setDownloadFill');
const setDownloadText = document.getElementById('setDownloadText');
// 查看日志
const setLogPath = document.getElementById('setLogPath');
const setLogView = document.getElementById('setLogView');
const setLogRefreshBtn = document.getElementById('setLogRefreshBtn');
const setLogFileBtn = document.getElementById('setLogFileBtn');
const setLogFolderBtn = document.getElementById('setLogFolderBtn');

// preload.js 通过 contextBridge.exposeInMainWorld('dsh', ...) 暴露全局 window.dsh。
let logCount = 0;
let logOpen = false;
let modeChosen = false;
// 主进程当前阶段：mode / detect / install / start / ready / running / stopped / error。
// 用于侧栏「首页」导航恢复正确界面（启动中回进度页，而非残留不可点的模式卡片）。
let currentPhase = 'mode';
// 最近一次 running 状态的服务信息（首页「正在运行中」控制台展示用）
let lastService = null;
let pluginBusy = false;
let pluginUpdateCheck = null; // 最近一次插件更新检查结果：{ [pkg]: { latest, outdated, legacyMigrate, error } }
let uptimeTimer = null;

const STAGE_LABELS = {
  init: () => t('stageInit'),
  detect: () => t('stageDetect'),
  install: () => t('stageInstall'),
  start: () => t('stageStart'),
  ready: () => t('stageReady'),
  running: () => t('statusRunning'),
  stopped: () => t('statusStopped'),
  error: () => t('stageError'),
};

// ============ 日志面板 ============
function toggleLog() {
  logOpen = !logOpen;
  logBody.hidden = !logOpen;
  logPanel.classList.toggle('open', logOpen);
}
logHeader.addEventListener('click', toggleLog);

function appendLog(text) {
  if (!logBody.querySelector('.log-line') && logBody.querySelector('.log-hint')) {
    logBody.innerHTML = '';
  }
  logCount += 1;
  logBadge.textContent = String(logCount);
  const div = document.createElement('div');
  div.className = 'log-line';
  if (/错误|失败|Error|error/.test(text)) div.classList.add('err');
  div.textContent = text;
  logBody.appendChild(div);
  logBody.scrollTop = logBody.scrollHeight;
}

// ============ 进度 ============
function setPercent(p) {
  const n = Math.max(0, Math.min(100, Math.round(p)));
  percentEl.textContent = n + '%';
  barFillEl.style.width = n + '%';
}

function setIcon(state) {
  stageIconEl.innerHTML = '';
  const el = document.createElement('div');
  el.className = state === 'ok' ? 'spinner ok' : state === 'err' ? 'spinner err' : 'spinner';
  stageIconEl.appendChild(el);
}

function showScreen(name) {
  homeScreen.hidden = name !== 'home';
  progressScreen.hidden = name !== 'progress';
  pluginScreen.hidden = name !== 'plugin';
  marketScreen.hidden = name !== 'market';
  settingsScreen.hidden = name !== 'settings';
  // 侧栏：所有页面（含启动进度页）都常驻显示，保证启动过程中也能看到导航
  if (sidebar) sidebar.hidden = false;
  if (shell) shell.classList.remove('no-sidebar');
  // 进度页属于"首页"的启动流程，高亮「首页」导航项
  syncNavActive(name === 'progress' ? 'home' : name);
  if (name !== 'home') stopUptimeTicker();
}

// 点击侧栏「首页」：根据主进程当前阶段恢复正确界面。
// 修复：启动过程中离开首页再回来时，若直接 showScreen('home') 会残留不可点击的
// 模式卡片（chooseMode 已置 disabled 且 modeChosen=true），这里按 currentPhase
// 统一路由 —— 启动中回到进度页、运行中/已停止回到控制台、mode 才回到模式选择。
function openHomePage() {
  if (currentPhase === 'detect' || currentPhase === 'install' || currentPhase === 'start' ||
      currentPhase === 'ready' || currentPhase === 'init' || currentPhase === 'error') {
    // 启动进行中 / 已出错：回到进度页继续查看进度或错误信息
    showScreen('progress');
    return;
  }
  if (currentPhase === 'running') {
    renderHome('running', lastService);
    showScreen('home');
    return;
  }
  if (currentPhase === 'stopped') {
    renderHome('stopped');
    showScreen('home');
    return;
  }
  // mode 或未知阶段：回到模式选择（renderHome 内部会重置卡片为可点击状态）
  renderHome('mode');
  showScreen('home');
}

// 高亮侧栏当前项
function syncNavActive(name) {
  const map = { home: navHome, plugin: navPlugin, market: navMarket, settings: navSettings };
  for (const k in map) {
    if (map[k]) map[k].classList.toggle('active', k === name);
  }
}

// 侧栏服务状态点（运行中绿色 / 停止灰色）
function setSidebarStatus(running) {
  if (sidebarDot) sidebarDot.className = 'sidebar-dot' + (running ? ' running' : '');
  if (sidebarStatusText) sidebarStatusText.textContent = running ? t('statusRunning') : t('statusStopped');
}

// ============ 首页渲染（模式选择 / 运行中 / 已停止） ============
function resetModeCards() {
  modeChosen = false;
  // 快速启动已合并进离线启动，卡片已移除，cardQuick 可能为 null，加守卫防空引用
  if (cardQuick) cardQuick.classList.remove('selected', 'disabled');
  cardSource.classList.remove('selected', 'disabled');
  cardLocal.classList.remove('selected', 'disabled');
  cardRepair.classList.remove('selected', 'disabled');
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h} 小时 ${m % 60} 分`;
  if (m > 0) return `${m} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

function stopUptimeTicker() {
  if (uptimeTimer) { clearInterval(uptimeTimer); uptimeTimer = null; }
}

function startUptimeTicker(service) {
  stopUptimeTicker();
  const startedAt = (service && service.startedAt) || Date.now();
  const port = (service && service.port) || 3080;
  const devMode = !!(service && service.devMode);
  const dshVer = service && service.dshVersion;
  const tick = () => {
    const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    statusDesc.textContent = `服务运行于 http://127.0.0.1:${port} · 已运行 ${formatUptime(secs * 1000)}${dshVer ? ' · dsh v' + dshVer : ''}${devMode ? ' · 开发者模式' : ''}`;
  };
  tick();
  uptimeTimer = setInterval(tick, 5000);
}

// 运行状态栏：极速模式检测到官方新版时显示「一键更新」横幅
function showStatusUpdate(service) {
  if (!statusUpdate || !statusUpdateText) return;
  const upd = service && service.localUpdate;
  if (upd && upd.latest) {
    statusUpdate.hidden = false;
    statusUpdateText.textContent = (currentLanguage === 'en'
      ? 'Official dsh v' + upd.latest + ' available (current v' + (upd.current || '-') + ')'
      : '发现官方新版 dsh v' + upd.latest + '（当前 v' + (upd.current || '-') + '）');
    if (btnUpdateLocal) btnUpdateLocal.disabled = false;
  } else {
    statusUpdate.hidden = true;
  }
}

// phase: 'mode' | 'running' | 'stopped'
function renderHome(phase, service) {
  resetModeCards();
  if (phase === 'running') {
    homeSubtitle.textContent = currentLanguage === 'en' ? 'Service is running' : '服务正在运行中';
    homeHint.textContent = currentLanguage === 'en' ? 'You can stop or restart the service below' : '可在下方停止或重新运行服务';
    homeHint.hidden = false;
    modeCards.hidden = true;
    statusPanel.hidden = false;
    statusDot.className = 'status-dot running';
    statusTitle.textContent = currentLanguage === 'en' ? 'Running' : '正在运行中';
    btnOpenMain.hidden = false;
    btnStopService.hidden = false;
    btnRestartService.hidden = false;
    setSidebarStatus(true);
    startUptimeTicker(service);
    showStatusUpdate(service);
  } else if (phase === 'stopped') {
    homeSubtitle.textContent = currentLanguage === 'en' ? 'Service stopped' : '服务已停止';
    homeHint.textContent = currentLanguage === 'en' ? 'Restart it, or choose another launch mode' : '可重新运行，或选择其他启动模式';
    homeHint.hidden = false;
    modeCards.hidden = false;
    statusPanel.hidden = false;
    statusDot.className = 'status-dot stopped';
    statusTitle.textContent = currentLanguage === 'en' ? 'Service stopped' : '服务已停止';
    statusDesc.textContent = currentLanguage === 'en' ? 'The service is not running. Click "Restart" to start it again.' : '服务未在运行，点击「重新运行」可再次启动';
    btnOpenMain.hidden = true;
    btnStopService.hidden = true;
    btnRestartService.hidden = false;
    setSidebarStatus(false);
    stopUptimeTicker();
    showStatusUpdate(null);
  } else {
    // mode：选择启动模式
    homeSubtitle.textContent = currentLanguage === 'en' ? 'Choose a launch mode to get started' : '选择启动模式，开始使用';
    homeHint.textContent = currentLanguage === 'en' ? 'Choose a launch mode — this page does not auto-start' : '请选择一种启动模式，本页面不会自动进入';
    homeHint.hidden = false;
    modeCards.hidden = false;
    statusPanel.hidden = true;
    setSidebarStatus(false);
    stopUptimeTicker();
    showStatusUpdate(null);
  }
}

// ============ 模式选择 ============
function chooseMode(mode) {
  if (modeChosen) return;
  modeChosen = true;
  if (cardQuick) cardQuick.classList.add('disabled');
  cardSource.classList.add('disabled');
  cardLocal.classList.add('disabled');
  cardRepair.classList.add('disabled');
  if (mode === 'quick') { if (cardQuick) cardQuick.classList.add('selected'); }
  else if (mode === 'source') cardSource.classList.add('selected');
  else if (mode === 'local') cardLocal.classList.add('selected');
  else if (mode === 'repair') cardRepair.classList.add('selected');
  showScreen('progress');
  setPercent(0);
  window.dsh && window.dsh.selectMode(mode);
}

if (cardQuick) cardQuick.addEventListener('click', () => chooseMode('quick'));
cardSource.addEventListener('click', () => chooseMode('source'));
cardLocal.addEventListener('click', () => chooseMode('local'));
cardRepair.addEventListener('click', () => chooseMode('repair'));
if (cardQuick) cardQuick.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('quick'); });
cardSource.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('source'); });
cardLocal.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('local'); });
cardRepair.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('repair'); });

// ============ 服务控制（首页控制台） ============
btnOpenMain.addEventListener('click', () => { if (window.dsh) window.dsh.showMain(); });

// 一键更新本地运行环境（极速模式检测到新版时点击）：停止 → 重装 → 自动重启
btnUpdateLocal.addEventListener('click', () => {
  if (!window.dsh || !window.dsh.updateLocalDsh) return;
  if (!window.confirm(currentLanguage === 'en'
    ? 'Update the local dsh runtime to the latest version? The service will restart automatically.'
    : '确定要将本地运行环境更新到官方最新版吗？服务会自动重启。')) return;
  btnUpdateLocal.disabled = true;
  btnUpdateLocal.textContent = currentLanguage === 'en' ? 'Updating...' : '更新中...';
  showScreen('progress');
  setPercent(0);
  setIcon('');
  stageTextEl.textContent = currentLanguage === 'en' ? 'Updating local runtime...' : '正在更新本地运行环境...';
  stageTagEl.textContent = STAGE_LABELS.install();
  footer.hidden = true;
  errorTip.hidden = true;
  window.dsh.updateLocalDsh().then(() => {
    // 更新完成后主进程会走 run() 重启流程，进度事件会自动接管界面
  }).catch(() => {
    btnUpdateLocal.disabled = false;
    btnUpdateLocal.textContent = t('btnUpdateLocal');
  });
});

btnStopService.addEventListener('click', () => {
  if (!window.dsh) return;
  // 提示确认
  if (!window.confirm(currentLanguage === 'en' ? 'Stop the DeepSeek Harness service?' : '确定要停止运行 DeepSeek Harness 服务吗？')) return;
  btnStopService.disabled = true;
  statusTitle.textContent = t('statusStopping');
  window.dsh.stopService().then(() => { btnStopService.disabled = false; });
});

btnRestartService.addEventListener('click', () => {
  if (!window.dsh) return;
  showScreen('progress');
  setPercent(0);
  setIcon('');
  stageTextEl.textContent = '正在重新运行...';
  stageTagEl.textContent = STAGE_LABELS.init();
  footer.hidden = true;
  errorTip.hidden = true;
  window.dsh.restartService();
});

// ============ 插件管理页 ============
// 进行中的插件操作表：key = 插件包名，value = 'install' | 'uninstall'。
// 与主进程 pluginOps 联动：事件驱动即时更新，状态查询兜底恢复（刷新/切换页面不丢失）。
const localBusy = new Map();
function opFor(p) {
  const key = p && (p.pkg || p.pkgName);
  if (key && localBusy.has(key)) return localBusy.get(key);
  return (p && p.opType) || null;
}

// 刷新插件相关列表（推荐插件 + 已安装插件；在市场页时也刷新市场列表）
function refreshPluginLists() {
  loadPluginStatus();
  loadInstalledList();
  if (marketScreen && !marketScreen.hidden && marketPage && !marketBusy) loadMarket();
}

// 打开插件管理页：保留已有终端日志（便于查看上次操作输出），并刷新状态
function openPluginPage() {
  showScreen('plugin');
  if (customLogCount === 0) resetCustomLog();
  refreshPluginLists();
}

// 初始化命令行日志面板与提示（仅在无内容时调用，切换页面不清空）
function resetCustomLog() {
  customLogCount = 0;
  customLogBadge.textContent = '0';
  customLogOpen = false;
  customLogBody.hidden = true;
  customLogBody.innerHTML = '<div class="log-hint">等待输出...</div>';
  customLogPanel.classList.remove('open');
  customLogPanel.hidden = true;
  showCustomNote('', '');
}

// 有插件操作输出时确保日志面板展开可见（模拟终端体验）
function ensureCustomLogOpen() {
  customLogPanel.hidden = false;
  if (!customLogOpen) {
    customLogOpen = true;
    customLogBody.hidden = false;
    customLogPanel.classList.add('open');
  }
}

// 全局忙碌状态：仅控制「自定义安装」输入区与刷新按钮。
// 推荐/已安装/市场列表中的按钮状态按单个插件的进行中操作 opType 独立渲染，
// 互不影响 —— 安装 A 时 B 的按钮不会再显示"卸载中"。
function setPluginBusy(busy) {
  pluginBusy = busy;
  pluginDefRefreshBtn.disabled = busy;
  customInstallBtn.disabled = busy;
}

function showCustomNote(text, kind) {
  customNote.hidden = !text;
  customNote.textContent = text || '';
  customNote.className = 'plugin-note' + (kind ? ' ' + kind : '');
}

// 自定义安装卡片的命令行日志面板（安装过程的 npm 输出统一显示在这里）
let customLogCount = 0;
let customLogOpen = false;

function toggleCustomLog() {
  customLogOpen = !customLogOpen;
  customLogBody.hidden = !customLogOpen;
  customLogPanel.classList.toggle('open', customLogOpen);
}
customLogHeader.addEventListener('click', toggleCustomLog);

function appendCustomLog(text) {
  if (!customLogBody.querySelector('.log-line') && customLogBody.querySelector('.log-hint')) {
    customLogBody.innerHTML = '';
  }
  customLogCount += 1;
  customLogBadge.textContent = String(customLogCount);
  const div = document.createElement('div');
  div.className = 'log-line';
  if (/^\$ /.test(text)) div.classList.add('cmd'); // 执行的命令原样高亮
  else if (/错误|失败|Error|error/.test(text)) div.classList.add('err');
  div.textContent = text;
  customLogBody.appendChild(div);
  customLogBody.scrollTop = customLogBody.scrollHeight;
  customLogPanel.hidden = false; // 一旦有输出即显示日志面板
}

// 推荐插件图标（按包名区分）
function recIconFor(pkg) {
  if (['@feiyang666/dsh-vault', '@feiyang666/deepseekharnessdesktop-vault'].includes(pkg)) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}

// 渲染单个推荐插件条目
function buildRecItem(p) {
  const item = document.createElement('div');
  item.className = 'plugin-rec';

  const icon = document.createElement('div');
  icon.className = 'plugin-rec-icon' + (['@feiyang666/dsh-vault', '@feiyang666/deepseekharnessdesktop-vault'].includes(p.pkg) ? ' vault' : '');
  icon.innerHTML = recIconFor(p.pkg);

  const info = document.createElement('div');
  info.className = 'plugin-rec-info';
  const name = document.createElement('div');
  name.className = 'plugin-rec-name';
  name.textContent = p.title || p.pkg;
  const desc = document.createElement('div');
  desc.className = 'plugin-rec-desc';
  desc.textContent = (p.desc ? p.desc + ' · ' : '') + p.pkg;
  const op = opFor(p);
  const status = document.createElement('div');
  status.className = 'plugin-status';
  const parts = [];
  if (op === 'install') {
    parts.push(t('pluginInstalling'));
  } else if (op === 'uninstall') {
    parts.push(t('pluginUninstalling'));
  } else if (p.installed) {
    parts.push(t('pluginInstalled') + (p.version ? ' v' + p.version : ''));
    parts.push(p.bundled ? t('pluginBundled') : t('pluginNotBundled'));
    if (p.legacyInstalled) parts.push(t('pluginLegacyInstalled'));
  } else {
    parts.push(t('pluginNotInstalled'));
  }
  status.textContent = parts.join(' · ');
  info.appendChild(name);
  info.appendChild(desc);
  info.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'plugin-rec-actions';
  const opActive = !!op || pluginBusy;

  // 旧包名已安装：提供「一键更新」+「卸载重装」两种选择
  if (p.legacyInstalled) {
    // 一键更新：直接安装新包名（主进程 installPlugin 会自动先卸旧包再装新包）
    const updateBtn = document.createElement('button');
    updateBtn.className = 'settings-btn primary migrate';
    updateBtn.dataset.action = 'update';
    updateBtn.textContent = op === 'install' ? t('pluginInstalling') : t('pluginUpdateBtn');
    updateBtn.disabled = opActive;
    updateBtn.addEventListener('click', () => doPluginInstall(p.pkg));
    // 卸载重装：先卸载旧包，再安装新包
    const reinstallBtn = document.createElement('button');
    reinstallBtn.className = 'settings-btn';
    reinstallBtn.dataset.action = 'reinstall';
    reinstallBtn.textContent = op === 'uninstall' ? t('pluginUninstalling') : t('pluginReinstallBtn');
    reinstallBtn.disabled = opActive;
    reinstallBtn.addEventListener('click', () => {
      if (!window.confirm((currentLanguage === 'en' ? 'Uninstall ' : '确定要卸载 ') + p.pkg + (currentLanguage === 'en' ? ' and reinstall with the new package name?' : ' 的旧版本，然后重新安装新包名版本吗？'))) return;
      // 卸载旧包（主进程卸载逻辑会一并清理新旧包名残留）
      uninstallPkg(p.pkg, { skipConfirm: true }).then((r) => {
        if (!r || r.ok === false) {
          showCustomNote(currentLanguage === 'en' ? 'Uninstall failed, reinstall cancelled' : '卸载失败，已取消重新安装', 'err');
          return;
        }
        doPluginInstall(p.pkg);
      }).catch(() => {});
    });
    actions.appendChild(updateBtn);
    actions.appendChild(reinstallBtn);
  } else {
    const installBtn = document.createElement('button');
    installBtn.className = 'settings-btn primary';
    installBtn.dataset.action = 'install';
    installBtn.textContent = op === 'install' ? t('pluginInstalling') : t('pluginInstallBtn');
    installBtn.hidden = (!!p.installed && op !== 'install') || op === 'uninstall';
    installBtn.disabled = opActive;
    installBtn.addEventListener('click', () => doPluginInstall(p.pkg));
    const uninstallBtn = document.createElement('button');
    uninstallBtn.className = 'settings-btn';
    uninstallBtn.dataset.action = 'uninstall';
    uninstallBtn.textContent = op === 'uninstall' ? t('pluginUninstalling') : t('pluginUninstallBtn');
    uninstallBtn.hidden = (!p.installed && op !== 'uninstall') || op === 'install';
    uninstallBtn.disabled = opActive;
    uninstallBtn.addEventListener('click', () => uninstallPkg(p.pkg));
    actions.appendChild(installBtn);
    actions.appendChild(uninstallBtn);
  }

  item.appendChild(icon);
  item.appendChild(info);
  item.appendChild(actions);
  return item;
}

// 推荐插件状态（渲染推荐插件列表）
function loadPluginStatus() {
  if (!window.dsh || !window.dsh.getPluginStatus) return;
  window.dsh.getPluginStatus().then((st) => {
    // 恢复全局忙碌状态（主进程有插件操作进行中时禁用自定义安装输入区，页面切换/刷新不丢失）
    if (st && typeof st.busy === 'boolean' && st.busy !== pluginBusy) setPluginBusy(st.busy);
    recPluginList.innerHTML = '';
    // 兼容旧返回格式：单插件状态 { ok, installed, version, bundled }
    let list;
    if (st && st.list && Array.isArray(st.list)) {
      list = st.list;
    } else if (st && st.ok) {
      list = [{
        pkg: '@feiyang666/dsh-usage-plugin',
        title: '用量与消耗插件',
        desc: '用量统计 / 余额查询 / 导出报表',
        installed: st.installed,
        version: st.version,
        bundled: st.bundled,
      }];
    } else {
      list = [];
    }
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'installed-empty';
      empty.textContent = st && st.error ? '推荐插件加载失败：' + st.error : '暂无推荐插件';
      recPluginList.appendChild(empty);
      return;
    }
    for (const p of list) {
      recPluginList.appendChild(buildRecItem(p));
    }
  }).catch(() => {
    recPluginList.innerHTML = '<div class="installed-empty">推荐插件加载失败</div>';
  });
}

// 已安装插件列表
function loadInstalledList() {
  if (!window.dsh || !window.dsh.listPlugins) return;
  window.dsh.listPlugins().then((res) => {
    const list = (res && res.ok && Array.isArray(res.list)) ? res.list : [];
    installedList.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'installed-empty';
      empty.textContent = t('pluginInstalledEmpty');
      installedList.appendChild(empty);
      return;
    }
    for (const p of list) {
      const op = opFor(p);
      const upd = (pluginUpdateCheck && pluginUpdateCheck[p.pkg]) || null;
      const item = document.createElement('div');
      item.className = 'installed-item';

      const info = document.createElement('div');
      info.className = 'installed-info';
      const name = document.createElement('div');
      name.className = 'installed-name';
      name.textContent = p.pkg;
      const meta = document.createElement('div');
      meta.className = 'installed-meta';
      if (op === 'uninstall') {
        meta.textContent = t('pluginUninstalling');
      } else {
        meta.textContent = 'v' + (p.version || '?');
      }
      if (['@feiyang666/dsh-usage-plugin', '@feiyang666/deepseekharnessdesktop', '@feiyang666/dsh-vault', '@feiyang666/deepseekharnessdesktop-vault'].includes(p.pkg)) {
        const rec = document.createElement('span');
        rec.className = 'installed-badge rec';
        rec.textContent = t('modeQuickBadge');
        meta.appendChild(rec);
      }
      if (p.bundled && op !== 'uninstall') {
        const b = document.createElement('span');
        b.className = 'installed-badge';
        b.textContent = t('pluginBundled');
        meta.appendChild(b);
      }
      // 更新状态标记
      if (upd && op !== 'uninstall') {
        if (upd.outdated) {
          const u = document.createElement('span');
          u.className = 'installed-badge updatable';
          u.textContent = t('pluginUpdateAvailable') + (upd.latest || '');
          meta.appendChild(u);
        } else if (upd.legacyMigrate) {
          const lm = document.createElement('span');
          lm.className = 'installed-badge updatable';
          lm.textContent = t('pluginLegacyMigrate');
          meta.appendChild(lm);
        } else if (upd.latest) {
          const ok = document.createElement('span');
          ok.className = 'installed-badge';
          ok.textContent = t('pluginUpToDate');
          meta.appendChild(ok);
        }
      }
      info.appendChild(name);
      info.appendChild(meta);

      // 操作按钮区：有更新时显示「更新」+「卸载」，否则只显示「卸载」
      const actions = document.createElement('div');
      actions.className = 'installed-actions';
      if (upd && upd.outdated && op !== 'uninstall') {
        const upBtn = document.createElement('button');
        upBtn.className = 'settings-btn primary';
        upBtn.textContent = op === 'install' ? t('pluginInstalling') : t('pluginUpgradeBtn');
        upBtn.disabled = !!op || pluginBusy;
        upBtn.addEventListener('click', () => doPluginInstall(p.pkg));
        actions.appendChild(upBtn);
      } else if (upd && upd.legacyMigrate && op !== 'uninstall') {
        // 旧包名安装：提供「一键更新」迁移到新包名
        const mgBtn = document.createElement('button');
        mgBtn.className = 'settings-btn primary migrate';
        mgBtn.textContent = op === 'install' ? t('pluginInstalling') : t('pluginMigrateBtn');
        mgBtn.disabled = !!op || pluginBusy;
        mgBtn.addEventListener('click', () => doPluginInstall(p.pkg));
        actions.appendChild(mgBtn);
      }
      const btn = document.createElement('button');
      btn.className = 'settings-btn';
      btn.textContent = op === 'uninstall' ? t('pluginUninstalling') : t('pluginUninstallBtn');
      btn.disabled = !!op || pluginBusy;
      btn.addEventListener('click', () => uninstallPkg(p.pkg));
      actions.appendChild(btn);

      item.appendChild(info);
      item.appendChild(actions);
      installedList.appendChild(item);
    }
  }).catch(() => {
    installedList.innerHTML = '<div class="installed-empty">' + t('pluginListLoadFail') + '</div>';
  });
}

// 检测已安装插件的更新（对比 npm registry 最新版本）
function checkPluginUpdates() {
  if (!window.dsh || !window.dsh.checkPluginUpdates) return;
  if (pluginCheckUpdatesBtn) {
    pluginCheckUpdatesBtn.disabled = true;
    pluginCheckUpdatesBtn.textContent = t('pluginCheckingUpdates');
  }
  window.dsh.checkPluginUpdates().then((res) => {
    if (pluginCheckUpdatesBtn) {
      pluginCheckUpdatesBtn.disabled = false;
      pluginCheckUpdatesBtn.textContent = t('pluginCheckUpdatesBtn');
    }
    const list = (res && res.ok && Array.isArray(res.list)) ? res.list : [];
    pluginUpdateCheck = {};
    for (const item of list) {
      pluginUpdateCheck[item.pkg] = item;
    }
    // 刷新已安装列表以展示更新标记
    loadInstalledList();
    // 汇总提示
    const count = list.filter((x) => x.outdated || x.legacyMigrate).length;
    if (count > 0) {
      showCustomNote((currentLanguage === 'en' ? count + ' plugin(s) can be updated' : '发现 ' + count + ' 个插件可更新'), '');
    } else {
      showCustomNote(currentLanguage === 'en' ? 'All plugins are up to date' : '所有插件均为最新版本', 'ok');
    }
  }).catch(() => {
    if (pluginCheckUpdatesBtn) {
      pluginCheckUpdatesBtn.disabled = false;
      pluginCheckUpdatesBtn.textContent = t('pluginCheckUpdatesBtn');
    }
    showCustomNote(currentLanguage === 'en' ? 'Failed to check plugin updates' : '插件更新检查失败', 'err');
  });
}

// 安装推荐插件（pkg 缺省为 @feiyang666/dsh-usage-plugin）
function doPluginInstall(pkg) {
  if (!window.dsh || !window.dsh.installPlugin) return;
  if (opFor({ pkg })) return; // 该插件已在安装/卸载中，忽略重复点击
  localBusy.set(pkg, 'install');
  refreshPluginLists();
  window.dsh.installPlugin(pkg).then(() => {
    localBusy.delete(pkg);
    // 安装（更新）完成后清除该插件的更新缓存，避免「更新」按钮残留
    if (pluginUpdateCheck && pluginUpdateCheck[pkg]) {
      delete pluginUpdateCheck[pkg];
    }
    refreshPluginLists();
  }).catch(() => {
    localBusy.delete(pkg);
    refreshPluginLists();
  });
}

// 自定义安装（支持任意命令格式：纯包名 / npm install xxx / npx xxx / node / pnpm ...）
function doCustomInstall() {
  if (pluginBusy || !window.dsh || !window.dsh.installCustomPlugin) return;
  const val = customPkgInput.value.trim();
  if (!val) {
    showCustomNote(currentLanguage === 'en' ? 'Please enter a plugin package name or install command first' : '请先填写要安装的插件包名或安装命令', 'err');
    return;
  }
  setPluginBusy(true);
  showCustomNote(currentLanguage === 'en' ? 'Installing, please wait (first install downloads dependencies from the mirror)...' : '正在安装，请稍候（首次需从镜像下载依赖）...', '');
  ensureCustomLogOpen();
  window.dsh.installCustomPlugin(val).then((r) => {
    setPluginBusy(false);
    if (r && r.ok) {
      showCustomNote('安装完成！点击下方「立即重启服务」即可生效。', 'ok');
      customPkgInput.value = '';
      restartHintCard.hidden = false;
    } else if (r && r.error) {
      // 主进程已通过 plugin:event 推送详细错误，这里补充提示
      showCustomNote('安装失败：' + r.error + '（可查看命令行日志）', 'err');
    }
    refreshPluginLists();
  }).catch((e) => {
    setPluginBusy(false);
    showCustomNote('安装异常：' + String((e && e.message) || e), 'err');
  });
}

// 卸载指定插件（支持同时卸载多个不同插件，互不影响）。
// 返回 Promise，供「卸载重装」等组合操作链式调用。
function uninstallPkg(pkg, opts) {
  const o = opts || {};
  if (!window.dsh || !window.dsh.uninstallPlugin) return Promise.resolve();
  if (opFor({ pkg })) return Promise.resolve(); // 该插件已在操作中
  if (!o.skipConfirm && !window.confirm((currentLanguage === 'en' ? 'Uninstall plugin ' : '确定要卸载插件 ') + pkg + (currentLanguage === 'en' ? '?' : ' 吗？'))) return Promise.resolve();
  localBusy.set(pkg, 'uninstall');
  refreshPluginLists();
  return window.dsh.uninstallPlugin(pkg).then((r) => {
    localBusy.delete(pkg);
    refreshPluginLists();
    // 主进程可能报告卸载失败（如目录被占用），这里如实提示
    if (r && r.ok === false) {
      showCustomNote((currentLanguage === 'en' ? 'Uninstall failed: ' : '卸载失败：') + ((r.error || (currentLanguage === 'en' ? 'unknown error' : '未知错误')) + '').slice(0, 120), 'err');
    }
    return r;
  }).catch((e) => {
    localBusy.delete(pkg);
    refreshPluginLists();
    showCustomNote((currentLanguage === 'en' ? 'Uninstall error: ' : '卸载异常：') + String((e && e.message) || e), 'err');
    throw e;
  });
}

pluginDefRefreshBtn.addEventListener('click', () => {
  loadPluginStatus();
  loadInstalledList();
});
pluginCheckUpdatesBtn.addEventListener('click', checkPluginUpdates);
customInstallBtn.addEventListener('click', doCustomInstall);
customPkgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCustomInstall(); });

// 立即重启服务（插件安装/卸载完成后提示用户重启生效）
pluginRestartBtn.addEventListener('click', () => {
  if (!window.dsh || !window.dsh.restartService) return;
  restartHintCard.hidden = true;
  showScreen('progress');
  setPercent(0);
  setIcon('');
  stageTextEl.textContent = '正在重新运行服务（插件加载中）...';
  stageTagEl.textContent = STAGE_LABELS.init();
  footer.hidden = true;
  errorTip.hidden = true;
  window.dsh.restartService();
});

// ============ 插件市场页 ============
let marketPage = 1;
let marketKeyword = '';
let marketTotalCount = 0;
let marketBusy = false;
const MARKET_PER_PAGE = 30;

function openMarketPage() {
  showScreen('market');
  marketPage = 1;
  marketKeyword = '';
  marketSearchInput.value = '';
  loadMarket();
}

function setMarketBusy(busy) {
  marketBusy = busy;
  marketSearchBtn.disabled = busy;
  marketRefreshBtn.disabled = busy;
  marketPrevBtn.disabled = busy;
  marketNextBtn.disabled = busy;
  marketSearchInput.disabled = busy;
}

function formatStars(n) {
  if (n == null) return '0';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}

// 渲染单个市场插件条目
function buildMarketItem(p) {
  const item = document.createElement('div');
  item.className = 'market-item' + (p.installed ? ' installed' : '') + (p.official ? ' official' : '');

  // 图标
  const icon = document.createElement('div');
  icon.className = 'market-item-icon';
  if (p.iconType === 'emoji') {
    icon.textContent = p.iconValue;
    icon.classList.add('emoji');
  } else {
    icon.textContent = p.iconValue;
    icon.classList.add('letter');
  }

  // 信息
  const info = document.createElement('div');
  info.className = 'market-item-info';
  const nameRow = document.createElement('div');
  nameRow.className = 'market-item-name-row';
  const name = document.createElement('span');
  name.className = 'market-item-name';
  name.textContent = p.name;
  name.title = p.fullName;
  nameRow.appendChild(name);
  if (p.official) {
    const badge = document.createElement('span');
    badge.className = 'market-badge official';
    badge.textContent = currentLanguage === 'en' ? 'Official' : '官方';
    nameRow.appendChild(badge);
  }
  if (!p.installable) {
    const badge = document.createElement('span');
    badge.className = 'market-badge nodl';
    badge.textContent = currentLanguage === 'en' ? 'Not an npm package' : '非 npm 包';
    nameRow.appendChild(badge);
  }

  const author = document.createElement('div');
  author.className = 'market-item-author';
  author.textContent = p.owner;

  const desc = document.createElement('div');
  desc.className = 'market-item-desc';
  desc.textContent = p.description || (currentLanguage === 'en' ? '(no description)' : '（无描述）');

  const op = opFor(p);
  const meta = document.createElement('div');
  meta.className = 'market-item-meta';
  const metaParts = [];
  metaParts.push(`★ ${formatStars(p.stars)}`);
  if (p.language) metaParts.push(p.language);
  if (p.license) metaParts.push(p.license);
  if (op === 'install') metaParts.push(t('pluginInstalling'));
  else if (p.installed) metaParts.push(t('pluginInstalled') + ' v' + (p.installedVersion || '?'));
  meta.textContent = metaParts.join(' · ');

  info.appendChild(nameRow);
  info.appendChild(author);
  info.appendChild(desc);
  info.appendChild(meta);

  // 操作
  const actions = document.createElement('div');
  actions.className = 'market-item-actions';
  if (op === 'install') {
    const installing = document.createElement('button');
    installing.className = 'btn btn-primary btn-sm';
    installing.textContent = t('pluginInstalling');
    installing.disabled = true;
    actions.appendChild(installing);
  } else if (p.installed) {
    const done = document.createElement('span');
    done.className = 'market-installed-label';
    done.textContent = t('pluginInstalled');
    actions.appendChild(done);
  } else if (p.installable) {
    const install = document.createElement('button');
    install.className = 'btn btn-primary btn-sm';
    install.textContent = t('pluginInstallBtn');
    install.disabled = marketBusy;
    install.addEventListener('click', () => installMarketPlugin(p, install));
    actions.appendChild(install);
  }
  const open = document.createElement('button');
  open.className = 'btn btn-sm';
  open.textContent = currentLanguage === 'en' ? 'View' : '查看';
  open.addEventListener('click', () => {
    if (window.dsh) window.dsh.openExternal(p.repoUrl || `https://github.com/${p.fullName}`);
  });
  actions.appendChild(open);

  item.appendChild(icon);
  item.appendChild(info);
  item.appendChild(actions);
  return item;
}

function installMarketPlugin(p, btn) {
  if (marketBusy || !window.dsh || !window.dsh.installMarketPlugin) return;
  if (!p.pkgName) return;
  if (opFor(p)) return; // 该插件已在操作中
  if (btn) btn.disabled = true;
  localBusy.set(p.pkgName, 'install');
  restartHintCard.hidden = true; // 该卡片在插件页；从市场安装后也提示重启
  window.dsh.installMarketPlugin(p.pkgName).then((r) => {
    localBusy.delete(p.pkgName);
    if (r && r.ok) {
      loadMarket();
      loadInstalledList();
    } else if (btn) {
      btn.disabled = false;
    }
  }).catch(() => {
    localBusy.delete(p.pkgName);
    if (btn) btn.disabled = false;
  });
}

function loadMarket() {
  if (!window.dsh || !window.dsh.listMarket) return;
  setMarketBusy(true);
  marketLoading.hidden = false;
  marketEmpty.hidden = true;
  marketList.classList.add('loading');
  window.dsh.listMarket({
    keyword: marketKeyword,
    page: marketPage,
    perPage: MARKET_PER_PAGE,
  }).then((res) => {
    setMarketBusy(false);
    marketLoading.hidden = true;
    marketList.classList.remove('loading');
    if (!res || !res.ok) {
      marketList.innerHTML = '';
      marketEmpty.hidden = false;
      marketEmpty.textContent = marketFailText((res && res.error) || (currentLanguage === 'en' ? 'unknown error' : '未知错误'));
      marketTotal.textContent = currentLanguage === 'en' ? 'Load failed' : '加载失败';
      marketPager.hidden = true;
      return;
    }
    marketTotalCount = res.total || res.list.length;
    marketTotal.textContent = (currentLanguage === 'en' ? `${marketTotalCount} plugins` : `共 ${marketTotalCount} 个插件`);
    marketList.innerHTML = '';
    if (!res.list || res.list.length === 0) {
      marketEmpty.hidden = false;
      marketEmpty.textContent = currentLanguage === 'en' ? 'No matching plugins found' : '没有找到匹配的插件';
      marketPager.hidden = true;
      return;
    }
    for (const p of res.list) {
      marketList.appendChild(buildMarketItem(p));
    }
    // 分页
    const totalPages = Math.max(1, Math.ceil(marketTotalCount / MARKET_PER_PAGE));
    marketPageInfo.textContent = `${marketPage} / ${totalPages}`;
    marketPager.hidden = totalPages <= 1;
    marketPrevBtn.disabled = marketPage <= 1;
    marketNextBtn.disabled = marketPage >= totalPages;
  }).catch(() => {
    setMarketBusy(false);
    marketLoading.hidden = true;
    marketList.classList.remove('loading');
    marketList.innerHTML = '';
    marketEmpty.hidden = false;
    marketEmpty.textContent = marketFailText(currentLanguage === 'en' ? 'network error' : '网络异常');
    marketTotal.textContent = currentLanguage === 'en' ? 'Load failed' : '加载失败';
    marketPager.hidden = true;
  });
}

// 根据错误类型生成可读的市场加载失败提示
function marketFailText(errMsg) {
  const msg = String(errMsg || (currentLanguage === 'en' ? 'unknown error' : '未知错误'));
  if (currentLanguage === 'en') {
    if (/rate limit|API rate|403|限流/i.test(msg)) {
      return `Failed to load plugin market: ${msg} (GitHub rate limit hit, please retry later)`;
    }
    if (/certificate|CERT|SSL|verify|network|网络/i.test(msg)) {
      return `Failed to load plugin market: ${msg} (network/certificate issue, auto-retry failed. Retry later or check your proxy settings)`;
    }
    return `Failed to load plugin market: ${msg} (please retry later)`;
  }
  if (/rate limit|API rate|403|限流/i.test(msg)) {
    return `插件市场加载失败：${msg}（触发了 GitHub 限流，请稍后再试）`;
  }
  if (/certificate|CERT|SSL|verify|network|网络/i.test(msg)) {
    return `插件市场加载失败：${msg}（网络/证书问题，已自动重试仍失败，请稍后重试或检查代理设置）`;
  }
  return `插件市场加载失败：${msg}（请稍后重试）`;
}

marketSearchBtn.addEventListener('click', () => {
  marketKeyword = marketSearchInput.value.trim();
  marketPage = 1;
  loadMarket();
});
marketSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    marketKeyword = marketSearchInput.value.trim();
    marketPage = 1;
    loadMarket();
  }
});
marketRefreshBtn.addEventListener('click', () => {
  loadMarket();
});
marketPrevBtn.addEventListener('click', () => {
  if (marketPage <= 1) return;
  marketPage -= 1;
  loadMarket();
});
marketNextBtn.addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(marketTotalCount / MARKET_PER_PAGE));
  if (marketPage >= totalPages) return;
  marketPage += 1;
  loadMarket();
});

// ============ 侧栏导航 ============
navHome.addEventListener('click', openHomePage);
navPlugin.addEventListener('click', openPluginPage);
navMarket.addEventListener('click', openMarketPage);
navSettings.addEventListener('click', openSettings);

// ============ 设置页 ============
function openSettings() {
  showScreen('settings');
  loadSettings();
  loadDshVersionInfo();
  loadLogs();
  // 进入设置页自动检查更新
  if (window.dsh && window.dsh.checkUpdate) {
    window.dsh.checkUpdate();
  }
}

// 查看日志：加载当前日志文件尾部内容并展示日志路径
function loadLogs() {
  if (!window.dsh || !window.dsh.getLogs) return;
  if (setLogView) setLogView.innerHTML = '<div class="log-hint">' + t('logWaiting') + '</div>';
  window.dsh.getLogs().then((r) => {
    if (!r || !r.ok) {
      if (setLogView) {
        setLogView.innerHTML = '<div class="log-line err">' + t('setLogLoadFail') + ((r && r.error) ? '：' + r.error : '') + '</div>';
      }
      return;
    }
    if (setLogPath) setLogPath.textContent = r.file || '';
    if (setLogView) {
      const lines = String(r.content || '').split('\n').filter((ln, i, arr) => !(ln === '' && i === arr.length - 1));
      setLogView.innerHTML = '';
      if (lines.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'log-hint';
        hint.textContent = t('setLogEmpty');
        setLogView.appendChild(hint);
      } else {
        for (const ln of lines) {
          const div = document.createElement('div');
          div.className = 'log-line' + (/错误|失败|Error|error/.test(ln) ? ' err' : '');
          div.textContent = ln;
          setLogView.appendChild(div);
        }
      }
      setLogView.scrollTop = setLogView.scrollHeight;
    }
  }).catch(() => {
    if (setLogView) setLogView.innerHTML = '<div class="log-line err">' + t('setLogLoadFail') + '</div>';
  });
}

if (setLogRefreshBtn) setLogRefreshBtn.addEventListener('click', loadLogs);
if (setLogFileBtn) {
  setLogFileBtn.addEventListener('click', () => {
    if (window.dsh && window.dsh.openLogFile) window.dsh.openLogFile();
  });
}
if (setLogFolderBtn) {
  setLogFolderBtn.addEventListener('click', () => {
    if (window.dsh && window.dsh.openLogFolder) window.dsh.openLogFolder();
  });
}

// ============ 界面语言（中文 / English） ============
let currentLanguage = 'zh';           // 'zh' | 'en'
let currentThemePref = 'system';      // 用户档位：dark | light | system
let currentResolvedTheme = 'dark';    // 'dark' | 'light'（实际生效明暗）

const I18N = {
  zh: {
    navHome: '首页',
    navPlugin: '插件管理',
    navMarket: '插件市场',
    navSettings: '设置',
    statusStopped: '未运行',
    statusStarting: '正在启动...',
    statusRunning: '运行中',
    statusStopping: '正在停止...',
    sidebarLang: '中文',
    sidebarLangEn: 'EN',
    sidebarThemeDark: '深色',
    sidebarThemeLight: '浅色',
    sidebarRepo: 'GitHub 项目',
    homeTitle: 'DeepSeek Harness 桌面版',
    homeSubtitle: '选择启动模式，开始使用',
    homeHint: '请选择一种启动模式，本页面不会自动进入',
    btnOpenMain: '打开主界面',
    btnStopService: '停止运行',
    btnRestartService: '重新运行',
    modeQuickBadge: '推荐',
    modeQuickTitle: '快速启动',
    modeQuickDesc: '官方 npx @deepseek-ai/dsh web，最快开始使用',
    modeQuickF1: '按官方规范 npx 自动安装',
    modeQuickF2: '自动选择最快国内镜像',
    modeQuickF3: '无需安装额外工具',
    modeQuickBtn: '选择快速启动',
    modeSourceTitle: '源码完整安装',
    modeSourceDesc: 'git clone + pnpm install + build，适合开发调试',
    modeSourceF1: 'git clone 官方仓库源码',
    modeSourceF2: 'pnpm install + pnpm run build',
    modeSourceF3: '需要 git，pnpm 自动安装',
    modeSourceBtn: '选择源码安装',
    modeLocalTitle: '极速启动',
    modeLocalDesc: '本地运行秒级启动，后台自动检查更新，最稳最快',
    modeLocalF1: '本地固定目录，启动不走 npm，秒级启动',
    modeLocalF2: '后台自动检查官方新版本，一键更新',
    modeLocalF3: '无需联网即可启动，断网也能用',
    modeLocalBtn: '选择极速启动',
    btnUpdateLocal: '一键更新',
    modeRepairTitle: '本地修复',
    modeRepairDesc: '应急抢修：强力清除本地数据后快速启动',
    modeRepairF1: '强力清除 ~/.dsh 全部本地数据',
    modeRepairF2: '修复坏插件引用导致的启动崩溃',
    modeRepairF3: '官方快速版 npx 直接启动',
    modeRepairBtn: '选择本地修复',
    logTitle: '命令行日志',
    logWaiting: '等待输出...',
    errorTipText: '启动失败。可尝试「本地修复」强力清除本地数据后重新启动。',
    btnOpenNode: '前往 nodejs.org 下载',
    btnRepair: '选择本地修复',
    btnRetry: '重新开始',
    btnQuit: '退出',
    pluginTitle: '插件管理',
    pluginSubtitle: '管理已安装插件，或通过包名自定义安装',
    pluginCustomTitle: '自定义安装',
    pluginCustomBtn: '安装',
    pluginCustomHint: '不限制格式：支持纯包名、「npm install 包名」、「npx @deepseek-ai/dsh plugin --profile web add 包名」、node / pnpm 等任意命令，原样执行。安装完成后点击「立即重启」即可生效。',
    pluginRecTitle: '推荐插件',
    pluginInstalledTitle: '已安装插件',
    pluginInstalledEmpty: '暂无已安装插件',
    pluginRestartHint: '插件安装 / 卸载后需要重启服务才会加载。重启会短暂关闭当前 WebUI 窗口，完成后会自动重新打开。',
    pluginRestartBtn: '立即重启服务',
    btnRefresh: '刷新',
    marketTitle: '插件市场',
    marketSubtitle: '扫描 GitHub 上带 dsh-plugin 话题的插件仓库，一键安装',
    marketSearchBtn: '搜索',
    marketLoading: '正在从 GitHub 加载插件列表…',
    marketEmpty: '没有找到匹配的插件',
    marketPrev: '上一页',
    marketNext: '下一页',
    setAbout: '关于',
    setVersionPrefix: '版本 ',
    setAppearance: '外观',
    setThemeTitle: '界面主题',
    setThemeDesc: '切换深色 / 浅色 / 跟随系统主题，选择后立即生效并保存；与官方 WebUI 多端同步，任意一端切换，另一端自动跟随',
    themeDark: '深色',
    themeLight: '浅色',
    themeSystem: '跟随系统',
    setWorkspaceTitle: '工作目录',
    setWorkspaceLabel: 'dsh 工作目录',
    setWorkspaceDesc: '聊天记录与工作区数据按工作目录保存。默认自动检测最近使用的目录；如读不到历史数据，可在此手动指定。',
    setWorkspaceSave: '保存',
    setWorkspaceDetect: '自动检测',
    workspaceCurrent: '当前：',
    workspaceAutoDetected: '（自动检测）',
    workspaceSaved: '已保存，重启服务后生效',
    workspaceInvalid: '目录不存在或不可访问',
    setNotifications: '通知',
    setNotifyTitle: '新版本通知',
    setNotifyDesc: '发现新版本时弹出系统通知提醒',
    setDevTitle: '开发者选项',
    setDevModeTitle: '开启开发者选项模式',
    setDevModeDesc: '选择「源码完整安装」时分离运行「服务端后端」与「浏览器端热更 watcher（pnpm dev:web）」两个进程，改动客户端插件源码后自动重建并热更。需先完成一次「源码完整安装」，开关对下次启动生效。',
    setRuntimeTitle: '运行环境（dsh）',
    setRuntimeDesc: '极速启动：本地运行秒级启动；后台自动检查官方新版本，发现新版可在运行状态栏一键更新',
    setDshCheck: '检查最新版本',
    setUpdateTitle: '检查更新',
    setCheckNow: '立即检查',
    setFoundNew: '发现新版本 v',
    setDownloadBtn: '下载并安装',
    umFoundNew: '发现新版本',
    umLater: '稍后再说',
    umNotesLoading: '加载中...',
    // 动态文本（JS 中使用 t() 获取）
    stageInit: '正在初始化',
    stageDetect: '检测本地环境',
    stageInstall: '安装运行环境',
    stageStart: '启动服务中',
    stageReady: '启动完成',
    stageError: '启动失败',
    stageRestart: '重新运行',
    pluginInstalling: '正在安装中...',
    pluginUninstalling: '正在卸载中...',
    pluginInstalled: '已安装',
    pluginNotInstalled: '未安装',
    pluginBundled: '已注册（重启服务后自动加载）',
    pluginNotBundled: '未注册 bundles',
    pluginLegacyInstalled: '旧包名安装，建议迁移到新包名',
    pluginInstallBtn: '一键安装',
    pluginUpdateBtn: '一键更新',
    pluginReinstallBtn: '卸载重装',
    pluginUninstallBtn: '卸载',
    pluginMigrateBtn: '迁移到新包名',
    pluginUpgradeBtn: '更新',
    pluginCheckUpdatesBtn: '检查更新',
    pluginCheckingUpdates: '检查中...',
    pluginUpdateAvailable: '可更新 v',
    pluginUpToDate: '已是最新',
    pluginLegacyMigrate: '旧包名，可迁移',
    pluginListLoadFail: '插件列表加载失败',
    stepPrefix: '步骤',
    setUpdateChecking: '正在检查更新...',
    setUpdateDownloading: '正在下载...',
    setDownloadingBtn: '下载中...',
    setNoChangelog: '暂无更新日志',
    setCurrentVersion: '当前版本：',
    setLogTitle: '查看日志',
    setLogDesc: '查看应用运行日志，便于排查启动、插件与服务问题。日志按天保存在以下文件：',
    setLogOpenFile: '打开日志文件',
    setLogOpenFolder: '打开日志目录',
    setLogEmpty: '暂无日志',
    setLogLoadFail: '日志读取失败',
  },
  en: {
    navHome: 'Home',
    navPlugin: 'Plugins',
    navMarket: 'Market',
    navSettings: 'Settings',
    statusStopped: 'Stopped',
    statusStarting: 'Starting...',
    statusRunning: 'Running',
    statusStopping: 'Stopping...',
    sidebarLang: 'English',
    sidebarLangEn: 'EN',
    sidebarThemeDark: 'Dark',
    sidebarThemeLight: 'Light',
    sidebarRepo: 'GitHub Repo',
    homeTitle: 'DeepSeek Harness Desktop',
    homeSubtitle: 'Choose a launch mode to get started',
    homeHint: 'Choose a launch mode — this page does not auto-start',
    btnOpenMain: 'Open Main UI',
    btnStopService: 'Stop Service',
    btnRestartService: 'Restart',
    modeQuickBadge: 'Recommended',
    modeQuickTitle: 'Quick Start',
    modeQuickDesc: 'Official npx @deepseek-ai/dsh web — fastest way to start',
    modeQuickF1: 'Auto-install via official npx',
    modeQuickF2: 'Auto-select fastest China mirror',
    modeQuickF3: 'No extra tools needed',
    modeQuickBtn: 'Choose Quick Start',
    modeSourceTitle: 'Full Source Build',
    modeSourceDesc: 'git clone + pnpm install + build, for development & debugging',
    modeSourceF1: 'git clone official repo source',
    modeSourceF2: 'pnpm install + pnpm run build',
    modeSourceF3: 'Requires git; pnpm auto-installs',
    modeSourceBtn: 'Choose Source Build',
    modeLocalTitle: 'Instant Start',
    modeLocalDesc: 'Instant launch from a local runtime, auto-checks updates in the background — most stable & fastest',
    modeLocalF1: 'Local fixed directory, no npm at startup — instant launch',
    modeLocalF2: 'Auto-checks official new versions, one-click update',
    modeLocalF3: 'Works even without network — fully offline capable',
    modeLocalBtn: 'Choose Instant Start',
    btnUpdateLocal: 'Update Now',
    modeRepairTitle: 'Local Repair',
    modeRepairDesc: 'Emergency repair: force-clear local data then quick start',
    modeRepairF1: 'Force-clear all ~/.dsh local data',
    modeRepairF2: 'Fix startup crashes caused by broken plugin refs',
    modeRepairF3: 'Starts via official quick-start npx',
    modeRepairBtn: 'Choose Local Repair',
    logTitle: 'Command Log',
    logWaiting: 'Waiting for output...',
    errorTipText: 'Startup failed. Try "Local Repair" to force-clear local data and restart.',
    btnOpenNode: 'Go to nodejs.org to download',
    btnRepair: 'Local Repair',
    btnRetry: 'Restart',
    btnQuit: 'Quit',
    pluginTitle: 'Plugin Management',
    pluginSubtitle: 'Manage installed plugins or install by package name',
    pluginCustomTitle: 'Custom Install',
    pluginCustomBtn: 'Install',
    pluginCustomHint: 'No format restrictions: plain package name, "npm install <pkg>", "npx @deepseek-ai/dsh plugin --profile web add <pkg>", node / pnpm — any command, run as-is. Click "Restart Now" after install to apply.',
    pluginRecTitle: 'Recommended Plugins',
    pluginInstalledTitle: 'Installed Plugins',
    pluginInstalledEmpty: 'No plugins installed yet',
    pluginRestartHint: 'After install / uninstall, you must restart the service to load. Restart briefly closes the WebUI window and reopens it automatically.',
    pluginRestartBtn: 'Restart Service Now',
    btnRefresh: 'Refresh',
    marketTitle: 'Plugin Market',
    marketSubtitle: 'Scan GitHub plugin repos tagged with dsh-plugin and install with one click',
    marketSearchBtn: 'Search',
    marketLoading: 'Loading plugin list from GitHub...',
    marketEmpty: 'No matching plugins found',
    marketPrev: 'Prev',
    marketNext: 'Next',
    setAbout: 'About',
    setVersionPrefix: 'Version ',
    setAppearance: 'Appearance',
    setThemeTitle: 'Interface Theme',
    setThemeDesc: 'Dark / Light / Follow System — takes effect immediately and saves. Synced with the official WebUI: change it on either side and the other follows.',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeSystem: 'Follow System',
    setWorkspaceTitle: 'Workspace',
    setWorkspaceLabel: 'dsh Workspace Directory',
    setWorkspaceDesc: 'Chat history and workspace data are stored per workspace directory. Auto-detects the most recent directory by default; specify one manually if history is missing.',
    setWorkspaceSave: 'Save',
    setWorkspaceDetect: 'Auto-detect',
    workspaceCurrent: 'Current: ',
    workspaceAutoDetected: ' (auto-detected)',
    workspaceSaved: 'Saved; takes effect after restart',
    workspaceInvalid: 'Directory does not exist or is inaccessible',
    setNotifications: 'Notifications',
    setNotifyTitle: 'New version notification',
    setNotifyDesc: 'Show a system notification when a new version is found',
    setDevTitle: 'Developer Options',
    setDevModeTitle: 'Enable developer options mode',
    setDevModeDesc: 'When choosing "Full Source Build", runs "service backend" and "browser hot-reload watcher (pnpm dev:web)" as two processes; changes to client plugin sources rebuild and hot-reload automatically. A "Full Source Build" must be done first. Applies on next launch.',
    setRuntimeTitle: 'Runtime (dsh)',
    setRuntimeDesc: 'Instant Start: instant launch from a local runtime; auto-checks official new versions in the background — update with one click when available',
    setDshCheck: 'Check Latest Version',
    setUpdateTitle: 'Check for Updates',
    setCheckNow: 'Check Now',
    setFoundNew: 'New version found: v',
    setDownloadBtn: 'Download & Install',
    umFoundNew: 'New Version Found',
    umLater: 'Later',
    umNotesLoading: 'Loading...',
    // 动态文本
    stageInit: 'Initializing',
    stageDetect: 'Detecting environment',
    stageInstall: 'Installing runtime',
    stageStart: 'Starting service',
    stageReady: 'Ready',
    stageError: 'Startup failed',
    stageRestart: 'Restarting',
    pluginInstalling: 'Installing...',
    pluginUninstalling: 'Uninstalling...',
    pluginInstalled: 'Installed',
    pluginNotInstalled: 'Not installed',
    pluginBundled: 'Registered (auto-loads after service restart)',
    pluginNotBundled: 'Not registered in bundles',
    pluginLegacyInstalled: 'Installed with old package name, migrate recommended',
    pluginInstallBtn: 'Install',
    pluginUpdateBtn: 'Update',
    pluginReinstallBtn: 'Reinstall',
    pluginUninstallBtn: 'Uninstall',
    pluginMigrateBtn: 'Migrate to New Name',
    pluginUpgradeBtn: 'Update',
    pluginCheckUpdatesBtn: 'Check Updates',
    pluginCheckingUpdates: 'Checking...',
    pluginUpdateAvailable: 'Update available: v',
    pluginUpToDate: 'Up to date',
    pluginLegacyMigrate: 'Legacy package, migrate',
    pluginListLoadFail: 'Failed to load plugin list',
    stepPrefix: 'Step',
    setUpdateChecking: 'Checking for updates...',
    setUpdateDownloading: 'Downloading...',
    setDownloadingBtn: 'Downloading...',
    setNoChangelog: 'No changelog available',
    setCurrentVersion: 'Current version: ',
    setLogTitle: 'View Logs',
    setLogDesc: 'View application run logs to troubleshoot startup, plugin and service issues. Logs are saved per day at:',
    setLogOpenFile: 'Open Log File',
    setLogOpenFolder: 'Open Log Folder',
    setLogEmpty: 'No logs yet',
    setLogLoadFail: 'Failed to load logs',
  },
};

// 取当前语言的文本
function t(key) {
  const dict = I18N[currentLanguage] || I18N.zh;
  return dict[key] != null ? dict[key] : (I18N.zh[key] != null ? I18N.zh[key] : key);
}

// 应用当前语言到所有标记了 data-i18n 的元素 + 侧边栏动态文本
function applyI18n() {
  const dict = I18N[currentLanguage] || I18N.zh;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });
  // 复合前缀文本（如「版本 1.8.0」）：data-i18n-prefix 指定前缀 key，原内容后缀保留
  document.querySelectorAll('[data-i18n-prefix]').forEach((el) => {
    const key = el.getAttribute('data-i18n-prefix');
    if (dict[key] != null) {
      const span = el.querySelector('span');
      if (span) el.childNodes[0].textContent = dict[key];
    }
  });
  // 侧边栏语言按钮文字
  if (sidebarLangText) {
    sidebarLangText.textContent = currentLanguage === 'en' ? I18N.en.sidebarLang : I18N.zh.sidebarLang;
  }
  // 侧边栏主题文字（跟随当前明暗）
  syncSidebarTheme(currentThemePref, currentResolvedTheme);
}

// 切换语言并持久化
function setLanguage(lang) {
  const next = lang === 'en' ? 'en' : 'zh';
  if (next === currentLanguage) return;
  currentLanguage = next;
  if (window.dsh && window.dsh.setLanguage) {
    window.dsh.setLanguage(next).catch(() => {});
  }
  applyI18n();
}

// ============ 界面主题（深色 / 浅色 / 跟随系统） ============
// 应用主题：在 <html> 上设置 data-theme，CSS 变量据此切换。
// theme 为档位（'dark' | 'light' | 'system'），resolved 为实际明暗（'dark' | 'light'）。
function applyTheme(resolvedTheme) {
  const t = resolvedTheme === 'light' ? 'light' : 'dark';
  currentResolvedTheme = t;
  document.documentElement.setAttribute('data-theme', t);
}

// 同步主题切换按钮高亮状态（按档位高亮，system 时不高亮任何一项或高亮 system 项）
function syncThemeButtons(theme) {
  const t = theme === 'light' ? 'light' : (theme === 'dark' ? 'dark' : 'system');
  if (themeDarkBtn) themeDarkBtn.classList.toggle('active', t === 'dark');
  if (themeLightBtn) themeLightBtn.classList.toggle('active', t === 'light');
  if (themeSystemBtn) themeSystemBtn.classList.toggle('active', t === 'system');
}

// 应用档位 + 实际明暗：HTML 切换 + 按钮高亮
function applyThemeState(theme, resolved) {
  currentThemePref = theme || 'system';
  const actual = resolved || currentThemePref;
  applyTheme(actual);
  syncThemeButtons(currentThemePref);
  syncSidebarTheme(currentThemePref, actual);
}

// 同步侧边栏主题快捷按钮（深色/浅色 与文字、图标）
function syncSidebarTheme(theme, resolved) {
  if (!sidebarThemeBtn) return;
  const dark = resolved === 'dark';
  if (sidebarThemeText) {
    sidebarThemeText.textContent = dark
      ? (currentLanguage === 'en' ? 'Dark' : '深色')
      : (currentLanguage === 'en' ? 'Light' : '浅色');
  }
  if (sidebarThemeIcon) {
    // 深色：月亮图标；浅色：太阳图标
    sidebarThemeIcon.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }
}

// 主题切换按钮：点击即切换并持久化
function setupThemeControls() {
  if (themeDarkBtn) {
    themeDarkBtn.addEventListener('click', () => setTheme('dark'));
  }
  if (themeLightBtn) {
    themeLightBtn.addEventListener('click', () => setTheme('light'));
  }
  if (themeSystemBtn) {
    themeSystemBtn.addEventListener('click', () => setTheme('system'));
  }
  // 侧边栏快捷主题切换：深色 <-> 浅色 循环切换
  if (sidebarThemeBtn) {
    sidebarThemeBtn.addEventListener('click', () => {
      const dark = currentResolvedTheme === 'dark';
      setTheme(dark ? 'light' : 'dark');
    });
  }
}

function setTheme(theme) {
  const t = ['dark', 'light', 'system'].includes(theme) ? theme : 'system';
  if (window.dsh && window.dsh.setTheme) {
    window.dsh.setTheme(t).then((r) => {
      // 主进程已持久化 + 同步官方 UI + 广播，这里按返回结果刷新状态
      if (r && r.ok) applyThemeState(r.theme, r.resolved);
    }).catch(() => {});
  }
}

function applyAppName(name, tagline) {
  const n = name || 'DeepSeek Harness 桌面版';
  const t = tagline || 'DeepSeek Harness 官方 Web UI 桌面客户端';
  document.title = n;
  if (appTitleProgress) appTitleProgress.textContent = n;
  if (setAppName) setAppName.textContent = n;
  if (setTagline) setTagline.textContent = t;
  if (umAppName) umAppName.textContent = n;
}

function loadSettings() {
  if (!window.dsh || !window.dsh.getSettings) return;
  window.dsh.getSettings().then((cfg) => {
    if (cfg) {
      applyAppName(cfg.appName, cfg.appTagline);
      setVersion.textContent = 'v' + cfg.version;
      // 侧栏版本号
      const sv = document.getElementById('sidebarVersion');
      if (sv) sv.textContent = 'v' + cfg.version;
      setNotifyToggle.checked = !!cfg.notifications;
      setDevModeToggle.checked = !!cfg.developerMode;
      if (cfg.dshVersion) {
        setDshVersion.textContent = t('setCurrentVersion') + 'v' + cfg.dshVersion;
      }
      if (cfg.theme) {
        applyThemeState(cfg.theme, cfg.themeResolved);
      }
      if (cfg.language) {
        currentLanguage = cfg.language === 'en' ? 'en' : 'zh';
      }
      // 工作目录：回填输入框并展示当前目录与自动检测结果
      if (cfg.workspaceDir) {
        renderWorkspace(cfg.workspaceDir, cfg.detectedWorkspace);
      }
      if (cfg.repoUrl && sidebarRepo) {
        sidebarRepo.href = cfg.repoUrl;
      }
      applyI18n();
      if (cfg.changelog) {
        setChangelog.innerHTML = renderMarkdown(cfg.changelog);
      } else {
        setChangelog.innerHTML = '<p>' + t('setNoChangelog') + '</p>';
      }
    }
  }).catch(() => {
    setVersion.textContent = 'v1.0.0';
  });
}

// 工作目录：回填输入框并展示当前目录与自动检测到的历史目录
function renderWorkspace(currentDir, detectedDir) {
  if (setWorkspaceInput) setWorkspaceInput.value = currentDir || '';
  if (setWorkspaceHint) {
    let text = t('workspaceCurrent') + (currentDir || '-');
    if (detectedDir && detectedDir !== currentDir) {
      text += ' · ' + (currentLanguage === 'en' ? 'Detected: ' : '检测到：') + detectedDir;
    }
    setWorkspaceHint.textContent = text;
  }
}

// 保存手动填写的工作目录（主进程校验存在性，重启服务后生效）
function saveWorkspaceDir() {
  if (!window.dsh || !window.dsh.setWorkspaceDir) return;
  const dir = setWorkspaceInput ? setWorkspaceInput.value.trim() : '';
  window.dsh.setWorkspaceDir(dir).then((r) => {
    if (r && r.ok) {
      renderWorkspace(r.workspaceDir, null);
      if (setWorkspaceHint) setWorkspaceHint.textContent = t('workspaceCurrent') + r.workspaceDir + ' · ' + t('workspaceSaved');
    } else if (r && r.error) {
      if (setWorkspaceHint) setWorkspaceHint.textContent = t('workspaceInvalid') + '：' + r.error;
    }
  }).catch(() => {});
}

// 自动检测：清除显式配置，恢复「按历史数据自动检测」
function detectWorkspaceDir() {
  if (!window.dsh || !window.dsh.setWorkspaceDir) return;
  window.dsh.setWorkspaceDir('').then((r) => {
    if (r && r.ok) {
      renderWorkspace(r.workspaceDir, null);
      if (setWorkspaceHint) setWorkspaceHint.textContent = t('workspaceCurrent') + r.workspaceDir + t('workspaceAutoDetected');
    }
  }).catch(() => {});
}

if (setWorkspaceSaveBtn) setWorkspaceSaveBtn.addEventListener('click', saveWorkspaceDir);
if (setWorkspaceDetectBtn) setWorkspaceDetectBtn.addEventListener('click', detectWorkspaceDir);

setNotifyToggle.addEventListener('change', () => {
  if (window.dsh && window.dsh.setNotifications) {
    window.dsh.setNotifications(setNotifyToggle.checked);
  }
});

setDevModeToggle.addEventListener('change', () => {
  if (window.dsh && window.dsh.setDeveloperMode) {
    window.dsh.setDeveloperMode(setDevModeToggle.checked);
  }
});

// ============ 运行环境（dsh 版本） ============
// 快速启动用 npm exec（npx）：每次启动自动解析 registry 最新版并更新，
// 这里展示"当前运行版本 vs registry 最新版本"，并提示重新运行即可用新版。
function showDshNote(text, kind) {
  setDshVersionNote.hidden = !text;
  setDshVersionNote.textContent = text || '';
  setDshVersionNote.className = 'plugin-note' + (kind ? ' ' + kind : '');
}

function loadDshVersionInfo() {
  if (!window.dsh || !window.dsh.getDshVersionInfo) return;
  setDshCheckBtn.disabled = true;
  window.dsh.getDshVersionInfo().then((info) => {
    setDshCheckBtn.disabled = false;
    if (!info || !info.ok) {
      if (info && info.running) setDshVersion.textContent = t('setCurrentVersion') + 'v' + info.running;
      showDshNote((currentLanguage === 'en' ? 'Failed to check latest version: ' : '最新版本查询失败：') + ((info && info.error) || (currentLanguage === 'en' ? 'unknown error' : '未知错误')) + (currentLanguage === 'en' ? ' (check network and retry)' : '（检查网络后重试）'), 'err');
      return;
    }
    const parts = [];
    if (info.running) parts.push((currentLanguage === 'en' ? 'Current v' : '当前版本 v') + info.running);
    if (info.latest) parts.push((currentLanguage === 'en' ? 'Latest v' : '最新版本 v') + info.latest);
    setDshVersion.textContent = parts.length > 0 ? parts.join(' · ') : t('setCurrentVersion') + '-';
    if (info.outdated) {
      showDshNote(currentLanguage === 'en' ? 'New version found: click "Update Now" on the home running status bar to update in one click' : '发现新版本：回到首页运行状态栏点击「一键更新」即可更新', '');
    } else if (info.running && info.latest) {
      showDshNote(currentLanguage === 'en' ? 'Already up to date' : '已是最新版本', 'ok');
    } else {
      showDshNote('', '');
    }
  }).catch(() => {
    setDshCheckBtn.disabled = false;
    showDshNote('最新版本查询失败', 'err');
  });
}

setDshCheckBtn.addEventListener('click', loadDshVersionInfo);

setCheckBtn.addEventListener('click', () => {
  if (window.dsh && window.dsh.checkUpdate) {
    window.dsh.checkUpdate();
  }
});

setDownloadBtn.addEventListener('click', () => {
  if (!window.dsh || !window.dsh.downloadUpdate) return;
  // 已下载完成 -> 点击安装
  const btnText = setDownloadBtnText.textContent;
  if ((currentLanguage === 'en' ? btnText === 'Install Update' : btnText === '安装更新') && window.dsh.installUpdate) {
    window.dsh.installUpdate();
    return;
  }
  if (btnText === '下载并安装') {
    window.dsh.downloadUpdate();
  }
});

// 更新状态渲染
function renderUpdateStatus(state) {
  if (!state) return;
  const s = state.status;
  if (s === 'checking') {
    setUpdateStatus.textContent = t('setUpdateChecking');
    setUpdateHint.textContent = '';
    setUpdateInfo.hidden = true;
    setDownloadProgress.hidden = true;
  } else if (s === 'uptodate') {
    setUpdateStatus.textContent = currentLanguage === 'en' ? 'Already up to date' : '已是最新版本';
    setUpdateHint.textContent = '';
    setUpdateInfo.hidden = true;
  } else if (s === 'available') {
    setUpdateStatus.textContent = state.message || '发现新版本';
    setUpdateHint.textContent = '';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = true;
    setDownloadBtnText.textContent = t('setDownloadBtn');
    if (state.latest) {
      setNewVersion.textContent = state.latest.version;
      setNewNotes.innerHTML = renderMarkdown((state.latest.release_notes || t('setNoChangelog')) + '\n\n' + (currentLanguage === 'en' ? 'File size: ' : '文件大小：') + formatSize(state.latest.file_size));
    }
  } else if (s === 'downloading') {
    setUpdateStatus.textContent = state.message || t('setUpdateDownloading');
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = false;
    setDownloadBtnText.textContent = t('setDownloadingBtn');
    setDownloadBtn.disabled = true;
    setDownloadFill.style.width = (state.percent || 0) + '%';
    setDownloadText.textContent = state.message || ((state.percent || 0) + '%');
  } else if (s === 'downloaded') {
    setUpdateStatus.textContent = currentLanguage === 'en' ? 'Downloaded, ready to install' : '下载完成，可安装';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = false;
    setDownloadFill.style.width = '100%';
    setDownloadText.textContent = '100%';
    setDownloadBtnText.textContent = currentLanguage === 'en' ? 'Install Update' : '安装更新';
    setDownloadBtn.disabled = false;
  } else if (s === 'installing') {
    setUpdateStatus.textContent = currentLanguage === 'en' ? 'Starting installer...' : '正在启动安装程序...';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = true;
  } else if (s === 'error') {
    setUpdateStatus.textContent = state.message || (currentLanguage === 'en' ? 'Update failed' : '更新失败');
    setUpdateHint.textContent = state.error || '';
    setUpdateInfo.hidden = true;
    setDownloadBtn.disabled = false;
  }
}

function formatSize(bytes) {
  if (bytes == null || bytes === 0) return '未知大小';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[u];
}

// ============ Markdown 渲染（更新日志） ============
// 轻量 Markdown 渲染器：仅覆盖更新日志常用语法 ——
// 标题（# ~ ######）、无序列表（-/*/+）、有序列表（1.）、
// 代码块（```）、行内代码（`code`）、粗体（**text**）、链接（[text](url)）。
// 先对整个文本做 HTML 转义再解析，输出为安全 HTML（原始 `< > &` 不会被当标签解析）。
function escapeHtmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMdInline(s) {
  // 行内代码优先（避免 code 内的 ** / 链接标记被二次解析）
  s = s.replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return s;
}

function renderMarkdown(md) {
  const lines = escapeHtmlText(md || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  let para = [];        // 段落行缓冲
  let list = null;      // 当前列表容器：'ul' | 'ol'
  let inCode = false;   // 是否处于代码块
  let codeBuf = [];

  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + renderMdInline(para.join(' ')) + '</p>');
      para = [];
    }
  };
  const closeList = () => {
    if (list) { out.push('</' + list + '>'); list = null; }
  };
  const openList = (type) => {
    if (list !== type) { closeList(); out.push('<' + type + '>'); list = type; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (inCode) {
      if (/^```/.test(line)) {
        inCode = false;
        out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>');
        codeBuf = [];
      } else {
        codeBuf.push(line);
      }
      continue;
    }
    if (/^```/.test(line)) {
      closeList(); flushPara();
      inCode = true;
      continue;
    }
    if (!line) { closeList(); flushPara(); continue; }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList(); flushPara();
      const level = h[1].length;
      out.push('<h' + level + '>' + renderMdInline(h[2]) + '</h' + level + '>');
      continue;
    }

    // 无序列表
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushPara(); openList('ul');
      out.push('<li>' + renderMdInline(ul[1]) + '</li>');
      continue;
    }

    // 有序列表
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara(); openList('ol');
      out.push('<li>' + renderMdInline(ol[1]) + '</li>');
      continue;
    }

    // 普通段落行
    closeList();
    para.push(line);
  }
  if (inCode && codeBuf.length) out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>');
  closeList();
  flushPara();
  return out.join('\n');
}

// ============ 更新弹窗 ============
let autoUpdatePopupShown = false; // 启动时自动弹窗只弹一次

function showUpdatePopup() {
  updateMask.hidden = false;
  umLaterBtn.hidden = false;
  umProgress.hidden = true;
  umActionBtn.disabled = false;
  umActionText.textContent = t('setDownloadBtn');
}

function hideUpdatePopup() {
  updateMask.hidden = true;
}

umLaterBtn.addEventListener('click', hideUpdatePopup);

umActionBtn.addEventListener('click', () => {
  if (!window.dsh) return;
  const label = umActionText.textContent;
  if ((currentLanguage === 'en' ? label === 'Install Update' : label === '安装更新') && window.dsh.installUpdate) {
    window.dsh.installUpdate();
    return;
  }
  if (window.dsh.downloadUpdate) {
    window.dsh.downloadUpdate();
  }
});

function renderUpdatePopup(state) {
  if (!state) return;
  const s = state.status;
  if (s === 'available') {
    if (state.latest) {
      umNewVersion.textContent = state.latest.version;
      umNotes.innerHTML = renderMarkdown((state.latest.release_notes || t('setNoChangelog')) + '\n\n' + (currentLanguage === 'en' ? 'File size: ' : '文件大小：') + formatSize(state.latest.file_size));
    }
    umProgress.hidden = true;
    umActionBtn.disabled = false;
    umActionText.textContent = t('setDownloadBtn');
    if (!autoUpdatePopupShown && settingsScreen.hidden) {
      autoUpdatePopupShown = true;
      showUpdatePopup();
    }
  } else if (s === 'downloading') {
    if (!updateMask.hidden) {
      umProgress.hidden = false;
      umActionBtn.disabled = true;
      umActionText.textContent = t('setDownloadingBtn');
      umFill.style.width = (state.percent || 0) + '%';
      umText.textContent = state.message || ((state.percent || 0) + '%');
    }
  } else if (s === 'downloaded') {
    if (!updateMask.hidden) {
      umProgress.hidden = false;
      umFill.style.width = '100%';
      umText.textContent = '100%';
      umActionBtn.disabled = false;
      umActionText.textContent = currentLanguage === 'en' ? 'Install Update' : '安装更新';
    }
  } else if (s === 'error') {
    if (!updateMask.hidden) {
      umProgress.hidden = true;
      umActionBtn.disabled = false;
      umActionText.textContent = currentLanguage === 'en' ? 'Retry Download' : '重新下载';
    }
  }
}

// ============ 初始化 ============
if (!window.dsh) {
  setPercent(0);
  stageTextEl.textContent = '预加载脚本缺失，请重新安装应用';
  stageTagEl.textContent = STAGE_LABELS.error();
  setIcon('err');
  showScreen('progress');
  footer.hidden = false;
  btnOpenNode.hidden = true;
  btnRetry.hidden = true;
} else {
  // 主题：立即应用预加载脚本传入的主题（同步、避免首帧闪色）
  if (window.dsh.theme) {
    applyTheme(window.dsh.theme);
  }
  setupThemeControls();

  // 侧边栏：语言切换按钮（中文 <-> English）
  if (sidebarLangBtn) {
    sidebarLangBtn.addEventListener('click', () => {
      setLanguage(currentLanguage === 'en' ? 'zh' : 'en');
    });
  }
  // 侧边栏：项目地址链接（打开 GitHub 仓库，地址由 settings:get 异步提供）
  if (sidebarRepo && sidebarRepo.href === '#') {
    sidebarRepo.href = 'https://github.com/feiyang-dev/DeepSeek-Harness-Desktop';
  }
  // 首帧应用语言（默认中文；settings:get 返回后 loadSettings 会再刷新）
  applyI18n();

  // 主进程推送主题变化（控制面板 / 官方 UI / 系统深浅色切换时实时跟随）
  if (window.dsh.onThemeChanged) {
    window.dsh.onThemeChanged(({ theme, resolved }) => {
      applyThemeState(theme, resolved);
    });
  }

  // 阶段切换（mode / detect / install / start / running / stopped / error）
  window.dsh.onPhase(({ phase, service }) => {
    currentPhase = phase;
    if (phase === 'running' && service) lastService = service;
    if (phase === 'mode') {
      // 回到首页模式选择（重试时）
      logCount = 0;
      logBadge.textContent = '0';
      logBody.innerHTML = '<div class="log-hint">等待输出...</div>';
      stepIndicator.hidden = true;
      renderHome('mode');
      showScreen('home');
    } else if (phase === 'running') {
      renderHome('running', service);
      showScreen('home');
    } else if (phase === 'stopped') {
      renderHome('stopped');
      showScreen('home');
    } else {
      // detect / install / start 等 → 进度界面
      showScreen('progress');
    }
  });

  // 进度事件（含实时细节 detail 与人性化提示 hint、步骤 step）
  window.dsh.onProgress(({ percent, stage, text, detail, hint, step }) => {
    // 记录当前阶段：启动过程中主进程只广播 boot:progress，首页导航靠它恢复正确界面
    if (stage === 'detect' || stage === 'install' || stage === 'start' || stage === 'ready') {
      currentPhase = stage;
    }
    // 防御：新的进度事件到达时，清除之前残留的错误提示（避免"假失败"残留）
    if (stage !== 'error') {
      errorTip.hidden = true;
      footer.hidden = true;
    }
    setPercent(percent);
    if (text) stageTextEl.textContent = text;
    if (stage && STAGE_LABELS[stage]) stageTagEl.textContent = STAGE_LABELS[stage]();
    if (stage === 'ready') setIcon('ok');
    if (detail) progressDetailEl.textContent = detail;
    else progressDetailEl.textContent = '';
    if (hint) progressHintEl.textContent = hint;
    else progressHintEl.textContent = '';
    if (step && step.total) {
      stepIndicator.hidden = false;
      stepPill.textContent = `${t('stepPrefix')} ${step.index}/${step.total}`;
      stepTitle.textContent = step.title;
    }
  });

  // 命令行日志
  window.dsh.onLog((text) => appendLog(text));

  // 错误状态：提示用户选择修复
  window.dsh.onStatus(({ phase, message, crashCode }) => {
    if (phase === 'error') {
      currentPhase = 'error';
      stopUptimeTicker();
      showScreen('progress'); // 无论当前在哪个页面，都切回进度页展示错误
      stageTagEl.textContent = STAGE_LABELS.error();
      stageTextEl.textContent = message || t('stageError');
      setIcon('err');
      footer.hidden = false;
      btnOpenNode.hidden = false;
      btnRetry.hidden = false;
      errorTip.hidden = false;
      if (crashCode != null) {
        // 原生模块崩溃（0xC0000005 等）：本地修复（清 profiles）对该类型无效，
        // 隐藏「选择本地修复」并给出针对性建议（清理缓存 / 换 LTS / 源码重建）
        btnRepair.hidden = true;
        const hex = '0x' + (Number(crashCode) >>> 0).toString(16).toUpperCase().padStart(8, '0');
        errorTipText.textContent = `检测到运行环境原生模块崩溃（${hex}）。\n已自动尝试清理损坏缓存并重新下载运行环境。若仍失败：\n① 点击「重新开始」再次自动修复；\n② 点击「前往 nodejs.org 下载」安装 Node.js LTS 稳定版后重试；\n③ 或选择「源码完整安装」由官方构建流程重新安装依赖。`;
      } else {
        btnRepair.hidden = false;
        errorTipText.textContent = message
          ? `启动失败：${message}\n建议点击「选择本地修复」，强力清除本地数据后重新启动。`
          : '启动失败。可点击「选择本地修复」强力清除本地数据后重新启动。';
      }
      if (!logOpen) toggleLog();
    }
  });

  // 更新状态（设置页 + 更新弹窗同时响应）
  window.dsh.onUpdateStatus((status) => {
    renderUpdateStatus(status);
    renderUpdatePopup(status);
  });

  // 运行状态增量更新（如 dsh 版本晚到）：刷新首页控制台，但不切换界面
  window.dsh.onServiceUpdate(({ service }) => {
    if (service && service.running) {
      renderHome('running', service);
      // 若正停留在设置页，同步刷新「运行环境（dsh）」的当前版本展示
      if (!settingsScreen.hidden && service.dshVersion && setDshVersion) {
        setDshVersion.textContent = t('setCurrentVersion') + 'v' + service.dshVersion;
      }
    }
  });

  // 插件安装/卸载事件（主进程推送的进度与结果）
  window.dsh.onPluginEvent((ev) => {
    if (!ev) return;
    if (ev.stage === 'log') {
      // 安装/卸载过程的命令行输出 → 统一显示在「自定义安装」卡片的终端日志面板
      appendCustomLog(ev.message || '');
      return;
    }
    if (ev.stage === 'command') {
      // 原样展示用户执行的完整命令（如 $ npx @deepseek-ai/dsh plugin ...）
      appendCustomLog('$ ' + (ev.command || ''));
      ensureCustomLogOpen();
      return;
    }
    if (ev.stage === 'installing' || ev.stage === 'uninstalling') {
      if (ev.pkg) localBusy.set(ev.pkg, ev.stage === 'uninstalling' ? 'uninstall' : 'install');
      restartHintCard.hidden = true;
      showCustomNote(ev.message || '', '');
      ensureCustomLogOpen();
      refreshPluginLists();
    } else if (ev.stage === 'done') {
      if (ev.pkg) {
        localBusy.delete(ev.pkg);
        // 安装（更新）完成后清除该插件的更新缓存，避免「更新」按钮残留
        if (pluginUpdateCheck && pluginUpdateCheck[ev.pkg]) {
          delete pluginUpdateCheck[ev.pkg];
        }
      }
      showCustomNote((ev.message || '完成') + '，点击下方「立即重启服务」即可生效。', 'ok');
      restartHintCard.hidden = false; // 安装/卸载完成 → 提示"立即重启"
      refreshPluginLists();
    } else if (ev.stage === 'error') {
      if (ev.pkg) localBusy.delete(ev.pkg);
      showCustomNote(ev.message || '操作失败', 'err');
      refreshPluginLists();
    }
  });

  // 进入 APP 立即自动检查更新
  if (window.dsh.checkUpdate) {
    window.dsh.checkUpdate();
  }

  // 启动时查询服务状态：若服务已在运行（如窗口重载），首页直接显示运行中
  if (window.dsh.getServiceState) {
    window.dsh.getServiceState().then((st) => {
      if (!st) return;
      currentPhase = st.phase || 'mode';
      if (st.phase === 'running' && st.running) {
        lastService = st;
        renderHome('running', st);
        showScreen('home');
      } else if (st.phase === 'stopped') {
        renderHome('stopped');
        showScreen('home');
      } else if (st.phase === 'mode' || st.phase === 'init') {
        renderHome('mode');
        showScreen('home');
      } else {
        // detect/install/start/ready/error：服务仍在启动中（如页面重载），回到进度页
        showScreen('progress');
      }
    }).catch(() => {
      renderHome('mode');
      showScreen('home');
    });
  } else {
    renderHome('mode');
    showScreen('home');
  }

  btnOpenNode.addEventListener('click', () => window.dsh.openExternal('https://nodejs.org/'));
  // 选择本地修复：直接进入修复模式（重新加载修复流程）
  btnRepair.addEventListener('click', () => {
    resetModeCards();
    footer.hidden = true;
    errorTip.hidden = true;
    chooseMode('repair');
  });
  btnRetry.addEventListener('click', () => {
    footer.hidden = true;
    errorTip.hidden = true;
    setPercent(0);
    setIcon('');
    stageTextEl.textContent = '正在重新开始...';
    stageTagEl.textContent = STAGE_LABELS.init();
    window.dsh.retry();
  });
  btnQuit.addEventListener('click', () => window.dsh.quit());
}
