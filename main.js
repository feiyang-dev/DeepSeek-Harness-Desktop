'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
const { spawn, execFile } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

// ============================================================
//  全局状态
// ============================================================
const isWin = process.platform === 'win32';
const DEFAULT_PORT = 3080;
const PKG_NAME = '@deepseek-ai/dsh';
const REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness.git';
const MODE_TIMEOUT_MS = 15000; // 模式选择超时：15 秒自动选快速启动

let port = DEFAULT_PORT;
let host = '127.0.0.1';

let bootWindow = null;   // 启动引导窗口
let mainWindow = null;   // 主窗口
let tray = null;
let serverProc = null;          // dsh 服务进程
let serverSpawnedByUs = false;
let quitting = false;
let bootPhase = 'init';         // mode / detect / install / start / ready / error
let selectedMode = null;        // 'quick' | 'source'
let modeTimer = null;
let portCleanupDone = false;    // 启动时端口清理是否完成

// ============================================================
//  IPC：进度 & 状态 & 日志
// ============================================================
function broadcast(channel, payload) {
  if (bootWindow && !bootWindow.isDestroyed()) {
    bootWindow.webContents.send(channel, payload);
  }
}

function setProgress(percent, stage, text, detail, hint) {
  bootPhase = stage;
  broadcast('boot:progress', {
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    stage,
    text,
    detail: detail || '',
    hint: hint || '',
  });
}

// 平滑推进进度：每调用一次在 [from, to] 内递增，避免卡在固定百分比
// detail 用于实时展示（如"已下载 3/180 个包"），hint 用于解释为什么慢
const _tickState = { percent: 30 };
function tickProgress(from, to, step, text, detail, hint) {
  if (_tickState.percent < from || _tickState.percent >= to) {
    _tickState.percent = from;
  }
  _tickState.percent = Math.min(_tickState.percent + step, to);
  broadcast('boot:progress', {
    percent: Math.round(_tickState.percent),
    stage: 'install',
    text,
    detail: detail || '',
    hint: hint || '',
  });
}

function logLine(line) {
  const text = typeof line === 'string' ? line : String(line);
  broadcast('boot:log', text);
  process.stderr.write('[dsh] ' + text + '\n');
}

function bootError(message) {
  bootPhase = 'error';
  logLine(`[错误] ${message}`);
  broadcast('boot:status', { phase: 'error', message });
}

// ============================================================
//  端口 / 就绪检测
// ============================================================
function isPortOpen(checkPort) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 1500);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once('error', () => { clearTimeout(timer); resolve(false); });
    socket.connect(checkPort, host);
  });
}

function isWebReady(checkPort) {
  return new Promise((resolve) => {
    const req = http.get({ host, port: checkPort, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function waitForWebReady(checkPort, timeoutMs, onTick) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isWebReady(checkPort)) return true;
    onTick && onTick();
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

// ============================================================
//  工具函数
// ============================================================
// 应用图标：按需加载不同尺寸的 PNG（托盘用 32，窗口用 256）
const ICON_DIR = path.join(__dirname, 'assets');
function appIcon(size) {
  const file = size ? path.join(ICON_DIR, `icon-${size}.png`) : path.join(ICON_DIR, 'icon.png');
  return nativeImage.createFromPath(file);
}

function which(cmd) {
  return new Promise((resolve) => {
    execFile(isWin ? 'where' : 'which', [cmd], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const line = String(stdout).trim().split(/\r?\n/)[0];
      resolve(line || null);
    });
  });
}

async function findNodeExe() {
  return which('node');
}

async function findNpmCli() {
  const nodeExe = await findNodeExe();
  if (!nodeExe) return null;
  const nodeDir = path.dirname(nodeExe);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const npmCmd = await which('npm');
  if (npmCmd) {
    const c2 = path.join(path.dirname(npmCmd), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(c2)) return c2;
  }
  return null;
}

async function findNpmPrefix() {
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  if (!nodeExe || !npmCli) return null;
  const r = await runCommand(nodeExe, [npmCli, 'prefix', '-g'], null, () => {});
  const prefix = String(r.out).trim().split(/\r?\n/).pop().trim();
  return prefix || null;
}

function dshBinPath(prefix) {
  return prefix ? path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js') : null;
}

// 通用子进程执行器：转发原始输出到日志面板，并返回 { code, out }
function runCommand(exe, args, opts, onOut) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(opts || {}),
    });
    let out = '';
    const onData = (d) => {
      const s = String(d);
      out += s;
      if (onOut) onOut(s);
      else logLine(s.replace(/\r?\n$/, ''));
    };
    child.stdout && child.stdout.on('data', onData);
    child.stderr && child.stderr.on('data', onData);
    child.on('error', (err) => resolve({ code: -1, out, error: err.message }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

// ============================================================
//  模式选择
// ============================================================
function startModeCountdown() {
  const total = MODE_TIMEOUT_MS / 1000;
  let left = total;
  broadcast('boot:mode-countdown', { seconds: left });
  modeTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(modeTimer);
      modeTimer = null;
      // 超时自动选快速启动
      selectMode('quick');
    } else {
      broadcast('boot:mode-countdown', { seconds: left });
    }
  }, 1000);
}

function selectMode(mode) {
  if (selectedMode) return; // 已选过
  selectedMode = mode;
  if (modeTimer) { clearInterval(modeTimer); modeTimer = null; }
  logLine(`[模式] 用户选择：${mode === 'quick' ? '快速启动（npx）' : mode === 'repair' ? '本地修复' : '源码完整安装'}`);
  run();
}

// ============================================================
//  快速启动流程（npx / 全局 dsh）
// ============================================================

// 终止所有与 dsh 相关的 node/npm 进程，防止 EPERM 文件占用。
// 用 PowerShell CIM 查询（对长命令行更可靠），再 taskkill。
async function killDshNodeProcesses() {
  return new Promise((resolve) => {
    if (!isWin) { resolve(); return; }
    const ps = `
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match '@deepseek-ai[\\\\/]dsh' -or
  $_.CommandLine -match 'dsh[\\\\/]lib[\\\\/]bin' -or
  $_.CommandLine -match 'npm-cli\\.js.{0,20}install -g' -or
  $_.CommandLine -match 'bin\\.ts web'
}
foreach ($p in $procs) { Write-Output $p.ProcessId }
`;
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(); return; }
      const pids = String(stdout).split(/\r?\n/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0 && n !== process.pid);
      if (pids.length === 0) { resolve(); return; }
      logLine('[诊断] killDshNodeProcesses 将终止: ' + pids.join(','));
      const kills = pids.map((pid) => new Promise((res) => {
        execFile('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true }, () => res());
      }));
      Promise.all(kills).then(() => resolve());
    });
  });
}

// 清理全局残留的 @deepseek-ai/dsh 目录（防止 npm 安装时 EPERM）
async function cleanupGlobalDsh(prefix) {
  if (!prefix) return;
  const dshDir = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh');
  if (!fs.existsSync(dshDir)) return;

  // 先终止占用它的进程（残留 npm install / 运行中的 dsh 服务）
  setProgress(22, 'install', '正在清理旧版安装残留...');
  await killDshNodeProcesses();
  await killProcessOnPort(port);
  await new Promise((r) => setTimeout(r, 500));

  // 用 PowerShell Remove-Item 删除（对长路径/文件占用更可靠）
  const psCmd = `Remove-Item -LiteralPath '${dshDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`;
  await new Promise((res) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true, timeout: 30000 }, () => res());
  });

  if (fs.existsSync(dshDir)) {
    logLine('[警告] 残留目录清理不完整，可能仍有进程占用');
  } else {
    logLine('[清理] 已删除旧的全局 dsh 目录');
  }
}

async function quickInstall(nodeExe, npmCli, prefix) {
  // 安装前清理旧残留（防止 EPERM）
  await cleanupGlobalDsh(prefix);
  setProgress(25, 'install', '正在下载并安装 DeepSeek Harness，请稍候...');
  const env = {
    ...process.env,
    npm_config_ignore_scripts: 'true',
    npm_config_progress: 'true',
    NPM_CONFIG_LOGLEVEL: 'info',
  };
  const args = ['install', '-g', PKG_NAME, '--no-audit', '--no-fund'];
  let fetchCount = 0;         // 已处理的下载/缓存行数
  let lastStage = 'fetch';    // fetch / extract / reify
  let lastTick = Date.now();
  // 兜底提示：长时间无进展时提醒用户"仍在工作"
  let stallWarn = false;
  const stallTimer = setInterval(() => {
    if (stallWarn) return;
    stallWarn = true;
    broadcast('boot:progress', {
      percent: Math.min(_tickState.percent + 1, 88),
      stage: 'install',
      text: '网络较慢，正在耐心下载依赖包...',
      detail: `已处理 ${fetchCount} 个包`,
      hint: '首次安装需下载约 200 个依赖包，取决于网络速度。若长时间不动，请检查网络。',
    });
  }, 60000); // 60 秒无进展则提示
  const r = await runCommand(nodeExe, [npmCli, ...args], { env }, (s) => {
    const now = Date.now();
    const throttled = now - lastTick >= 300; // 进度条最多每 300ms 刷新一次
    if (/npm http fetch|npm http cache|GET.*200|downloading/i.test(s)) {
      if (lastStage !== 'fetch') { lastStage = 'fetch'; fetchCount = 0; }
      fetchCount += 1;
      if (throttled) {
        lastTick = now;
        tickProgress(30, 55, 0.5, '正在从镜像源下载依赖包...',
          `已处理 ${fetchCount} 个依赖包`, '首次安装需下载约 200 个包，视网络而定，请耐心等待');
      }
      return;
    }
    if (/extract|inflight|loading.*node_modules/i.test(s)) {
      if (lastStage !== 'extract') { lastStage = 'extract'; fetchCount = 0; }
      if (throttled) {
        lastTick = now;
        tickProgress(55, 72, 0.7, '正在解压安装依赖...',
          '正在写入到全局目录', '解压 200 多个包通常很快，请稍候');
      }
      return;
    }
    if (/reify|added \d+/i.test(s)) {
      if (lastStage !== 'reify') { lastStage = 'reify'; fetchCount = 0; }
      if (throttled) {
        lastTick = now;
        tickProgress(72, 88, 0.9, '正在安装配置插件...',
          '正在链接依赖', '正在做最后的安装配置，马上就好');
      }
      return;
    }
    // 关键行（错误、警告、汇总）才进日志
    if (/error|ERR|warn|WARN|added \d+|up to date|changed \d+/i.test(s)) {
      logLine(s.replace(/\r?\n$/, ''));
    }
  });
  clearInterval(stallTimer);
  if (r.code !== 0) {
    // 识别 EPERM 权限问题，给出人性化提示
    if (/EPERM|EACCES|operation not permitted/i.test(r.out)) {
      return { ok: false, error: '安装时遇到文件占用（权限不足）。请先关闭杀毒软件/安全卫士的实时防护，或右键以管理员身份运行本程序后再试。', code: 'EPERM' };
    }
    if (/EAI_AGAIN|ENOTFOUND|ECONNREFUSED|network|fetch failed/i.test(r.out)) {
      return { ok: false, error: '网络连接失败。请检查网络/代理设置后重试。', code: 'NETWORK' };
    }
    return { ok: false, error: r.error || `npm install 退出码 ${r.code}` };
  }
  setProgress(90, 'install', '安装完成');
  return { ok: true };
}

// ============================================================
//  本地修复流程（清除全局安装并重新安装）
// ============================================================
async function repairInstall(nodeExe, npmCli, prefix) {
  const env = {
    ...process.env,
    npm_config_ignore_scripts: 'true',
    npm_config_progress: 'true',
    NPM_CONFIG_LOGLEVEL: 'info',
  };

  // 1) 停止可能正在运行的 dsh 服务（本 App 启动的 + 端口上残留的旧服务）
  setProgress(10, 'install', '正在停止正在运行的 dsh 服务...');
  if (serverProc) {
    await stopWebService();
  }
  await killProcessOnPort(port);

  // 2) 卸载全局 dsh
  setProgress(20, 'install', '正在卸载旧版 DeepSeek Harness...');
  const unR = await runCommand(nodeExe, [npmCli, 'uninstall', '-g', PKG_NAME], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
  if (unR.code !== 0 && unR.out.indexOf('not installed') === -1) {
    logLine(`[警告] 卸载返回码 ${unR.code}，继续清理残留...`);
  }

  // 3) 清理残留目录（若存在）——强化：终止进程 + 重试删除
  setProgress(30, 'install', '正在清除残留文件...');
  await cleanupGlobalDsh(prefix);

  // 4) 重新安装（进度平滑推进，与 quickInstall 相同的体验）
  setProgress(40, 'install', '正在重新安装 DeepSeek Harness...');
  let fetchCount = 0;
  let lastStage = 'fetch';
  let lastTick = Date.now();
  const inst = await runCommand(nodeExe, [npmCli, 'install', '-g', PKG_NAME, '--no-audit', '--no-fund'], { env }, (s) => {
    const now = Date.now();
    const throttled = now - lastTick >= 300;
    if (/npm http fetch|npm http cache|GET.*200|downloading/i.test(s)) {
      if (lastStage !== 'fetch') { lastStage = 'fetch'; fetchCount = 0; }
      fetchCount += 1;
      if (throttled) { lastTick = now; tickProgress(45, 60, 0.5, '正在从镜像源下载依赖包...'); }
      return;
    }
    if (/extract|inflight|loading.*node_modules/i.test(s)) {
      if (lastStage !== 'extract') { lastStage = 'extract'; fetchCount = 0; }
      if (throttled) { lastTick = now; tickProgress(60, 75, 0.7, '正在解压安装依赖...'); }
      return;
    }
    if (/reify|added \d+/i.test(s)) {
      if (lastStage !== 'reify') { lastStage = 'reify'; fetchCount = 0; }
      if (throttled) { lastTick = now; tickProgress(75, 88, 0.9, '正在安装配置插件...'); }
      return;
    }
    if (/error|ERR|warn|WARN|added \d+|up to date|changed \d+/i.test(s)) {
      logLine(s.replace(/\r?\n$/, ''));
    }
  });
  if (inst.code !== 0) {
    if (/EPERM|EACCES|operation not permitted/i.test(inst.out)) {
      return { ok: false, error: '修复时遇到文件占用（权限不足）。请先关闭杀毒软件/安全卫士的实时防护，或右键以管理员身份运行本程序后再试。', code: 'EPERM' };
    }
    if (/EAI_AGAIN|ENOTFOUND|ECONNREFUSED|network|fetch failed/i.test(inst.out)) {
      return { ok: false, error: '网络连接失败。请检查网络/代理设置后重试。', code: 'NETWORK' };
    }
    return { ok: false, error: inst.error || `重新安装退出码 ${inst.code}` };
  }
  setProgress(90, 'install', '修复完成');
  return { ok: true };
}

// ============================================================
//  源码完整安装流程（git clone + pnpm + build）
// ============================================================
const SOURCE_DIR_NAME = 'deepseek-harness';
function sourceRepoPath() {
  // 安装到用户数据目录下，避免污染工作区
  return path.join(app.getPath('userData'), SOURCE_DIR_NAME);
}

async function sourceInstall(nodeExe) {
  // 1) 检测 git / pnpm
  setProgress(30, 'install', '正在检测 git 与 pnpm...');
  const gitPath = await which('git');
  if (!gitPath) {
    return { ok: false, error: '未检测到 git，请先安装 https://git-scm.com/' };
  }
  logLine(`[检测] git: ${gitPath}`);

  // pnpm 优先用 npm 全局的 pnpm-cli.js 直跑（避免 .cmd 弹窗）
  let pnpmCli = null;
  const npmCli = await findNpmCli();
  const prefix = await findNpmPrefix();
  if (prefix) {
    const cand = path.join(prefix, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (fs.existsSync(cand)) pnpmCli = cand;
  }
  if (!pnpmCli) {
    const pnpmPath = await which('pnpm');
    if (pnpmPath) {
      // pnpm.cmd -> node_modules/pnpm/bin/pnpm.cjs
      const d = path.dirname(pnpmPath);
      const cand = path.join(d, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
      if (fs.existsSync(cand)) pnpmCli = cand;
    }
  }
  if (!pnpmCli) {
    // 没装 pnpm：用 npm 安装
    setProgress(35, 'install', '未检测到 pnpm，正在安装 pnpm...');
    const env = { ...process.env, npm_config_ignore_scripts: 'true' };
    const r = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
    if (r.code !== 0) {
      return { ok: false, error: 'pnpm 安装失败，请手动安装后重试' };
    }
    const newPrefix = await findNpmPrefix();
    pnpmCli = newPrefix ? path.join(newPrefix, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs') : null;
    if (!pnpmCli || !fs.existsSync(pnpmCli)) {
      return { ok: false, error: 'pnpm 安装完成但找不到 pnpm.cjs 入口' };
    }
  }
  logLine(`[检测] pnpm: ${pnpmCli}`);

  // 2) clone 仓库
  const repoPath = sourceRepoPath();
  if (!fs.existsSync(path.join(repoPath, 'package.json'))) {
    setProgress(40, 'install', '正在克隆 deepseek-harness 源码仓库...',
      '从 GitHub 拉取完整项目源码', '仓库含约 1000 个文件，取决于网络速度，请耐心等待');
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const r = await runCommand('git', ['clone', '--progress', REPO_URL, repoPath], {}, (s) => {
      // git 进度行（Receiving objects: 45%）驱动进度
      const m = s.match(/Receiving objects:\s+(\d+)%/i);
      if (m) setProgress(40 + Number(m[1]) * 0.12, 'install', '正在克隆源码仓库...',
        `已接收 ${m[1]}%`, '仓库约 1000 个文件，取决于网络速度');
      else if (/error|fatal|失败|Error/i.test(s)) logLine(s.replace(/\r?\n$/, ''));
    });
    if (r.code !== 0) {
      return { ok: false, error: 'git clone 失败，请检查网络（可配置代理）后重试' };
    }
  } else {
    setProgress(40, 'install', '检测到源码仓库已存在，跳过 clone');
    logLine('[源码] 仓库已存在，跳过 clone');
  }

  // 3) pnpm install --ignore-scripts（跳过 koffi 编译，同 start-web.bat）
  setProgress(55, 'install', '正在安装依赖（pnpm install）...',
    '从镜像源拉取全部依赖包', '源码模式依赖多，首次安装约需几分钟，请耐心等待');
  logLine('[源码] pnpm install --ignore-scripts');
  const installEnv = {
    ...process.env,
    npm_config_ignore_scripts: 'true',
    npm_config_progress: 'true',
    NPM_CONFIG_LOGLEVEL: 'info',
  };
  const r1 = await runCommand(nodeExe, [pnpmCli, 'install', '--reporter=append-only', '--ignore-scripts'], { cwd: repoPath, env: installEnv }, (s) => {
    if (/error|ERR|failed|失败|WARN/i.test(s)) logLine(s.replace(/\r?\n$/, ''));
  });
  if (r1.code !== 0) {
    return { ok: false, error: 'pnpm install 失败，请查看日志' };
  }

  // 4) build
  setProgress(75, 'install', '正在构建项目（pnpm run build）...',
    '正在编译并打包全部模块', '构建可能需要几分钟，这是源码模式最耗时的步骤');
  logLine('[源码] pnpm run build（可能需要几分钟）');
  const r2 = await runCommand(nodeExe, [pnpmCli, 'run', 'build'], { cwd: repoPath, env: installEnv }, (s) => {
    if (/error|ERR|failed|失败|Error|Built|done/i.test(s)) logLine(s.replace(/\r?\n$/, ''));
  });
  if (r2.code !== 0) {
    return { ok: false, error: 'pnpm run build 失败，请查看日志' };
  }
  setProgress(90, 'install', '源码安装完成');
  return { ok: true, repoPath };
}

// 源码模式启动：node --import tsx/esm apps/cli/src/bin.ts web
function sourceStartWeb(repoPath, nodeExe) {
  const binEntry = path.join(repoPath, 'apps', 'cli', 'src', 'bin.ts');
  const args = ['--import', 'tsx/esm', binEntry, 'web', '--host', host, '--port', String(port)];
  const child = spawn(nodeExe, args, {
    cwd: repoPath,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanServiceEnv(),
  });
  serverProc = child;
  serverSpawnedByUs = true;
  child.stdout && child.stdout.on('data', (d) => {
    const s = String(d);
    logLine(s.replace(/\r?\n$/, ''));
    if (/listening|http:\/\/|Local:/.test(s)) setProgress(96, 'start', '服务已启动，正在打开界面...');
  });
  child.stderr && child.stderr.on('data', (d) => logLine(String(d).replace(/\r?\n$/, '')));
  child.on('error', (err) => { logLine(`[错误] 服务启动失败: ${err.message}`); });
  child.on('exit', (code, signal) => {
    if (!quitting) bootError(`dsh 服务异常退出 (code=${code})`);
    serverProc = null;
  });
}

// 构建干净的服务环境变量：剥离可能污染 Node 子进程的变量（IDE 注入、Electron 相关）
function cleanServiceEnv() {
  const env = { ...process.env };
  // 移除可能干扰子进程的变量
  delete env.NODE_OPTIONS;            // CodeBuddy/IDE 注入的 --require
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_IS_DEV;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  delete env.npm_config_ignore_scripts; // 服务运行不需要跳过脚本
  // 确保 PATH 可用
  if (!env.PATH) env.PATH = process.env.Path || process.env.PATH;
  return env;
}

// 快速模式启动：node <global>/node_modules/@deepseek-ai/dsh/lib/bin.js web
function quickStartWeb(nodeExe, binPath) {
  const args = ['web', '--host', host, '--port', String(port)];
  const child = spawn(nodeExe, [binPath, ...args], {
    cwd: app.getPath('userData'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanServiceEnv(),
  });
  serverProc = child;
  serverSpawnedByUs = true;
  let started = false;
  child.stdout && child.stdout.on('data', (d) => {
    const s = String(d);
    logLine(s.replace(/\r?\n$/, ''));
    if (/listening|http:\/\/|Local:/.test(s)) {
      started = true;
      setProgress(96, 'start', '服务已启动，正在打开界面...');
    }
  });
  child.stderr && child.stderr.on('data', (d) => {
    logLine(String(d).replace(/\r?\n$/, ''));
  });
  child.on('error', (err) => { logLine(`[错误] 服务启动失败: ${err.message}`); });
  child.on('exit', (code, signal) => {
    if (!quitting) {
      if (started) {
        logLine(`[诊断] 服务曾成功启动，但后来退出 (code=${code}, signal=${signal})`);
        bootError(`dsh 服务启动后退出 (code=${code})，请查看日志`);
      } else {
        logLine(`[诊断] 服务未输出就绪信息即退出 (code=${code}, signal=${signal})`);
        bootError(`dsh 服务启动失败 (code=${code})，请查看日志`);
      }
    }
    serverProc = null;
  });
}

async function stopWebService() {
  if (!serverProc || !serverSpawnedByUs) return;
  try {
    if (isWin) {
      await new Promise((res) => {
        execFile('taskkill', ['/pid', String(serverProc.pid), '/t', '/f'], { windowsHide: true }, () => res());
      });
    } else {
      serverProc.kill('SIGTERM');
    }
  } catch (e) { /* ignore */ }
  serverProc = null;
  serverSpawnedByUs = false;
}

// 统一退出流程：停止服务 → 退出 App
async function quitApp() {
  if (quitting) return;
  quitting = true;
  await stopWebService();
  app.quit();
}

// 终止占用指定端口的进程（启动前清理旧服务，保证干净启动）
async function killProcessOnPort(checkPort) {
  return new Promise((resolve) => {
    if (!isWin) { resolve(false); return; }
    execFile('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true }, (err, stdout) => {
      if (err) { resolve(false); return; }
      const lines = String(stdout).split(/\r?\n/);
      const pids = new Set();
      for (const line of lines) {
        // 匹配形如 "  TCP    127.0.0.1:3080    0.0.0.0:0    LISTENING    19220"
        // 或 IPv6 "  TCP    [::]:3080    0.0.0.0:0    LISTENING    19220"
        const m = line.match(/TCP\s+(?:\[[0-9a-f:.]+\]|\S+):(\d+)\s+\S+\s+(?:LISTENING|ESTABLISHED)\s+(\d+)\s*$/i);
        if (m && Number(m[1]) === checkPort) pids.add(Number(m[2]));
      }
      if (pids.size === 0) { resolve(false); return; }
      logLine('[诊断] killProcessOnPort 将终止端口 ' + checkPort + ' 的进程: ' + [...pids].join(','));
      const killAll = [...pids].map((pid) => new Promise((res) => {
        execFile('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true }, () => res());
      }));
      Promise.all(killAll).then(() => resolve(true));
    });
  });
}

// 启动时立刻终结占用端口的旧服务（App 启动瞬间执行，不依赖模式选择）
async function cleanupOldService() {
  logLine('[启动] 正在检测端口 ' + port + ' 上的旧服务...');
  if (await isPortOpen(port)) {
    // 先停掉由本 App 启动的服务进程
    if (serverProc) await stopWebService();
    // 再强制终止端口上残留的进程（可能是用户手动 npx 启动的旧服务）
    const killed = await killProcessOnPort(port);
    if (killed) logLine('[启动] 已停止旧服务进程');
    // 等待端口完全释放
    for (let i = 0; i < 20; i++) {
      if (!(await isPortOpen(port))) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    logLine('[启动] 端口已释放');
  } else {
    logLine('[启动] 端口空闲，无需清理');
  }
  portCleanupDone = true;
}

// 主流程
async function run() {
  // 首次进入：先显示模式选择
  if (!selectedMode) {
    bootPhase = 'mode';
    broadcast('boot:phase', { phase: 'mode' });
    startModeCountdown();
    return;
  }

  // 解析 --port（仅命令行参数，界面选择不涉及）
  const cliArgs = process.argv.slice(1);
  const portIdx = cliArgs.findIndex((a) => a === '--port');
  if (portIdx >= 0 && cliArgs[portIdx + 1]) {
    const p = parseInt(cliArgs[portIdx + 1], 10);
    if (!Number.isNaN(p)) port = p;
  }

  // 0) 等待启动瞬间的端口清理完成（保证端口已释放再继续）
  setProgress(4, 'detect', '正在等待清理旧服务...');
  for (let i = 0; i < 30 && !portCleanupDone; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!portCleanupDone) logLine('[启动] 端口清理超时，继续尝试');

  // 1) 环境检测
  setProgress(8, 'detect', '正在检测 Node.js 运行环境...');
  const nodeExe = await findNodeExe();
  if (!nodeExe) {
    bootError('未检测到 Node.js。请访问 https://nodejs.org/ 安装后重新启动本应用。');
    return;
  }
  setProgress(18, 'detect', 'Node.js 环境正常');
  const npmCli = await findNpmCli();
  const prefix = await findNpmPrefix();

  if (selectedMode === 'repair') {
    // ===== 本地修复 =====
    setProgress(22, 'detect', '准备本地修复环境...');
    if (!npmCli) {
      bootError('未检测到 npm，无法执行修复。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    const r = await repairInstall(nodeExe, npmCli, prefix);
    if (!r.ok) { bootError(r.error); return; }
    setProgress(60, 'start', '正在启动 DeepSeek Harness 服务...');
    const realBin = dshBinPath(prefix);
    quickStartWeb(nodeExe, realBin);
  } else if (selectedMode === 'source') {
    // ===== 源码完整安装 =====
    setProgress(22, 'detect', '准备源码安装环境...');
    if (!npmCli) {
      bootError('未检测到 npm，无法安装 pnpm。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    const r = await sourceInstall(nodeExe, npmCli);
    if (!r.ok) { bootError(r.error); return; }
    setProgress(60, 'start', '正在启动 DeepSeek Harness 服务...');
    sourceStartWeb(r.repoPath, nodeExe);
  } else {
    // ===== 快速启动 =====
    setProgress(22, 'detect', '正在检查 DeepSeek Harness 是否已安装...');
    const binPath = dshBinPath(prefix);
    const installed = binPath && fs.existsSync(binPath);
    if (!installed) {
      if (!npmCli) {
        bootError('未检测到 npm，无法自动安装。请先安装 Node.js（含 npm）后重试。');
        return;
      }
      const r = await quickInstall(nodeExe, npmCli, prefix);
      if (!r.ok) { bootError(r.error); return; }
    } else {
      setProgress(50, 'detect', 'DeepSeek Harness 已就绪');
    }
    setProgress(60, 'start', '正在启动 DeepSeek Harness 服务...');
    const realBin = dshBinPath(prefix);
    quickStartWeb(nodeExe, realBin);
  }

  // 2) 等待就绪
  const bootStart = Date.now();
  const ready = await waitForWebReady(port, 10 * 60 * 1000, () => {
    const pct = Math.min(60 + ((Date.now() - bootStart) / (10 * 60 * 1000)) * 35, 95);
    broadcast('boot:progress', { percent: Math.round(pct), stage: 'start', text: '正在等待服务就绪...' });
  });
  if (!ready) {
    bootError('Web UI 启动超时，请查看下方日志排查问题。');
    return;
  }
  setProgress(100, 'ready', '启动完成');
  finishBoot();
}

function finishBoot() {
  bootPhase = 'ready';
  createMainWindow();
  // 主窗口就绪后再销毁引导窗口；若加载超时（页面较大/网络慢）也强制切换。
  // 注意必须用 destroy()：close() 会触发引导窗的 close 处理器进而 quitApp()，
  // 导致主界面还没显示 App 就退出。
  const switchToMain = () => {
    if (bootWindow && !bootWindow.isDestroyed()) bootWindow.destroy();
  };
  mainWindow.once('ready-to-show', switchToMain);
  setTimeout(switchToMain, 20000);
}

// ============================================================
//  窗口 / 托盘
// ============================================================
function createBootWindow() {
  bootWindow = new BrowserWindow({
    width: 780,
    height: 620,
    resizable: true,
    minWidth: 680,
    minHeight: 540,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness 桌面版 - 启动中',
    icon: appIcon(256),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  bootWindow.loadFile(path.join(__dirname, 'boot', 'boot.html'));
  // 关闭引导窗口 = 退出 App
  bootWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      quitApp();
    }
  });
  bootWindow.on('closed', () => { bootWindow = null; });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness 桌面版',
    icon: appIcon(256),
    backgroundColor: '#0d1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    logLine(`[诊断] 主界面加载失败 (${code}) ${desc} ${url}`);
  });
  mainWindow.loadURL(`http://${host}:${port}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 关闭主窗口时：询问用户是退出 App 还是保存到托盘
  let closeDialogOpen = false;
  mainWindow.on('close', (e) => {
    if (quitting) return; // 正在退出，直接关闭
    e.preventDefault();
    if (closeDialogOpen) return; // 防止重复弹窗
    closeDialogOpen = true;

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      title: 'DeepSeek Harness 桌面版',
      message: '关闭窗口后要做什么？',
      detail: '服务仍在后台运行，可随时从托盘恢复。',
      buttons: ['保存到托盘', '退出 App'],
      defaultId: 0,
      cancelId: 1,
      icon: appIcon(256),
    });

    closeDialogOpen = false;
    if (choice === 0) {
      // 保存到托盘：隐藏窗口，服务继续运行
      mainWindow.hide();
      if (tray && tray.displayBalloon) {
        tray.displayBalloon({
          title: 'DeepSeek Harness 桌面版',
          content: '已保存到系统托盘，服务继续在后台运行。',
          icon: appIcon(32),
        });
      }
    } else {
      // 退出 App：清理服务后退出
      quitApp();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  // 托盘图标用 32x32 较合适（Windows 托盘显示尺寸）
  const trayIcon = appIcon(32);
  tray = new Tray(trayIcon);
  tray.setToolTip('DeepSeek Harness 桌面版');
  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ============================================================
//  生命周期
// ============================================================

// 单实例锁：防止多个 App 同时运行（托盘出现多个图标）
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  // 已有实例在运行，通知它并退出
  app.quit();
} else {
  // 第二个实例启动时，聚焦已有实例的窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // 设置应用图标（影响任务栏、Alt-Tab、exe 资源）
  app.setAppUserModelId('com.dsh.desktop');
  if (process.platform === 'win32') {
    app.setIcon && app.setIcon(appIcon(256));
  }
  createBootWindow();
  createTray();

  // App 启动瞬间即自动终结旧服务（不依赖模式选择）
  cleanupOldService();

  // 显示模式选择（与清理并行，互不阻塞）
  bootPhase = 'mode';
  broadcast('boot:phase', { phase: 'mode' });
  startModeCountdown();
});

// 所有窗口关闭 → 退出 App（不再常驻托盘）
app.on('window-all-closed', () => {
  quitApp();
});

app.on('before-quit', async (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  await stopWebService();
  app.quit();
});

// IPC
ipcMain.handle('boot:select-mode', (e, mode) => {
  if (mode === 'quick' || mode === 'source' || mode === 'repair') selectMode(mode);
  return true;
});

ipcMain.handle('boot:retry', async () => {
  if (bootPhase === 'error') {
    selectedMode = null;
    broadcast('boot:phase', { phase: 'mode' });
    startModeCountdown();
  }
  return true;
});

ipcMain.handle('boot:quit', async () => {
  quitting = true;
  await stopWebService();
  app.quit();
  return true;
});

ipcMain.handle('app:open-external', (e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
  return true;
});

// "关于"信息：版本号 + 更新日志（供启动界面展示）
ipcMain.handle('app:about-info', async () => {
  let version = '1.0.0';
  try {
    version = app.getVersion() || '1.0.0';
  } catch (e) { /* ignore */ }
  let changelog = '';
  try {
    const changelogPath = path.join(__dirname, 'CHANGELOG.md');
    changelog = fs.readFileSync(changelogPath, 'utf8');
  } catch (e) { /* 未找到更新日志时留空 */ }
  return { version, changelog };
});
