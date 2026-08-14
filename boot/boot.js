'use strict';

// ============ 元素引用 ============
const homeScreen = document.getElementById('homeScreen');
const progressScreen = document.getElementById('progressScreen');
const pluginScreen = document.getElementById('pluginScreen');
const settingsScreen = document.getElementById('settingsScreen');
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
const homePluginBtn = document.getElementById('homePluginBtn');

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
const pluginBack = document.getElementById('pluginBack');
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
const settingsEntry = document.getElementById('settingsEntry');
const settingsBack = document.getElementById('settingsBack');
const setVersion = document.getElementById('setVersion');
const setAppName = document.getElementById('setAppName');
const setTagline = document.getElementById('setTagline');
const setChangelog = document.getElementById('setChangelog');
const setUpdateBase = document.getElementById('setUpdateBase');
const setNotifyToggle = document.getElementById('setNotifyToggle');
const themeDarkBtn = document.getElementById('themeDarkBtn');
const themeLightBtn = document.getElementById('themeLightBtn');
const setDevModeToggle = document.getElementById('setDevModeToggle');
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
  settingsScreen.hidden = name !== 'settings';
  if (name !== 'home') stopUptimeTicker();
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
  const tick = () => {
    const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    statusDesc.textContent = `服务运行于 http://127.0.0.1:${port} · 已运行 ${formatUptime(secs * 1000)}${devMode ? ' · 开发者模式' : ''}`;
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
    stopUptimeTicker();
  } else {
    // mode：选择启动模式
    homeSubtitle.textContent = '选择启动模式，开始使用';
    homeHint.textContent = '请选择一种启动模式，本页面不会自动进入';
    homeHint.hidden = false;
    modeCards.hidden = false;
    statusPanel.hidden = true;
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
function openPluginPage() {
  showScreen('plugin');
  resetCustomLog();
  loadPluginStatus();
  loadInstalledList();
}

// 打开插件管理页时重置命令行日志面板与提示
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

homePluginBtn.addEventListener('click', openPluginPage);
pluginBack.addEventListener('click', () => showScreen('home'));

function setPluginBusy(busy) {
  pluginBusy = busy;
  pluginDefRefreshBtn.disabled = busy;
  customInstallBtn.disabled = busy;
  // 推荐插件列表中的按钮
  recPluginList.querySelectorAll('.plugin-rec-actions .settings-btn').forEach((b) => {
    b.disabled = busy;
    if (b.dataset.action === 'install') b.textContent = busy ? '安装中...' : '一键安装';
    else if (b.dataset.action === 'uninstall') b.textContent = busy ? '卸载中...' : '卸载';
  });
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
  if (/错误|失败|Error|error/.test(text)) div.classList.add('err');
  div.textContent = text;
  customLogBody.appendChild(div);
  customLogBody.scrollTop = customLogBody.scrollHeight;
  customLogPanel.hidden = false; // 一旦有输出即显示日志面板
}

// 推荐插件图标（按包名区分）
function recIconFor(pkg) {
  if (pkg === '@feiyang666/deepseekharnessdesktop-vault') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}

// 渲染单个推荐插件条目
function buildRecItem(p) {
  const item = document.createElement('div');
  item.className = 'plugin-rec';

  const icon = document.createElement('div');
  icon.className = 'plugin-rec-icon' + (p.pkg === '@feiyang666/deepseekharnessdesktop-vault' ? ' vault' : '');
  icon.innerHTML = recIconFor(p.pkg);

  const info = document.createElement('div');
  info.className = 'plugin-rec-info';
  const name = document.createElement('div');
  name.className = 'plugin-rec-name';
  name.textContent = p.title || p.pkg;
  const desc = document.createElement('div');
  desc.className = 'plugin-rec-desc';
  desc.textContent = (p.desc ? p.desc + ' · ' : '') + p.pkg;
  const status = document.createElement('div');
  status.className = 'plugin-status';
  const parts = [];
  if (p.installed) {
    parts.push('已安装' + (p.version ? ' v' + p.version : ''));
    parts.push(p.bundled ? '已注册（重启服务后自动加载）' : '未注册 bundles');
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
  installBtn.textContent = '一键安装';
  installBtn.hidden = !!p.installed;
  installBtn.disabled = pluginBusy;
  installBtn.addEventListener('click', () => doPluginInstall(p.pkg));
  const uninstallBtn = document.createElement('button');
  uninstallBtn.className = 'settings-btn';
  uninstallBtn.dataset.action = 'uninstall';
  uninstallBtn.textContent = '卸载';
  uninstallBtn.hidden = !p.installed;
  uninstallBtn.disabled = pluginBusy;
  uninstallBtn.addEventListener('click', () => uninstallPkg(p.pkg, uninstallBtn));
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
      const item = document.createElement('div');
      item.className = 'installed-item';

      const info = document.createElement('div');
      info.className = 'installed-info';
      const name = document.createElement('div');
      name.className = 'installed-name';
      name.textContent = p.pkg;
      const meta = document.createElement('div');
      meta.className = 'installed-meta';
      meta.textContent = 'v' + (p.version || '?');
      if (['@feiyang666/deepseekharnessdesktop', '@feiyang666/deepseekharnessdesktop-vault'].includes(p.pkg)) {
        const rec = document.createElement('span');
        rec.className = 'installed-badge rec';
        rec.textContent = '推荐';
        meta.appendChild(rec);
      }
      if (p.bundled) {
        const b = document.createElement('span');
        b.className = 'installed-badge';
        b.textContent = '已注册';
        meta.appendChild(b);
      }
      info.appendChild(name);
      info.appendChild(meta);

      const btn = document.createElement('button');
      btn.className = 'settings-btn';
      btn.textContent = '卸载';
      btn.disabled = pluginBusy;
      btn.addEventListener('click', () => uninstallPkg(p.pkg, btn));

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
  if (pluginBusy || !window.dsh || !window.dsh.installPlugin) return;
  setPluginBusy(true);
  window.dsh.installPlugin(pkg).then(() => setPluginBusy(false));
}

// 自定义安装
function doCustomInstall() {
  if (pluginBusy || !window.dsh || !window.dsh.installCustomPlugin) return;
  const val = customPkgInput.value.trim();
  if (!val) {
    showCustomNote('请先填写要安装的插件包名或安装命令', 'err');
    return;
  }
  setPluginBusy(true);
  showCustomNote('正在安装，请稍候（首次需从镜像下载依赖）...', '');
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
    loadPluginStatus();
    loadInstalledList();
  }).catch((e) => {
    setPluginBusy(false);
    showCustomNote('安装异常：' + String((e && e.message) || e), 'err');
  });
}

// 卸载指定插件
function uninstallPkg(pkg, btn) {
  if (pluginBusy || !window.dsh || !window.dsh.uninstallPlugin) return;
  if (!window.confirm('确定要卸载插件 ' + pkg + ' 吗？')) return;
  setPluginBusy(true);
  if (btn) btn.disabled = true;
  window.dsh.uninstallPlugin(pkg).then(() => {
    setPluginBusy(false);
    loadPluginStatus();
    loadInstalledList();
  }).catch(() => {
    setPluginBusy(false);
    loadPluginStatus();
    loadInstalledList();
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

// ============ 设置页 ============
function openSettings() {
  showScreen('settings');
  loadSettings();
  // 进入设置页自动检查更新
  if (window.dsh && window.dsh.checkUpdate) {
    window.dsh.checkUpdate();
  }
}

function closeSettings() {
  showScreen('home');
}

settingsEntry.addEventListener('click', openSettings);
settingsBack.addEventListener('click', closeSettings);

// ============ 界面主题（深色 / 浅色） ============
// 应用主题：在 <html> 上设置 data-theme，CSS 变量据此切换
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  syncThemeButtons(t);
}

// 同步主题切换按钮高亮状态
function syncThemeButtons(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  if (themeDarkBtn) themeDarkBtn.classList.toggle('active', t === 'dark');
  if (themeLightBtn) themeLightBtn.classList.toggle('active', t === 'light');
}

// 主题切换按钮：点击即切换并持久化
function setupThemeControls() {
  if (themeDarkBtn) {
    themeDarkBtn.addEventListener('click', () => setTheme('dark'));
  }
  if (themeLightBtn) {
    themeLightBtn.addEventListener('click', () => setTheme('light'));
  }
}

function setTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  applyTheme(t);
  if (window.dsh && window.dsh.setTheme) {
    window.dsh.setTheme(t);
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
      setNotifyToggle.checked = !!cfg.notifications;
      setDevModeToggle.checked = !!cfg.developerMode;
      if (cfg.theme) {
        applyTheme(cfg.theme);
      }
      if (cfg.updateApiBase) {
        setUpdateBase.textContent = '更新服务：' + cfg.updateApiBase;
      }
      if (cfg.changelog) {
        setChangelog.textContent = cfg.changelog;
      } else {
        setChangelog.textContent = '暂无更新日志';
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
      setNewNotes.textContent = (state.latest.release_notes || '暂无更新日志') + '\n\n文件大小：' + formatSize(state.latest.file_size);
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
      umNotes.textContent = (state.latest.release_notes || '暂无更新日志') + '\n\n文件大小：' + formatSize(state.latest.file_size);
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

  // 插件安装/卸载事件（主进程推送的进度与结果）
  window.dsh.onPluginEvent((ev) => {
    if (!ev) return;
    if (ev.stage === 'log') {
      // 安装/卸载过程的命令行输出 → 统一显示在「自定义安装」卡片的命令行日志面板
      appendCustomLog(ev.message || '');
      return;
    }
    if (ev.stage === 'installing' || ev.stage === 'uninstalling') {
      setPluginBusy(true);
      restartHintCard.hidden = true;
      showCustomNote(ev.message || '', '');
    } else if (ev.stage === 'done') {
      setPluginBusy(false);
      showCustomNote((ev.message || '完成') + '，点击下方「立即重启服务」即可生效。', 'ok');
      restartHintCard.hidden = false; // 安装/卸载完成 → 提示"立即重启"
      loadPluginStatus();
      loadInstalledList();
    } else if (ev.stage === 'error') {
      setPluginBusy(false);
      showCustomNote(ev.message || '操作失败', 'err');
      loadPluginStatus();
      loadInstalledList();
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
