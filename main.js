'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, Notification } = require('electron');
const { spawn, execFile } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const pluginMgr = require('./plugin-manager.js');

// ============================================================
//  全局状态
// ============================================================
const isWin = process.platform === 'win32';
const DEFAULT_PORT = 3080;
const PKG_NAME = '@deepseek-ai/dsh';
const REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness.git';

// 应用展示名（DeepSeek Harness 官方 Web UI 桌面客户端）。所有窗口标题 / 托盘 / 弹窗 / 通知统一使用，
// 改名只需改这一处。
const APP_NAME = 'DeepSeek Harness 桌面版';
const APP_TAGLINE = 'DeepSeek Harness 官方 Web UI 桌面客户端';

// ============================================================
//  更新服务配置（后端地址）
// ============================================================
const UPDATE_API_BASE = (process.env.DSH_UPDATE_API || 'https://api.deepseekharness.desktop.cwj666.top').replace(/\/+$/, '');
const UPDATE_APP_ID = 'dsh-desktop';

// ============================================================
//  npm 国内镜像源（多镜像自动切换，加速依赖下载）
//  说明：
//  - 用户可用环境变量 DSH_NPM_REGISTRY 强制指定单一镜像（跳过测速）
//  - 未指定时：启动时并发测速选最快镜像；安装失败自动切换到下一个可用镜像
// ============================================================
const NPM_REGISTRIES = [
  { name: 'npmmirror（阿里云）', url: 'https://registry.npmmirror.com' },
  { name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/npm/' },
  { name: '华为云', url: 'https://mirrors.huaweicloud.com/repository/npm/' },
  { name: '淘宝旧源', url: 'https://registry.npm.taobao.org' },
  { name: '网易', url: 'https://mirrors.163.com/npm/' },
  { name: '官方源（兜底）', url: 'https://registry.npmjs.org' },
];

// 镜像类失败特征：网络不通 / 404 缺包（部分镜像不同步所有包）/ 超时等。
// 命中这些错误时说明"换一个镜像可能就好"，应自动切换镜像重试，
// 避免因某个镜像缺包/不可用导致插件装不上。
const MIRROR_FAIL_RE = /E404|404\s|Not Found|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|network|fetch failed|getaddrinfo|UNABLE_TO_GET_ISSUER/i;

// 环境变量强制指定时，仅使用指定镜像
const forcedRegistry = (process.env.DSH_NPM_REGISTRY || '').replace(/\/+$/, '');
let npmRegistry = forcedRegistry || NPM_REGISTRIES[0].url;
let registryIndex = 0; // 当前使用镜像在池中的位置（用于失败切换）

// 测速探测：并发 ping 各镜像，选择响应最快的可用源
function pingRegistry(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const u = new URL(url);
    const req = https.get(
      { hostname: u.hostname, path: '/-/ping', port: u.port || 443, protocol: u.protocol, timeout: timeoutMs, method: 'HEAD' },
      (res) => {
        resolve({ url, ms: Date.now() - start, ok: true });
        res.resume();
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ url, ms: Infinity, ok: false }); });
    req.on('error', () => { resolve({ url, ms: Infinity, ok: false }); });
  });
}

// 启动时并发测速，选择最快可用镜像
async function selectFastestRegistry() {
  if (forcedRegistry) {
    logLine(`[镜像] 使用环境变量指定镜像：${npmRegistry}`);
    return npmRegistry;
  }
  logLine('[镜像] 正在测速选择最快的 npm 镜像源...');
  const results = await Promise.all(
    NPM_REGISTRIES.map((r) => pingRegistry(r.url).then((p) => ({ ...p, name: r.name })))
  );
  const usable = results.filter((r) => r.ok && r.ms !== Infinity).sort((a, b) => a.ms - b.ms);
  if (usable.length > 0) {
    const best = usable[0];
    npmRegistry = best.url;
    registryIndex = NPM_REGISTRIES.findIndex((r) => r.url === best.url);
    logLine(`[镜像] 已选择最快镜像：${best.name} ${best.url}（${best.ms}ms）`);
  } else {
    npmRegistry = NPM_REGISTRIES[0].url;
    registryIndex = 0;
    logLine('[镜像] 测速失败，使用默认镜像：' + npmRegistry);
  }
  return npmRegistry;
}

// 测速结果缓存：并发调用共享同一次测速
// （run() 启动流程与插件安装可能同时触发，避免重复测速）
let registrySelectionPromise = null;
function ensureRegistrySelected() {
  if (forcedRegistry) {
    logLine(`[镜像] 使用环境变量指定镜像：${npmRegistry}`);
    return Promise.resolve(npmRegistry);
  }
  if (!registrySelectionPromise) registrySelectionPromise = selectFastestRegistry();
  return registrySelectionPromise;
}

// 安装失败时切换到下一个镜像（并返回新镜像地址，供重试）
function nextRegistry() {
  if (forcedRegistry) return null; // 强制指定时不切换
  registryIndex = (registryIndex + 1) % NPM_REGISTRIES.length;
  npmRegistry = NPM_REGISTRIES[registryIndex].url;
  logLine(`[镜像] 当前镜像不可用，切换到：${NPM_REGISTRIES[registryIndex].name} ${npmRegistry}`);
  return npmRegistry;
}

let port = DEFAULT_PORT;
let host = '127.0.0.1';

let bootWindow = null;   // 首页引导窗口（常驻：模式选择 / 运行状态控制台 / 插件管理 / 设置）
let mainWindow = null;   // WebUI 主窗口（独立新窗口，加载 http://host:port）
let tray = null;
let serverProc = null;          // dsh 服务进程
let serverSpawnedByUs = false;
let devWebProc = null;          // 开发者选项模式：浏览器端热更 watcher（pnpm dev:web）进程
let quitting = false;
let developerMode = false;      // 开发者选项模式（设置中持久化，对下次启动生效）
let bootPhase = 'init';         // mode / detect / install / start / running / stopped / error
let symlinkHealed = false;      // .dsh/profiles symlink 是否已自动修复过（防无限重启）
let selectedMode = null;        // 'quick' | 'source' | 'repair'
let modeTimer = null;
let portCleanupDone = false;    // 启动时端口清理是否完成

// 服务运行状态（供首页"正在运行中"控制台展示）
const serviceState = {
  running: false,
  mode: null,          // 当前启动模式
  port: DEFAULT_PORT,
  startedAt: null,     // 最近一次就绪时间戳
  pid: null,
  devMode: false,      // 开发者选项模式（服务端后端 + 浏览器端热更 watcher 分离运行）
  devWebPid: null,     // 浏览器端热更 watcher 进程 PID
};

// ============================================================
//  IPC：进度 & 状态 & 日志
// ============================================================
function broadcast(channel, payload) {
  if (bootWindow && !bootWindow.isDestroyed()) {
    bootWindow.webContents.send(channel, payload);
  }
}

// 每个模式的详细步骤表（按进度阈值区间映射到"步骤 x/n"）
// 严格遵循官方运行规范：
//   快速启动：npx @deepseek-ai/dsh web
//   源码安装：git clone → pnpm install → pnpm run build → pnpm dsh web
//   本地修复：自动备份 → 只清理坏插件引用(profiles) → 官方快速版启动
const MODE_STEPS = {
  quick: [
    { p: 0, title: '检测运行环境' },
    { p: 20, title: '配置 npm 镜像源' },
    { p: 40, title: 'npx 下载依赖（首次较慢）' },
    { p: 80, title: '启动 Web UI' },
    { p: 96, title: '启动服务' },
  ],
  // 开发者选项模式下的快速启动：服务端后端与浏览器端热更 watcher（pnpm dev:web）分离运行
  quickDev: [
    { p: 0, title: '检测运行环境' },
    { p: 20, title: '检查源码仓库' },
    { p: 45, title: '启动服务端后端' },
    { p: 65, title: '启动浏览器端热更 watcher' },
    { p: 96, title: '启动服务' },
  ],
  repair: [
    { p: 0, title: '检测运行环境' },
    { p: 15, title: '停止正在运行的服务' },
    { p: 30, title: '备份数据并清理坏插件引用' },
    { p: 80, title: '修复完成' },
    { p: 96, title: '启动服务' },
  ],
  source: [
    { p: 0, title: '检测运行环境' },
    { p: 30, title: '检测 git 与 pnpm' },
    { p: 35, title: '安装 pnpm' },
    { p: 40, title: '克隆源码仓库' },
    { p: 55, title: '安装项目依赖' },
    { p: 75, title: '构建项目' },
    { p: 90, title: '构建完成' },
    { p: 96, title: '启动服务' },
  ],
};

let currentSteps = null; // 当前模式的步骤表

// 根据进度百分比解析当前步骤
function resolveStep(percent) {
  if (!currentSteps || currentSteps.length === 0) return null;
  let idx = 0;
  for (let i = 0; i < currentSteps.length; i++) {
    if (percent >= currentSteps[i].p) idx = i;
  }
  return { index: idx + 1, total: currentSteps.length, title: currentSteps[idx].title };
}

function setProgress(percent, stage, text, detail, hint) {
  bootPhase = stage;
  broadcast('boot:progress', {
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    stage,
    text,
    detail: detail || '',
    hint: hint || '',
    step: resolveStep(percent),
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
  refreshTrayMenu();
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

async function waitForWebReady(checkPort, timeoutMs, onTick, shouldAbort) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (shouldAbort && shouldAbort()) return false;
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
//  模式选择（不再自动倒计时进入，由用户自行选择）
// ============================================================
function selectMode(mode) {
  // 已选过且不在错误/已停止状态：忽略重复选择
  // 错误状态允许重新选择（如从错误界面直接进入"本地修复"）；已停止状态允许改选其他模式
  if (selectedMode && bootPhase !== 'error' && bootPhase !== 'stopped') return;
  selectedMode = mode;
  if (modeTimer) { clearInterval(modeTimer); modeTimer = null; }
  logLine(`[模式] 用户选择：${mode === 'quick' ? '快速启动（npx）' : mode === 'repair' ? '本地修复' : '源码完整安装'}`);
  if (developerMode) {
    logLine('[模式] 开发者选项模式已开启：服务端后端与浏览器端热更 watcher（pnpm dev:web）将分离运行');
  }
  run();
}

// ============================================================
//  快速启动流程（npx）
// ============================================================

// 终止所有与 dsh 相关的 node/npm/pnpm 进程，防止 EPERM 文件占用。
// 用 PowerShell CIM 查询（对长命令行更可靠），再 taskkill。
// 覆盖三种启动方式：npx 快速版、全局安装版、源码 pnpm dsh web，以及开发者模式的 dev:web 热更 watcher。
async function killDshNodeProcesses() {
  return new Promise((resolve) => {
    if (!isWin) { resolve(); return; }
    const ps = `
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match '@deepseek-ai[\\\\/]dsh' -or
  $_.CommandLine -match 'dsh[\\\\/]lib[\\\\/]bin' -or
  $_.CommandLine -match 'npm-cli\\.js.{0,20}install -g' -or
  $_.CommandLine -match 'pnpm\\.cjs.{0,40}dsh\\s+web' -or
  $_.CommandLine -match 'bin\\.ts web' -or
  $_.CommandLine -match 'dev:web'
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

// ============================================================
//  修复前自动备份 ~/.dsh（安全网：绝不丢失用户数据）
// ============================================================
// 在清理前把整个 ~/.dsh（排除 node_modules 依赖目录）复制到
// ~/.dsh-backups/<时间戳>/。即使后续修复出现意外，也能完整找回
// 聊天记录、工作区数据、设置与凭据。
async function backupDshDataBeforeCleanup(dshHome) {
  const backupRoot = path.join(os.homedir(), '.dsh-backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupRoot, stamp);
  try {
    fs.mkdirSync(backupRoot, { recursive: true });
    if (isWin) {
      // robocopy：稳定处理长路径与大量小文件；/XD node_modules 排除依赖（可重新生成）
      await new Promise((res) => {
        execFile('robocopy', [dshHome, dest, '/E', '/XD', 'node_modules', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1'], { windowsHide: true, timeout: 120000 }, () => res());
      });
    } else {
      fs.cpSync(dshHome, dest, { recursive: true, filter: (src) => !src.includes(`${path.sep}node_modules`) });
    }
    if (fs.existsSync(dest)) {
      logLine(`[备份] 已自动备份数据到：${dest}`);
      return dest;
    }
  } catch (e) {
    logLine(`[警告] 修复前自动备份失败（将继续修复，但建议手动备份）：${e.message}`);
  }
  return null;
}

// ============================================================
//  外科手术式清理（应急抢修）
// ============================================================
// 背景：dsh 的 profile 目录（~/.dsh/profiles/<name>/）下除了 node_modules
// 符号链接外，还有 cordis.patch.yml 等用户配置。当用户曾通过 npm 安装过
// 自定义插件（如 @feiyang666/deepseekharnessdesktop），cordis.patch.yml 会
// 插入该插件的引用；一旦该包被卸载/未安装，dsh web 启动时 Cordis 加载插件树
// 会直接抛 "Cannot find package '...'" 导致整个服务崩溃（code=1）。
//
// 旧版"本地修复"会强力清除整个 ~/.dsh 目录（profiles + sessions + storages
// 等），导致聊天记录、工作区数据、设置、凭据全部丢失。
//
// 新版策略（只清坏插件，不丢用户数据）：
//   1) 修复前先把整个 ~/.dsh 自动备份到 ~/.dsh-backups/<时间戳>/（安全网）；
//   2) 只删除 profiles/ 目录（坏插件引用的唯一来源，npx 会按官方默认重新生成）；
//   3) 保留 sessions/（聊天记录）、storages/（工作区数据）、settings.yaml、
//      .credentials.yaml、.anonymous-user-id —— 全部用户数据原样保留。
async function nukeLocalDshData() {
  const dshHome = path.join(os.homedir(), '.dsh');
  if (!fs.existsSync(dshHome)) {
    logLine('[清理] ~/.dsh 目录不存在，无需清除');
    return 0;
  }

  // 先终止占用 ~/.dsh 的进程（运行中的 dsh 服务 / 残留 node）
  await killDshNodeProcesses();
  await killProcessOnPort(port);
  await new Promise((r) => setTimeout(r, 500));

  // 1) 删除前自动备份（绝不丢数据的底线保障）
  await backupDshDataBeforeCleanup(dshHome);

  // 2) 只删除 profiles（坏插件引用的唯一来源）；sessions/storages/settings 全部保留
  let removed = 0;
  const profilesDir = path.join(dshHome, 'profiles');
  if (fs.existsSync(profilesDir)) {
    try {
      fs.rmSync(profilesDir, { recursive: true, force: true });
      removed = fs.existsSync(profilesDir) ? 0 : 1;
    } catch (e) {
      logLine(`[警告] profiles 删除失败，改用 PowerShell 重试：${e.message}`);
      if (isWin) {
        const psCmd = `Remove-Item -LiteralPath '${profilesDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`;
        await new Promise((res) => {
          execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true, timeout: 30000 }, () => res());
        });
        removed = fs.existsSync(profilesDir) ? 0 : 1;
      }
    }
  }

  if (removed > 0) {
    logLine('[清理] 已清理坏插件引用（profiles 目录）。聊天记录、工作区数据、设置与凭据均已保留，dsh 将重新生成官方默认 profile');
  } else {
    logLine('[警告] profiles 清理不完整，可能仍有进程占用；请稍后手动删除 ' + profilesDir);
  }
  return removed;
}

// ============================================================
//  精准修复：只删除出错的插件（不碰其他插件与用户数据）
// ============================================================
// 从服务启动错误输出中提取坏插件包名。dsh 报错形如：
//   Cannot find package '@feiyang666/deepseekharnessdesktop' imported from ...
//   ERR_MODULE_NOT_FOUND: Cannot find package 'xxx' from ...
//   failed to import loader entry 'file:///.../node_modules/@scope/pkg/lib/index.js'
// 提取后统一归一化为 npm 包名（@scope/name 或 name）。
function extractBadPluginNames(startupOutput) {
  const names = new Set();
  // 1) Cannot find package/module 'xxx'
  const re1 = /Cannot find (?:package|module)\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re1.exec(startupOutput))) {
    const simple = normalizePkgRef(m[1]);
    if (simple) names.add(simple);
  }
  // 2) failed to import loader entry '.../node_modules/@scope/pkg/lib/index.js'
  //    从路径中反推包名（node_modules 之后的前两段）
  const re2 = /failed to import (?:loader|plugin) entry\s+['"]([^'"]+)['"]/g;
  while ((m = re2.exec(startupOutput))) {
    const simple = pkgRefFromNodeModulesPath(m[1]);
    if (simple) names.add(simple);
  }
  // 官方基础包与 dsh 本体依赖不是用户插件，绝不自动删除（可能是官方依赖缺失，应交给修复模式）
  return [...names].filter((n) => !pluginMgr.BASE_PKGS.includes(n) && !n.startsWith('@deepseek-ai/'));
}

// 'file:///.../node_modules/@scope/pkg/lib/index.js' -> '@scope/pkg'；非 node_modules 路径返回 null
function pkgRefFromNodeModulesPath(raw) {
  const s = String(raw || '').trim();
  const idx = s.indexOf('node_modules');
  if (idx < 0) return null;
  const segs = s.slice(idx + 'node_modules'.length).split(/[\\/]/).filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0].startsWith('@')) return segs.length >= 2 ? `${segs[0]}/${segs[1]}` : null;
  return segs[0] || null;
}

function normalizePkgRef(raw) {
  const s = String(raw || '').trim();
  if (!s || s.startsWith('.')) return null;
  const parts = s.split(/[\\/]/);
  if (s.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0] || null;
}

// 在全部 profile 中移除指定插件的所有引用，其他内容一律不动：
//   1) package.json -> dsh.profile.bundles 中摘掉该包
//   2) cordis.patch.yml 中 1.0.x 遗留的 "- insert:" 块（含该包名）
//   3) 删除 node_modules/<pkg> 实体（符号链接或目录）
// 返回值：{ removed: <实际删除的 node_modules 实体数>, touched: <被修改的 profile 数> }
function removePluginRefsFromProfiles(pkgNames) {
  if (!pkgNames || pkgNames.length === 0) return { removed: 0, touched: 0 };
  const dshHome = path.join(os.homedir(), '.dsh');
  const profilesDir = path.join(dshHome, 'profiles');
  if (!fs.existsSync(profilesDir)) return { removed: 0, touched: 0 };

  let removed = 0;
  let touched = 0;
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(profilesDir, entry.name);
    let profileChanged = false;

    // 1) bundles 注册摘除
    const manifestPath = path.join(dir, 'package.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const bundles = manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)
        ? manifest.dsh.profile.bundles : [];
      for (const name of pkgNames) {
        const idx = bundles.indexOf(name);
        if (idx >= 0) {
          bundles.splice(idx, 1);
          profileChanged = true;
        }
      }
      if (profileChanged) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      }
    } catch (e) {
      logLine(`[警告] 读取 profile 清单失败（跳过，不影响其他 profile）：${e.message}`);
    }

    // 2) cordis.patch.yml 遗留引用摘除
    for (const name of pkgNames) {
      if (pluginMgr.removeLegacyPatchRow(path.join(dir, 'cordis.patch.yml'), name)) profileChanged = true;
    }

    // 3) 删除 node_modules 实体
    for (const name of pkgNames) {
      const pkgDir = path.join(dir, 'node_modules', ...name.split('/'));
      if (fs.existsSync(pkgDir)) {
        try {
          fs.rmSync(pkgDir, { recursive: true, force: true });
          removed++;
          profileChanged = true;
        } catch (e) {
          logLine(`[警告] 删除坏插件目录失败：${pkgDir}（${e.message}）`);
        }
      }
    }

    if (profileChanged) touched++;
  }
  return { removed, touched };
}

// ============================================================
//  本地修复流程（应急抢修）
//  只清理坏插件引用（profiles 目录），保留聊天记录/工作区/设置/凭据。
//  清理前自动备份到 ~/.dsh-backups/，数据绝不丢失。
// ============================================================
async function repairFlow() {
  // 1) 停止可能正在运行的 dsh 服务（本 App 启动的 + 端口上残留的旧服务）+ 开发者模式 watcher
  setProgress(15, 'install', '正在停止正在运行的 dsh 服务...');
  if (serverProc) await stopWebService();
  await stopDevWebWatcher();
  await killProcessOnPort(port);

  // 2) 修复核心：自动备份 → 只清理坏插件引用（profiles），保留全部用户数据
  setProgress(30, 'install', '正在备份数据并清理坏插件引用...',
    '自动备份全部数据到 ~/.dsh-backups', '仅清理损坏的插件引用，聊天记录、工作区数据与设置都会保留');
  await nukeLocalDshData();

  setProgress(80, 'install', '本地修复完成，准备启动服务...');
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

// 查找 pnpm 的 .cjs 入口（优先 npm 全局安装目录，避免 .cmd 弹窗）
async function findPnpmCli() {
  const prefix = await findNpmPrefix();
  if (prefix) {
    const cand = path.join(prefix, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (fs.existsSync(cand)) return cand;
  }
  const pnpmPath = await which('pnpm');
  if (pnpmPath) {
    // pnpm.cmd -> node_modules/pnpm/bin/pnpm.cjs
    const d = path.dirname(pnpmPath);
    const cand = path.join(d, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (fs.existsSync(cand)) return cand;
  }
  return null;
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
  const npmCli = await findNpmCli();
  let pnpmCli = await findPnpmCli();
  if (!pnpmCli) {
    // 没装 pnpm：用 npm 安装
    setProgress(35, 'install', '未检测到 pnpm，正在安装 pnpm...');
    const env = { ...process.env, npm_config_ignore_scripts: 'true' };
    const r = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--registry', npmRegistry, '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
    if (r.code !== 0) {
      // 镜像类失败（网络 / 404 缺包等）：自动切换镜像重试一次
      const next = nextRegistry();
      if (next && MIRROR_FAIL_RE.test(r.out)) {
        logLine('[镜像] 自动切换镜像重试安装 pnpm');
        const retry = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--registry', next, '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
        if (retry.code === 0) { /* 成功则继续 */ }
        else return { ok: false, error: 'pnpm 安装失败，请手动安装后重试' };
      } else {
        return { ok: false, error: 'pnpm 安装失败，请手动安装后重试' };
      }
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
  const r1 = await runCommand(nodeExe, [pnpmCli, 'install', '--reporter=append-only', '--ignore-scripts', '--registry', npmRegistry], { cwd: repoPath, env: installEnv }, (s) => {
    if (/error|ERR|failed|失败|WARN/i.test(s)) logLine(s.replace(/\r?\n$/, ''));
  });
  if (r1.code !== 0) {
    // 镜像类失败（网络 / 404 缺包等）：自动切换镜像重试一次
    if (MIRROR_FAIL_RE.test(r1.out)) {
      const next = nextRegistry();
      if (next) {
        setProgress(57, 'install', '当前镜像不稳定，正在切换镜像源重试...');
        logLine('[镜像] 自动切换镜像重试 pnpm install');
        const retry = await runCommand(nodeExe, [pnpmCli, 'install', '--reporter=append-only', '--ignore-scripts', '--registry', next], { cwd: repoPath, env: installEnv }, (s) => {
          if (/error|ERR|failed|失败|WARN/i.test(s)) logLine(s.replace(/\r?\n$/, ''));
        });
        if (retry.code !== 0) {
          return { ok: false, error: 'pnpm install 失败（已尝试多个镜像源），请查看日志' };
        }
      } else {
        return { ok: false, error: 'pnpm install 失败，请查看日志' };
      }
    } else {
      return { ok: false, error: 'pnpm install 失败，请查看日志' };
    }
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
  return { ok: true, repoPath, pnpmCli };
}

// 源码模式启动：pnpm dsh web（严格遵循官方规范）
function sourceStartWeb(repoPath, nodeExe, pnpmCli) {
  const args = ['dsh', 'web', '--host', host, '--port', String(port)];
  const child = spawn(nodeExe, [pnpmCli, ...args], {
    cwd: repoPath,
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
    if (/listening|http:\/\/|Local:|ready/i.test(s)) {
      started = true;
      setProgress(96, 'start', '服务已启动，正在打开界面...');
    }
  });
  child.stderr && child.stderr.on('data', (d) => logLine(String(d).replace(/\r?\n$/, '')));
  child.on('error', (err) => { logLine(`[错误] 服务启动失败: ${err.message}`); });
  child.on('exit', (code, signal) => {
    // 若该子进程已不是当前服务进程（用户主动停止/重启时 serverProc 已被置空），忽略其退出
    if (quitting || serverProc !== child) return;
    if (started) {
      logLine(`[诊断] 服务曾成功启动，但后来退出 (code=${code}, signal=${signal})`);
      onServiceExited();
      bootError(`dsh 服务启动后退出 (code=${code})，请查看日志`);
    } else {
      logLine(`[诊断] 服务未输出就绪信息即退出 (code=${code}, signal=${signal})`);
      bootError(`dsh 服务启动失败 (code=${code})，请查看日志`);
    }
    serverProc = null;
  });
}

// 服务进程退出后的统一收尾：清空运行状态、停止 watcher、关闭 WebUI 主窗口
function onServiceExited() {
  serverSpawnedByUs = false;
  serviceState.running = false;
  serviceState.startedAt = null;
  serviceState.pid = null;
  serviceState.devMode = false;
  serviceState.devWebPid = null;
  // 后端退出时一并停止浏览器端热更 watcher（分离的两个进程同生共死）
  if (devWebProc) stopDevWebWatcher();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;
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

// 快速模式启动：npx @deepseek-ai/dsh web（严格遵循官方规范）
// 用 node <npm-cli.js> exec --yes 直跑，避免 Windows .cmd 弹窗。
// 首次运行 npx 会自动下载 @deepseek-ai/dsh（官方方式，走已测速的镜像）。
function startWebViaNpx(nodeExe, npmCli) {
  const env = cleanServiceEnv();
  // npx 首次会下载安装 @deepseek-ai/dsh，必须跳过 koffi 源码编译（本机无 CMake）
  env.npm_config_ignore_scripts = 'true';
  env.npm_config_progress = 'true';
  env.NPM_CONFIG_LOGLEVEL = 'info';
  // npm exec --yes -- <pkg> <args>：`--` 之后为包名与 dsh 子命令参数
  const args = ['exec', '--yes', '--', PKG_NAME, 'web', '--host', host, '--port', String(port)];
  const child = spawn(nodeExe, [npmCli, ...args], {
    cwd: app.getPath('userData'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  serverProc = child;
  serverSpawnedByUs = true;
  let started = false;
  let startupOutput = ''; // 记录启动输出，用于失败诊断
  child.stdout && child.stdout.on('data', (d) => {
    const s = String(d);
    startupOutput += s;
    logLine(s.replace(/\r?\n$/, ''));
    if (/listening|http:\/\/|Local:|ready/i.test(s)) {
      started = true;
      setProgress(96, 'start', '服务已启动，正在打开界面...');
    }
  });
  child.stderr && child.stderr.on('data', (d) => {
    startupOutput += String(d);
    logLine(String(d).replace(/\r?\n$/, ''));
  });
  child.on('error', (err) => { logLine(`[错误] 服务启动失败: ${err.message}`); });
  child.on('exit', (code, signal) => {
    // 若该子进程已不是当前服务进程（用户主动停止/重启时 serverProc 已被置空），忽略其退出
    if (quitting || serverProc !== child) return;
    // 若因插件树加载失败（残留坏插件引用 "Cannot find package '@feiyang666/...'"）
    // 或 symlink 异常：优先只删除出错的插件，不碰其他插件与用户数据；
    // 提取不到坏插件名时才回退到清理整个 profiles（同样保留用户数据）。
    if (!symlinkHealed && /plugin tree failed to load|Cannot find package|ERR_MODULE_NOT_FOUND|failed to import loader entry|is not a symlink|symlink/i.test(startupOutput)) {
      symlinkHealed = true;
      const badPlugins = extractBadPluginNames(startupOutput);
      if (badPlugins.length > 0) {
        // 精准修复：备份后只删坏插件
        logLine(`[自动修复] 检测到坏插件引用：${badPlugins.join(', ')}。正在备份数据并只清理这些插件后重启服务（其他插件与聊天记录/工作区/设置全部保留）...`);
        backupDshDataBeforeCleanup(path.join(os.homedir(), '.dsh')).then(() => {
          const r = removePluginRefsFromProfiles(badPlugins);
          logLine(`[自动修复] 已清理坏插件 ${badPlugins.join(', ')}（删除残留 ${r.removed} 处，涉及 ${r.touched} 个 profile），正在重启服务...`);
          setTimeout(() => {
            if (!quitting && !serverProc) startWebViaNpx(nodeExe, npmCli);
          }, 600);
        });
        return;
      }
      logLine('[自动修复] 检测到 profile 插件加载失败，但无法定位具体坏插件，正在备份数据并清理坏插件引用（profiles 目录）后重启服务...');
      nukeLocalDshData().then(() => {
        setTimeout(() => {
          if (!quitting && !serverProc) startWebViaNpx(nodeExe, npmCli);
        }, 600);
      });
      return;
    }
    if (started) {
      logLine(`[诊断] 服务曾成功启动，但后来退出 (code=${code}, signal=${signal})`);
      onServiceExited();
      bootError(`dsh 服务启动后退出 (code=${code})，请查看日志`);
    } else {
      logLine(`[诊断] 服务未输出就绪信息即退出 (code=${code}, signal=${signal})`);
      bootError(`dsh 服务启动失败 (code=${code})，请查看日志`);
    }
    serverProc = null;
  });
}

async function stopWebService() {
  if (!serverProc || !serverSpawnedByUs) return;
  // 先摘除引用再 kill：子进程 exit 事件触发时 serverProc 已不是它，
  // exit 处理器会因 `serverProc !== child` 直接忽略，避免误报"启动失败"
  const proc = serverProc;
  serverProc = null;
  serverSpawnedByUs = false;
  try {
    if (isWin) {
      await new Promise((res) => {
        execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true }, () => res());
      });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) { /* ignore */ }
}

// ============================================================
//  开发者选项模式：浏览器端热更 watcher（pnpm run dev:web）
//  与「服务端后端」分离运行：监听全部 dsh.client 插件源码，
//  改动后重建 bundle，后端 stat-poll 到变化即广播 rebuilt 帧，
//  浏览器免刷新热更 —— 即 DSH 官方前端开发方式。
// ============================================================
function startDevWebWatcher(repoPath, nodeExe, pnpmCli) {
  const child = spawn(nodeExe, [pnpmCli, 'run', 'dev:web'], {
    cwd: repoPath,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanServiceEnv(),
  });
  devWebProc = child;
  const onData = (d) => {
    const s = String(d);
    logLine('[dev:web] ' + s.replace(/\r?\n$/, ''));
  };
  child.stdout && child.stdout.on('data', onData);
  child.stderr && child.stderr.on('data', onData);
  child.on('error', (err) => logLine(`[dev:web] watcher 启动失败: ${err.message}`));
  child.on('exit', (code, signal) => {
    // 若该子进程已不是当前 watcher（用户主动停止时 devWebProc 已被置空），忽略其退出
    if (quitting || devWebProc !== child) return;
    devWebProc = null;
    serviceState.devWebPid = null;
    logLine(`[dev:web] 浏览器端热更 watcher 已退出 (code=${code}, signal=${signal})，客户端插件改动将不再自动热更`);
  });
}

async function stopDevWebWatcher() {
  if (!devWebProc) return;
  // 先摘除引用再 kill（与 stopWebService 同理，避免 exit 处理器误报）
  const proc = devWebProc;
  devWebProc = null;
  serviceState.devWebPid = null;
  try {
    if (isWin) {
      await new Promise((res) => {
        execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true }, () => res());
      });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) { /* ignore */ }
}

// 开发者选项模式：检查源码仓库是否就绪（已 clone / 已装依赖 / 已构建前端）
// 若仓库已克隆但前端尚未构建（缺少 apps/web/dist），则自动执行 pnpm run build 完成构建，
// 而不再要求用户先手动选择「源码完整安装」。
async function ensureSourceRepoReady(nodeExe, npmCli) {
  const repoPath = sourceRepoPath();
  if (!fs.existsSync(path.join(repoPath, 'package.json'))) {
    return { ok: false, error: '开发者模式需要已安装的源码仓库。请先选择「源码完整安装」完成一次安装，或关闭开发者选项模式。' };
  }
  const pnpmCli = await findPnpmCli();
  if (!pnpmCli) {
    return { ok: false, error: '未找到 pnpm，无法启动浏览器端热更 watcher（pnpm run dev:web）。请先选择「源码完整安装」自动安装 pnpm。' };
  }
  if (!fs.existsSync(path.join(repoPath, 'apps', 'web', 'dist', 'index.html'))) {
    // 源码仓库已克隆、依赖已装，但前端尚未构建：自动补齐构建（pnpm run build，与源码完整安装一致）
    logLine('[源码] 检测到前端尚未构建（缺少 apps/web/dist），开始自动构建...');
    setProgress(30, 'install', '检测到源码仓库尚未构建前端，正在自动构建...',
      '正在编译并打包全部模块', '构建可能需要几分钟，仅首次需要，请耐心等待');
    const buildEnv = {
      ...process.env,
      npm_config_ignore_scripts: 'true',
      npm_config_progress: 'true',
      NPM_CONFIG_LOGLEVEL: 'info',
    };
    const br = await runCommand(nodeExe, [pnpmCli, 'run', 'build'], { cwd: repoPath, env: buildEnv }, (s) => {
      if (/error|ERR|failed|失败|Error|Built|done/i.test(s)) logLine(s.replace(/\r?\n$/, ''));
    });
    if (br.code !== 0) {
      return { ok: false, error: '自动构建前端失败（pnpm run build），请查看日志。如持续失败，可尝试「源码完整安装」重新安装。' };
    }
    if (!fs.existsSync(path.join(repoPath, 'apps', 'web', 'dist', 'index.html'))) {
      return { ok: false, error: '构建已完成但仍未生成 apps/web/dist，请尝试「本地修复」或「源码完整安装」。' };
    }
    setProgress(42, 'install', '前端构建完成');
    logLine('[源码] 前端构建完成');
  }
  return { ok: true, repoPath, pnpmCli };
}

// 统一退出流程：停止服务 → 退出 App
async function quitApp() {
  if (quitting) return;
  quitting = true;
  await stopWebService();
  await stopDevWebWatcher();
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
    return;
  }

  // 解析 --port（仅命令行参数，界面选择不涉及）
  const cliArgs = process.argv.slice(1);
  const portIdx = cliArgs.findIndex((a) => a === '--port');
  if (portIdx >= 0 && cliArgs[portIdx + 1]) {
    const p = parseInt(cliArgs[portIdx + 1], 10);
    if (!Number.isNaN(p)) port = p;
  }

  // 进入启动流程：清空运行状态（重新运行场景）
  serviceState.running = false;
  serviceState.startedAt = null;
  serviceState.pid = null;

  // 0) 根据所选模式加载详细步骤表（快速启动 + 开发者选项模式用独立步骤表）
  currentSteps = (selectedMode === 'quick' && developerMode)
    ? MODE_STEPS.quickDev
    : (MODE_STEPS[selectedMode] || MODE_STEPS.quick);

  // 0.1) 并发测速选择最快 npm 镜像（不阻塞主流程，安装时自动使用最快源；结果缓存，插件安装复用）
  ensureRegistrySelected();

  // 1) 确保端口已释放再启动新服务：等待启动瞬间的端口清理完成（最长 10s），
  //    超时则强制终止端口占用进程并等待释放，避免旧服务/残留进程抢占端口导致
  //    新服务 EADDRINUSE 启动失败（"第二次启动"误报失败的根因之一）
  setProgress(4, 'detect', '正在清理旧服务并释放端口...');
  for (let i = 0; i < 100 && !portCleanupDone; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!portCleanupDone) {
    logLine('[启动] 端口清理未完成，强制终止端口占用进程...');
    await killProcessOnPort(port);
    for (let i = 0; i < 20; i++) {
      if (!(await isPortOpen(port))) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (await isPortOpen(port)) {
    logLine('[警告] 端口 ' + port + ' 仍被占用，新服务可能启动失败');
  }

  // 1) 环境检测
  setProgress(8, 'detect', '正在检测 Node.js 运行环境...');
  const nodeExe = await findNodeExe();
  if (!nodeExe) {
    bootError('未检测到 Node.js。请访问 https://nodejs.org/ 安装后重新启动本应用。');
    return;
  }
  setProgress(18, 'detect', 'Node.js 环境正常');

  const npmCli = await findNpmCli();

  if (selectedMode === 'repair') {
    // ===== 本地修复（应急抢修）=====
    // 自动备份 → 只清理坏插件引用(profiles)，保留聊天记录/工作区/设置/凭据 → 官方快速版 npx 启动
    setProgress(20, 'detect', '准备本地修复环境...');
    if (!npmCli) {
      bootError('未检测到 npm，无法执行修复。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    const r = await repairFlow();
    if (!r.ok) { bootError(r.error); return; }
    setProgress(82, 'start', '正在启动 DeepSeek Harness 服务（官方快速版）...');
    startWebViaNpx(nodeExe, npmCli);
  } else if (selectedMode === 'source') {
    // ===== 源码完整安装 =====
    // 严格规范：git clone → pnpm install → pnpm run build → pnpm dsh web
    setProgress(20, 'detect', '准备源码安装环境...');
    if (!npmCli) {
      bootError('未检测到 npm，无法安装 pnpm。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    const r = await sourceInstall(nodeExe, npmCli);
    if (!r.ok) { bootError(r.error); return; }
    setProgress(60, 'start', '正在启动 DeepSeek Harness 服务（pnpm dsh web）...');
    sourceStartWeb(r.repoPath, nodeExe, r.pnpmCli);
    // 开发者选项模式：源码安装完成后同时启动浏览器端热更 watcher
    if (developerMode) {
      setProgress(93, 'start', '开发者模式：正在启动浏览器端热更 watcher（pnpm run dev:web）...',
        '监听 dsh.client 插件源码，改动后自动重建并热更', '首次启动 watcher 需完成全部客户端插件的初始构建，请耐心等待');
      startDevWebWatcher(r.repoPath, nodeExe, r.pnpmCli);
    }
  } else if (developerMode) {
    // ===== 快速启动 + 开发者选项模式 =====
    // 将「服务端后端」与「浏览器端热更 watcher（pnpm dev:web）」分离为两个进程，
    // 便于前端插件开发：改动源码 → tsdown 重建 bundle → 后端广播 rebuilt 帧 → 浏览器免刷新热更。
    // 与源码模式共用同一仓库（%APPDATA%/dsh-desktop/deepseek-harness），需先完成一次源码安装。
    setProgress(20, 'detect', '开发者模式：检查源码仓库...');
    if (!npmCli) {
      bootError('未检测到 npm，无法使用开发者模式。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    const r = await ensureSourceRepoReady(nodeExe, npmCli);
    if (!r.ok) { bootError(r.error); return; }
    setProgress(45, 'install', '正在启动服务端后端（源码方式 dsh web）...');
    sourceStartWeb(r.repoPath, nodeExe, r.pnpmCli);
    setProgress(65, 'install', '正在启动浏览器端热更 watcher（pnpm run dev:web）...',
      '监听 dsh.client 插件源码，改动后自动重建并热更', '首次启动 watcher 需完成全部客户端插件的初始构建，请耐心等待');
    startDevWebWatcher(r.repoPath, nodeExe, r.pnpmCli);
  } else {
    // ===== 快速启动 =====
    // 严格规范：npx @deepseek-ai/dsh web（官方推荐方式，无需全局安装）
    setProgress(20, 'detect', '使用官方快速方式启动（npx @deepseek-ai/dsh web）...');
    if (!npmCli) {
      bootError('未检测到 npm，无法使用 npx 启动。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    startWebViaNpx(nodeExe, npmCli);
  }

  // 2) 等待就绪（若服务进程已退出并报错，立即中止等待，不再误判为启动成功）
  const bootStart = Date.now();
  const ready = await waitForWebReady(port, 10 * 60 * 1000, () => {
    const elapsed = Math.floor((Date.now() - bootStart) / 1000);
    const pct = Math.min(60 + (elapsed / 600) * 35, 95);
    broadcast('boot:progress', {
      percent: Math.round(pct),
      stage: 'start',
      text: `正在启动服务，已等待 ${elapsed} 秒...`,
      detail: '首次启动需要初始化运行环境，请耐心等待',
      step: resolveStep(pct),
    });
  }, () => bootPhase === 'error');
  if (bootPhase === 'error') return; // 子进程已退出并报错，交给错误界面处理
  if (!ready) {
    bootError('Web UI 启动超时，请查看下方日志排查问题。');
    return;
  }
  setProgress(100, 'ready', '启动完成');
  finishBoot();
}

// 启动完成：首页引导窗口保持常驻，变为"正在运行中"控制台；
// WebUI 在独立的新窗口（mainWindow）中打开。
function finishBoot() {
  bootPhase = 'running';
  serviceState.running = true;
  serviceState.startedAt = Date.now();
  serviceState.mode = selectedMode;
  serviceState.port = port;
  serviceState.pid = serverProc ? serverProc.pid : null;
  serviceState.devMode = developerMode && (selectedMode === 'quick' || selectedMode === 'source');
  serviceState.devWebPid = devWebProc ? devWebProc.pid : null;
  logLine(`[服务] 已就绪：http://${host}:${port}（模式：${selectedMode || 'unknown'}${serviceState.devMode ? '，开发者选项模式' : ''}）`);
  if (serviceState.devMode) {
    logLine(`[服务] 开发者选项模式：服务端后端（PID ${serviceState.pid || '-'}）与浏览器端热更 watcher（PID ${serviceState.devWebPid || '-'}）已分离运行`);
  }
  broadcast('boot:phase', { phase: 'running', service: { ...serviceState } });
  refreshTrayMenu();
  showMainWindow();
}

// 显示 / 重建 WebUI 主窗口（运行中或重新运行后调用）
function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.loadURL(`http://${host}:${port}`); } catch (e) { /* ignore */ }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createMainWindow();
}

// 停止服务：终止子进程 → 关闭 WebUI 主窗口 → 首页显示"已停止"
async function stopService() {
  if (bootPhase === 'stopped') return;
  logLine('[服务] 正在停止运行...');
  await stopWebService();
  await stopDevWebWatcher();
  // 兜底：端口上若仍有残留进程一并终止
  if (isWin) await killProcessOnPort(port);
  onServiceExited();
  bootPhase = 'stopped';
  logLine('[服务] 已停止');
  broadcast('boot:phase', { phase: 'stopped' });
  refreshTrayMenu();
}

// 重新运行：停止（如有）→ 用上次所选模式重新走完整启动流程
async function restartService() {
  if (!selectedMode) {
    bootPhase = 'mode';
    broadcast('boot:phase', { phase: 'mode' });
    return { ok: false, message: '尚未选择启动模式' };
  }
  logLine('[服务] 用户请求重新运行（模式：' + selectedMode + '）');
  // 先停掉旧服务并关闭旧 WebUI 窗口（不广播 stopped，避免界面闪烁）
  await stopWebService();
  await stopDevWebWatcher();
  if (isWin) await killProcessOnPort(port);
  onServiceExited();
  // 重新做一次端口清理（保证端口释放干净），再走完整启动流程
  portCleanupDone = false;
  cleanupOldService().then(() => {
    if (!quitting) run();
  });
  return { ok: true };
}

// ============================================================
//  窗口 / 托盘
// ============================================================
function createBootWindow() {
  // 窗口背景色跟随主题，避免切换/加载时闪白
  const theme = loadAppConfig().theme === 'light' ? 'light' : 'dark';
  bootWindow = new BrowserWindow({
    width: 780,
    height: 620,
    resizable: true,
    minWidth: 680,
    minHeight: 540,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: appIcon(256),
    backgroundColor: theme === 'light' ? '#f6f8fa' : '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--dsh-theme=${theme}`],
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
    title: APP_NAME,
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
      title: APP_NAME,
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
          title: APP_NAME,
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
  tray.setToolTip(APP_NAME);
  refreshTrayMenu();
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// 根据服务状态重建托盘菜单（运行中可停止，停止后可重新运行）
function refreshTrayMenu() {
  if (!tray) return;
  const running = serviceState.running;
  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: running ? '停止运行' : '重新运行',
      click: () => { running ? stopService() : restartService(); },
    },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(running ? `${APP_NAME} - 运行中（http://127.0.0.1:${port}）` : APP_NAME);
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
    } else if (serviceState.running) {
      showMainWindow();
    }
  });
}

app.whenReady().then(() => {
  // 设置应用图标（影响任务栏、Alt-Tab、exe 资源）
  app.setAppUserModelId('com.dsh.desktop');
  if (process.platform === 'win32') {
    app.setIcon && app.setIcon(appIcon(256));
  }
  // 读取持久化的开发者选项模式开关
  developerMode = loadAppConfig().developerMode === true;
  if (developerMode) logLine('[设置] 开发者选项模式已开启（可从设置页关闭）');
  createBootWindow();
  createTray();

  // App 启动瞬间即自动终结旧服务（不依赖模式选择）
  cleanupOldService();

  // 显示模式选择（与清理并行，互不阻塞；不再自动倒计时进入）
  bootPhase = 'mode';
  broadcast('boot:phase', { phase: 'mode' });
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
  await stopDevWebWatcher();
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
  }
  return true;
});

ipcMain.handle('boot:quit', async () => {
  quitting = true;
  await stopWebService();
  await stopDevWebWatcher();
  app.quit();
  return true;
});


// ============================================================
//  服务控制 IPC（首页"正在运行中"控制台）
// ============================================================
ipcMain.handle('service:get-state', async () => {
  return { phase: bootPhase, ...serviceState };
});

ipcMain.handle('service:stop', async () => {
  await stopService();
  return { ok: true };
});

ipcMain.handle('service:restart', async () => {
  return await restartService();
});

ipcMain.handle('service:show-main', async () => {
  if (serviceState.running) {
    showMainWindow();
    return { ok: true };
  }
  return { ok: false, message: '服务未运行' };
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

// ============================================================
//  应用更新服务（对接线上后端 UPDATE_API_BASE）
// ============================================================

// ---------- 本地配置：设备标识 / 通知开关 ----------
function configFilePath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

let appConfig = null;
function loadAppConfig() {
  if (appConfig) return appConfig;
  try {
    appConfig = JSON.parse(fs.readFileSync(configFilePath(), 'utf8'));
  } catch (e) {
    appConfig = {};
  }
  if (!appConfig.deviceId) {
    appConfig.deviceId = crypto.randomUUID();
    saveAppConfig();
  }
  if (typeof appConfig.notifications !== 'boolean') {
    appConfig.notifications = true;
    saveAppConfig();
  }
  if (typeof appConfig.developerMode !== 'boolean') {
    appConfig.developerMode = false;
    saveAppConfig();
  }
  // 界面主题：'dark' | 'light'（默认深色）
  if (!['dark', 'light'].includes(appConfig.theme)) {
    appConfig.theme = 'dark';
    saveAppConfig();
  }
  return appConfig;
}

function saveAppConfig() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(configFilePath(), JSON.stringify(appConfig, null, 2), 'utf8');
  } catch (e) { /* ignore */ }
}

function getDeviceId() {
  return loadAppConfig().deviceId;
}

// ---------- 更新状态 ----------
let updateState = {
  status: 'idle',   // idle | checking | uptodate | available | downloading | downloaded | installing | error
  latest: null,     // 后端返回的最新版本信息
  percent: 0,
  message: '',
  error: '',
  filePath: null,
};

function updateStatus(partial) {
  Object.assign(updateState, partial);
  broadcast('update:status', { ...updateState });
}

function appVersion() {
  try { return app.getVersion() || '1.0.0'; } catch (e) { return '1.0.0'; }
}

// 字节数格式化（与渲染层一致）
function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[u];
}

// 系统通知（受通知开关控制）
function notify(title, body) {
  try {
    const cfg = loadAppConfig();
    if (cfg.notifications === false) return;
    if (!Notification.isSupported()) return;
    new Notification({ title, body, icon: appIcon(32) }).show();
  } catch (e) { /* ignore */ }
}

// ---------- HTTP 请求 ----------
function httpJsonRequest(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': `dsh-desktop/${appVersion()}` }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        return resolve(httpJsonRequest(res.headers.location, timeoutMs));
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('服务器返回格式错误'));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('网络请求超时')); });
    req.on('error', (e) => reject(new Error('网络错误：' + e.message)));
  });
}

// ---------- 检查更新 ----------
async function checkUpdate() {
  updateStatus({ status: 'checking', message: '正在检查更新...', error: '', latest: null, filePath: null });
  try {
    const query = new URLSearchParams({
      appId: UPDATE_APP_ID,
      version: appVersion(),
      platform: process.platform,
      arch: process.arch,
      deviceId: getDeviceId(),
    });
    const url = `${UPDATE_API_BASE}/api/update/check?${query.toString()}`;
    const data = await httpJsonRequest(url);
    if (!data.success) throw new Error(data.message || '检查更新失败');

    const d = data.data;
    if (d.hasUpdate && d.latest) {
      updateStatus({ status: 'available', latest: d.latest, message: `发现新版本 v${d.latest.version}` });
      notify('发现新版本', `${APP_NAME} v${d.latest.version} 已发布，可在设置中查看更新。`);
    } else {
      updateStatus({ status: 'uptodate', latest: null, message: '已是最新版本' });
    }
    return { ...updateState };
  } catch (e) {
    updateStatus({ status: 'error', error: e.message, message: '检查更新失败' });
    return { ...updateState };
  }
}

// ---------- 下载安装包 ----------
function sanitizeFileName(name) {
  return String(name || 'update').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function verifyFileHash(filePath, expectedHash) {
  if (!expectedHash) return true;
  try {
    const actual = await sha256File(filePath);
    return actual.toLowerCase() === String(expectedHash).toLowerCase();
  } catch (e) {
    return false;
  }
}

function downloadUpdate() {
  return new Promise((resolve, reject) => {
    const latest = updateState.latest;
    if (!latest || !latest.id) {
      updateStatus({ status: 'error', error: '没有可下载的版本', message: '没有可下载的版本' });
      return reject(new Error('没有可下载的版本'));
    }
    // 直接用已知的更新服务地址构造下载 URL，避免反代拼接的 download_url 协议/端口异常
    // （download_url 字段仍作为展示用途保留）
    const sep = UPDATE_API_BASE.includes('?') ? '&' : '?';
    const url = `${UPDATE_API_BASE}/api/update/download/${latest.id}${sep}deviceId=${encodeURIComponent(getDeviceId())}`;
    const targetDir = path.join(app.getPath('userData'), 'downloads');
    fs.mkdirSync(targetDir, { recursive: true });
    const fileName = sanitizeFileName(latest.file_name || `dsh-desktop-${latest.version}-setup.exe`);
    const targetPath = path.join(targetDir, fileName);

    updateStatus({ status: 'downloading', percent: 0, message: '正在下载更新包...', error: '' });

    const file = fs.createWriteStream(targetPath);
    const req = https.get(url, { headers: { 'User-Agent': `dsh-desktop/${appVersion()}` } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        file.destroy();
        // 重定向：强制升级为 HTTPS 协议（反代可能返回 http:// 地址）
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('http://')) {
          redirectUrl = 'https://' + redirectUrl.slice('http://'.length);
        }
        updateStatus({ status: 'downloading', percent: 0, message: '正在下载更新包...' });
        return doDownload(redirectUrl, targetPath).then(resolve, reject);
      }
      // 优先用响应头 Content-Length，缺失时（Nginx chunked 转发）用检查接口返回的 file_size 兜底
      const total =
        parseInt(res.headers['content-length'] || '0', 10) ||
        (updateState.latest && updateState.latest.file_size) ||
        0;
      let received = 0;
      let lastEmitAt = 0;
      res.on('data', (c) => {
        received += c.length;
        if (total > 0) {
          const pct = Math.min(100, Math.round((received / total) * 100));
          // 节流：最多每 150ms 推送一次进度，避免高频 IPC
          const now = Date.now();
          if (now - lastEmitAt >= 150 || pct >= 100) {
            lastEmitAt = now;
            updateStatus({
              status: 'downloading',
              percent: pct,
              message: `正在下载更新包 ${pct}%（${formatBytes(received)} / ${formatBytes(total)}）`,
            });
          }
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(async () => {
          const ok = await verifyFileHash(targetPath, latest.file_hash);
          if (!ok) {
            fs.unlink(targetPath, () => {});
            updateStatus({ status: 'error', error: '安装包校验失败', message: '安装包校验失败，请重试' });
            return reject(new Error('安装包校验失败'));
          }
          updateStatus({ status: 'downloaded', percent: 100, message: '更新包下载完成', filePath: targetPath });
          resolve(targetPath);
        });
      });
    });
    req.on('timeout', () => { req.destroy(); file.destroy(); updateStatus({ status: 'error', error: '下载超时', message: '下载超时' }); reject(new Error('下载超时')); });
    req.on('error', (e) => { file.destroy(); updateStatus({ status: 'error', error: e.message, message: '下载失败' }); reject(e); });
    file.on('error', (e) => { req.destroy(); updateStatus({ status: 'error', error: e.message, message: '写入失败' }); reject(e); });
  });

  // 内部：处理重定向后的实际下载
  function doDownload(url, targetPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetPath);
      const req = https.get(url, { headers: { 'User-Agent': `dsh-desktop/${appVersion()}` } }, (res) => {
        const total =
          parseInt(res.headers['content-length'] || '0', 10) ||
          (updateState.latest && updateState.latest.file_size) ||
          0;
        let received = 0;
        let lastEmitAt = 0;
        res.on('data', (c) => {
          received += c.length;
          if (total > 0) {
            const pct = Math.min(100, Math.round((received / total) * 100));
            const now = Date.now();
            if (now - lastEmitAt >= 150 || pct >= 100) {
              lastEmitAt = now;
              updateStatus({
                status: 'downloading',
                percent: pct,
                message: `正在下载更新包 ${pct}%（${formatBytes(received)} / ${formatBytes(total)}）`,
              });
            }
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(async () => {
            const latest = updateState.latest;
            const ok = await verifyFileHash(targetPath, latest && latest.file_hash);
            if (!ok) {
              fs.unlink(targetPath, () => {});
              updateStatus({ status: 'error', error: '安装包校验失败', message: '安装包校验失败，请重试' });
              return reject(new Error('安装包校验失败'));
            }
            updateStatus({ status: 'downloaded', percent: 100, message: '更新包下载完成', filePath: targetPath });
            resolve(targetPath);
          });
        });
      });
      req.on('timeout', () => { req.destroy(); file.destroy(); reject(new Error('下载超时')); });
      req.on('error', (e) => { file.destroy(); reject(e); });
      file.on('error', (e) => { req.destroy(); reject(e); });
    });
  }
}

// ---------- 安装更新 ----------
function installUpdate() {
  const filePath = updateState.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, message: '更新包不存在，请重新下载' };
  }
  const latest = updateState.latest;
  const versionLabel = latest ? ` v${latest.version}` : '';
  const choice = dialog.showMessageBoxSync(bootWindow || undefined, {
    type: 'question',
    title: '安装更新',
    message: `准备安装 ${APP_NAME}${versionLabel}`,
    detail: '即将启动安装程序。更新完成后请重新打开应用。',
    buttons: ['开始安装', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
    icon: appIcon(256),
  });
  if (choice !== 0) {
    return { ok: false, message: '已取消安装' };
  }
  updateStatus({ status: 'installing', message: '正在启动安装程序...' });
  // 优先用 shell.openPath 打开（.exe 会直接运行）
  const err = shell.openPath(filePath);
  if (err && typeof err.then === 'function') {
    err.then((msg) => {
      if (msg) {
        // 打开失败：回退为直接 spawn
        try {
          spawn(filePath, [], { detached: true, stdio: 'ignore' }).unref();
          updateStatus({ status: 'installing', message: '安装程序已启动' });
        } catch (e) {
          updateStatus({ status: 'error', error: '无法启动安装程序', message: '无法启动安装程序' });
        }
      } else {
        updateStatus({ status: 'installing', message: '安装程序已启动' });
      }
    });
  } else if (err) {
    try {
      spawn(filePath, [], { detached: true, stdio: 'ignore' }).unref();
      updateStatus({ status: 'installing', message: '安装程序已启动' });
    } catch (e) {
      updateStatus({ status: 'error', error: '无法启动安装程序', message: '无法启动安装程序' });
    }
  } else {
    updateStatus({ status: 'installing', message: '安装程序已启动' });
  }
  return { ok: true, message: '安装程序已启动' };
}

// ============================================================
//  设置 & 更新 IPC
// ============================================================
ipcMain.handle('settings:get', async () => {
  const cfg = loadAppConfig();
  let changelog = '';
  try {
    changelog = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8');
  } catch (e) { /* 未找到更新日志时留空 */ }
  return {
    version: appVersion(),
    changelog,
    notifications: cfg.notifications !== false,
    developerMode: cfg.developerMode === true,
    theme: cfg.theme === 'light' ? 'light' : 'dark',
    deviceId: cfg.deviceId,
    updateApiBase: UPDATE_API_BASE,
    appId: UPDATE_APP_ID,
    appName: APP_NAME,
    appTagline: APP_TAGLINE,
  };
});

// 界面主题切换（深色 / 浅色），持久化保存
ipcMain.handle('settings:set-theme', (e, theme) => {
  const cfg = loadAppConfig();
  cfg.theme = theme === 'light' ? 'light' : 'dark';
  saveAppConfig();
  logLine(`[设置] 界面主题已切换为${cfg.theme === 'light' ? '浅色' : '深色'}`);
  return { ok: true, theme: cfg.theme };
});

ipcMain.handle('settings:set-notifications', (e, enabled) => {
  const cfg = loadAppConfig();
  cfg.notifications = !!enabled;
  saveAppConfig();
  return { ok: true, notifications: cfg.notifications };
});

// 开发者选项模式开关（持久化，对下次启动生效）
ipcMain.handle('settings:set-developer-mode', (e, enabled) => {
  const cfg = loadAppConfig();
  cfg.developerMode = !!enabled;
  developerMode = !!enabled;
  saveAppConfig();
  logLine(`[设置] 开发者选项模式已${cfg.developerMode ? '开启' : '关闭'}（对下次启动生效）`);
  return { ok: true, developerMode: cfg.developerMode };
});

ipcMain.handle('update:check', async () => {
  return await checkUpdate();
});

ipcMain.handle('update:download', async () => {
  try {
    const filePath = await downloadUpdate();
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('update:install', async () => {
  return installUpdate();
});


// ============================================================
//  插件管理 IPC（推荐插件一键安装 + 自定义包名安装）
//  安装逻辑等价于 `dsh plugin --profile web add <pkg>`，但无需 pnpm：
//  npm install 进 profile 目录 + 自动注册 dsh.profile.bundles。
// ============================================================

// 查询推荐插件列表安装状态
ipcMain.handle('plugin:status', async () => {
  try {
    const dir = pluginMgr.profileDir();
    const list = pluginMgr.RECOMMENDED_PLUGINS.map((p) => ({
      pkg: p.pkg,
      title: p.title,
      desc: p.desc,
      ...pluginMgr.pluginStatus(dir, p.pkg),
    }));
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 列出 profile 中所有已安装插件
ipcMain.handle('plugin:list', async () => {
  try {
    const list = pluginMgr.listInstalledPlugins(pluginMgr.profileDir());
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 插件安装尝试的镜像顺序：当前镜像 → 镜像池其余镜像（去重）。
// 保证某个镜像缺包（404）/网络异常时能自动换到下一个可用镜像，插件不会因镜像问题装不上。
function pluginRegistryAttempts() {
  const list = [npmRegistry];
  for (const r of NPM_REGISTRIES) {
    if (!list.includes(r.url)) list.push(r.url);
  }
  return list;
}

function registryLabel(url) {
  const found = NPM_REGISTRIES.find((r) => r.url === url);
  return found ? found.name : url;
}

// 某个镜像安装成功后，把它记为当前镜像（后续安装/源安装直接复用可用镜像）
function setCurrentRegistry(url) {
  npmRegistry = url;
  const i = NPM_REGISTRIES.findIndex((r) => r.url === url);
  if (i >= 0) registryIndex = i;
}

// 统一安装入口：pkg 缺省为推荐插件
async function doInstallPlugin(pkg) {
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  const name = pkg || pluginMgr.PLUGIN_PKG;
  if (!nodeExe || !npmCli) {
    const msg = '未检测到 Node.js / npm，请先安装 Node.js（https://nodejs.org/）';
    broadcast('plugin:event', { stage: 'error', message: msg });
    return { ok: false, error: msg };
  }
  await ensureRegistrySelected();
  try {
    let r = null;
    // 依次尝试镜像池：当前镜像失败（404 缺包 / 网络异常等）自动换下一个
    for (const reg of pluginRegistryAttempts()) {
      broadcast('plugin:event', {
        stage: 'installing',
        pkg: name,
        message: `正在安装 ${name}（镜像：${registryLabel(reg)}）...`,
      });
      r = await pluginMgr.installPlugin({
        nodeExe,
        npmCli,
        registry: reg,
        pkg: name,
        onOut: (s) => {
          const line = String(s).replace(/\r?\n$/, '');
          logLine('[插件] ' + line);
          // 命令行输出同时转发到渲染进程，统一显示在「自定义安装」卡片
          broadcast('plugin:event', { stage: 'log', pkg: name, message: line });
        },
      });
      if (r.ok) {
        setCurrentRegistry(reg); // 记录可用镜像，后续安装优先使用
        logLine(`[镜像] 插件安装成功，当前镜像：${registryLabel(reg)}`);
        break;
      }
      // 非镜像类失败（包名不合法等）继续换镜像也无意义，直接终止
      if (!MIRROR_FAIL_RE.test(r.out || '')) break;
      logLine(`[镜像] ${registryLabel(reg)} 不可用（${(r.error || '安装失败').slice(0, 80)}），尝试下一个镜像`);
    }
    if (r.ok) {
      broadcast('plugin:event', {
        stage: 'done',
        pkg: name,
        message: `安装完成（v${r.version || '未知版本'}）${r.bundled ? '，已注册到 profile bundles' : ''}`,
      });
      notify('插件安装完成', `${name} v${r.version || ''} 已安装，重新运行服务后生效。`);
    } else {
      const triedAll = r && r.out && MIRROR_FAIL_RE.test(r.out);
      broadcast('plugin:event', {
        stage: 'error',
        pkg: name,
        message: `安装失败：${(r && r.error) || '未知错误'}${triedAll ? '（已尝试全部镜像源，请检查包名是否正确或网络是否可用）' : ''}`,
      });
    }
    return r;
  } catch (e) {
    broadcast('plugin:event', { stage: 'error', message: '安装异常：' + e.message });
    return { ok: false, error: e.message };
  }
}

// 一键安装推荐插件（pkg 缺省为 @feiyang666/deepseekharnessdesktop）
ipcMain.handle('plugin:install', async (e, payload) => {
  const pkg = payload && typeof payload === 'object' ? payload.pkg : null;
  return await doInstallPlugin(pkg || null);
});

// 自定义包名 / 安装命令安装（支持 "npm install xxx" 形式）
ipcMain.handle('plugin:install-custom', async (e, payload) => {
  const input = payload && typeof payload === 'object' ? payload.pkg : payload;
  const v = pluginMgr.validatePkgSpec(input);
  if (!v.ok) {
    broadcast('plugin:event', { stage: 'error', message: v.error });
    return { ok: false, error: v.error };
  }
  return await doInstallPlugin(v.pkg);
});

// 统一卸载入口：pkg 缺省为推荐插件
async function doUninstallPlugin(pkg) {
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  const name = pkg || pluginMgr.PLUGIN_PKG;
  if (!nodeExe || !npmCli) {
    const msg = '未检测到 Node.js / npm';
    broadcast('plugin:event', { stage: 'error', message: msg });
    return { ok: false, error: msg };
  }
  broadcast('plugin:event', { stage: 'uninstalling', pkg: name, message: `正在卸载 ${name} ...` });
  try {
    const r = await pluginMgr.uninstallPlugin({
      nodeExe,
      npmCli,
      registry: npmRegistry,
      pkg: name,
      onOut: (s) => {
        const line = String(s).replace(/\r?\n$/, '');
        logLine('[插件] ' + line);
        // 命令行输出同时转发到渲染进程，统一显示在「自定义安装」卡片
        broadcast('plugin:event', { stage: 'log', pkg: name, message: line });
      },
    });
    broadcast('plugin:event', {
      stage: r.ok ? 'done' : 'error',
      pkg: name,
      message: r.ok ? '卸载完成' : `卸载失败：${r.error || '未知错误'}`,
    });
    return r;
  } catch (e) {
    broadcast('plugin:event', { stage: 'error', message: '卸载异常：' + e.message });
    return { ok: false, error: e.message };
  }
}

ipcMain.handle('plugin:uninstall', async (e, payload) => {
  const input = payload && typeof payload === 'object' ? payload.pkg : payload;
  return await doUninstallPlugin(input || null);
});