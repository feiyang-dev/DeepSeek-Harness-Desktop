'use strict';

// ============ 元素引用 ============
const modeScreen = document.getElementById('modeScreen');
const progressScreen = document.getElementById('progressScreen');
const cardQuick = document.getElementById('cardQuick');
const cardSource = document.getElementById('cardSource');
const cardRepair = document.getElementById('cardRepair');
const countdownFill = document.getElementById('countdownFill');
const countdownNum = document.getElementById('countdownNum');

const percentEl = document.getElementById('percent');
const barFillEl = document.getElementById('barFill');
const stageTextEl = document.getElementById('stageText');
const stageTagEl = document.getElementById('stageTag');
const stageIconEl = document.getElementById('stageIcon');
const progressDetailEl = document.getElementById('progressDetail');
const progressHintEl = document.getElementById('progressHint');
const footer = document.getElementById('footer');
const btnOpenNode = document.getElementById('btnOpenNode');
const btnRetry = document.getElementById('btnRetry');
const btnQuit = document.getElementById('btnQuit');

// 日志面板
const logPanel = document.getElementById('logPanel');
const logHeader = document.getElementById('logHeader');
const logToggle = document.getElementById('logToggle');
const logBody = document.getElementById('logBody');
const logBadge = document.getElementById('logBadge');

// 关于弹窗
const aboutLink = document.getElementById('aboutLink');
const aboutMask = document.getElementById('aboutMask');
const aboutClose = document.getElementById('aboutClose');
const aboutOk = document.getElementById('aboutOk');
const aboutVersion = document.getElementById('aboutVersion');
const aboutChangelog = document.getElementById('aboutChangelog');
const tabIntro = document.getElementById('tabIntro');
const tabChangelog = document.getElementById('tabChangelog');
const panelIntro = document.getElementById('panelIntro');
const panelChangelog = document.getElementById('panelChangelog');

// preload.js 通过 contextBridge.exposeInMainWorld('dsh', ...) 暴露全局 window.dsh。
// 不要在此处再用 const dsh 声明，否则与全局词法环境的 dsh 冲突
// （报错 "Identifier 'dsh' has already been declared"）。统一用 window.dsh 访问。
let logCount = 0;
let logOpen = false;
let modeChosen = false;

const STAGE_LABELS = {
  init: '正在初始化',
  detect: '检测本地环境',
  install: '安装运行环境',
  start: '启动服务中',
  ready: '启动完成',
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

function showProgressScreen() {
  modeScreen.hidden = true;
  progressScreen.hidden = false;
}

function showModeScreen() {
  progressScreen.hidden = true;
  modeScreen.hidden = false;
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
  showProgressScreen();
  setPercent(0);
  window.dsh && window.dsh.selectMode(mode);
}

cardQuick.addEventListener('click', () => chooseMode('quick'));
cardSource.addEventListener('click', () => chooseMode('source'));
cardRepair.addEventListener('click', () => chooseMode('repair'));
cardQuick.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('quick'); });
cardSource.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('source'); });
cardRepair.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') chooseMode('repair'); });

// ============ 关于弹窗 ============
function switchAboutTab(name) {
  const intro = name === 'intro';
  panelIntro.hidden = !intro;
  panelChangelog.hidden = intro;
  tabIntro.classList.toggle('active', intro);
  tabChangelog.classList.toggle('active', !intro);
}

function openAbout() {
  switchAboutTab('intro');
  if (window.dsh && window.dsh.getAboutInfo) {
    window.dsh.getAboutInfo().then(({ version, changelog }) => {
      aboutVersion.textContent = 'v' + version;
      aboutChangelog.textContent = changelog || '暂无更新日志';
    }).catch(() => {
      aboutVersion.textContent = 'v1.0.0';
      aboutChangelog.textContent = '暂无更新日志';
    });
  }
  aboutMask.hidden = false;
}
function closeAbout() {
  aboutMask.hidden = true;
}
aboutLink.addEventListener('click', openAbout);
aboutClose.addEventListener('click', closeAbout);
aboutOk.addEventListener('click', closeAbout);
aboutMask.addEventListener('click', (e) => { if (e.target === aboutMask) closeAbout(); });
tabIntro.addEventListener('click', () => switchAboutTab('intro'));
tabChangelog.addEventListener('click', () => switchAboutTab('changelog'));

// ============ 初始化 ============
if (!window.dsh) {
  setPercent(0);
  stageTextEl.textContent = '预加载脚本缺失，请重新安装应用';
  stageTagEl.textContent = STAGE_LABELS.error;
  setIcon('err');
  showProgressScreen();
  footer.hidden = false;
  btnOpenNode.hidden = true;
  btnRetry.hidden = true;
} else {
  // 倒计时
  window.dsh.onModeCountdown(({ seconds }) => {
    const total = 15;
    countdownFill.style.width = (seconds / total) * 100 + '%';
    countdownNum.textContent = seconds + ' 秒';
  });

  // 阶段切换
  window.dsh.onPhase(({ phase }) => {
    if (phase === 'mode') {
      // 回到模式选择（重试时）
      modeChosen = false;
      cardQuick.classList.remove('selected', 'disabled');
      cardSource.classList.remove('selected', 'disabled');
      cardRepair.classList.remove('selected', 'disabled');
      logCount = 0;
      logBadge.textContent = '0';
      logBody.innerHTML = '<div class="log-hint">等待输出...</div>';
      countdownFill.style.width = '100%';
      countdownNum.textContent = '15 秒';
      showModeScreen();
    } else {
      showProgressScreen();
    }
  });

  // 进度事件（含实时细节 detail 与人性化提示 hint）
  window.dsh.onProgress(({ percent, stage, text, detail, hint }) => {
    setPercent(percent);
    if (text) stageTextEl.textContent = text;
    if (stage && STAGE_LABELS[stage]) stageTagEl.textContent = STAGE_LABELS[stage];
    if (stage === 'ready') setIcon('ok');
    // 实时细节
    if (detail) progressDetailEl.textContent = detail;
    else progressDetailEl.textContent = '';
    // 人性化提示
    if (hint) progressHintEl.textContent = hint;
    else progressHintEl.textContent = '';
  });

  // 命令行日志
  window.dsh.onLog((text) => appendLog(text));

  // 错误状态
  window.dsh.onStatus(({ phase, message }) => {
    if (phase === 'error') {
      stageTagEl.textContent = STAGE_LABELS.error;
      stageTextEl.textContent = message || '启动失败';
      setIcon('err');
      footer.hidden = false;
      btnOpenNode.hidden = false;
      btnRetry.hidden = false;
      // 自动展开日志面板，方便查看原因
      if (!logOpen) toggleLog();
    }
  });

  btnOpenNode.addEventListener('click', () => window.dsh.openExternal('https://nodejs.org/'));
  btnRetry.addEventListener('click', () => {
    footer.hidden = true;
    setPercent(0);
    setIcon('');
    stageTextEl.textContent = '正在重新开始...';
    stageTagEl.textContent = STAGE_LABELS.init;
    window.dsh.retry();
  });
  btnQuit.addEventListener('click', () => window.dsh.quit());
}
