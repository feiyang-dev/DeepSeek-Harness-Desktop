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
const cardRepair = document.getElementById('cardRepair');

// 首页运行状态控制台
const statusPanel = document.getElementById('statusPanel');
const statusDot = document.getElementById('statusDot');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const btnOpenMain = document.getElementById('btnOpenMain');
const btnStopService = document.getElementById('btnStopService');
const btnRestartService = document.getElementById('btnRestartService');

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
const setUpdateBase = document.getElementById('setUpdateBase');
const setNotifyToggle = document.getElementById('setNotifyToggle');
const themeDarkBtn = document.getElementById('themeDarkBtn');
const themeLightBtn = document.getElementById('themeLightBtn');
const themeSystemBtn = document.getElementById('themeSystemBtn');
const setDevModeToggle = document.getElementById('setDevModeToggle');
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

// preload.js 通过 contextBridge.exposeInMainWorld('dsh', ...) 暴露全局 window.dsh。
let logCount = 0;
let logOpen = false;
let modeChosen = false;
let pluginBusy = false;
let uptimeTimer = null;

const STAGE_LABELS = {
  init: '正在初始化',
  detect: '检测本地环境',
  install: '安装运行环境',
  start: '启动服务中',
  ready: '启动完成',
  running: '正在运行中',
  stopped: '服务已停止',
  error: '出现问题',
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
  if (sidebarStatusText) sidebarStatusText.textContent = running ? '运行中' : '未运行';
}

// ============ 首页渲染（模式选择 / 运行中 / 已停止） ============
function resetModeCards() {
  modeChosen = false;
  cardQuick.classList.remove('selected', 'disabled');
  cardSource.classList.remove('selected', 'disabled');
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

// phase: 'mode' | 'running' | 'stopped'
function renderHome(phase, service) {
  resetModeCards();
  if (phase === 'running') {
    homeSubtitle.textContent = '服务正在运行中';
    homeHint.textContent = '可在下方停止或重新运行服务';
    homeHint.hidden = false;
    modeCards.hidden = true;
    statusPanel.hidden = false;
    statusDot.className = 'status-dot running';
    statusTitle.textContent = '正在运行中';
    btnOpenMain.hidden = false;
    btnStopService.hidden = false;
    btnRestartService.hidden = false;
    setSidebarStatus(true);
    startUptimeTicker(service);
  } else if (phase === 'stopped') {
    homeSubtitle.textContent = '服务已停止';
    homeHint.textContent = '可重新运行，或选择其他启动模式';
    homeHint.hidden = false;
    modeCards.hidden = false;
    statusPanel.hidden = false;
    statusDot.className = 'status-dot stopped';
    statusTitle.textContent = '服务已停止';
    statusDesc.textContent = '服务未在运行，点击「重新运行」可再次启动';
    btnOpenMain.hidden = true;
    btnStopService.hidden = true;
    btnRestartService.hidden = false;
    setSidebarStatus(false);
    stopUptimeTicker();
  } else {
    // mode：选择启动模式
    homeSubtitle.textContent = '选择启动模式，开始使用';
    homeHint.textContent = '请选择一种启动模式，本页面不会自动进入';
    homeHint.hidden = false;
    modeCards.hidden = false;
    statusPanel.hidden = true;
    setSidebarStatus(false);
    stopUptimeTicker();
  }
}

// ============ 模式选择 ============
function chooseMode(mode) {
  if (modeChosen) return;
  modeChosen = true;
  cardQuick.classList.add('disabled');
  cardSource.classList.add('disabled');
  cardRepair.classList.add('disabled');
  if (mode === 'quick') cardQuick.classList.add('selected');
  else if (mode === 'source') cardSource.classList.add('selected');
  else if (mode === 'repair') cardRepair.classList.add('selected');
  showScreen('progress');
  setPercent(0);
  window.dsh && window.dsh.selectMode(mode);
}

cardQuick.addEventListener('click', () => chooseMode('quick'));
cardSource.addEventListener('click', () => chooseMode('source'));
cardRepair.addEventListener('click', () => chooseMode('repair'));
cardQuick.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('quick'); });
cardSource.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('source'); });
cardRepair.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('repair'); });

// ============ 服务控制（首页控制台） ============
btnOpenMain.addEventListener('click', () => { if (window.dsh) window.dsh.showMain(); });

btnStopService.addEventListener('click', () => {
  if (!window.dsh) return;
  // 提示确认
  if (!window.confirm('确定要停止运行 DeepSeek Harness 服务吗？')) return;
  btnStopService.disabled = true;
  statusTitle.textContent = '正在停止...';
  window.dsh.stopService().then(() => { btnStopService.disabled = false; });
});

btnRestartService.addEventListener('click', () => {
  if (!window.dsh) return;
  showScreen('progress');
  setPercent(0);
  setIcon('');
  stageTextEl.textContent = '正在重新运行...';
  stageTagEl.textContent = STAGE_LABELS.init;
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
    parts.push('正在安装中...');
  } else if (op === 'uninstall') {
    parts.push('正在卸载中...');
  } else if (p.installed) {
    parts.push('已安装' + (p.version ? ' v' + p.version : ''));
    parts.push(p.bundled ? '已注册（重启服务后自动加载）' : '未注册 bundles');
    if (p.legacyInstalled) parts.push('旧包名安装，建议迁移到新包名');
  } else {
    parts.push('未安装');
  }
  status.textContent = parts.join(' · ');
  info.appendChild(name);
  info.appendChild(desc);
  info.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'plugin-rec-actions';
  const installBtn = document.createElement('button');
  installBtn.className = 'settings-btn primary';
  installBtn.dataset.action = 'install';
  // 旧包名已安装：按钮变为「迁移到新包名」（主进程会先卸载旧包再装新包）
  if (p.legacyInstalled) {
    installBtn.textContent = op === 'install' ? '安装中...' : '迁移到新包名';
    installBtn.classList.add('migrate');
  } else {
    installBtn.textContent = op === 'install' ? '安装中...' : '一键安装';
  }
  installBtn.hidden = (!!p.installed && op !== 'install') || op === 'uninstall';
  installBtn.disabled = !!op || pluginBusy;
  installBtn.addEventListener('click', () => doPluginInstall(p.pkg));
  const uninstallBtn = document.createElement('button');
  uninstallBtn.className = 'settings-btn';
  uninstallBtn.dataset.action = 'uninstall';
  uninstallBtn.textContent = op === 'uninstall' ? '卸载中...' : '卸载';
  uninstallBtn.hidden = (!p.installed && op !== 'uninstall') || op === 'install';
  uninstallBtn.disabled = !!op || pluginBusy;
  uninstallBtn.addEventListener('click', () => uninstallPkg(p.pkg));
  actions.appendChild(installBtn);
  actions.appendChild(uninstallBtn);

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
        pkg: '@feiyang666/deepseekharnessdesktop',
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
      empty.textContent = '暂无已安装插件';
      installedList.appendChild(empty);
      return;
    }
    for (const p of list) {
      const op = opFor(p);
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
        meta.textContent = '正在卸载中...';
      } else {
        meta.textContent = 'v' + (p.version || '?');
      }
      if (['@feiyang666/deepseekharnessdesktop', '@feiyang666/dsh-vault', '@feiyang666/deepseekharnessdesktop-vault'].includes(p.pkg)) {
        const rec = document.createElement('span');
        rec.className = 'installed-badge rec';
        rec.textContent = '推荐';
        meta.appendChild(rec);
      }
      if (p.bundled && op !== 'uninstall') {
        const b = document.createElement('span');
        b.className = 'installed-badge';
        b.textContent = '已注册';
        meta.appendChild(b);
      }
      info.appendChild(name);
      info.appendChild(meta);

      const btn = document.createElement('button');
      btn.className = 'settings-btn';
      btn.textContent = op === 'uninstall' ? '卸载中...' : '卸载';
      btn.disabled = !!op || pluginBusy;
      btn.addEventListener('click', () => uninstallPkg(p.pkg));

      item.appendChild(info);
      item.appendChild(btn);
      installedList.appendChild(item);
    }
  }).catch(() => {
    installedList.innerHTML = '<div class="installed-empty">插件列表加载失败</div>';
  });
}

// 安装推荐插件（pkg 缺省为 @feiyang666/deepseekharnessdesktop）
function doPluginInstall(pkg) {
  if (!window.dsh || !window.dsh.installPlugin) return;
  if (opFor({ pkg })) return; // 该插件已在安装/卸载中，忽略重复点击
  localBusy.set(pkg, 'install');
  refreshPluginLists();
  window.dsh.installPlugin(pkg).then(() => {
    localBusy.delete(pkg);
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
    showCustomNote('请先填写要安装的插件包名或安装命令', 'err');
    return;
  }
  setPluginBusy(true);
  showCustomNote('正在安装，请稍候（首次需从镜像下载依赖）...', '');
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

// 卸载指定插件（支持同时卸载多个不同插件，互不影响）
function uninstallPkg(pkg) {
  if (!window.dsh || !window.dsh.uninstallPlugin) return;
  if (opFor({ pkg })) return; // 该插件已在操作中
  if (!window.confirm('确定要卸载插件 ' + pkg + ' 吗？')) return;
  localBusy.set(pkg, 'uninstall');
  refreshPluginLists();
  window.dsh.uninstallPlugin(pkg).then(() => {
    localBusy.delete(pkg);
    refreshPluginLists();
  }).catch(() => {
    localBusy.delete(pkg);
    refreshPluginLists();
  });
}

pluginDefRefreshBtn.addEventListener('click', () => {
  loadPluginStatus();
  loadInstalledList();
});
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
  stageTagEl.textContent = STAGE_LABELS.init;
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
    badge.textContent = '官方';
    nameRow.appendChild(badge);
  }
  if (!p.installable) {
    const badge = document.createElement('span');
    badge.className = 'market-badge nodl';
    badge.textContent = '非 npm 包';
    nameRow.appendChild(badge);
  }

  const author = document.createElement('div');
  author.className = 'market-item-author';
  author.textContent = p.owner;

  const desc = document.createElement('div');
  desc.className = 'market-item-desc';
  desc.textContent = p.description || '（无描述）';

  const op = opFor(p);
  const meta = document.createElement('div');
  meta.className = 'market-item-meta';
  const metaParts = [];
  metaParts.push(`★ ${formatStars(p.stars)}`);
  if (p.language) metaParts.push(p.language);
  if (p.license) metaParts.push(p.license);
  if (op === 'install') metaParts.push('正在安装中...');
  else if (p.installed) metaParts.push('已安装 v' + (p.installedVersion || '?'));
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
    installing.textContent = '安装中...';
    installing.disabled = true;
    actions.appendChild(installing);
  } else if (p.installed) {
    const done = document.createElement('span');
    done.className = 'market-installed-label';
    done.textContent = '已安装';
    actions.appendChild(done);
  } else if (p.installable) {
    const install = document.createElement('button');
    install.className = 'btn btn-primary btn-sm';
    install.textContent = '安装';
    install.disabled = marketBusy;
    install.addEventListener('click', () => installMarketPlugin(p, install));
    actions.appendChild(install);
  }
  const open = document.createElement('button');
  open.className = 'btn btn-sm';
  open.textContent = '查看';
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
      marketEmpty.textContent = marketFailText((res && res.error) || '未知错误');
      marketTotal.textContent = '加载失败';
      marketPager.hidden = true;
      return;
    }
    marketTotalCount = res.total || res.list.length;
    marketTotal.textContent = `共 ${marketTotalCount} 个插件`;
    marketList.innerHTML = '';
    if (!res.list || res.list.length === 0) {
      marketEmpty.hidden = false;
      marketEmpty.textContent = '没有找到匹配的插件';
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
    marketEmpty.textContent = marketFailText('网络异常');
    marketTotal.textContent = '加载失败';
    marketPager.hidden = true;
  });
}

// 根据错误类型生成可读的市场加载失败提示
function marketFailText(errMsg) {
  const msg = String(errMsg || '未知错误');
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
navHome.addEventListener('click', () => showScreen('home'));
navPlugin.addEventListener('click', openPluginPage);
navMarket.addEventListener('click', openMarketPage);
navSettings.addEventListener('click', openSettings);

// ============ 设置页 ============
function openSettings() {
  showScreen('settings');
  loadSettings();
  loadDshVersionInfo();
  // 进入设置页自动检查更新
  if (window.dsh && window.dsh.checkUpdate) {
    window.dsh.checkUpdate();
  }
}

// ============ 界面主题（深色 / 浅色 / 跟随系统） ============
// 应用主题：在 <html> 上设置 data-theme，CSS 变量据此切换。
// theme 为档位（'dark' | 'light' | 'system'），resolved 为实际明暗（'dark' | 'light'）。
function applyTheme(resolvedTheme) {
  const t = resolvedTheme === 'light' ? 'light' : 'dark';
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
  applyTheme(resolved || theme);
  syncThemeButtons(theme || 'system');
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
  if (appTitleHome) appTitleHome.textContent = n;
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
        setDshVersion.textContent = '当前版本：v' + cfg.dshVersion;
      }
      if (cfg.theme) {
        applyThemeState(cfg.theme, cfg.themeResolved);
      }
      if (cfg.updateApiBase) {
        setUpdateBase.textContent = '更新服务：' + cfg.updateApiBase;
      }
      if (cfg.changelog) {
        setChangelog.innerHTML = renderMarkdown(cfg.changelog);
      } else {
        setChangelog.innerHTML = '<p>暂无更新日志</p>';
      }
    }
  }).catch(() => {
    setVersion.textContent = 'v1.0.0';
  });
}

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
      if (info && info.running) setDshVersion.textContent = '当前版本：v' + info.running;
      showDshNote('最新版本查询失败：' + ((info && info.error) || '未知错误') + '（检查网络后重试）', 'err');
      return;
    }
    const parts = [];
    if (info.running) parts.push('当前版本 v' + info.running);
    if (info.latest) parts.push('最新版本 v' + info.latest);
    setDshVersion.textContent = parts.length > 0 ? parts.join(' · ') : '当前版本：-';
    if (info.outdated) {
      showDshNote('发现新版本：停止运行后重新选择「快速启动」，npx 会自动下载并使用最新版', '');
    } else if (info.running && info.latest) {
      showDshNote('已是最新版本', 'ok');
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
  if (btnText === '安装更新' && window.dsh.installUpdate) {
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
    setUpdateStatus.textContent = '正在检查更新...';
    setUpdateHint.textContent = '';
    setUpdateInfo.hidden = true;
    setDownloadProgress.hidden = true;
  } else if (s === 'uptodate') {
    setUpdateStatus.textContent = '已是最新版本';
    setUpdateHint.textContent = '';
    setUpdateInfo.hidden = true;
  } else if (s === 'available') {
    setUpdateStatus.textContent = state.message || '发现新版本';
    setUpdateHint.textContent = '';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = true;
    setDownloadBtnText.textContent = '下载并安装';
    if (state.latest) {
      setNewVersion.textContent = state.latest.version;
      setNewNotes.innerHTML = renderMarkdown((state.latest.release_notes || '暂无更新日志') + '\n\n文件大小：' + formatSize(state.latest.file_size));
    }
  } else if (s === 'downloading') {
    setUpdateStatus.textContent = state.message || '正在下载...';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = false;
    setDownloadBtnText.textContent = '下载中...';
    setDownloadBtn.disabled = true;
    setDownloadFill.style.width = (state.percent || 0) + '%';
    setDownloadText.textContent = state.message || ((state.percent || 0) + '%');
  } else if (s === 'downloaded') {
    setUpdateStatus.textContent = '下载完成，可安装';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = false;
    setDownloadFill.style.width = '100%';
    setDownloadText.textContent = '100%';
    setDownloadBtnText.textContent = '安装更新';
    setDownloadBtn.disabled = false;
  } else if (s === 'installing') {
    setUpdateStatus.textContent = '正在启动安装程序...';
    setUpdateInfo.hidden = false;
    setDownloadProgress.hidden = true;
  } else if (s === 'error') {
    setUpdateStatus.textContent = state.message || '更新失败';
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
  umActionText.textContent = '下载并安装';
}

function hideUpdatePopup() {
  updateMask.hidden = true;
}

umLaterBtn.addEventListener('click', hideUpdatePopup);

umActionBtn.addEventListener('click', () => {
  if (!window.dsh) return;
  const label = umActionText.textContent;
  if (label === '安装更新' && window.dsh.installUpdate) {
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
      umNotes.innerHTML = renderMarkdown((state.latest.release_notes || '暂无更新日志') + '\n\n文件大小：' + formatSize(state.latest.file_size));
    }
    umProgress.hidden = true;
    umActionBtn.disabled = false;
    umActionText.textContent = '下载并安装';
    if (!autoUpdatePopupShown && settingsScreen.hidden) {
      autoUpdatePopupShown = true;
      showUpdatePopup();
    }
  } else if (s === 'downloading') {
    if (!updateMask.hidden) {
      umProgress.hidden = false;
      umActionBtn.disabled = true;
      umActionText.textContent = '下载中...';
      umFill.style.width = (state.percent || 0) + '%';
      umText.textContent = state.message || ((state.percent || 0) + '%');
    }
  } else if (s === 'downloaded') {
    if (!updateMask.hidden) {
      umProgress.hidden = false;
      umFill.style.width = '100%';
      umText.textContent = '100%';
      umActionBtn.disabled = false;
      umActionText.textContent = '安装更新';
    }
  } else if (s === 'error') {
    if (!updateMask.hidden) {
      umProgress.hidden = true;
      umActionBtn.disabled = false;
      umActionText.textContent = '重新下载';
    }
  }
}

// ============ 初始化 ============
if (!window.dsh) {
  setPercent(0);
  stageTextEl.textContent = '预加载脚本缺失，请重新安装应用';
  stageTagEl.textContent = STAGE_LABELS.error;
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

  // 主进程推送主题变化（控制面板 / 官方 UI / 系统深浅色切换时实时跟随）
  if (window.dsh.onThemeChanged) {
    window.dsh.onThemeChanged(({ theme, resolved }) => {
      applyThemeState(theme, resolved);
    });
  }

  // 阶段切换（mode / detect / install / start / running / stopped / error）
  window.dsh.onPhase(({ phase, service }) => {
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
    // 防御：新的进度事件到达时，清除之前残留的错误提示（避免"假失败"残留）
    if (stage !== 'error') {
      errorTip.hidden = true;
      footer.hidden = true;
    }
    setPercent(percent);
    if (text) stageTextEl.textContent = text;
    if (stage && STAGE_LABELS[stage]) stageTagEl.textContent = STAGE_LABELS[stage];
    if (stage === 'ready') setIcon('ok');
    if (detail) progressDetailEl.textContent = detail;
    else progressDetailEl.textContent = '';
    if (hint) progressHintEl.textContent = hint;
    else progressHintEl.textContent = '';
    if (step && step.total) {
      stepIndicator.hidden = false;
      stepPill.textContent = `步骤 ${step.index}/${step.total}`;
      stepTitle.textContent = step.title;
    }
  });

  // 命令行日志
  window.dsh.onLog((text) => appendLog(text));

  // 错误状态：提示用户选择修复
  window.dsh.onStatus(({ phase, message }) => {
    if (phase === 'error') {
      stopUptimeTicker();
      showScreen('progress'); // 无论当前在哪个页面，都切回进度页展示错误
      stageTagEl.textContent = STAGE_LABELS.error;
      stageTextEl.textContent = message || '启动失败';
      setIcon('err');
      footer.hidden = false;
      btnOpenNode.hidden = false;
      btnRepair.hidden = false;
      btnRetry.hidden = false;
      errorTip.hidden = false;
      errorTipText.textContent = message
        ? `启动失败：${message}\n建议点击「选择本地修复」，强力清除本地数据后重新启动。`
        : '启动失败。可点击「选择本地修复」强力清除本地数据后重新启动。';
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
        setDshVersion.textContent = '当前版本：v' + service.dshVersion;
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
      if (ev.pkg) localBusy.delete(ev.pkg);
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
      if (st.phase === 'running' && st.running) {
        renderHome('running', st);
        showScreen('home');
      } else if (st.phase === 'stopped') {
        renderHome('stopped');
        showScreen('home');
      } else {
        renderHome('mode');
        showScreen('home');
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
    stageTagEl.textContent = STAGE_LABELS.init;
    window.dsh.retry();
  });
  btnQuit.addEventListener('click', () => window.dsh.quit());
}
