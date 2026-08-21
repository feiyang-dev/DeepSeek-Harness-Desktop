'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, shell, dialog, Notification } = require('electron');
const { spawn, spawnSync, execFile } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const pluginMgr = require('./plugin-manager.js');
const pluginMarket = require('./plugin-market.js');
const dshSettings = require('./dsh-settings.js');

// ============================================================
//  全局状态
// ============================================================
const isWin = process.platform === 'win32';
// Windows 下把控制台代码页切到 UTF-8：main.js 日志输出 UTF-8 中文，若终端是
// GBK（chcp 936）会显示乱码（如「鍚姩」）。从 start.bat / cmd 启动时共享控制台，
// chcp 65001 对当前控制台立即生效；无控制台（双击 GUI 启动）时静默跳过。
if (isWin) {
  try {
    spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'chcp', '65001'], { stdio: 'ignore', windowsHide: true });
  } catch (e) { /* ignore */ }
}
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
// 项目主页（侧边栏「GitHub 项目」链接）
const PROJECT_URL = 'https://github.com/feiyang-dev/DeepSeek-Harness-Desktop';

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
  { name: '官方源（兜底）', url: 'https://registry.npmjs.org', fallback: true },
];

// 镜像类失败特征：网络不通 / 404 缺包（部分镜像不同步所有包）/ 超时等。
// 命中这些错误时说明"换一个镜像可能就好"，应自动切换镜像重试，
// 避免因某个镜像缺包/不可用导致插件装不上。
const MIRROR_FAIL_RE = /E404|404\s|Not Found|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|network|fetch failed|getaddrinfo|UNABLE_TO_GET_ISSUER/i;

// ============================================================
//  原生模块崩溃码识别（Windows NTSTATUS / 0xC0000005 等）
//  场景：dsh 服务进程在加载原生模块（koffi / node-pty / node-addon-require-builtin 等）
//  时发生内存访问违规，进程以这些码直接退出（无 JS 堆栈、无错误输出）。
//  常见根因：npx 缓存中损坏的预编译二进制 / 当前 Node 版本过新导致 ABI 不兼容。
//  处理策略：识别后自动清理缓存重启一次，仍失败则给出针对性提示。
// ============================================================
const NATIVE_CRASH_CODES = {
  // 0xC0000005 STATUS_ACCESS_VIOLATION —— 访问违规，最常见的原生模块崩溃
  3221225477: '内存访问违规（0xC0000005）',
  // 0xC0000409 STATUS_STACK_BUFFER_OVERRUN —— 栈缓冲区溢出
  3221226505: '栈缓冲区溢出（0xC0000409）',
  // 0xC00000FD STATUS_STACK_OVERFLOW —— 栈溢出
  3221225725: '栈溢出（0xC00000FD）',
  // 0xC0000135 STATUS_DLL_NOT_FOUND —— 找不到 DLL
  3221225781: '缺少动态链接库（0xC0000135）',
  // 0xC000000D STATUS_INVALID_PARAMETER —— 无效参数
  3221225485: '无效参数（0xC000000D）',
};

// 判断进程退出码是否为原生模块崩溃码（Windows 崩溃码一定是负数转无符号后的 0xC0000005 形式）
function isNativeCrashCode(code) {
  const n = Number(code);
  if (!Number.isInteger(n) || n === 0) return false;
  const unsigned = n >>> 0; // 负退出码转成无符号 32 位，如 -1073741819 -> 3221225477
  return Object.prototype.hasOwnProperty.call(NATIVE_CRASH_CODES, unsigned);
}

// 返回崩溃码的中文描述（非崩溃码返回 null）
function describeCrashCode(code) {
  const n = Number(code);
  if (!Number.isInteger(n)) return null;
  const unsigned = n >>> 0;
  return NATIVE_CRASH_CODES[unsigned] || null;
}

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

// 安装失败时切换到下一个镜像（并返回新镜像地址，供重试）。
// 策略：优先尝试其他国内镜像（跳过官方源兜底）；仅当所有国内镜像都试过仍失败，
// 才切换到官方源（registry.npmjs.org）作最后兜底 —— 避免某个国内镜像 404 缺包时
// 直接跳到官方源（网易 404 后跳到 npmjs 的旧问题），而是先换其他国内镜像继续。
function nextRegistry() {
  if (forcedRegistry) return null; // 强制指定时不切换
  const n = NPM_REGISTRIES.length;
  const start = registryIndex + 1;
  // 先在其他国内镜像中找下一个（跳过 fallback 官方源）
  for (let step = 0; step < n; step++) {
    const idx = (start + step) % n;
    const r = NPM_REGISTRIES[idx];
    if (r.fallback) continue; // 官方源兜底，放最后
    if (idx === registryIndex) break; // 转了一圈，所有国内镜像都试过了
    registryIndex = idx;
    npmRegistry = r.url;
    logLine(`[镜像] 当前镜像不可用，切换到：${r.name} ${r.url}`);
    return npmRegistry;
  }
  // 所有国内镜像都失败：官方源兜底（仅一次）
  const fb = NPM_REGISTRIES.findIndex((r) => r.fallback);
  if (fb < 0 || fb === registryIndex) return null;
  registryIndex = fb;
  npmRegistry = NPM_REGISTRIES[fb].url;
  logLine(`[镜像] 当前镜像不可用，切换到：${NPM_REGISTRIES[fb].name} ${npmRegistry}`);
  return npmRegistry;
}

let port = DEFAULT_PORT;
let host = '127.0.0.1';
// 移动端远程控制：开启后 dsh web 以 --host 0.0.0.0 监听所有网卡（手机扫码 / 局域网访问）。
// 仅影响服务监听地址；桌面端自身的健康检查、主窗口加载、日志展示始终用 127.0.0.1，不受影响。
let remoteControl = false;

// 获取本机局域网 IPv4 地址列表（供「移动端远程控制」设置页展示手机访问链接）
function getLanIPv4Addresses() {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const it of list || []) {
        if (it && it.family === 'IPv4' && !it.internal) out.push(it.address);
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

// ── 移动端远程控制的实现方式 ─────────────────────────────────────────────
// dsh 官方 CLI（dsh-web-app/startup.js）出于安全硬编码拒绝 `--host 0.0.0.0`
// （防止远程代码执行暴露到局域网）。因此不能通过命令行参数实现。
// 但 profile 配置层（dsh-host-webserver schema、dsh-web-app 的 ALL_INTERFACES_HOST /
// resolveLanTrust）完整支持 0.0.0.0。做法是：CLI 仍传 `--host 127.0.0.1`
// （桌面端自身的健康检查、主窗口加载、日志展示全部不受影响），同时给 dsh web
// 传一个 `--patch <overlay>`，把 webserver 行的 config.host 覆盖为 0.0.0.0。
// 这样 dsh-remote-web-ui 插件读到 webServer.host === "0.0.0.0"，就会生成局域网
// 配对二维码 / 手机访问链接。
//
// overlay 文件内容（YAML patch 列表，按 id 覆盖 bundle 层 webserver 行）：
//   - id: webserver
//     config:
//       host: '0.0.0.0'
//       port: !!js ctx.webStartup.port ?? <默认端口>
function remoteOverlayPath() {
  try {
    return path.join(app.getPath('userData'), 'remote-control.patch.yml');
  } catch (e) {
    return path.join(os.tmpdir(), 'dsh-remote-control.patch.yml');
  }
}

// 按当前 remoteControl 开关状态生成/删除 overlay 文件。启动各模式前调用一次即可。
function syncRemoteOverlay() {
  const file = remoteOverlayPath();
  try {
    if (!remoteControl) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return;
    }
    const content = [
      '# Auto-generated by dsh-desktop (mobile remote control). Do not edit.',
      '- id: webserver',
      '  config:',
      "    host: '0.0.0.0'",
      '    port: !!js ctx.webStartup.port ?? ' + String(port),
    ].join('\n') + '\n';
    fs.writeFileSync(file, content, 'utf8');
  } catch (e) {
    logLine(`[警告] 写入移动端远程控制 overlay 失败：${e.message}`);
  }
}

// 拼接启动参数中远程控制相关的片段：开启时传 --patch overlay，关闭时不传
function remoteControlArgs() {
  return remoteControl ? ['--patch', remoteOverlayPath()] : [];
}

let bootWindow = null;   // 首页引导窗口（常驻：模式选择 / 运行状态控制台 / 插件管理 / 设置）
let mainWindow = null;   // WebUI 主窗口（独立新窗口，加载 http://host:port）
let closeDialogOpen = false; // WebUI 关闭确认框是否已弹出（防重复弹窗）
let tray = null;
let serverProc = null;          // dsh 服务进程
let serverSpawnedByUs = false;
let devWebProc = null;          // 开发者选项模式：浏览器端热更 watcher（pnpm dev:web）进程
let quitting = false;
let developerMode = false;      // 开发者选项模式（设置中持久化，对下次启动生效）
let bootPhase = 'init';         // mode / detect / install / start / running / stopped / error
let bootProgressPercent = 0;    // 最近一次广播的启动进度百分比
let symlinkHealed = false;      // .dsh/profiles symlink 是否已自动修复过（防无限重启）
// npx 缓存自动修复预算（模块级，跨 startWebViaNpx 递归调用共享，防无限重启）。
// 两类问题独立计数：原生崩溃重下也救不了 ABI 不兼容，只修 1 次；
// 缓存损坏重下大概率有效，允许 2 次（第 2 次先 npm cache verify 校验内容缓存）。
// 服务成功启动（finishBoot）或用户重新运行（run）时复位，下次故障仍有全额预算。
let crashRepairBudget = 1;      // 原生模块崩溃（0xC0000005 等）自动修复剩余次数
let cacheRepairBudget = 2;      // npx 缓存损坏（文件缺失 / main 入口缺失）自动修复剩余次数
let selectedMode = null;        // 'quick' | 'source' | 'repair' | 'local'
let modeTimer = null;
let portCleanupDone = false;    // 启动时端口清理是否完成

// 环境定位缓存：极速启动（本地固定目录）每次点击都要走 findNodeExe/findNpmCli，
// 而 which() 内部会 spawn 子进程（where 命令），几百毫秒纯属浪费。缓存结果，
// 同一应用会话内复用；安装 Node 后会主动清缓存（见 installNodeOfficial）。
let cachedNodeExe = null;
let cachedNpmCli = null;

// 服务运行状态（供首页"正在运行中"控制台展示）
const serviceState = {
  running: false,
  mode: null,          // 当前启动模式
  port: DEFAULT_PORT,
  startedAt: null,     // 最近一次就绪时间戳
  pid: null,
  devMode: false,      // 开发者选项模式（服务端后端 + 浏览器端热更 watcher 分离运行）
  devWebPid: null,     // 浏览器端热更 watcher 进程 PID
  dshVersion: null,    // 最近一次 npx 快速启动实际运行的 dsh 版本
  localUpdate: null,   // 离线启动模式检测到官方新版：{ latest, next, current }，无则 null
  remoteControl: false, // 移动端远程控制是否开启（服务监听 0.0.0.0）
  lanAddresses: [],    // 局域网 IPv4 地址列表（开启远程控制时手机访问用）
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
  local: [
    { p: 0, title: '检测运行环境' },
    { p: 25, title: '检查本地运行环境' },
    { p: 45, title: '安装本地运行环境' },
    { p: 80, title: '启动本地 dsh 服务' },
    { p: 96, title: '启动服务' },
  ],
};

let currentSteps = null; // 当前模式的步骤表
let firstInstallShown = false; // 本次启动是否已向前端发出过「首次安装」提示

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
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  // 强制单调递增：进度只往前走，不回退（除非 resetProgress 显式重置）。
  // 修复各模式百分比与阶段脱节的问题（如"正在安装"却显示 60%、到不了 100%）。
  const effective = p >= bootProgressPercent ? p : bootProgressPercent;
  bootPhase = stage;
  bootProgressPercent = effective;
  // 安装阶段自动启动"慢进"定时器（下载依赖时进度持续走动），离开 install 阶段即停止
  if (stage === 'install') {
    startInstallTicker();
  } else if (stage !== 'install') {
    stopInstallTicker();
  }
  broadcast('boot:progress', {
    percent: effective,
    stage,
    text,
    detail: detail || '',
    hint: hint || '',
    step: resolveStep(effective),
    // 下载/解压进度（前端日志面板进度条用）
    dl: { count: installStats.downloaded, total: installStats.total || null },
    ex: { count: installStats.extracted, total: installStats.total || null },
  });
}

// 重置进度（仅在启动模式切换 / 重新运行时调用，避免上次残留的百分比卡住新进度）
function resetProgress() {
  bootProgressPercent = 0;
  firstInstallShown = false;
  installStats.downloaded = 0;
  installStats.extracted = 0;
  installStats.lastPkg = '';
  installStats.total = 0;
  stopInstallTicker();
}

// ===== 安装阶段"慢进"机制 =====
// 大文件下载（如首次安装数百 MB 依赖）阶段可能长时间没有任何 setProgress 事件，
// 进度条会卡在某个数字不动，给用户"卡死"的错觉。这里用一个低频定时器，
// 在 install 阶段内缓慢推进百分比（最高到安装阶段的合理上限），让进度"一直在走"。
let installTicker = null;
// 安装/更新阶段的开始时间（用于进度页实时显示"已进行 X 分 Y 秒"）
let installStageStartedAt = 0;
// 安装/更新统计（供进度页与心跳日志展示"已下载 N 个包 / 已解压 N 个包"）
// total = 依赖树解析出的总包数（npm silly placeDep ROOT <pkg> 在下载前全部输出）
const installStats = { downloaded: 0, extracted: 0, lastPkg: '', total: 0 };

// 格式化为 "X 分 YY 秒"（不足 1 分钟显示 "YY 秒"）
function formatElapsed(msec) {
  const sec = Math.max(0, Math.floor(msec / 1000));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return mm > 0 ? `${mm} 分 ${String(ss).padStart(2, '0')} 秒` : `${ss} 秒`;
}

// 解析 npm 实时输出，累计下载 / 解压进度统计。
//  - 总包数：`npm silly placeDep ROOT <pkg>@<ver>`（依赖树解析阶段先于下载/解压全部输出）
//  - 下载：`npm http fetch GET 200 <url>.tgz` / `npm http cache <pkg>@<url>.tgz`
//  - 解压：`npm silly ADD node_modules/<pkg>`（每解压完一个包输出一行）
function feedInstallStats(raw) {
  if (/npm silly placeDep ROOT\s+\S+/.test(raw)) installStats.total += 1;
  if (/\.tgz/.test(raw) && /npm http (fetch GET 200|cache)/.test(raw)) installStats.downloaded += 1;
  const addM = raw.match(/npm silly ADD node_modules\/([^\s]+)/);
  if (addM) { installStats.extracted += 1; installStats.lastPkg = addM[1]; }
}

function startInstallTicker() {
  if (installTicker) return;
  installTicker = setInterval(() => {
    // 仅当仍处于 install 阶段、且尚未进入等待/就绪阶段时慢进
    if (bootPhase !== 'install' || bootProgressPercent >= 95) {
      stopInstallTicker();
      return;
    }
    // 每次 +0.3%，约 5 分钟从 0 爬到 90；配合真实进度事件，实际到不了上限
    const next = Math.min(bootProgressPercent + 0.3, 92);
    bootProgressPercent = next;
    // 每 2 秒刷新耗时 + 下载/解压进度：首次安装 / 更新都展示，避免进度页长时间无变化
    const elapsed = formatElapsed(installStageStartedAt ? Date.now() - installStageStartedAt : 0);
    const stats = [];
    if (installStats.downloaded > 0) stats.push(`已下载 ${installStats.downloaded} 个依赖包`);
    if (installStats.extracted > 0) stats.push(`已解压 ${installStats.extracted} 个${installStats.lastPkg ? `（最近：${installStats.lastPkg}）` : ''}`);
    const stageName = firstInstallShown ? '正在下载并安装运行环境' : '正在更新运行环境';
    const hint = `${stageName}，已 ${elapsed}${stats.length ? '，' + stats.join('，') : ''}，请耐心等待（可展开命令行日志查看每个包的下载/解压过程）`;
    broadcast('boot:progress', {
      percent: Math.round(next),
      stage: 'install',
      text: null,
      detail: null,
      hint,
      // 保持首次安装提示可见（避免慢进事件把已显示的首次安装提示关掉）
      firstInstall: firstInstallShown,
      step: resolveStep(next),
      // 下载/解压进度（前端日志面板进度条用）
      dl: { count: installStats.downloaded, total: installStats.total || null },
      ex: { count: installStats.extracted, total: installStats.total || null },
    });
  }, 2000);
}
function stopInstallTicker() {
  if (installTicker) {
    clearInterval(installTicker);
    installTicker = null;
  }
}

// 通知前端「这是首次安装 / 大文件下载」，让进度页展示醒目提示引导用户耐心等待。
// firstInstallShown 防止同一次启动重复广播（安装进度会多次 setProgress）。
function notifyFirstInstall() {
  if (firstInstallShown) return;
  firstInstallShown = true;
  broadcast('boot:progress', {
    percent: Math.max(0, Math.min(100, Math.round(bootProgressPercent))),
    stage: bootPhase,
    text: null,
    detail: null,
    hint: null,
    firstInstall: true,
    step: resolveStep(bootProgressPercent),
  });
}

// ============================================================
//  日志文件（设置页「查看日志」）
//  目录：<userData>/logs/，按天分文件 dsh-desktop-YYYY-MM-DD.log。
//  仅做追加写入，任何异常都静默忽略，绝不阻塞主流程。
// ============================================================
function logsDir() {
  try {
    return path.join(app.getPath('userData'), 'logs');
  } catch (e) {
    return path.join(os.homedir(), '.dsh', 'logs');
  }
}

function currentLogFilePath() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return path.join(logsDir(), `dsh-desktop-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`);
}

function appendLogFile(text) {
  try {
    const file = currentLogFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    fs.appendFileSync(file, `[${stamp}] ${text}\n`, 'utf8');
  } catch (e) { /* 日志写入失败不影响主流程 */ }
}

// 读取当前日志文件尾部最多 maxLines 行
function readRecentLogs(maxLines) {
  const file = currentLogFilePath();
  const dir = logsDir();
  try {
    if (!fs.existsSync(file)) return { ok: true, content: '', file, logDir: dir };
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    // 去掉末尾可能出现的空行
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    const tail = lines.slice(Math.max(0, lines.length - (maxLines || 2000)));
    return { ok: true, content: tail.join('\n'), file, logDir: dir };
  } catch (e) {
    return { ok: false, error: e.message, content: '', file, logDir: dir };
  }
}

function logLine(line) {
  const text = typeof line === 'string' ? line : String(line);
  // 每行日志统一带 [HH:MM:SS] 时间戳：界面日志面板与开发终端可见，便于判断"干了多久"。
  // 日志文件由 appendLogFile 内部自行加时间戳，这里传原始文本避免重复。
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const stamped = `[${stamp}] ${text}`;
  broadcast('boot:log', stamped);
  appendLogFile(text);
  process.stderr.write('[dsh] ' + stamped + '\n');
}

// 启动失败：透传可选的崩溃码，前端据此展示针对性修复建议
function bootError(message, crashCode) {
  bootPhase = 'error';
  stopInstallTicker();
  logLine(`[错误] ${message}`);
  broadcast('boot:status', { phase: 'error', message, crashCode: crashCode != null ? Number(crashCode) : null });
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
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ============================================================
//  工具函数
// ============================================================
// 应用图标：按需加载不同尺寸的 PNG（托盘用 32，窗口用 256）。
// 支持黑/白两套：white=true 时用白色 logo（深色模式），否则用黑色 logo（浅色模式）。
const ICON_DIR = path.join(__dirname, 'assets');
function appIcon(size, white) {
  const suffix = white ? '-white' : '';
  const file = size
    ? path.join(ICON_DIR, `icon-${size}${suffix}.png`)
    : path.join(ICON_DIR, `icon${suffix}.png`);
  return nativeImage.createFromPath(file);
}
// 根据当前主题返回窗口图标（浅色 -> 黑 logo；深色 -> 白 logo）
function themedAppIcon(size) {
  return appIcon(size, resolveEffectiveTheme() === 'dark');
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

// 官方 Node.js MSI 的常见安装位置（机器级 + 每用户安装），用于 PATH 未刷新时仍能定位 node.exe
function knownNodeDirs() {
  const dirs = [];
  if (isWin) {
    const prog = process.env['ProgramFiles'] || 'C:\\Program Files';
    const prog86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    dirs.push(path.join(prog, 'nodejs'));
    dirs.push(path.join(prog86, 'nodejs'));
    dirs.push(path.join(local, 'Programs', 'nodejs'));
    // nvm-windows 常见布局：<NVM_HOME>\v<version>
    const nvmHome = process.env['NVM_HOME'];
    if (nvmHome) {
      try {
        for (const e of fs.readdirSync(nvmHome)) {
          if (/^v\d+/.test(e)) dirs.push(path.join(nvmHome, e));
        }
      } catch (_) { /* ignore */ }
    }
  } else {
    // macOS / Linux：Homebrew / 官方 pkg / nvm
    dirs.push('/usr/local/bin');
    dirs.push('/opt/homebrew/bin');
    dirs.push('/usr/bin');
  }
  return dirs;
}

function findNodeExeSyncFallback() {
  const name = isWin ? 'node.exe' : 'node';
  for (const d of knownNodeDirs()) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function findNodeExe() {
  if (cachedNodeExe) return cachedNodeExe;
  const w = await which('node');
  if (w) { cachedNodeExe = w; return w; }
  // PATH 未刷新（刚安装 / 未加入 PATH）时，回退到官方安装目录定位
  const fb = findNodeExeSyncFallback();
  if (fb) cachedNodeExe = fb;
  return fb;
}

// 官方 Git for Windows 的常见安装位置（机器级 + 每用户），用于 PATH 未刷新时仍能定位 git.exe
function knownGitDirs() {
  const dirs = [];
  if (isWin) {
    const prog = process.env['ProgramFiles'] || 'C:\\Program Files';
    const prog86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    dirs.push(path.join(prog, 'Git', 'cmd'));
    dirs.push(path.join(prog86, 'Git', 'cmd'));
    dirs.push(path.join(local, 'Programs', 'Git', 'cmd'));
  } else {
    dirs.push('/usr/bin');
    dirs.push('/usr/local/bin');
    dirs.push('/opt/homebrew/bin');
  }
  return dirs;
}

async function findGitExe() {
  const w = await which('git');
  if (w) return w;
  const name = isWin ? 'git.exe' : 'git';
  for (const d of knownGitDirs()) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function findNpmCli() {
  if (cachedNpmCli) return cachedNpmCli;
  const nodeExe = await findNodeExe();
  if (!nodeExe) return null;
  const nodeDir = path.dirname(nodeExe);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) { cachedNpmCli = c; return c; }
  }
  const npmCmd = await which('npm');
  if (npmCmd) {
    const c2 = path.join(path.dirname(npmCmd), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(c2)) { cachedNpmCli = c2; return c2; }
  }
  // macOS：Homebrew 安装的 node/npm 是符号链接（/opt/homebrew/bin/npm →
  // ../lib/node_modules/npm/bin/npm-cli.js），上面两种布局都找不到。
  // 用 `npm root -g` 拿到全局 node_modules 真实目录再定位 npm-cli.js。
  if (process.platform === 'darwin' && npmCmd) {
    const rootR = await runCommand(nodeExe, [npmCmd, 'root', '-g'], null, () => {});
    const root = String(rootR.out || '').trim().split(/\r?\n/).pop().trim();
    if (root) {
      const c3 = path.join(root, 'npm', 'bin', 'npm-cli.js');
      if (fs.existsSync(c3)) { cachedNpmCli = c3; return c3; }
    }
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

// ============================================================
//  官方运行环境自动补齐（Node.js / git，均下载正版官方安装包）
// ============================================================

// 下载文件到本地（支持 30x 重定向，回传下载进度），返回目标路径
function downloadToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': `dsh-desktop/${appVersion()}` }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        return resolve(downloadToFile(res.headers.location, destPath, onProgress));
      }
      if (res.statusCode !== 200) {
        req.destroy();
        return reject(new Error(`下载失败（HTTP ${res.statusCode}）`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      const file = fs.createWriteStream(destPath);
      let received = 0;
      res.on('data', (c) => {
        received += c.length;
        if (onProgress) onProgress(received, total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
      file.on('error', reject);
      req.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
    req.on('error', reject);
  });
}

// 解析官方最新 LTS 版本号（失败时回退到固定稳定版本）
async function resolveLatestNodeVersion() {
  try {
    const data = await httpJsonRequest('https://nodejs.org/dist/index.json', 20000);
    if (Array.isArray(data)) {
      const lts = data.find((v) => v && v.lts);
      if (lts && lts.version) return String(lts.version).replace(/^v/, '');
      const stable = data.find((v) => v && v.version);
      if (stable && stable.version) return String(stable.version).replace(/^v/, '');
    }
  } catch (e) { /* 回退 */ }
  return '20.18.1'; // 官方 LTS 兜底版本
}

// 自动安装官方 Node.js（MSI 静默每用户安装，无需管理员权限）
// 返回是否安装成功（随后可经 findNodeExe 定位 node.exe）
async function installNodeOfficial() {
  setProgress(9, 'detect', '未检测到 Node.js，正在自动安装官方 Node.js（LTS）...',
    '首次使用需安装 Node.js 运行环境（含 npm）', '自动下载官方安装包并静默安装，请耐心等待');
  logLine('[环境] 未检测到 Node.js，开始自动安装官方 Node.js（LTS）...');

  const version = await resolveLatestNodeVersion();
  const url = `https://nodejs.org/dist/v${version}/node-v${version}-x64.msi`;
  const tmp = path.join(app.getPath('temp'), `node-v${version}-x64.msi`);
  logLine(`[环境] 下载官方安装包：${url}`);

  try {
    await downloadToFile(url, tmp, (received, total) => {
      if (total > 0) {
        const pct = 9 + Math.round((received / total) * 6);
        setProgress(pct, 'detect', `正在下载 Node.js v${version}（${formatBytes(received)} / ${formatBytes(total)}）...`);
      }
    });
  } catch (e) {
    logLine(`[环境] Node.js 下载失败：${e.message}`);
    return false;
  }

  setProgress(15, 'detect', `正在安装 Node.js v${version}...`, '静默安装官方安装包', '安装完成后会自动写入用户环境变量（新终端生效）');
  logLine('[环境] 正在静默安装 Node.js（msiexec /qn，每用户模式）...');
  const msiexec = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'msiexec.exe') : 'msiexec';
  const r = await runCommand(msiexec, ['/i', tmp, '/qn', '/norestart', 'MSIINSTALLPERUSER=1'], null, (s) => {
    const line = String(s).replace(/\r?\n$/, '');
    if (line.trim()) logLine('[环境] ' + line);
  });
  // msiexec 返回 0 为成功，3010 为"成功但需重启"；两者都视为安装成功
  if (r.code !== 0 && r.code !== 3010) {
    logLine(`[环境] Node.js 安装失败（msiexec 退出码 ${r.code}）`);
    return false;
  }

  // 安装后定位 node.exe（PATH 可能尚未刷新，直接按官方安装目录查找）
  const nodeExe = findNodeExeSyncFallback() || (await which('node'));
  if (!nodeExe) {
    logLine('[环境] Node.js 安装完成但未找到 node.exe，请重启本应用后重试');
    return false;
  }
  // 新装 Node：清除环境定位缓存，后续 findNodeExe/findNpmCli 用新路径
  cachedNodeExe = null;
  cachedNpmCli = null;
  logLine(`[环境] Node.js 安装完成：${nodeExe}`);
  return true;
}

// 解析官方最新 Git for Windows 版本号（失败时回退到固定稳定版本）
async function resolveLatestGitVersion() {
  try {
    const data = await httpJsonRequest('https://api.github.com/repos/git-for-windows/git/releases/latest', 20000);
    const tag = data && data.tag_name;
    if (tag) return String(tag).replace(/^v/, '');
  } catch (e) { /* 回退 */ }
  return '2.47.1.windows.2'; // 官方稳定版兜底
}

// 自动安装官方 Git for Windows（每用户静默安装，无需管理员权限）
// 返回是否安装成功（随后可经 findGitExe 定位 git.exe）
async function installGitOfficial() {
  setProgress(31, 'install', '未检测到 git，正在自动安装官方 Git for Windows...',
    '源码完整安装需要 git 工具', '自动下载官方安装包并静默安装，请耐心等待');
  logLine('[环境] 未检测到 git，开始自动安装官方 Git for Windows...');

  const version = await resolveLatestGitVersion();
  const url = `https://github.com/git-for-windows/git/releases/download/v${version}/Git-${version}-64-bit.exe`;
  const tmp = path.join(app.getPath('temp'), `Git-${version}-64-bit.exe`);
  logLine(`[环境] 下载官方安装包：${url}`);

  try {
    await downloadToFile(url, tmp, (received, total) => {
      if (total > 0) {
        const pct = 31 + Math.round((received / total) * 3);
        setProgress(pct, 'install', `正在下载 Git for Windows（${formatBytes(received)} / ${formatBytes(total)}）...`);
      }
    });
  } catch (e) {
    logLine(`[环境] Git 下载失败：${e.message}`);
    return false;
  }

  setProgress(34, 'install', `正在安装 Git for Windows v${version}...`, '静默安装官方安装包', '安装完成后会自动写入用户环境变量（新终端生效）');
  logLine('[环境] 正在静默安装 Git for Windows（每用户模式）...');
  const r = await runCommand(tmp, ['/VERYSILENT', '/CURRENTUSER', '/NORESTART', '/NOCANCEL', '/SP-', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS'], null, (s) => {
    const line = String(s).replace(/\r?\n$/, '');
    if (line.trim()) logLine('[环境] ' + line);
  });
  if (r.code !== 0) {
    logLine(`[环境] Git 安装失败（安装器退出码 ${r.code}）`);
    return false;
  }

  const gitExe = await findGitExe();
  if (!gitExe) {
    logLine('[环境] Git 安装完成但未找到 git.exe，请重启本应用后重试');
    return false;
  }
  logLine(`[环境] Git 安装完成：${gitExe}`);
  return true;
}

// 通用子进程执行器：转发原始输出到日志面板，并返回 { code, out, error?, killed? }
// 自愈超时支持：opts.idleTimeoutMs = 无任何输出超时（判定卡死）、opts.timeoutMs = 整体硬超时。
// 两种超时都会强制终止子进程并返回 killed:true，供上层做"卡死自修复"。
function runCommand(exe, args, opts, onOut) {
  const { idleTimeoutMs = 0, timeoutMs = 0, onSpawned = null, ...spawnOpts } = opts || {};
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnOpts,
    });
    if (onSpawned) onSpawned(child);
    let out = '';
    let idleTimer = null;
    let killTimer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };
    const killChild = () => {
      try { child.kill(); } catch (e) { /* 忽略 */ }
    };
    // 无输出超时：每次收到输出都重新武装计时（有输出即视为"活着"）。
    // 注意：必须先 clear 再 set，且 armIdle 必须放在 onData 可访问的作用域。
    const armIdle = () => {
      if (!idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        logLine(`[自修复] 检测到进程超过 ${Math.round(idleTimeoutMs / 1000)} 秒无任何输出（疑似卡死），正在强制终止...`);
        killChild();
        finish({ code: -2, out, error: 'idle-timeout', killed: true });
      }, idleTimeoutMs);
    };
    const onData = (d) => {
      const s = String(d);
      out += s;
      armIdle(); // 有输出：重新开始无输出计时
      if (onOut) onOut(s);
      else logLine(s.replace(/\r?\n$/, ''));
    };
    child.stdout && child.stdout.on('data', onData);
    child.stderr && child.stderr.on('data', onData);
    armIdle(); // 初始武装
    // 整体超时：硬性兜底
    if (timeoutMs > 0) {
      killTimer = setTimeout(() => {
        logLine(`[自修复] 进程运行超过 ${Math.round(timeoutMs / 60000)} 分钟仍未完成（超时上限），正在强制终止...`);
        killChild();
        finish({ code: -3, out, error: 'timeout', killed: true });
      }, timeoutMs);
    }
    child.on('error', (err) => finish({ code: -1, out, error: err.message }));
    // code === null 表示进程被信号终止（外部 kill / 自愈强制终止），标记 killed 供上层判断
    child.on('close', (code) => finish({ code, out, killed: code === null }));
  });
}

// ===== npm 安装"自修复"机制 =====
// npm 在解析/重建 dsh 这种 150+ 依赖的超大依赖树时，偶发死循环卡死
//（无输出、无网络、无磁盘写入、CPU 满转）。这里给安装命令加两层超时保护，
// 检测到卡死后自动清理残留安装状态并重试（清理深度逐级加深），彻底失败才报错。
const NPM_INSTALL_IDLE_TIMEOUT = 8 * 60 * 1000; // 8 分钟无任何输出 = 判定卡死
const NPM_INSTALL_TIMEOUT = 30 * 60 * 1000;     // 30 分钟整体硬上限

// 清理安装现场：删除可能损坏的 lockfile 与目标包目录，避免残留状态干扰重试。
// deep=true 时彻底删除整个 node_modules（多次中断可能留下残缺/损坏的半成品目录）。
// 注意：只清理 dsh-local 下的安装残留，绝不触碰 npm 全局缓存（_cacache，2GB+ 的有效复用缓存）。
function cleanupPartialDshInstall(dir, deep) {
  try {
    const lock = path.join(dir, 'package-lock.json');
    if (fs.existsSync(lock)) fs.rmSync(lock, { force: true });
    if (deep) {
      const nm = path.join(dir, 'node_modules');
      if (fs.existsSync(nm)) fs.rmSync(nm, { recursive: true, force: true });
      return;
    }
    const dshPkg = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh');
    if (fs.existsSync(dshPkg)) fs.rmSync(dshPkg, { recursive: true, force: true });
    const scope = path.join(dir, 'node_modules', '@deepseek-ai');
    if (fs.existsSync(scope)) fs.rmSync(scope, { recursive: true, force: true });
  } catch (e) { /* 清理失败不影响重试 */ }
}

// 开始安装前的轻量清理：只删除 package-lock.json（可能记录旧依赖树/损坏状态）。
// 注意：绝不能全删 node_modules —— Windows 上同步递归删除 333MB/近万个文件会阻塞
// 数分钟（表现为"更新卡死"）；且清空后 npm 全量重建依赖树更慢、更容易触发 npm 11
// 解析性能问题。残缺/损坏的包由自愈机制（cleanupPartialDshInstall）在卡死时定向清理。
function purgeLocalInstallBeforeInstall(dir) {
  try {
    const lock = path.join(dir, 'package-lock.json');
    if (fs.existsSync(lock)) { fs.rmSync(lock, { force: true }); return true; }
    return false;
  } catch (e) { return false; }
}

// 带自愈的 npm install（固定用 npm@10 执行，绕开 npm 11 解析超大依赖树的性能缺陷）：
//  - 卡死/超时（killed）→ 清理残留 → 自动重试，最多 2 轮，清理深度逐级加深
//  - 镜像类失败 → 自动切换镜像重试
//  - 其它失败不盲目重试，交由上层报错
async function runNpmInstallSelfHealing(nodeExe, base, env, dir) {
  const npmCli = base[0];
  // 最近一次收到子进程输出的时间（心跳用）：npm 下载/解压依赖阶段可能长时间零输出，
  // 靠心跳日志让日志面板持续有动静，用户无需反复手动判断"是不是卡住了"。
  let lastOutputAt = Date.now();
  const onOut = (s) => {
    lastOutputAt = Date.now();
    const raw = s.replace(/\r?\n$/, '');
    feedInstallStats(raw); // 累计下载/解压进度
    logLine(raw);
  };
  // 关闭 audit/fund（POST 到 npmjs.org 慢且刷屏）+ 调高并行下载数（150+ 依赖的 tarball 并发拉取，加速下载阶段）
  const npmEnv = { ...env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_maxsockets: '20' };
  // 关键：npm 11 在解析 @deepseek-ai/dsh 这种 150+ 依赖的超大树时，idealTree/placeDep
  // 阶段会 CPU 满转、零网络零写盘、输出极慢（实测 15 分钟仍未进入下载解压阶段）。
  // 因此直接改用 npm@10 执行安装绕开该性能缺陷：npx 首次缓存 npm@10（几十秒），
  // 之后每次复用缓存，比"先用 npm 11 卡死再切换"更快、也更简单。
  const run = (registry) => {
    const opts = { env: npmEnv, idleTimeoutMs: NPM_INSTALL_IDLE_TIMEOUT, timeoutMs: NPM_INSTALL_TIMEOUT };
    // `--` 后第一个参数是命令名 `npm`，其后为 `install` 子命令；外层 `--registry` 让 npx 下载 npm@10 也走所选镜像
    // 注意：不能用 --legacy-peer-deps —— 它会跳过 peerDependencies 的自动安装，导致 dsh 的 cordis 插件
    // （如 @deepseek-ai/cordis-plugin-group）缺失、启动时 ERR_MODULE_NOT_FOUND 崩溃。必须保留 peerDeps 自动安装。
    const subArgs = ['install', ...base.slice(2), '--no-package-lock', '--registry', registry];
    return runCommand(nodeExe, [npmCli, 'exec', '--yes', '--package', 'npm@10', '--registry', registry, '--', 'npm', ...subArgs], opts, onOut);
  };
  // 安装心跳：子进程静默超过 15 秒时，每 15 秒补一条带耗时的时间戳日志。
  // 注意：只补日志，绝不杀进程——dsh 依赖树（150+ 包）解析慢是正常现象，
  // 无输出不代表卡死；误杀只会导致"反复重启、永远装不完"的死循环。
  const heartbeat = setInterval(() => {
    if (Date.now() - lastOutputAt < 15000) return; // 子进程一直在输出，不打扰
    logLine(`[进度] npm 安装仍在进行中（已 ${formatElapsed(installStageStartedAt ? Date.now() - installStageStartedAt : 0)}），当前阶段无输出属正常（正在下载/解压依赖），请耐心等待`);
  }, 15000);
  let r = await run(npmRegistry);
  // 真正的"卡死"判定：由 runCommand 的 idleTimeoutMs（8 分钟完全无输出）触发并强制终止。
  // 依赖树解析慢（有零星输出）绝不触发。
  for (let attempt = 1; attempt <= 2 && r.code !== 0; attempt++) {
    if (r.killed === true) { // 仅当 idle/整体超时被信号终止
      logLine(`[自修复] npm 安装超过 ${Math.round(NPM_INSTALL_IDLE_TIMEOUT / 60000)} 分钟无任何输出（判定卡死），正在清理残留后自动重试（第 ${attempt} 次/共 2 次）...`);
      cleanupPartialDshInstall(dir, attempt >= 2);
      r = await run(npmRegistry);
      continue;
    }
    if (MIRROR_FAIL_RE.test(String(r.out || ''))) {
      const next = nextRegistry();
      if (!next) break;
      logLine('[镜像] 自动切换镜像重试安装本地运行环境');
      r = await run(next);
      continue;
    }
    break; // 非卡死、非镜像错误的其它失败：不盲目重试
  }
  clearInterval(heartbeat);
  return r;
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
  logLine(`[模式] 用户选择：${mode === 'quick' ? '快速启动（npx）' : mode === 'repair' ? '本地修复' : mode === 'local' ? '极速启动（本地环境）' : '源码完整安装'}`);
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
    if (isWin) {
      const ps = `
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match '@deepseek-ai[\\\\/]dsh' -or
  $_.CommandLine -match 'dsh-local' -or
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
      return;
    }
    if (process.platform === 'darwin') {
      // macOS：pgrep -f 匹配 dsh 相关 node 进程命令行后逐个 kill -9
      const pattern = '(@deepseek-ai\\\\/dsh|dsh\\\\/lib\\\\/bin|bin\\\\.ts web|dev:web)';
      execFile('pgrep', ['-f', pattern], { windowsHide: true }, (err, stdout) => {
        if (err) { resolve(); return; }
        const pids = String(stdout).split(/\r?\n/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0 && n !== process.pid);
        if (pids.length === 0) { resolve(); return; }
        logLine('[诊断] killDshNodeProcesses 将终止: ' + pids.join(','));
        const kills = pids.map((pid) => new Promise((res) => {
          execFile('kill', ['-9', String(pid)], {}, () => res());
        }));
        Promise.all(kills).then(() => resolve());
      });
      return;
    }
    resolve();
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
  // 1) Cannot find package 'xxx'（用户插件缺失）
  //    注意：不能匹配 "Cannot find module '文件路径'"——那是 npx 缓存损坏（缺文件），
  //    应由缓存修复分支处理，而不是当作用户插件去摘除引用。
  const re1 = /Cannot find package\s+['"]([^'"]+)['"]/g;
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

// 「已安装且已构建」状态文件放在 userData 下（不污染 git 仓库），
// 用于判断二次启动是否可以跳过 pnpm install / pnpm run build。
function sourceStatePath() {
  return path.join(app.getPath('userData'), '.dsh-harness-build-state.json');
}

// 以 pnpm-lock.yaml + package.json 内容计算指纹：依赖未变更时无需重装重编。
// （依赖变更（如 git pull）会改变指纹，从而自动触发重新 install + build）
function sourceFingerprint(repoPath) {
  const hash = crypto.createHash('sha256');
  for (const f of ['pnpm-lock.yaml', 'package.json']) {
    try { hash.update(fs.readFileSync(path.join(repoPath, f), 'utf8')); } catch { /* 文件缺失则贡献空片段 */ }
  }
  return hash.digest('hex');
}

// 写入「已成功 install + build」状态；失败不影响启动，仅返回 false。
function markSourceBuilt(repoPath) {
  try {
    fs.writeFileSync(sourceStatePath(), JSON.stringify({
      built: true,
      repoPath,
      fingerprint: sourceFingerprint(repoPath),
      at: Date.now(),
    }, null, 2));
    return true;
  } catch (e) {
    logLine(`[源码] 写入构建状态文件失败（不影响启动）: ${e.message}`);
    return false;
  }
}

// 是否可跳过 install/build：仓库存在 + node_modules 完整 + 状态标记存在 + 指纹未变。
function canSkipSourceInstallBuild(repoPath) {
  const sp = sourceStatePath();
  if (!fs.existsSync(repoPath) ||
      !fs.existsSync(path.join(repoPath, 'node_modules')) ||
      !fs.existsSync(sp)) {
    return false;
  }
  try {
    const st = JSON.parse(fs.readFileSync(sp, 'utf8'));
    return st.built === true && st.fingerprint === sourceFingerprint(repoPath);
  } catch {
    return false;
  }
}

// 查找 pnpm 的 .cjs 入口（优先 npm 全局安装目录，避免 .cmd 弹窗）
async function findPnpmCli() {
  const prefix = await findNpmPrefix();
  if (prefix) {
    // 标准布局：<prefix>/node_modules/pnpm/bin/pnpm.cjs
    const cand = path.join(prefix, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (fs.existsSync(cand)) return cand;
    // macOS Homebrew 布局：<prefix>/lib/node_modules/pnpm/bin/pnpm.cjs
    const brewCand = path.join(prefix, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (fs.existsSync(brewCand)) return brewCand;
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

// ============================================================
//  pnpm 安装/启动辅助
//  背景：@deepseek-ai/dsh 拆成 150+ 依赖子包，npm（10/11）解析其依赖树时
//  placeDep 阶段 CPU 满转、十几分钟装不完；--legacy-peer-deps 虽快但会漏装
//  peerDependencies（cordis 插件）导致启动崩溃。pnpm 用完全不同的解析算法，
//  实测 94 秒装完且能正确放置 peer 依赖、可正常启动，是"又快又对"的唯一正解。
// ============================================================

// 确保 pnpm 可用：定位 pnpm.cjs 入口；缺失则用 npm 全局安装一次。
// 返回 pnpm.cjs 绝对路径，失败返回 null。
async function ensurePnpmCli(nodeExe, npmCli) {
  const existing = await findPnpmCli();
  if (existing) return existing;
  logLine('[安装] 未检测到 pnpm，正在安装 pnpm（用于快速安装 dsh）...');
  const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096', npm_config_ignore_scripts: 'true' };
  const r = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--registry', npmRegistry, '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
  if (r.code !== 0) {
    if (MIRROR_FAIL_RE.test(String(r.out || ''))) {
      const next = nextRegistry();
      if (next) {
        logLine('[镜像] 切换镜像重试安装 pnpm');
        const retry = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--registry', next, '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
        if (retry.code === 0) return (await findPnpmCli()) || null;
      }
    }
    return null;
  }
  return (await findPnpmCli()) || null;
}

// pnpm add 安装本地运行环境（带镜像切换自愈）。
// pnpm 解析快、不会漏装 peerDependencies；卡死/超时交给 runCommand 的 idle/timeout 兜底。
async function runPnpmInstallSelfHealing(nodeExe, pnpmCli, spec, dir, env) {
  // 关键：安装前清掉 dsh-local/package.json 里可能残留的旧依赖范围。
  // 早期 npm install --prefix 会在这里写入形如 "0.1.0-rc.8" 的固定版本，
  // pnpm add 会尊重该范围而装出旧版（旧版不认识 --patch 等新参数导致启动失败）。
  // 清除后 @latest/@next 才能真实解析到最新版。
  const pkgFile = path.join(dir, 'package.json');
  try {
    if (fs.existsSync(pkgFile)) {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      if (pkg && pkg.dependencies && pkg.dependencies[PKG_NAME]) {
        delete pkg.dependencies[PKG_NAME];
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        logLine('[安装] 已清除旧的 dsh 依赖版本锁定，确保解析到最新版');
      }
    }
  } catch (e) { /* 清理失败不影响安装，pnpm add 会覆盖 */ }
  const onOut = (s) => {
    const raw = String(s).replace(/\r?\n$/, '');
    if (raw.trim()) logLine(raw);
  };
  const run = (registry) => {
    // pnpm --dir <dir> add <spec>：在指定目录安装（无 package.json 时自动创建）
    const args = ['--dir', dir, 'add', spec, '--ignore-scripts', '--registry', registry, '--reporter=append-only'];
    const opts = { env, idleTimeoutMs: NPM_INSTALL_IDLE_TIMEOUT, timeoutMs: NPM_INSTALL_TIMEOUT };
    return runCommand(nodeExe, [pnpmCli, ...args], opts, onOut);
  };
  let r = await run(npmRegistry);
  // 镜像类失败：依次尝试所有候选镜像（国内镜像优先、官方源最后兜底），
  // 全部候选都失败才放弃 —— 避免单个国内镜像缺包/网络问题直接导致安装失败。
  let registryTries = 1;
  while (registryTries < NPM_REGISTRIES.length && r.code !== 0 && MIRROR_FAIL_RE.test(String(r.out || ''))) {
    const next = nextRegistry();
    if (!next) break;
    registryTries++;
    logLine('[镜像] 自动切换镜像重试安装本地运行环境');
    r = await run(next);
  }
  return r;
}

async function sourceInstall(nodeExe) {
  // 1) 检测 git / pnpm（git 缺失时自动安装官方 Git for Windows）
  setProgress(30, 'install', '正在检测 git 与 pnpm...');
  let gitPath = await findGitExe();
  if (!gitPath) {
    const ok = await installGitOfficial();
    gitPath = ok ? (await findGitExe()) : null;
    if (!gitPath) {
      return { ok: false, error: '未检测到 git，且自动安装失败。请手动从 https://git-scm.com/ 安装后重试。' };
    }
  }
  logLine(`[检测] git: ${gitPath}`);

  // pnpm 优先用 npm 全局的 pnpm-cli.js 直跑（避免 .cmd 弹窗）
  const npmCli = await findNpmCli();
  let pnpmCli = await findPnpmCli();
  if (!pnpmCli) {
    // 没装 pnpm：用 npm 安装
    setProgress(35, 'install', '未检测到 pnpm，正在安装 pnpm...');
    // 提升 npm 子进程 V8 堆上限（解析大型依赖树时内存峰值高），并覆盖 IDE 注入的 NODE_OPTIONS
    const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096', npm_config_ignore_scripts: 'true' };
    const r = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--registry', npmRegistry, '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
    if (r.code !== 0) {
      // 镜像类失败（网络 / 404 缺包等）：自动切换镜像重试一次；
      // 仅确认是镜像问题才切换，避免非镜像失败（如内存不足 OOM）误切全局镜像源
      if (MIRROR_FAIL_RE.test(r.out)) {
        const next = nextRegistry();
        if (next) {
          logLine('[镜像] 自动切换镜像重试安装 pnpm');
          const retry = await runCommand(nodeExe, [npmCli, 'install', '-g', 'pnpm', '--registry', next, '--no-audit', '--no-fund'], { env }, (s) => logLine(s.replace(/\r?\n$/, '')));
          if (retry.code === 0) { /* 成功则继续 */ }
          else return { ok: false, error: 'pnpm 安装失败，请手动安装后重试' };
        } else {
          return { ok: false, error: 'pnpm 安装失败，请手动安装后重试' };
        }
      } else {
        return { ok: false, error: 'pnpm 安装失败，请手动安装后重试' };
      }
    }
    const newPrefix = await findNpmPrefix();
    pnpmCli = newPrefix ? path.join(newPrefix, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs') : null;
    if ((!pnpmCli || !fs.existsSync(pnpmCli)) && newPrefix) {
      // macOS Homebrew 布局兜底：<prefix>/lib/node_modules/pnpm/bin/pnpm.cjs
      const brewCand = path.join(newPrefix, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
      if (fs.existsSync(brewCand)) pnpmCli = brewCand;
    }
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
    const r = await runCommand(gitPath, ['clone', '--progress', REPO_URL, repoPath], {}, (s) => {
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

  // 2.5) 已安装且依赖未变更 → 跳过 install / build，直接启动
  // （满足「源码安装过一次后，下一次直接用源码启动，不再重复安装编译」）
  if (canSkipSourceInstallBuild(repoPath)) {
    setProgress(85, 'install', '检测到此前已成功安装并构建，且依赖未变更，跳过 pnpm install 与 pnpm run build');
    logLine('[源码] 已安装且依赖未变更，跳过 pnpm install 与 pnpm run build');
    return { ok: true, repoPath, pnpmCli };
  }

  // 3) pnpm install --ignore-scripts（跳过 koffi 编译，同 start-web.bat）
  setProgress(55, 'install', '正在安装依赖（pnpm install）...',
    '从镜像源拉取全部依赖包', '源码模式依赖多，首次安装约需几分钟，请耐心等待');
  logLine('[源码] pnpm install --ignore-scripts');
  const installEnv = {
    ...process.env,
    // 提升子进程 V8 堆上限：npm/pnpm 解析大型依赖树（150+ 包）时内存峰值高，
    // 默认 2GB 堆在部分机器上会 OOM 崩溃（JavaScript heap out of memory）。
    // 同时覆盖 IDE 注入的 NODE_OPTIONS（--require 等会污染子进程）。
    NODE_OPTIONS: '--max-old-space-size=4096',
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
  // 记录「已安装且已构建」状态，供下次启动跳过 install/build
  markSourceBuilt(repoPath);
  setProgress(90, 'install', '源码安装完成');
  return { ok: true, repoPath, pnpmCli };
}

// 源码模式启动：pnpm dsh web（严格遵循官方规范）
function sourceStartWeb(repoPath, nodeExe, pnpmCli) {
  syncRemoteOverlay();
  // dsh web 新版默认在就绪后自动打开系统默认浏览器；桌面版自行在 Electron 主窗口
  // 中打开 WebUI，必须显式 --no-open 避免弹出浏览器（旧版 dsh 会忽略未知参数，安全）。
  // --patch 是 dsh launcher 自身参数，必须紧跟 web、放在所有 app 参数（--no-open/--host/--port）之前
  const args = ['dsh', 'web', ...remoteControlArgs(), '--no-open', '--host', host, '--port', String(port)];
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
      const desc = describeCrashCode(code);
      logLine(`[诊断] 服务曾成功启动，但后来退出 (code=${code}, signal=${signal})`);
      onServiceExited();
      bootError(desc
        ? `dsh 服务运行中崩溃（${desc}），服务已停止。可能原因：源码安装的原生模块（koffi / node-pty）不稳定。可尝试「重新运行」；若反复崩溃，建议选择「源码完整安装」重新安装依赖。`
        : `dsh 服务启动后退出 (code=${code})，请查看日志`, code);
    } else {
      const desc = describeCrashCode(code);
      logLine(`[诊断] 服务未输出就绪信息即退出 (code=${code}, signal=${signal})`);
      if (desc) {
        const ver = getNodeVersion(nodeExe) || process.versions.node;
        bootError(`dsh 服务启动失败：${desc}。源码安装的原生模块（koffi / node-pty）可能损坏或与当前 Node.js（v${ver}）不兼容。建议选择「源码完整安装」重新执行 pnpm install 重建原生依赖。`, code);
      } else {
        bootError(`dsh 服务启动失败 (code=${code})，请查看日志`);
      }
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
  serviceState.remoteControl = false;
  serviceState.lanAddresses = [];
  // 后端退出时一并停止浏览器端热更 watcher（分离的两个进程同生共死）
  if (devWebProc) stopDevWebWatcher();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;
}

// ============================================================
//  离线启动模式（本地固定目录，不走 npm exec / registry）
//  核心思路：
//    - dsh 安装到 <userData>/dsh-local 固定目录（首次安装需联网一次）
//    - 启动时直接用 node 运行本地包入口（lib/bin.js），不再向 registry
//      解析 latest —— 二次以后启动完全离线、无网络往返，最稳最快
//    - 需要更新时重新执行一次「离线启动」即可联网重装到最新版
// ============================================================
const LOCAL_DIR_NAME = 'dsh-local';
function localDshDir() {
  return path.join(app.getPath('userData'), LOCAL_DIR_NAME);
}

// 解析本地 dsh 包的 bin 入口（动态读取 package.json 的 bin 字段，兼容入口改名）
function localDshEntry() {
  const pkgPath = path.join(localDshDir(), 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const bin = pkg.bin || {};
    const entry = typeof bin === 'string' ? bin : (bin.dsh || Object.values(bin)[0] || null);
    if (!entry) return null;
    const full = path.join(path.dirname(pkgPath), entry);
    return fs.existsSync(full) ? full : null;
  } catch (e) {
    return null;
  }
}

// 修正 dsh-local/package.json 中 dsh 依赖的 semver 范围。
// npm 首次安装会自动生成形如 ^0.1.0-rc.7 的范围，而 node-semver 对 prerelease 的
// 匹配规则是：范围含 prerelease 时只接受同一 [major.minor.patch] 前缀的候选版本，
// 因此 ^0.1.0-rc.7 只会命中 0.1.0-rc.x 系列 —— 官方发布 0.1.1-rc.1 后，
// `npm install @deepseek-ai/dsh` 会判定"已安装的 0.1.0-rc.8 已满足范围"而输出
// up to date，导致"检测到新版但永远更新不上去"。这里把范围放开为 latest/next。
function loosenLocalDshSpec(dir, tag) {
  try {
    const pkgFile = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgFile)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    if (!pkg || !pkg.dependencies || !pkg.dependencies[PKG_NAME]) return;
    pkg.dependencies[PKG_NAME] = tag === 'next' ? 'next' : 'latest';
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) { /* 忽略 */ }
}

// 离线启动：确保本地已安装 dsh（<userData>/dsh-local），不存在则用 npm 安装一次。
// 返回 { ok, entry }；entry 为本地 dsh bin 入口绝对路径。
async function localInstall(nodeExe, npmCli) {
  setProgress(25, 'install', '正在检查本地运行环境...');
  const existing = localDshEntry();
  if (existing) {
    logLine('[离线] 检测到本地 dsh 运行环境（' + existing + '），跳过安装');
    return { ok: true, entry: existing };
  }
  // 未安装 / 入口缺失：用 pnpm add 装到本地固定目录（pnpm 解析依赖树快、且不会漏装 peerDependencies）
  // 安装前清理残留的旧 dsh 进程：避免旧进程占用 dsh-local / 缓存文件句柄。
  await killDshNodeProcesses();
  if (isWin) await killProcessOnPort(port);
  await new Promise((r) => setTimeout(r, 500));
  installStageStartedAt = Date.now(); // 记录安装开始时间（进度页显示"已进行多久"）
  setProgress(35, 'install', '未检测到本地运行环境，正在安装（首次需联网，之后可秒级启动）...',
    '正在安装 @deepseek-ai/dsh 到本地固定目录', '首次安装需从镜像下载依赖，请耐心等待');
  notifyFirstInstall();
  // 确保 pnpm 可用（缺失则自动安装）
  const pnpmCli = await ensurePnpmCli(nodeExe, npmCli);
  if (!pnpmCli) {
    return { ok: false, error: 'pnpm 安装失败，无法快速安装 dsh。请手动执行 npm install -g pnpm 后重试。' };
  }
  const dir = localDshDir();
  fs.mkdirSync(dir, { recursive: true });
  const env = {
    ...process.env,
    // 提升 pnpm 子进程 V8 堆上限，避免安装 150+ 依赖时 OOM
    NODE_OPTIONS: '--max-old-space-size=4096',
  };
  // 解析 latest 精确版本号（绕开 pnpm 对 @latest 标签的解析差异/元数据缓存，避免装到旧版 rc.8）
  const tags = await queryDshDistTags();
  const spec = (tags && tags.latest) ? `${PKG_NAME}@${tags.latest}` : `${PKG_NAME}@latest`;
  // pnpm add 安装（自带镜像切换自愈）
  const r = await runPnpmInstallSelfHealing(nodeExe, pnpmCli, spec, dir, env);
  if (r.code !== 0) {
    if (MIRROR_FAIL_RE.test(String(r.out || ''))) {
      return { ok: false, error: '本地运行环境安装失败（已尝试多个镜像源），请查看日志' };
    }
    return { ok: false, error: '本地运行环境安装失败，请查看日志' };
  }
  const entry = localDshEntry();
  if (!entry) {
    return { ok: false, error: '本地运行环境安装完成但找不到 dsh 入口，请尝试「本地修复」或重新选择「极速启动」' };
  }
  setProgress(85, 'install', '本地运行环境就绪');
  return { ok: true, entry };
}

// 离线启动：直接用 node 运行本地 dsh 包入口（不经过 npm exec，不依赖 registry）
function localStartWeb(nodeExe, entry) {
  syncRemoteOverlay();
  // dsh web 新版默认在就绪后自动打开系统默认浏览器；桌面版自行在 Electron 主窗口
  // 中打开 WebUI，必须显式 --no-open 避免弹出浏览器（旧版 dsh 会忽略未知参数，安全）。
  // --patch 是 dsh launcher 自身参数，必须紧跟 web、放在所有 app 参数（--no-open/--host/--port）之前
  const args = ['web', ...remoteControlArgs(), '--no-open', '--host', host, '--port', String(port)];
  // 工作目录决定 dsh 会话数据的归属（历史数据能否读到），与快速/修复模式保持一致
  const workDir = resolveWorkspaceDir();
  logLine(`[目录] dsh 工作目录：${workDir}`);
  const child = spawn(nodeExe, [entry, ...args], {
    cwd: workDir,
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
      const desc = describeCrashCode(code);
      logLine(`[诊断] 服务曾成功启动，但后来退出 (code=${code}, signal=${signal})`);
      onServiceExited();
      bootError(desc
        ? `dsh 服务运行中崩溃（${desc}），服务已停止。可能原因：本地运行环境的原生模块（koffi / node-pty）不稳定。可尝试「重新运行」；若反复崩溃，建议删除本地运行环境目录（%APPDATA%\\dsh-desktop\\dsh-local）后重新选择「极速启动」重装，或选择「源码完整安装」。`
        : `dsh 服务启动后退出 (code=${code})，请查看日志`, code);
    } else {
      const desc = describeCrashCode(code);
      logLine(`[诊断] 服务未输出就绪信息即退出 (code=${code}, signal=${signal})`);
      if (desc) {
        const ver = getNodeVersion(nodeExe) || process.versions.node;
        bootError(`dsh 服务启动失败：${desc}。本地运行环境的原生模块（koffi / node-pty）可能损坏或与当前 Node.js（v${ver}）不兼容。建议删除本地运行环境目录（%APPDATA%\\dsh-desktop\\dsh-local）后重新选择「极速启动」重装，或选择「源码完整安装」重建依赖。`, code);
      } else {
        bootError(`dsh 服务启动失败 (code=${code})，请查看日志`);
      }
    }
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

// ============================================================
//  判断启动失败输出是否为「npx 缓存损坏」（区别于「用户插件损坏」）
// ============================================================
// 特征：
//   1) "Cannot find module '...npm-cache\_npx\...'" —— dsh 或其传递依赖在 npx 缓存
//      中的文件缺失（典型：@opentelemetry/otlp-transformer 的 build/src/index.js 丢失）；
//   2) "Please verify that the package.json has a valid \"main\" entry" —— 主入口缺失。
// 与「用户插件损坏」是两类问题：
//   - 缓存损坏（路径落在 npm-cache/_npx 或 node_modules/@opentelemetry 等官方依赖）→ 清理 npx 缓存重新下载；
//   - 用户插件损坏（"Cannot find package '@scope/name'"，位于 ~/.dsh/profiles/）→ 只摘除坏插件引用。
function isNpxCacheCorruption(output) {
  const s = String(output || '');
  if (!s) return false;
  // 主入口缺失提示（几乎总伴随 Cannot find module）
  if (/valid "main" entry/i.test(s)) return true;
  // Cannot find module 且路径落在 npm/npx 缓存内（Windows %LOCALAPPDATA%\npm-cache\_npx 或 mac/Linux ~/.npm/_npx）
  if (/Cannot find module[^\r\n]*(?:npm-cache[\\/]_npx|[\\/]_npx[\\/])/i.test(s)) return true;
  // 官方传递依赖缺失：@opentelemetry 等（build/src/index.js 缺失是缓存解压不完整的典型）
  if (/Cannot find module[^\r\n]*node_modules[\\/]@opentelemetry/i.test(s)) return true;
  return false;
}

// ============================================================
//  二级修复：npm cache verify —— 校验 npm 内容缓存（_cacache）
// ============================================================
// 场景：清空 _npx 后重新下载，若 _cacache 中的 tarball 本身损坏（校验和不符 /
// 网络中断写坏），npm 仍会解出同样的坏包 → 再次文件缺失。verify 会校验并剔除
// 损坏条目，下次下载强制走网络重新拉取完整 tarball。
// 异步流式执行（可长达数十秒），带 3 分钟超时保护；结果写入日志。
function npmCacheVerify(nodeExe, npmCli) {
  return new Promise((resolve) => {
    logLine('[缓存修复] 正在执行 npm cache verify 校验内容缓存（可能需要一两分钟）...');
    const env = cleanServiceEnv();
    env.npm_config_registry = npmRegistry;
    const child = spawn(nodeExe, [npmCli, 'cache', 'verify', '--registry', npmRegistry], {
      cwd: app.getPath('userData'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let out = '';
    const onData = (d) => { out += String(d); };
    child.stdout && child.stdout.on('data', onData);
    child.stderr && child.stderr.on('data', onData);
    const timer = setTimeout(() => {
      logLine('[缓存修复] npm cache verify 超时（3 分钟），跳过校验继续修复流程');
      try { child.kill(); } catch (e) { /* ignore */ }
      resolve(false);
    }, 3 * 60 * 1000);
    child.on('error', (err) => {
      clearTimeout(timer);
      logLine(`[缓存修复] npm cache verify 执行失败：${err.message}`);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      // verify 输出含 "Content verified" / "Index verified" 摘要，保留末尾几行供排查
      const tail = out.trim().split(/\r?\n/).slice(-4).join(' | ');
      logLine(`[缓存修复] npm cache verify ${ok ? '完成' : `退出（code=${code}）`}${tail ? `：${tail}` : ''}`);
      resolve(ok);
    });
  });
}

// ============================================================
//  原生模块崩溃自动修复：清理损坏缓存后重启
// ============================================================
// 0xC0000005 类崩溃通常来自 npx 缓存中损坏的 @deepseek-ai/dsh 预编译二进制
// （或 node-addon 原生缓存）。清理后强制 npx 重新下载即可修复。
// 返回清理说明（供日志展示）。
function clearCrashCaches() {
  const cleared = [];
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  // 1) npx 缓存中损坏的 @deepseek-ai/dsh（Windows: %LOCALAPPDATA%\npm-cache\_npx\...）
  //    mac/Linux: ~/.npm/_npx/...；可能同时存在多个 _npx 工作目录，逐个检查。
  //    删除整个条目目录（含 package-lock 元数据），确保下次 npx 完整重新下载。
  const npxRoots = isWin
    ? [path.join(local, 'npm-cache', '_npx')]
    : [path.join(os.homedir(), '.npm', '_npx')];
  for (const npxRoot of npxRoots) {
    if (!fs.existsSync(npxRoot)) continue;
    try {
      let removed = 0;
      for (const entry of fs.readdirSync(npxRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const entryDir = path.join(npxRoot, entry.name);
        const dshPkgDir = path.join(entryDir, 'node_modules', '@deepseek-ai', 'dsh');
        if (fs.existsSync(dshPkgDir)) {
          try {
            fs.rmSync(entryDir, { recursive: true, force: true });
            removed++;
          } catch (e) {
            logLine(`[崩溃修复] 删除 npx 缓存条目失败：${e.message}`);
          }
        }
      }
      if (removed > 0) cleared.push(`已清理 npx 缓存中的 @deepseek-ai/dsh（${removed} 处，下次自动重新下载）`);
    } catch (e) {
      logLine(`[崩溃修复] 扫描 npx 缓存失败：${e.message}`);
    }
  }

  // 2) node-addon 原生模块缓存（node-addon-require-builtin 等预编译二进制缓存，
  //    损坏时同样会引发 0xC0000005；位于 %LOCALAPPDATA%\node-addon-native-custom-loader\native-cache）
  const addonCache = path.join(local, 'node-addon-native-custom-loader', 'native-cache');
  if (fs.existsSync(addonCache)) {
    try {
      fs.rmSync(addonCache, { recursive: true, force: true });
      cleared.push('已清理原生模块缓存（node-addon-native-custom-loader）');
    } catch (e) {
      logLine(`[崩溃修复] 删除原生模块缓存失败：${e.message}`);
    }
  }

  return cleared;
}

// 获取用户系统实际的 Node.js 版本（dsh 服务用用户系统的 node.exe 运行，
// 而非 Electron 内嵌版本；用于崩溃提示中给出准确的版本号）。
function getNodeVersion(nodeExe) {
  try {
    const r = spawnSync(nodeExe, ['--version'], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
    if (r.error) return '';
    return String(r.stdout || '').trim().replace(/^v/i, '');
  } catch (e) {
    return '';
  }
}

// 崩溃自动修复后的就绪等待循环。
// 场景：首次进程 0xC0000005 崩溃 → 清理缓存 → 重启新进程。此时 run() 的 waitForWebReady
// 已因 bootPhase='error' 中止并 return，为避免"服务在后台静默启动、界面却停在错误页/卡死"，
// 由本函数独立等待新进程就绪并完成启动（finishBoot）或最终报错。
async function crashRetryWaitReady() {
  const bootStart = Date.now();
  const MAX_MS = 10 * 60 * 1000; // 与主流程一致，最长等 10 分钟
  // 本次重试开始时记录当前进程，避免误把后续用户主动重启当作重试进程
  const retryProc = serverProc;
  while (Date.now() - bootStart < MAX_MS) {
    // 用户主动退出 / 服务被外部停止
    if (quitting) return;
    // 新进程已退出且未就绪：交给 exit 处理器最终报错（修复预算已用尽时不会再触发修复）
    if (serverProc !== retryProc || !serverProc) {
      // 若进程已退出并已广播错误，无需重复操作；否则超时兜底
      if (bootPhase !== 'running' && bootPhase !== 'error') {
        bootError('运行环境崩溃后重启失败（服务进程提前退出），请查看下方日志。');
      }
      return;
    }
    if (await isWebReady(port)) {
      if (serverProc !== retryProc || !serverProc) return;
      setProgress(100, 'ready', '启动完成');
      finishBoot();
      return;
    }
    const elapsed = Math.floor((Date.now() - bootStart) / 1000);
    // 从当前进度继续推进（不固定从 60 起步），与主流程 setProgress 一致
    const base = bootProgressPercent >= 10 ? bootProgressPercent : 60;
    const pct = Math.min(base + (elapsed / 600) * 35, 95);
    broadcast('boot:progress', {
      percent: Math.round(Math.max(bootProgressPercent, pct)),
      stage: 'start',
      text: `正在重新启动服务，已等待 ${elapsed} 秒...`,
      detail: '首次需重新下载运行环境依赖，请耐心等待',
      step: resolveStep(pct),
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  if (bootPhase !== 'running' && bootPhase !== 'error') {
    bootError('运行环境崩溃后重启超时，请查看下方日志排查问题。');
  }
}

// 快速模式启动：pnpm dlx @deepseek-ai/dsh web（pnpm 等价于 npx，但解析依赖树快 10 倍+）
// 用 node <pnpm.cjs> dlx 直跑，避免 Windows .cmd 弹窗。
//
// 版本策略：pnpm dlx 每次向 registry 解析 latest（pnpm store 按 resolved 版本比对，
// 发现新版自动下载）。官方发布新版本后，下次快速启动自动就是最新版；
// 仅当 registry 不可达时，自动改用 --prefer-offline 回退到缓存中已有的版本继续启动。
function startWebViaPnpm(nodeExe, pnpmCli) {
  const baseEnv = cleanServiceEnv();
  // pnpm dlx 首次会下载安装 @deepseek-ai/dsh，必须跳过 koffi 源码编译（本机无 CMake）
  baseEnv.npm_config_ignore_scripts = 'true';
  baseEnv.npm_config_progress = 'true';
  baseEnv.NPM_CONFIG_LOGLEVEL = 'info';
  // 关键：显式指定镜像源（国内默认 npmmirror）。之前这里没设置，会退回默认源
  // npmjs.org，在国内网络下下载 @deepseek-ai/dsh 慢到 500+ 秒仍装不上。
  baseEnv.npm_config_registry = npmRegistry;
  syncRemoteOverlay();
  // pnpm dlx <pkg> <args>：下载 pkg 后运行其 bin，<args> 原样传给 dsh 子命令
  // dsh web 新版默认在就绪后自动打开系统默认浏览器；桌面版自行在 Electron 主窗口
  // 中打开 WebUI，必须显式 --no-open 避免弹出浏览器（旧版 dsh 会忽略未知参数，安全）。
  // --patch 是 dsh launcher 自身参数，必须紧跟 web、放在所有 app 参数（--no-open/--host/--port）之前
  const args = ['--ignore-scripts', 'dlx', PKG_NAME, 'web', ...remoteControlArgs(), '--no-open', '--host', host, '--port', String(port)];
  // 工作目录决定 dsh 会话数据的归属（历史数据能否读到）。解析一次并缓存，
  // 重试时保持一致，避免反复扫描 sessions 目录。
  const workDir = resolveWorkspaceDir();
  logLine(`[目录] dsh 工作目录：${workDir}`);

  let registryRetries = 0;     // 已切换镜像次数（上限 = 候选镜像数，防无限切换）
  let retriedOffline = false;  // 是否已用缓存版本兜底重试过（防无限重启）
  let started = false;
  let startupOutput = '';     // 记录启动输出，用于失败诊断
  let child = null;

  const spawnOnce = (extraEnv) => {
    const env = { ...baseEnv, ...(extraEnv || {}) };
    child = spawn(nodeExe, [pnpmCli, ...args], {
      cwd: workDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    serverProc = child;
    serverSpawnedByUs = true;
    started = false;
    startupOutput = '';
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
      // 原生模块崩溃（0xC0000005 等）：无 JS 堆栈、无错误输出，通常为 npx 缓存中的
      // @deepseek-ai/dsh 预编译二进制损坏或与当前 Node 版本 ABI 不兼容。
      // 自动清理损坏缓存后强制重新下载并重启一次；仍崩溃则交给下方最终报错给出针对性提示。
      if (!started && crashRepairBudget > 0 && isNativeCrashCode(code)) {
        crashRepairBudget--;
        const desc = describeCrashCode(code) || `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
        logLine(`[崩溃修复] 检测到原生模块崩溃（${desc}），自动清理损坏缓存后重启服务...`);
        logLine('[崩溃修复] 提示：dsh 依赖的原生模块（koffi / node-pty 等）已随缓存损坏或与当前 Node 版本不兼容，正在清理缓存并重新下载运行环境（首次需重新下载依赖，请耐心等待）...');
        // 注意：此处不能用 setProgress —— 它会把 bootPhase 改为 'install'，从而覆盖 'error'，
        // 导致 run() 的 waitForWebReady（shouldAbort: bootPhase==='error'）不中止而空转到超时。
        // 这里直接广播进度，保持 bootPhase='error' 让 run() 快速中止，由 crashRetryWaitReady 接管后续启动。
        broadcast('boot:progress', {
          percent: 50, stage: 'install',
          text: '检测到运行环境崩溃，正在自动清理缓存并重新下载...',
          detail: '已清理损坏的原生模块缓存', hint: '首次需重新下载依赖，请耐心等待',
          step: resolveStep(50),
        });
        const cleared = clearCrashCaches();
        for (const line of cleared) logLine('[崩溃修复] ' + line);
        serverProc = null;
        // 清理后强制 npx 重新解析下载并重启。关键：run() 的 waitForWebReady 已因
        // bootPhase='error' 中止并 return，无人再等待新进程就绪，若只重启会停在错误界面
        // 而服务在后台静默运行（表现为"卡死/错误"）。因此这里内嵌一个就绪等待循环，
        // 由本分支负责完成启动（finishBoot）或最终报错。
        setTimeout(() => {
          if (quitting || serverProc) return;
          startWebViaPnpm(nodeExe, pnpmCli); // 修复预算为模块级状态，新进程的 exit 处理器不会超出预算重复修复
          crashRetryWaitReady();
        }, 600);
        return;
      }
      // npx 缓存损坏（文件缺失 / 主入口缺失）：dsh 或其传递依赖（如 @opentelemetry/otlp-transformer）
      // 在 npx 缓存中不完整。与「用户插件损坏」不同，应清理 npx 缓存重新下载，而非删除用户 profile 引用。
      // cacheRepairBudget 控制自动修复次数（防无限重启）：
      //   第 1 次：清 _npx 缓存重新下载（多数情况即可修复——下载中断留下的残缺条目）；
      //   第 2 次（预算用尽）：说明重新下载仍解出坏包，升级为 npm cache verify 校验
      //   _cacache 内容缓存（剔除损坏 tarball）后再清理重启，强制下次走网络拉完整包。
      if (!started && cacheRepairBudget > 0 && isNpxCacheCorruption(startupOutput)) {
        cacheRepairBudget--;
        const deepVerify = cacheRepairBudget === 0; // 最后一次修复：附加深校验
        logLine(`[缓存修复] 检测到 npx 缓存损坏（运行环境依赖文件缺失），自动清理缓存并重新下载后重启服务${deepVerify ? '，并深度校验 npm 内容缓存' : ''}...`);
        broadcast('boot:progress', {
          percent: 50, stage: 'install',
          text: deepVerify
            ? '重新下载后仍检测到依赖缺失，正在深度校验 npm 缓存并重新下载...'
            : '检测到运行环境依赖缺失，正在自动清理缓存并重新下载...',
          detail: deepVerify ? '正在校验并剔除损坏的缓存包' : '已清理损坏的 npx 缓存',
          hint: '首次需重新下载依赖，请耐心等待',
          step: resolveStep(50),
        });
        serverProc = null;
        (async () => {
          if (deepVerify) await npmCacheVerify(nodeExe, pnpmCli);
          const cleared = clearCrashCaches();
          for (const line of cleared) logLine('[缓存修复] ' + line);
          await new Promise((r) => setTimeout(r, 600));
          if (!quitting && !serverProc) {
            startWebViaPnpm(nodeExe, pnpmCli);
            crashRetryWaitReady();
          }
        })();
        return;
      }
      // 镜像类失败（网络不通 / 404 缺包 / 超时等）：切换到下一个镜像重试。
      // 优先换其他国内镜像（官方源最后兜底），全部候选都失败才走离线缓存兜底。
      if (!started && registryRetries < NPM_REGISTRIES.length - 1 && MIRROR_FAIL_RE.test(startupOutput)) {
        const next = nextRegistry();
        if (next) {
          registryRetries++;
          logLine(`[镜像] 当前镜像不可用，切换到 ${next} 重试...`);
          serverProc = null;
          spawnOnce({ npm_config_registry: next });
          return;
        }
      }
      // 离线兜底：npm exec 解析 registry 最新版失败（网络 / 镜像不可达）时，
      // 用 --prefer-offline 回退到 npx 缓存中已有的 dsh 版本继续启动（首次启动仍需要网络）
      if (!started && !retriedOffline && MIRROR_FAIL_RE.test(startupOutput)) {
        retriedOffline = true;
        logLine('[版本] registry 暂不可达，正在用 npx 缓存中的 dsh 版本重试（--prefer-offline）...');
        serverProc = null;
        spawnOnce({ npm_config_prefer_offline: 'true' });
        return;
      }
      // 若因插件树加载失败（残留坏插件引用 "Cannot find package '@feiyang666/...'"）
      // 或 symlink 异常：优先只删除出错的插件，不碰其他插件与用户数据；
      // 提取不到坏插件名时才回退到清理整个 profiles（同样保留用户数据）。
      // 注意：npx 缓存损坏（缺文件）同样会报 plugin tree failed to load，但清 profiles
      // 救不了它（缓存修复预算已用尽说明重下也无效），此时绝不能走本分支动用户数据。
      if (!symlinkHealed && !isNpxCacheCorruption(startupOutput) && /plugin tree failed to load|Cannot find package|ERR_MODULE_NOT_FOUND|failed to import loader entry|is not a symlink|symlink/i.test(startupOutput)) {
        symlinkHealed = true;
        const badPlugins = extractBadPluginNames(startupOutput);
        if (badPlugins.length > 0) {
          // 精准修复：备份后只删坏插件
          logLine(`[自动修复] 检测到坏插件引用：${badPlugins.join(', ')}。正在备份数据并只清理这些插件后重启服务（其他插件与聊天记录/工作区/设置全部保留）...`);
          backupDshDataBeforeCleanup(path.join(os.homedir(), '.dsh')).then(() => {
            const r = removePluginRefsFromProfiles(badPlugins);
            logLine(`[自动修复] 已清理坏插件 ${badPlugins.join(', ')}（删除残留 ${r.removed} 处，涉及 ${r.touched} 个 profile），正在重启服务...`);
            setTimeout(() => {
              if (!quitting && !serverProc) startWebViaPnpm(nodeExe, pnpmCli);
            }, 600);
          });
          return;
        }
        logLine('[自动修复] 检测到 profile 插件加载失败，但无法定位具体坏插件，正在备份数据并清理坏插件引用（profiles 目录）后重启服务...');
        nukeLocalDshData().then(() => {
          setTimeout(() => {
            if (!quitting && !serverProc) startWebViaPnpm(nodeExe, pnpmCli);
          }, 600);
        });
        return;
      }
      if (started) {
        // 曾成功启动但后来崩溃退出：运行中崩溃，多半也是原生模块（koffi / node-pty）问题
        const desc = describeCrashCode(code);
        logLine(`[诊断] 服务曾成功启动，但后来退出 (code=${code}, signal=${signal})`);
        onServiceExited();
        bootError(desc
          ? `dsh 服务运行中崩溃（${desc}），服务已停止。可能原因：运行环境原生模块不稳定。可尝试「重新运行」；若反复崩溃，建议安装 Node.js LTS 版后重试。`
          : `dsh 服务启动后退出 (code=${code})，请查看日志`, code);
      } else {
        const desc = describeCrashCode(code);
        logLine(`[诊断] 服务未输出就绪信息即退出 (code=${code}, signal=${signal})`);
        if (desc) {
          // 已自动清理缓存重试仍崩溃：提示原生模块与当前 Node 版本 ABI 不兼容
          const ver = getNodeVersion(nodeExe) || process.versions.node;
          bootError(`dsh 服务启动失败：${desc}，且自动清理缓存重试后仍无法启动。通常为当前 Node.js（v${ver}）版本过新，与 dsh 依赖的原生模块（koffi / node-pty）不兼容。建议：① 安装 Node.js LTS 稳定版后重新启动；② 或选择「源码完整安装」由官方构建流程重新安装依赖。`, code);
        } else if (isNpxCacheCorruption(startupOutput)) {
          // 缓存损坏自动修复两次（含 npm cache verify 深校验）后仍失败：
          // 给出可操作的手动清理指引，而不是笼统的"查看日志"
          bootError('dsh 服务启动失败：运行环境依赖在本地缓存中反复损坏（自动修复已尝试两次无效）。请在命令行执行 npm cache clean --force 清空全部 npm 缓存后，点击「重新运行」重新下载；若仍失败，请检查磁盘空间与杀毒软件是否拦截了下载。', code);
        } else {
          bootError(`dsh 服务启动失败 (code=${code})，请查看日志`);
        }
      }
      serverProc = null;
    });
  };

  spawnOnce();
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
  // 兜底：即使子进程清理（taskkill）卡住，也保证 5 秒内强制退出，
  // 修复"停止运行有效但退出 APP 无作用"的问题。
  const forceTimer = setTimeout(() => { app.exit(0); }, 5000);
  if (forceTimer && typeof forceTimer.unref === 'function') forceTimer.unref();
  try {
    await stopWebService();
    await stopDevWebWatcher();
    // 清理残留的 npm install / dsh 相关子进程：应用退出时不留孤儿进程，
    // 避免下次启动出现"多个 npm 并发写同一目录"导致的死锁（此前反复卡死的根因之一）。
    await killDshNodeProcesses();
  } catch (e) { /* ignore */ }
  app.quit();
}

// 终止占用指定端口的进程（启动前清理旧服务，保证干净启动）
async function killProcessOnPort(checkPort) {
  return new Promise((resolve) => {
    if (isWin) {
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
      return;
    }
    if (process.platform === 'darwin') {
      // macOS：lsof -ti tcp:<port> 取占用端口的 PID 后 kill -9
      execFile('lsof', ['-ti', `tcp:${checkPort}`], { windowsHide: true }, (err, stdout) => {
        if (err) { resolve(false); return; }
        const pids = String(stdout).split(/\r?\n/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
        if (pids.length === 0) { resolve(false); return; }
        logLine('[诊断] killProcessOnPort 将终止端口 ' + checkPort + ' 的进程: ' + pids.join(','));
        const killAll = pids.map((pid) => new Promise((res) => {
          execFile('kill', ['-9', String(pid)], {}, () => res());
        }));
        Promise.all(killAll).then(() => resolve(true));
      });
      return;
    }
    resolve(false);
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
  // 用户主动重新运行：视为新一轮尝试，自动修复预算复位（与 finishBoot 复位策略一致）
  crashRepairBudget = 1;
  cacheRepairBudget = 2;

  // 0) 根据所选模式加载详细步骤表（快速启动 + 开发者选项模式用独立步骤表）
  currentSteps = (selectedMode === 'quick' && developerMode)
    ? MODE_STEPS.quickDev
    : (MODE_STEPS[selectedMode] || MODE_STEPS.quick);
  // 重置进度：重新运行时清零，保证新进度从 0 单调递增到 100（见 setProgress）
  resetProgress();

  // 0.1) 并发测速选择最快 npm 镜像（等待选出最快源后再安装，避免用默认源 npmjs.org 装不上；结果缓存，插件安装复用）
  //     离线启动模式若本地环境已就绪则跳过测速，保证完全离线时无需网络探测即可秒级启动
  if (!(selectedMode === 'local' && localDshEntry())) {
    await ensureRegistrySelected();
  }

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

  // 1) 环境检测：缺失时自动安装官方 Node.js（含 npm），
  //    不再只给官网链接把用户推向"修复模式"形成引导死循环。
  setProgress(8, 'detect', '正在检测 Node.js 运行环境...');
  let nodeExe = await findNodeExe();
  if (!nodeExe) {
    const installed = await installNodeOfficial();
    nodeExe = installed ? (await findNodeExe()) : null;
    if (!nodeExe) {
      bootError('未检测到 Node.js，且自动安装失败。请手动从 https://nodejs.org/ 下载 LTS 版安装后，重新启动本应用。');
      return;
    }
  }
  setProgress(18, 'detect', 'Node.js 环境正常');

  // 极速启动且本地环境已就绪：无需 npm（直接用 node 运行本地包入口），
  // 跳过 findNpmCli 省去一次 which('npm') 子进程，进一步缩短启动时间。
  const localEntryReady = selectedMode === 'local' && localDshEntry();
  const npmCli = localEntryReady ? null : await findNpmCli();

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
    const pnpmCli = await ensurePnpmCli(nodeExe, npmCli);
    if (!pnpmCli) {
      bootError('pnpm 安装失败，无法启动服务。请手动执行 npm install -g pnpm 后重试。');
      return;
    }
    setProgress(82, 'start', '正在启动 DeepSeek Harness 服务（官方快速版）...');
    startWebViaPnpm(nodeExe, pnpmCli);
  } else if (selectedMode === 'local') {
    // ===== 极速启动（本地固定目录，不走 npm exec / registry）=====
    // dsh 安装到 <userData>/dsh-local，启动直接用 node 运行本地包入口，
    // 不依赖网络解析，二次以后启动最快最稳（首次安装仍需联网一次）。
    if (localEntryReady) {
      // 本地环境已就绪：跳过 localInstall 的重复检查，直接启动
      setProgress(78, 'start', '正在启动本地 dsh 服务（极速模式）...');
      localStartWeb(nodeExe, localEntryReady);
    } else {
      setProgress(20, 'detect', '准备极速启动环境...');
      if (!npmCli) {
        bootError('未检测到 npm，无法安装本地运行环境。请先安装 Node.js（含 npm）后重试。');
        return;
      }
      const r = await localInstall(nodeExe, npmCli);
      if (!r.ok) { bootError(r.error); return; }
      setProgress(80, 'start', '正在启动本地 dsh 服务（极速模式）...');
      localStartWeb(nodeExe, r.entry);
    }
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
    // pnpm dlx @deepseek-ai/dsh web（pnpm 等价于 npx，解析依赖树快）
    setProgress(20, 'detect', '使用官方快速方式启动（pnpm dlx @deepseek-ai/dsh web）...');
    if (!npmCli) {
      bootError('未检测到 npm，无法启动。请先安装 Node.js（含 npm）后重试。');
      return;
    }
    const pnpmCli = await ensurePnpmCli(nodeExe, npmCli);
    if (!pnpmCli) {
      bootError('pnpm 安装失败，无法启动服务。请手动执行 npm install -g pnpm 后重试。');
      return;
    }
    startWebViaPnpm(nodeExe, pnpmCli);
  }

  // 2) 等待就绪（若服务进程已退出并报错，立即中止等待，不再误判为启动成功）
  const bootStart = Date.now();
  const ready = await waitForWebReady(port, 10 * 60 * 1000, () => {
    const elapsed = Math.floor((Date.now() - bootStart) / 1000);
    // 从当前已到达的百分比继续推进（不固定从 60 起步），最高 95%，
    // 最终 100% 由下方的 setProgress(100,'ready') 完成 —— 保证所有模式都能到 100%。
    const base = bootProgressPercent >= 10 ? bootProgressPercent : 60;
    const pct = Math.min(base + (elapsed / 600) * 35, 95);
    broadcast('boot:progress', {
      percent: Math.round(Math.max(bootProgressPercent, pct)),
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
  stopInstallTicker();
  // 服务成功启动：自动修复预算已达成使命，复位以保证下次故障仍有全额自愈能力
  crashRepairBudget = 1;
  cacheRepairBudget = 2;
  serviceState.running = true;
  serviceState.startedAt = Date.now();
  serviceState.mode = selectedMode;
  serviceState.port = port;
  serviceState.pid = serverProc ? serverProc.pid : null;
  serviceState.devMode = developerMode && (selectedMode === 'quick' || selectedMode === 'source');
  serviceState.devWebPid = devWebProc ? devWebProc.pid : null;
  serviceState.remoteControl = remoteControl;
  serviceState.lanAddresses = remoteControl ? getLanIPv4Addresses() : [];
  logLine(`[服务] 已就绪：http://${host}:${port}（模式：${selectedMode || 'unknown'}${serviceState.devMode ? '，开发者选项模式' : ''}）`);
  // 移动端远程控制：额外展示局域网访问地址（手机与电脑同一 Wi-Fi 时可访问）
  if (remoteControl) {
    const lan = getLanIPv4Addresses();
    if (lan.length) logLine(`[服务] 移动端远程控制已开启：手机扫码或访问 http://${lan.join(' / http://')}:${port} 即可远程控制当前工作区`);
    else logLine('[服务] 移动端远程控制已开启，但未检测到局域网 IPv4 地址（请检查网络连接）');
  }
  if (serviceState.devMode) {
    logLine(`[服务] 开发者选项模式：服务端后端（PID ${serviceState.pid || '-'}）与浏览器端热更 watcher（PID ${serviceState.devWebPid || '-'}）已分离运行`);
  }
  broadcast('boot:phase', { phase: 'running', service: { ...serviceState } });
  refreshTrayMenu();
  showMainWindow();
  // 快速 / 修复模式：异步查询 npx 实际运行的 dsh 版本并展示（不阻塞；源码 / 开发者模式跳过）
  if ((selectedMode === 'quick' || selectedMode === 'repair') && !serviceState.devMode) {
    reportDshVersion();
  } else if (selectedMode === 'local') {
    reportLocalDshVersion();
    // 后台静默检查官方新版：延迟调用避免与 dsh 首次加载抢带宽，离线时查询失败静默跳过
    setTimeout(() => checkLocalDshUpdate(), 8000);
  }
}

// 运行状态增量更新（如 dsh 版本晚到时轻量推送，不触发界面切换）
function broadcastServiceUpdate() {
  broadcast('service:update', { service: { ...serviceState } });
}

// 查询并展示当前 npx 运行的 dsh 版本。
// npm exec 每次解析 registry 最新版（npx 缓存按 resolved tarball 比对自动更新），
// 官方发布新版本后下次启动自动就是最新版；这里仅做展示，不阻塞启动流程，失败静默。
function reportDshVersion() {
  (async () => {
    try {
      const nodeExe = await findNodeExe();
      const npmCli = await findNpmCli();
      if (!nodeExe || !npmCli) return;
      const env = cleanServiceEnv();
      env.npm_config_registry = npmRegistry; // 同 npx 启动：走国内镜像，避免默认源慢/卡
      const r = await runCommand(nodeExe, [npmCli, 'exec', '--yes', '--silent', '--', PKG_NAME, '--version'], { env }, () => {});
      const line = String(r.out || '').split(/\r?\n/).map((s) => s.trim()).find((s) => /^v?\d+\.\d+\.\d+/.test(s));
      if (line) {
        serviceState.dshVersion = line.replace(/^v/, '');
        logLine(`[版本] 正在运行 dsh v${serviceState.dshVersion}（npm exec 每次解析 registry 最新版，官方发布新版后下次启动自动更新）`);
        broadcastServiceUpdate();
      }
    } catch (e) { /* 静默 */ }
  })();
}

// 查询并展示本地固定目录（<userData>/dsh-local）安装的 dsh 版本。
// 离线启动模式专用：读取本地 package.json，无需联网，失败静默。
function reportLocalDshVersion() {
  try {
    const pkgPath = path.join(localDshDir(), 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
    if (!fs.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && pkg.version) {
      serviceState.dshVersion = String(pkg.version).replace(/^v/, '');
      logLine(`[版本] 正在运行本地安装的 dsh v${serviceState.dshVersion}（极速模式：秒级启动，有新版时运行状态栏可一键更新）`);
      broadcastServiceUpdate();
    }
  } catch (e) { /* 静默 */ }
}

// 查询 npm registry 上 dsh 包的版本标签：
//  latest —— 正式版（latest 标签）；next —— 预发布版（next 标签，官方 RC/Beta 通道）。
// 返回 { latest, next, error }，失败时 error 非空。
async function queryDshDistTags() {
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  if (!nodeExe || !npmCli) return { latest: null, next: null, error: '未检测到 Node.js / npm' };
  const r = await runCommand(
    nodeExe,
    [npmCli, 'view', PKG_NAME, 'dist-tags', '--json', '--registry', npmRegistry, '--no-audit', '--no-fund'],
    { env: cleanServiceEnv() },
    () => {}
  );
  const text = String(r.out || '').trim();
  let tags = null;
  try {
    tags = JSON.parse(text);
  } catch (e) {
    // 部分 npm 版本输出非纯 JSON：逐字段正则兜底解析
    const m = {};
    const re = /"(\w+)"\s*:\s*"([^"]+)"/g;
    let mm;
    while ((mm = re.exec(text))) m[mm[1]] = mm[2];
    if (m.latest || m.next) tags = m;
  }
  if (!tags || !tags.latest) return { latest: null, next: null, error: '解析 registry 版本标签失败' };
  return {
    latest: String(tags.latest).replace(/^v/, ''),
    next: tags.next ? String(tags.next).replace(/^v/, '') : null,
    error: null,
  };
}

// 离线启动模式：后台静默检查官方新版本（正式版 latest + 预发布版 next）。
// 有网时延迟调用，不抢启动带宽；离线时查询失败静默跳过，完全不影响启动。
async function checkLocalDshUpdate() {
  try {
    if (serviceState.mode !== 'local') return;
    const res = await queryDshDistTags();
    if (res.error || !res.latest) return;
    const running = serviceState.dshVersion;
    if (!running) return;
    const latest = res.latest;
    const next = res.next && res.next !== latest ? res.next : null;
    const hasStable = latest !== running;
    const hasNext = !!next && next !== running;
    if (!hasStable && !hasNext) {
      logLine(`[版本] 本地运行环境已是最新版 v${running}`);
      return;
    }
    serviceState.localUpdate = { latest, next, current: running };
    const hint = [];
    if (hasStable) hint.push(`正式版 v${latest}`);
    if (hasNext) hint.push(`预发布版 v${next}`);
    logLine(`[版本] 检测到官方新版 dsh：${hint.join('、')}（当前 v${running}），可在运行状态栏选择更新`);
    broadcastServiceUpdate();
  } catch (e) { /* 静默：离线或查询失败不阻塞 */ }
}

// 离线启动模式：一键更新 —— 重装本地 dsh。
// tag: 'latest'（正式版，默认） | 'next'（预发布版，如官方 RC 通道）
// 只要本地运行环境已安装即可更新（服务未运行 / 非本地模式运行时也可更新本地环境）；
// 仅当服务正以极速启动模式运行时，才自动停止 → 重装 → 重启。
async function updateLocalDsh(tag) {
  const isNext = tag === 'next';
  const channelName = isNext ? '预发布版' : '正式版';
  // 本地运行环境未安装时无法更新
  if (!localDshEntry()) {
    return { ok: false, error: '本地运行环境尚未安装，请先选择「极速启动」完成安装' };
  }
  const wasRunning = !!serviceState.running;
  const wasLocalMode = serviceState.mode === 'local';
  logLine(`[更新] 开始更新本地运行环境到${channelName}（@${isNext ? 'next' : 'latest'}）...`);
  // 记录更新开始时间：进度页实时显示"已进行 X 分 Y 秒"
  installStageStartedAt = Date.now();
  try {
    // 1) 安装前先清理所有残留的 dsh 进程（"更新卡死 20 分钟"的根因修复）：
    //    上次以 npx 快速版 / 源码版启动、或未正常退出的旧 node 进程，会占用
    //    dsh-local / ~/.dsh / npm _cacache 的文件句柄；Windows 下 npm install 撞上
    //    这些被占用文件会反复 EBUSY 重试而卡死。killDshNodeProcesses 无残留时
    //    毫秒级返回，安全无害。
    setProgress(10, 'install', '正在清理残留的旧进程...');
    await killDshNodeProcesses();
    if (isWin) await killProcessOnPort(port);
    // 本地模式服务运行中：停掉当前服务（dsh-local 文件被占用，Windows 下 npm install 会失败）
    if (wasRunning && wasLocalMode) {
      setProgress(12, 'install', '正在停止当前服务...');
      await stopWebService();
      await stopDevWebWatcher();
      onServiceExited();
    }
    // taskkill 返回 ≠ 文件句柄已释放（Windows 释放是异步的），稍等片刻再安装
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) { /* 停止失败继续执行 */ }
  // 2) 用 pnpm add 重装本地 dsh 到指定版本通道（pnpm 解析快、不会锁死 prerelease 版本）
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  if (!nodeExe || !npmCli) {
    bootError('未检测到 npm，无法更新本地运行环境。请先安装 Node.js（含 npm）后重试。');
    return { ok: false, error: '未检测到 npm' };
  }
  const pnpmCli = await ensurePnpmCli(nodeExe, npmCli);
  if (!pnpmCli) {
    bootError('pnpm 安装失败，无法更新本地运行环境。请手动执行 npm install -g pnpm 后重试。');
    return { ok: false, error: 'pnpm 安装失败' };
  }
  setProgress(35, 'install', '正在下载并安装最新版运行环境...',
    `正在更新 @deepseek-ai/dsh 到官方${channelName}（@${isNext ? 'next' : 'latest'}）`, '更新完成后服务会自动重新启动，请耐心等待');
  // 注意：更新不是首次安装，绝不能广播 firstInstall 提示（会让界面错误显示
  // "本机还未安装运行环境"，且与后续进度事件交替出现造成闪烁）。
  const dir = localDshDir();
  const env = {
    ...process.env,
    // 提升 pnpm 子进程 V8 堆上限，避免安装 150+ 依赖时 OOM
    NODE_OPTIONS: '--max-old-space-size=4096',
  };
  // 解析精确版本号（绕开 pnpm 对 @latest/@next 标签的解析差异/元数据缓存，避免装到旧版 rc.8）
  const tags = await queryDshDistTags();
  const target = isNext ? (tags.next || tags.latest) : tags.latest;
  const installSpec = target ? `${PKG_NAME}@${target}` : (isNext ? `${PKG_NAME}@next` : `${PKG_NAME}@latest`);
  // pnpm add 安装（自带镜像切换自愈）
  const r = await runPnpmInstallSelfHealing(nodeExe, pnpmCli, installSpec, dir, env);
  if (r.code !== 0) {
    bootError('本地运行环境更新失败，请查看日志后重试。');
    return { ok: false, error: '更新失败，请查看日志' };
  }
  const entry = localDshEntry();
  if (!entry) {
    bootError('本地运行环境更新完成但入口异常，请重新选择「极速启动」重试。');
    return { ok: false, error: '更新完成但入口异常' };
  }
  // 3) 清除更新标记与旧版本号
  serviceState.dshVersion = null;
  serviceState.localUpdate = null;
  if (wasRunning && wasLocalMode) {
    // 原服务以极速启动模式运行：自动重新启动
    logLine('[更新] 本地运行环境更新完成，正在自动重新启动服务...');
    run();
    return { ok: true, restarted: true };
  }
  // 服务未运行 / 非本地模式运行：只更新本地环境，不自动重启
  if (wasRunning) {
    logLine('[更新] 本地运行环境更新完成（当前服务运行不受影响，下次「极速启动」自动使用新版）');
  } else {
    logLine('[更新] 本地运行环境更新完成，下次选择「极速启动」即可使用新版本');
  }
  return { ok: true, restarted: false };
}

// 删除本地运行环境目录（pnpm 的 node_modules 含大量 junction 符号链接与数百 MB 小文件）。
// Windows 上用 cmd 的 rmdir /s /q 删除：它能正确处理 junction（不会把符号链接当普通目录
// 递归进入而反复重试），删除速度快、不阻塞事件循环；fs.promises.rm 在 junction 上易卡死
// （正是"清除一直转圈"的根因）。带超时兜底，超过 60s 仍未完成则终止子进程并提示手动删除。
function removeDirWin(dir) {
  return new Promise((resolve) => {
    if (!isWin) {
      fs.promises.rm(dir, { recursive: true, force: true }).then(() => resolve(true)).catch(() => resolve(false));
      return;
    }
    // 一次性删空目录树；/s 递归删除子目录与文件，/q 安静模式不提示。
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'rmdir', '/s', '/q', dir], { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 60000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('exit', () => { clearTimeout(timer); resolve(!fs.existsSync(dir)); });
  });
}

// 清除本地运行环境（极速启动固定目录 %APPDATA%\dsh-desktop\dsh-local）。
// 设置页操作：停止服务 → 删除本地运行环境目录 → 返回结果与目录路径。
// 清除后下次选择「极速启动」会重新联网安装。
async function clearLocalRuntime() {
  const dir = localDshDir();
  logLine('[清除] 开始清除本地运行环境：' + dir);
  try {
    // 1) 停止当前服务（含残留端口进程、watcher），关闭 WebUI 窗口
    if (bootPhase === 'running' || bootPhase === 'start' || bootPhase === 'install') {
      await stopWebService();
      await stopDevWebWatcher();
      if (isWin) await killProcessOnPort(port);
      onServiceExited();
    }
    // 2) 删除本地运行环境目录（含 node_modules 与入口）。
    //    必须用子进程删除（Windows 用 cmd rmdir），不能同步删 —— 该目录有数百 MB
    //    小文件 + junction，同步删除会长时间阻塞事件循环导致窗口卡死。
    setProgress(10, 'install', '正在清除本地运行环境...', '正在删除 ' + dir + '，请稍候');
    if (fs.existsSync(dir)) {
      await removeDirWin(dir);
    }
    setProgress(20, 'install', '本地运行环境已清除');
  } catch (e) {
    logLine(`[清除] 停止服务或删除目录时出错：${e.message}`);
    stopInstallTicker();
    return {
      ok: false,
      dir,
      exists: fs.existsSync(dir),
      error: '清除本地运行环境失败，请先「停止运行」后再试。若仍失败，可手动删除目录：' + dir,
    };
  }
  // 3) 清理相关状态：版本信息、更新提示、运行模式
  serviceState.dshVersion = null;
  serviceState.localUpdate = null;
  serviceState.mode = null;
  stopInstallTicker();
  // 明确广播「已停止」阶段：清除流程把 bootPhase 置为 install（进度事件），
  // 若不广播，前端 currentPhase 会停留在 install，导致离开首页再回来时
  // 误判为"启动中"而停留在进度页（而不是「已停止」控制台）。
  bootPhase = 'stopped';
  broadcast('boot:phase', { phase: 'stopped' });
  // 主动通知前端服务已停止（首页控制台从「正在运行」切回「已停止/选择模式」）
  if (typeof broadcastServiceUpdate === 'function') broadcastServiceUpdate();
  logLine('[清除] 本地运行环境已清除（' + dir + '）。下次选择「极速启动」会重新联网安装。');
  return { ok: true, dir, exists: fs.existsSync(dir) };
}

// 显示 / 重建 WebUI 主窗口（运行中或重新运行后调用）
function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 已有窗口直接恢复显示，绝不 reload：
    // 之前的 loadURL 会把用户当前停留的页面强制刷新回根路径，导致
    // 托盘"打开主界面"打开的并非用户初始进入的页面（甚至卡在加载中）。
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
  // 立即进入"重新启动中"阶段并广播，避免界面回退到"运行中"：
  // 前端点击「立即重启」后 showScreen('progress') 会触发 resyncProgressScreen 兜底
  // 查询主进程真实状态。若此处不先把 bootPhase 从 'running' 改掉，该查询会认为
  // 服务仍在运行，把进度页瞬间拉回「正在运行中」控制台（表现为"点了立即重启，
  // 页面还是运行中"）。
  bootPhase = 'start';
  serviceState.running = false;
  serviceState.startedAt = null;
  serviceState.pid = null;
  broadcast('boot:phase', { phase: 'start' });
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
  const resolved = resolveEffectiveTheme();
  bootWindow = new BrowserWindow({
    width: 960,
    height: 660,
    resizable: true,
    minWidth: 760,
    minHeight: 560,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: themedAppIcon(256),
    backgroundColor: resolved === 'light' ? '#f5f5f5' : '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--dsh-theme=${resolved}`],
    },
  });
  bootWindow.loadFile(path.join(__dirname, 'boot', 'boot.html'));
  // 外部链接（如更新日志中的链接）用系统默认浏览器打开，禁止在应用内新开窗口
  bootWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
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
  // 窗口背景色跟随主题（浅色时避免加载期闪黑）
  const resolved = resolveEffectiveTheme();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: themedAppIcon(256),
    backgroundColor: resolved === 'light' ? '#ffffff' : '#0d1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    logLine(`[诊断] 主界面加载失败 (${code}) ${desc} ${url}`);
  });
  // 页面加载完成后注入官方主题协议（colorScheme + data-ds-dark-theme）
  mainWindow.webContents.on('did-finish-load', () => {
    applyThemeToMainWindow();
  });
  mainWindow.loadURL(`http://${host}:${port}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 关闭主窗口时：弹原生确认框（响应快、零延迟），让用户选择
  //   - 退出 Web 界面：关闭 WebUI 窗口，回到引导台（服务继续后台运行）
  //   - 退出 APP：清理服务后完全退出
  mainWindow.on('close', (e) => {
    if (quitting) return; // 正在退出，直接关闭
    e.preventDefault();
    if (closeDialogOpen) return; // 防止重复弹窗
    closeDialogOpen = true;

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      title: APP_NAME,
      message: '关闭窗口后要做什么？',
      detail: '「退出 Web 界面」保留后台服务，可随时在引导台重新打开；「退出 APP」会结束所有后台服务。',
      buttons: ['退出 Web 界面', '退出 APP'],
      defaultId: 0,
      cancelId: 1,
      icon: themedAppIcon(256),
    });
    closeDialogOpen = false;

    if (choice === 0) {
      // 退出 Web 界面：关闭 WebUI 窗口，保留引导台与服务
      mainWindow.destroy();
      mainWindow = null;
      // 通知引导台回到「运行控制台」（服务仍在运行），
      // 否则引导台仍停留在"100% 正在打开界面"的进度页，看似卡死
      broadcast('boot:phase', { phase: 'running', service: { ...serviceState } });
      if (tray && tray.displayBalloon) {
        tray.displayBalloon({
          title: APP_NAME,
          content: '已退出 Web 界面，服务继续在后台运行。',
          icon: themedAppIcon(32),
        });
      }
    } else {
      // 退出 APP：清理服务后完全退出
      quitApp();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  // 托盘图标用 32x32 较合适（Windows 托盘显示尺寸），默认黑色模式
  const trayIcon = appIcon(32);
  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);
  refreshTrayMenu();
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  // macOS 托盘不触发 double-click，改用单击恢复主界面
  if (process.platform === 'darwin') {
    tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  }
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
    app.setIcon && app.setIcon(themedAppIcon(256));
  }
  // 读取持久化的开发者选项模式开关
  developerMode = loadAppConfig().developerMode === true;
  if (developerMode) logLine('[设置] 开发者选项模式已开启（可从设置页关闭）');
  // 读取持久化的「移动端远程控制」开关：开启后 dsh web 监听 0.0.0.0（手机扫码/局域网访问）
  remoteControl = loadAppConfig().remoteControl === true;
  if (remoteControl) logLine('[设置] 移动端远程控制已开启：dsh web 将监听所有网卡（0.0.0.0），重启服务后生效');
  // 主题：先以官方 settings.yaml 为准对齐一次（消除 app-config 与官方 WebUI 的
  // 不一致），再应用原生层（标题栏/系统弹窗跟随）+ 监听官方 settings.yaml 反向同步
  syncThemeFromOfficial();
  applyNativeTheme();
  watchDshSettings();
  // system 档：系统深浅色实时变化时，同步到各窗口（不重启，立即跟随）
  nativeTheme.on('updated', () => {
    if (loadAppConfig().theme === 'system') {
      applyThemeToMainWindow();
      broadcastTheme();
    }
  });
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

app.on('before-quit', (e) => {
  if (quitting) return;
  // 未经过 quitApp 的退出路径（如系统关机/注销/任务管理器结束）：阻止退出，走统一清理流程
  e.preventDefault();
  quitApp();
});

// IPC
ipcMain.handle('boot:select-mode', (e, mode) => {
  if (mode === 'quick' || mode === 'source' || mode === 'repair' || mode === 'local') selectMode(mode);
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
  await quitApp();
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
  // 界面主题：'dark' | 'light' | 'system'（默认 system，跟随系统）
  if (!['dark', 'light', 'system'].includes(appConfig.theme)) {
    appConfig.theme = 'system';
    saveAppConfig();
  }
  // 界面语言：'zh' | 'en'（默认 zh，简体中文）
  if (!['zh', 'en'].includes(appConfig.language)) {
    appConfig.language = 'zh';
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

// ============================================================
//  工作目录（dsh 服务 cwd）：决定会话/工作区数据的归属
// ============================================================
// dsh 的会话数据按「工作目录(cwd)」分目录存储在 ~/.dsh/sessions/<projectKey>/ 下。
// 桌面端此前把 dsh 服务 cwd 固定成 app.getPath('userData')，导致会话写进
// 与用户历史目录不同的新目录，旧聊天记录/工作区“读不到”。
// 这里引入可配置的工作目录，并按历史数据智能取默认值。

// 解码 projectKey 为多个候选工作目录。
// dsh 的 projectKey 编码是有损的（官方注释 "Separator replacement ... intentionally lossy"）：
//   - `/ \ :` 统一替换成 `-`（连续分隔符合并为一个 `-`）；
//   - 目录名里的连字符 `-` 本身也原样保留；
//   - 空格等其他字符转义为 `~XXXX`（如空格 -> ~0020）。
// 因此 `-` 既可能是路径分隔符也可能是目录名的一部分，无法唯一还原。
// 这里枚举所有「合并相邻段」的组合生成候选，由调用方用存在性校验挑选真实目录。
function decodeProjectKeyCandidates(dirName) {
  if (typeof dirName !== 'string') return [];
  if (!dirName.startsWith('--') || !dirName.endsWith('--')) return [];
  let inner = dirName.slice(2, -2);
  if (!inner || inner === 'root' || inner === '_no-cwd') return [];
  // 还原 ~XXXX 转义（如 ~0020 -> 空格、~4E2D -> 中）。`-` 本身不转义，因此
  // 还原结果不会引入额外的 `-`，可放心按 `-` 分割。
  inner = inner.replace(/~([0-9A-Fa-f]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
  const segs = inner.split('-');
  if (segs.length < 2) return [];
  const drive = segs[0];
  if (!/^[A-Za-z]$/.test(drive)) return [];
  const rest = segs.slice(1);
  const n = rest.length;
  const candidates = [];
  const add = (mask) => {
    const parts = [];
    let i = 0;
    while (i < n) {
      let seg = rest[i];
      while (i < n - 1 && (mask & (1 << i))) {
        seg += '-' + rest[i + 1];
        i += 1;
      }
      parts.push(seg);
      i += 1;
    }
    candidates.push(drive + ':' + '\\' + parts.join('\\'));
  };
  if (n <= 12) {
    // 段数不多时枚举全部组合（最多 2^11 种）
    for (let mask = 0; mask < (1 << (n - 1)); mask++) add(mask);
  } else {
    // 超长路径退化：全分隔 + 常见单点合并
    add(0);
    for (let i = 0; i < n - 1; i++) add(1 << i);
  }
  return candidates;
}

// 兼容旧签名：返回首个存在性校验通过的候选，无法判定时返回全分隔解码。
function decodeProjectKey(dirName) {
  for (const cand of decodeProjectKeyCandidates(dirName)) {
    try { if (fs.existsSync(cand)) return cand; } catch (e) { /* ignore */ }
  }
  const cands = decodeProjectKeyCandidates(dirName);
  return cands[0] || null;
}

// 扫描 ~/.dsh/sessions/ 反推历史工作目录。
// 策略：对每个 projectKey 枚举候选并用存在性校验筛出真实目录，再按
// 「会话数最多优先，其次最新活动」排序 —— 会话最多者通常是用户的主要工作目录。
function detectHistoricalWorkspace() {
  const sessionsRoot = path.join(dshSettings.dshHomeDir(), 'sessions');
  let best = null;
  let bestCount = 0;
  let bestTime = 0;
  try {
    if (!fs.existsSync(sessionsRoot)) return null;
    for (const name of fs.readdirSync(sessionsRoot)) {
      const dir = path.join(sessionsRoot, name);
      let st;
      try { st = fs.statSync(dir); } catch (e) { continue; }
      if (!st.isDirectory()) continue;
      // 取第一个存在的候选作为真实目录
      let cwd = null;
      for (const cand of decodeProjectKeyCandidates(name)) {
        try { if (fs.existsSync(cand)) { cwd = cand; break; } } catch (e) { /* ignore */ }
      }
      if (!cwd) continue;
      // 会话数：project 目录下的 session 子目录数；mtime：目录树内最新活动
      let count = 0;
      let mtime = st.mtimeMs;
      try {
        const walk = (d) => {
          let entries;
          try { entries = fs.readdirSync(d, { withFileTypes: true }); }
          catch (e) { return; }
          for (const entry of entries) {
            const p = path.join(d, entry.name);
            try {
              const st2 = fs.statSync(p);
              if (st2.mtimeMs > mtime) mtime = st2.mtimeMs;
            } catch (e) { /* ignore */ }
            if (entry.isDirectory()) {
              count += 1;
              walk(p);
            }
          }
        };
        walk(dir);
      } catch (e) { /* ignore */ }
      if (count > bestCount || (count === bestCount && mtime > bestTime)) {
        bestCount = count;
        bestTime = mtime;
        best = cwd;
      }
    }
  } catch (e) { /* ignore */ }
  return best;
}

// 解析 dsh 服务实际使用的工作目录：
//   1) app-config 里显式配置且目录存在 → 用之；
//   2) 否则按历史会话反推最近使用目录；
//   3) 仍无 → 用户主目录。
function resolveWorkspaceDir() {
  const cfg = loadAppConfig();
  if (cfg.workspaceDir && typeof cfg.workspaceDir === 'string') {
    try { if (fs.existsSync(cfg.workspaceDir)) return cfg.workspaceDir; }
    catch (e) { /* ignore */ }
  }
  const detected = detectHistoricalWorkspace();
  if (detected) {
    // 历史目录可能已被删除/移动，需校验存在，否则 spawn 会因 cwd 不存在而失败
    try { if (fs.existsSync(detected)) return detected; }
    catch (e) { /* ignore */ }
  }
  return os.homedir();
}

// ============================================================
//  界面主题（三档：dark / light / system）
// ============================================================
//  themeSource 是用户偏好档位（'dark' | 'light' | 'system'）；
//  resolvedTheme 是实际生效的明暗（'dark' | 'light'），system 时由系统解析。

// 解析用户偏好的实际明暗（system -> 系统当前深浅色）
function resolveEffectiveTheme() {
  const pref = loadAppConfig().theme;
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

// 启动时以官方 settings.yaml 的 ui-theme.preference 为准，回写 app-config。
// 原因：桌面端与官方 WebUI 主题需双向同步；若上次在 WebUI 里改过主题而桌面端
// 未运行（或反向监听没捕获到），app-config 会残留旧值。若不先对齐，后续
// did-finish-load 注入会拿 app-config 旧值覆盖官方实际主题，导致 WebUI 内切换
// 主题“看起来不生效”——官方 preference 已等于目标值，setTheme 提前 return，
// 而 DOM 却被桌面端注入成了旧主题，视觉与状态脱节。
function syncThemeFromOfficial() {
  try {
    const official = dshSettings.readThemePreference();
    if (!official) return;
    const cfg = loadAppConfig();
    if (cfg.theme !== official) {
      cfg.theme = official;
      saveAppConfig();
      logLine(`[主题] 启动时以官方设置同步为：${official === 'dark' ? '深色' : official === 'light' ? '浅色' : '跟随系统'}`);
    }
  } catch (e) { /* ignore */ }
}

// 把主题应用到 Electron 原生层（标题栏 / 系统弹窗 / 右键菜单跟随）
function applyNativeTheme() {
  const pref = loadAppConfig().theme;
  nativeTheme.themeSource = pref === 'system' ? 'system' : pref;
}

// 把当前主题广播给 boot 窗口（控制面板刷新主题显示 / 背景色）
function broadcastTheme() {
  const pref = loadAppConfig().theme;
  const resolved = resolveEffectiveTheme();
  broadcast('theme:changed', {
    theme: pref,           // 用户档位：dark | light | system
    resolved,              // 实际明暗：dark | light
  });
  if (bootWindow && !bootWindow.isDestroyed()) {
    bootWindow.setBackgroundColor(resolved === 'light' ? '#f5f5f5' : '#111111');
    // 标题栏图标跟随主题黑白（浅色 -> 黑 logo；深色 -> 白 logo）
    bootWindow.setIcon(themedAppIcon(256));
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIcon(themedAppIcon(256));
  }
  // 任务栏 / Alt-Tab 图标跟随主题
  if (process.platform === 'win32' && app.setIcon) {
    app.setIcon(themedAppIcon(256));
  }
}

// 向官方 WebUI 主窗口注入官方主题协议（不改官方代码）：
// 官方 boot-theme 脚本做的事 —— 设置 colorScheme + body[data-ds-dark-theme]。
// 这里用 executeJavaScript 在运行时直接应用，避免改动官方任何文件。
const OFFICIAL_THEME_INJECT = (dark) => `(() => {
  const dark = ${!!dark};
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.body.toggleAttribute('data-ds-dark-theme', dark);
  document.documentElement.style.backgroundColor = dark ? '#0d1117' : '#ffffff';
  return dark;
})()`;

// 把当前主题实时应用到官方 WebUI 主窗口（若已加载完成）
function applyThemeToMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || !serviceState.running) return;
  const resolved = resolveEffectiveTheme();
  try {
    mainWindow.webContents.executeJavaScript(OFFICIAL_THEME_INJECT(resolved === 'dark')).catch(() => {});
    // 窗口背景色同步（浅色时不闪黑）
    mainWindow.setBackgroundColor(resolved === 'light' ? '#ffffff' : '#0d1117');
  } catch (e) { /* 窗口可能尚未 ready */ }
}

// 主题统一入口：设置偏好 -> 持久化 app-config -> 同步官方 settings.yaml
// -> 应用原生层 -> 应用官方 WebUI -> 广播到控制面板
function setThemePreference(theme) {
  const t = ['dark', 'light', 'system'].includes(theme) ? theme : 'system';
  const cfg = loadAppConfig();
  cfg.theme = t;
  saveAppConfig();

  // 同步官方 WebUI 主题偏好（~/.dsh/settings.yaml 的 ui-theme.preference）
  const sync = dshSettings.writeThemePreference(t);

  // 应用各处
  applyNativeTheme();
  applyThemeToMainWindow();
  broadcastTheme();
  logLine(`[主题] 已切换为${t === 'dark' ? '深色' : t === 'light' ? '浅色' : '跟随系统'}（官方同步：${sync.changed ? '已写入' : '已一致'}）`);
  return { ok: true, theme: t, resolved: resolveEffectiveTheme() };
}

// 反向同步：监听官方 settings.yaml（~/.dsh/settings.yaml）的 ui-theme.preference。
// 官方 WebUI 自己的设置页切换主题时写入该文件，这里感知变化并同步到控制面板。
let settingsWatcher = null;
let settingsWatchTimer = null;
function watchDshSettings() {
  const file = dshSettings.settingsYamlPath();
  const onChange = () => {
    // fs.watch 可能重复触发，合并为一次延迟处理
    clearTimeout(settingsWatchTimer);
    settingsWatchTimer = setTimeout(() => {
      try {
        const official = dshSettings.readThemePreference();
        if (!official) return;
        const cfg = loadAppConfig();
        if (cfg.theme !== official) {
          cfg.theme = official;
          saveAppConfig();
          applyNativeTheme();
          applyThemeToMainWindow();
          broadcastTheme();
          logLine(`[主题] 官方 WebUI 中主题已切换为${official === 'dark' ? '深色' : official === 'light' ? '浅色' : '跟随系统'}，控制面板已同步`);
        }
      } catch (e) { /* ignore */ }
    }, 300);
  };
  try {
    // 目录级 watch 更稳（文件可能被原子替换/重建）
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) return;
    settingsWatcher = fs.watch(dir, (evt, name) => {
      if (name === 'settings.yaml' || name === 'settings.yml') onChange();
    });
  } catch (e) {
    settingsWatcher = null;
  }
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
    new Notification({ title, body, icon: themedAppIcon(32) }).show();
  } catch (e) { /* ignore */ }
}

// ---------- HTTP 请求 ----------
// TLS 证书校验失败（unable to verify the first certificate / UNABLE_TO_VERIFY_LEAF_SIGNATURE）
// 常见于国内网络环境（代理 / 运营商劫持 / 系统根证书不全）。自动降级为不校验证书重试一次，
// 保证版本解析 / 更新检查等关键请求可用（仅对异常请求降级，不影响其他请求）。
function httpJsonRequest(url, timeoutMs = 15000) {
  return httpJsonRequestInner(url, timeoutMs, false);
}

function httpJsonRequestInner(url, timeoutMs, insecure) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': `dsh-desktop/${appVersion()}` }, timeout: timeoutMs, rejectUnauthorized: !insecure },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy();
          return resolve(httpJsonRequestInner(res.headers.location, timeoutMs, insecure));
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
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('网络请求超时')); });
    req.on('error', (e) => {
      // 证书校验失败：降级重试一次（跳过证书校验）
      if (!insecure && /certificate|CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|SSL/i.test(e.message)) {
        logLine('[网络] 检测到证书校验失败，自动降级重试（跳过证书校验）：' + url);
        return resolve(httpJsonRequestInner(url, timeoutMs, true));
      }
      reject(new Error('网络错误：' + e.message));
    });
  });
}

// ---------- 检查更新 ----------
async function checkUpdate() {
  updateStatus({ status: 'checking', messageKey: 'updateChecking', error: '', latest: null, filePath: null });
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
// 启动安装程序（detached，不随本应用退出而终止）；传 --updated 让 NSIS 安装器在
// 安装完成后自动启动新版应用（与 electron-builder 官方更新流程一致）
function launchInstaller(filePath) {
  try {
    spawn(filePath, ['--updated'], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (e) {
    updateStatus({ status: 'error', error: '无法启动安装程序', message: '无法启动安装程序' });
    return false;
  }
}

// 安装程序已成功启动：延迟退出当前应用，释放正在运行的 exe 文件占用，
// 否则 NSIS 安装器无法覆盖文件，会出现"应用正在运行/安装冲突"导致只能卸载重装。
function scheduleQuitForInstall() {
  updateStatus({ status: 'installing', message: '安装程序已启动，正在退出当前应用...' });
  const t = setTimeout(() => {
    if (!quitting) quitApp();
  }, 1200);
  if (t && typeof t.unref === 'function') t.unref();
}

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
    detail: '即将启动安装程序，本应用将自动退出。安装完成后会自动打开新版应用。',
    buttons: ['开始安装', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
    icon: themedAppIcon(256),
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
        if (launchInstaller(filePath)) scheduleQuitForInstall();
      } else {
        scheduleQuitForInstall();
      }
    });
  } else if (err) {
    if (launchInstaller(filePath)) scheduleQuitForInstall();
  } else {
    scheduleQuitForInstall();
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
    remoteControl: remoteControl,
    lanAddresses: remoteControl ? getLanIPv4Addresses() : [],
    serviceHost: host,
    servicePort: port,
    dshVersion: serviceState.dshVersion,
    theme: cfg.theme,
    themeResolved: resolveEffectiveTheme(),
    workspaceDir: resolveWorkspaceDir(),
    detectedWorkspace: detectHistoricalWorkspace(),
    language: cfg.language === 'en' ? 'en' : 'zh',
    deviceId: cfg.deviceId,
    updateApiBase: UPDATE_API_BASE,
    appId: UPDATE_APP_ID,
    appName: APP_NAME,
    appTagline: APP_TAGLINE,
    repoUrl: PROJECT_URL,
  };
});

// 界面主题切换（dark / light / system），持久化 + 同步官方 WebUI + 原生层联动
ipcMain.handle('settings:set-theme', (e, theme) => {
  return setThemePreference(theme);
});

// 设置 dsh 工作目录（决定会话/工作区数据归属，重启服务后生效）。
// 传空字符串即清除显式配置、恢复“按历史数据自动检测”。
ipcMain.handle('settings:set-workspace-dir', (e, dir) => {
  const cfg = loadAppConfig();
  const d = typeof dir === 'string' ? dir.trim() : '';
  if (!d) {
    delete cfg.workspaceDir;
    saveAppConfig();
    logLine('[目录] 工作目录已恢复为自动检测');
    return { ok: true, workspaceDir: resolveWorkspaceDir() };
  }
  try {
    if (!fs.existsSync(d)) {
      return { ok: false, workspaceDir: resolveWorkspaceDir(), error: '目录不存在' };
    }
  } catch (e) {
    return { ok: false, workspaceDir: resolveWorkspaceDir(), error: '目录不可访问' };
  }
  cfg.workspaceDir = d;
  saveAppConfig();
  logLine(`[目录] 工作目录已设为：${d}`);
  return { ok: true, workspaceDir: d };
});

// 界面语言切换（zh / en），持久化保存
ipcMain.handle('settings:set-language', (e, language) => {
  const lang = language === 'en' ? 'en' : 'zh';
  const cfg = loadAppConfig();
  cfg.language = lang;
  saveAppConfig();
  logLine(`[设置] 界面语言已切换为${lang === 'en' ? 'English' : '简体中文'}`);
  return { ok: true, language: lang };
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

// 「移动端远程控制」开关（持久化，对下次启动生效）：
// 开启后 dsh web 以配置层 overlay 方式监听 0.0.0.0（CLI 仍传 127.0.0.1 以绕过官方安全拒绝，
// 实际绑定 0.0.0.0 由 --patch overlay 覆盖 webserver 行实现），手机扫码 / 局域网地址可远程
// 控制当前工作区；关闭则仅本机（127.0.0.1）可访问。
ipcMain.handle('settings:set-remote-control', (e, enabled) => {
  const cfg = loadAppConfig();
  cfg.remoteControl = !!enabled;
  remoteControl = !!enabled;
  saveAppConfig();
  const lan = enabled ? getLanIPv4Addresses() : [];
  logLine(`[设置] 移动端远程控制已${cfg.remoteControl ? '开启' : '关闭'}（重启服务后生效）${cfg.remoteControl ? `，局域网地址：${lan.join(', ') || '（未检测到）'}` : ''}`);
  return { ok: true, remoteControl: cfg.remoteControl, lanAddresses: lan, servicePort: port };
});

// 查看日志：读取当前日志文件尾部内容 + 日志路径
ipcMain.handle('settings:get-logs', () => {
  return readRecentLogs(2000);
});

// 打开日志文件（系统默认文本编辑器）
ipcMain.handle('settings:open-log-file', async () => {
  const file = currentLogFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const err = await shell.openPath(file);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 打开日志目录（系统文件管理器）
ipcMain.handle('settings:open-log-folder', async () => {
  const dir = logsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 查询 dsh 运行环境版本信息（设置页展示）：当前运行版本 + registry 正式版/预发布版。
// 快速启动（npm exec）每次都会解析 registry 最新版并自动更新，这里仅做对比展示。
// 服务未运行时（本地环境已安装）：回退读取本地 package.json 的实际版本作为对比基准。
ipcMain.handle('dsh:version-info', async () => {
  const localExists = !!localDshEntry();
  let running = serviceState.dshVersion || null;
  if (!running && localExists) {
    try {
      const pkgPath = path.join(localDshDir(), 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg && pkg.version) running = String(pkg.version).replace(/^v/, '');
      }
    } catch (e) { /* 读取失败则保持 null */ }
  }
  let latest = null;
  let next = null;
  let error = '';
  try {
    const res = await queryDshDistTags();
    if (res.error) throw new Error(res.error);
    latest = res.latest;
    next = res.next;
  } catch (e) {
    error = e.message;
  }
  return {
    ok: !error,
    running,
    latest,
    next,
    // outdated：正式版或预发布版任一与当前运行版本不同即视为有可更新版本
    outdated: !!(running && ((latest && running !== latest) || (next && running !== next))),
    error,
    // 极速启动本地运行环境：固定目录位置与是否已安装（设置页「清除」功能用）
    localDir: localDshDir(),
    localExists,
  };
});

// 离线启动模式：一键更新本地运行环境（停止服务 → 重装 → 自动重启）。
// tag: 'latest' 正式版（默认） | 'next' 预发布版
ipcMain.handle('dsh:update-local', async (e, tag) => {
  return await updateLocalDsh(tag);
});

// 清除本地运行环境（极速启动固定目录）：停止服务 → 删除目录 → 返回结果与路径
ipcMain.handle('dsh:clear-local', async () => {
  return await clearLocalRuntime();
});

// 本地运行环境信息（设置页即时展示路径，不查询网络，立即返回）
ipcMain.handle('dsh:local-runtime-info', async () => {
  return {
    localDir: localDshDir(),
    localExists: !!localDshEntry(),
  };
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
//  同时支持用户直接粘贴任意命令（npx / npm / node / pnpm 等）原样执行。
// ============================================================

// 主进程插件操作状态表：key 为插件包名（命令操作用 'cmd:<命令>'）。
// 渲染进程刷新/切换页面后通过 plugin:status / plugin:list 查询到进行中的
// 操作并恢复按钮状态，避免"正在安装却显示未安装"的状态丢失问题。
const pluginOps = new Map();
function setPluginOp(key, op) {
  if (op) pluginOps.set(key, op);
  else pluginOps.delete(key);
}
function currentPluginOp(pkg) {
  const op = pluginOps.get(pkg);
  return op ? op.type : null;
}

// 查询推荐插件列表安装状态（叠加进行中的操作状态 opType + 全局忙碌标记）
ipcMain.handle('plugin:status', async () => {
  try {
    const dir = pluginMgr.profileDir();
    const list = pluginMgr.RECOMMENDED_PLUGINS.map((p) => ({
      pkg: p.pkg,
      title: p.title,
      desc: p.desc,
      ...pluginMgr.pluginStatus(dir, p.pkg),
      opType: currentPluginOp(p.pkg),
    }));
    return { ok: true, list, busy: pluginOps.size > 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 列出 profile 中所有已安装插件（叠加进行中的操作状态 opType）
ipcMain.handle('plugin:list', async () => {
  try {
    const list = pluginMgr.listInstalledPlugins(pluginMgr.profileDir()).map((p) => ({
      ...p,
      opType: currentPluginOp(p.pkg),
    }));
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 简单 semver 比较：返回 1 表示 a>b，-1 表示 a<b，0 相等。忽略 v 前缀与预发布标识。
function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/, '').split(/[.-]/).map((s) => parseInt(s, 10) || 0);
  const pb = String(b || '').replace(/^v/, '').split(/[.-]/).map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// 查询 npm registry 上某个包的最新版本（复用 dsh:version-info 的查询方式）
async function queryNpmLatestVersion(pkgName) {
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  if (!nodeExe || !npmCli) return { version: null, error: '未检测到 Node.js / npm' };
  try {
    const r = await runCommand(
      nodeExe,
      [npmCli, 'view', pkgName, 'version', '--registry', npmRegistry, '--no-audit', '--no-fund'],
      { env: cleanServiceEnv() },
      () => {}
    );
    const line = String(r.out || '').split(/\r?\n/).map((s) => s.trim()).find((s) => /^\d+\.\d+\.\d+/.test(s));
    if (!line) return { version: null, error: '未找到该包或解析版本失败' };
    return { version: line.replace(/^v/, ''), error: null };
  } catch (e) {
    return { version: null, error: e.message };
  }
}

// 检测已安装插件的更新：遍历已安装列表，逐个查询 npm registry 最新版本并对比。
// 旧包名安装的插件（如 @feiyang666/deepseekharnessdesktop、deepseekharnessdesktop-vault）
// 会改为查询新包名（@feiyang666/dsh-usage-plugin、@feiyang666/dsh-vault），
// 并标记 legacyMigrate 提示可迁移。
ipcMain.handle('plugin:check-updates', async () => {
  try {
    const installed = pluginMgr.listInstalledPlugins(pluginMgr.profileDir());
    const results = [];
    for (const p of installed) {
      // 只有真正按「旧包名」安装的插件才需要迁移提示：旧包名 -> 查询并迁移到新包名。
      // 注意不能依赖 legacyAliasFor(p.pkg) !== p.pkg 判断——它是双向映射，新包名
      // 也会返回旧名，导致新包被误标成「旧包名，可迁移」。
      const isLegacy = p.pkg === pluginMgr.PLUGIN_PKG_LEGACY || p.pkg === pluginMgr.PLUGIN_VAULT_PKG_LEGACY;
      const checkPkg = isLegacy ? (pluginMgr.legacyAliasFor(p.pkg) || p.pkg) : p.pkg;
      const { version, error } = await queryNpmLatestVersion(checkPkg);
      const current = p.version || '';
      results.push({
        pkg: p.pkg,
        checkPkg,
        current,
        latest: version,
        outdated: !!(version && current && compareVersions(version, current) > 0),
        legacyMigrate: isLegacy,
        error: error || null,
      });
    }
    return { ok: true, list: results };
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

// 统一安装入口：支持包名（字符串）或解析后的安装内容（{ ok, type, pkg?|command?, tokens? }）。
// pkg 缺省为推荐插件。
async function doInstallPlugin(input) {
  const nodeExe = await findNodeExe();
  const npmCli = await findNpmCli();
  if (!nodeExe || !npmCli) {
    const msg = '未检测到 Node.js / npm，请先安装 Node.js（https://nodejs.org/）';
    broadcast('plugin:event', { stage: 'error', message: msg });
    return { ok: false, error: msg };
  }
  // 解析安装内容：对象（已解析）或字符串（原始输入）
  let parsed = input && typeof input === 'object' ? input : null;
  if (typeof input === 'string') {
    if (!String(input).trim()) {
      const msg = '请输入要安装的插件包名或安装命令';
      broadcast('plugin:event', { stage: 'error', message: msg });
      return { ok: false, error: msg };
    }
    parsed = pluginMgr.validatePkgSpec(input);
  }
  // null / undefined（推荐插件 / 市场安装按钮）→ 默认推荐插件
  if (!parsed) parsed = pluginMgr.validatePkgSpec(pluginMgr.PLUGIN_PKG);
  if (!parsed || !parsed.ok) {
    const msg = (parsed && parsed.error) || '无效的安装内容';
    broadcast('plugin:event', { stage: 'error', message: msg });
    return { ok: false, error: msg };
  }
  if (parsed.type === 'command') {
    return await runInstallCommand(parsed, nodeExe, npmCli);
  }
  return await runInstallPkg(parsed.pkg, nodeExe, npmCli);
}

// 标准安装流程：依次尝试镜像池，失败自动换下一个镜像
async function runInstallPkg(name, nodeExe, npmCli) {
  await ensureRegistrySelected();
  setPluginOp(name, { type: 'install', startedAt: Date.now() });
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
    broadcast('plugin:event', { stage: 'error', pkg: name, message: '安装异常：' + e.message });
    return { ok: false, error: e.message };
  } finally {
    setPluginOp(name, null);
  }
}

// 定位 `dsh` 命令的真实可执行入口，返回 { exe, args, source }；找不到返回 null。
// 背景：「极速启动」把 dsh 装到 <userData>/dsh-local 固定目录，直接用 node 跑入口，
// 并不会把 dsh 加入系统 PATH。导致自定义安装输入 `dsh plugin --profile web add xxx`
// 时 which('dsh') 失败，报「未找到命令 dsh」。这里按优先级自动定位：
//   1) 极速启动本地固定目录（与桌面端当前运行的 dsh 完全一致）
//   2) npm 全局安装目录（npm prefix -g 下的 @deepseek-ai/dsh）
//   3) 系统 PATH（where/which dsh），Windows 下 .cmd/.bat 用 cmd.exe 执行
//   4) npx 缓存兜底（快速启动模式下 dsh 在 npx 缓存里，node npx-cli.js @deepseek-ai/dsh ...）
// 前两者用 `node <JS入口>` 直接运行，不依赖 PATH。
async function resolveDshCli(nodeExe, npmCli) {
  // 1) 极速启动本地固定目录（桌面端「极速启动」模式安装的本地 dsh）
  const local = localDshEntry();
  if (local) return { exe: nodeExe, args: [local], source: 'local' };
  // 2) npm 全局安装目录（npm i -g @deepseek-ai/dsh）
  const prefix = await findNpmPrefix();
  if (prefix) {
    const pkgDir = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh');
    const pkgFile = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        const bin = pkg.bin || {};
        const entry = typeof bin === 'string' ? bin : (bin.dsh || Object.values(bin)[0] || null);
        if (entry) {
          const full = path.join(pkgDir, entry);
          if (fs.existsSync(full)) return { exe: nodeExe, args: [full], source: 'global' };
        }
      } catch (e) { /* 忽略损坏的 package.json */ }
    }
  }
  // 3) 系统 PATH
  const found = await which('dsh');
  if (found) {
    if (isWin && /\.(cmd|bat)$/i.test(found)) {
      return { exe: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', found], source: 'path' };
    }
    return { exe: found, args: [], source: 'path' };
  }
  // 4) npx 缓存兜底（快速启动模式下 dsh 不在本地目录 / 全局 / PATH）
  if (npmCli) {
    const npxCli = path.join(path.dirname(npmCli), 'npx-cli.js');
    if (fs.existsSync(npxCli)) return { exe: nodeExe, args: [npxCli, '@deepseek-ai/dsh'], source: 'npx' };
  }
  return null;
}

// 修复 profile 中 pnpm-workspace.yaml 的 build 审批配置，避免 `dsh plugin add` 因
// pnpm 10+ 的「ignored build scripts」机制以非零退出码失败（dsh CLI 会把任何 pnpm
// 非零退出当作安装失败，输出 "pnpm failed in profile directory"）。
// 触发场景：profile 的 pnpm-workspace.yaml 里 allowBuilds 被写成占位值
// （"set this to true or false"，是非交互执行 `pnpm approve-builds` 时写入的非法值），
// 导致 cloudflared / cpu-features / ssh2 等带构建脚本的依赖永远不被批准。
// 修复方式：占位值统一改为 true，并确保 strictDepBuilds: false（未批准的构建脚本
// 后续只警告不失败）。返回是否实际发生了修改。
function fixPnpmBuildApprovals(profileDir) {
  const file = path.join(profileDir, 'pnpm-workspace.yaml');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return false;
  }
  let next = text;
  let changed = false;

  // 1) allowBuilds 下的占位值（`set this to true or false`）→ true
  if (/set this to true or false/i.test(next)) {
    next = next.replace(/set this to true or false/gi, 'true');
    changed = true;
  }

  // 2) 确保 strictDepBuilds: false 存在（未批准的构建脚本只警告，不导致 install 失败）
  if (!/^\s*strictDepBuilds\s*:/m.test(next)) {
    next = next.trimEnd() + '\nstrictDepBuilds: false\n';
    changed = true;
  }

  if (!changed) return false;
  try {
    fs.writeFileSync(file, next, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

// 命令模式：原样执行用户输入的命令（npx / npm / node / pnpm / dsh / 其他可执行文件）。
// 用 spawn 数组参数（不经 shell），输出完整转发到渲染进程终端日志面板。
async function runInstallCommand(parsed, nodeExe, npmCli) {
  const tokens = parsed.tokens || [];
  const first = String(tokens[0] || '').toLowerCase();
  const displayCmd = tokens.join(' ');
  const opKey = 'cmd:' + displayCmd;

  let exe = null;
  let args = [];
  if (first === 'npm') {
    if (!npmCli) return failInstall(opKey, '未检测到 npm');
    exe = nodeExe; args = [npmCli, ...tokens.slice(1)];
  } else if (first === 'npx') {
    if (!npmCli) return failInstall(opKey, '未检测到 npm / npx');
    const npxCli = path.join(path.dirname(npmCli), 'npx-cli.js');
    if (!fs.existsSync(npxCli)) return failInstall(opKey, '未找到 npx 入口（' + npxCli + '）');
    exe = nodeExe; args = [npxCli, ...tokens.slice(1)];
  } else if (first === 'node') {
    exe = nodeExe; args = tokens.slice(1);
  } else if (first === 'pnpm') {
    const pnpmCli = await findPnpmCli();
    if (!pnpmCli) return failInstall(opKey, '未找到 pnpm，请先安装 pnpm 后再试');
    exe = nodeExe; args = [pnpmCli, ...tokens.slice(1)];
  } else if (first === 'dsh') {
    // `dsh` 命令：自动定位本地「极速启动」安装 / npm 全局安装 / 系统 PATH / npx 缓存。
    // 否则本地安装的 dsh 未加入 PATH 时会报「未找到命令 dsh」。
    const dshCli = await resolveDshCli(nodeExe, npmCli);
    if (!dshCli) {
      return failInstall(opKey, '未找到命令 dsh，请确认其已安装并加入 PATH；也可改用「npx @deepseek-ai/dsh ...」或直接输入包名安装');
    }
    logLine(`[命令] dsh 定位到 ${dshCli.source}：${dshCli.exe} ${dshCli.args.join(' ')}`);
    exe = dshCli.exe; args = [...dshCli.args, ...tokens.slice(1)];
  } else {
    const found = await which(tokens[0]);
    if (!found) return failInstall(opKey, `未找到命令 ${tokens[0]}，请确认其已安装并加入 PATH`);
    exe = found; args = tokens.slice(1);
  }

  setPluginOp(opKey, { type: 'install', startedAt: Date.now() });
  broadcast('plugin:event', { stage: 'command', command: displayCmd });
  broadcast('plugin:event', { stage: 'installing', message: `正在执行：${displayCmd}` });
  try {
    const env = {
      ...cleanServiceEnv(),
      npm_config_ignore_scripts: 'true',
      npm_config_registry: npmRegistry, // npx/npm 默认走已选镜像，避免国内直连官方源慢
      npm_config_yes: 'true',           // 非交互环境：npx / npm exec 不弹 "Ok to proceed?" 确认
      NPM_CONFIG_LOGLEVEL: 'info',
      npm_config_progress: 'true',
    };
    const cwd = pluginMgr.profileDir();
    pluginMgr.ensureProfile(cwd); // 确保 profile 目录存在（命令可能在此目录下执行）
    const onOut = (s) => {
      const line = String(s).replace(/\r?\n$/, '');
      logLine('[插件] ' + line);
      broadcast('plugin:event', { stage: 'log', message: line });
    };
    let r = await runCommand(exe, args, { cwd, env }, onOut);
    // dsh 命令经 pnpm 安装插件时，pnpm 10+ 会因「ignored build scripts」以非零退出，
    // 被 dsh CLI 判定为安装失败。自动修复 profile 的 pnpm build 审批配置后重试一次。
    if (r.code !== 0 && first === 'dsh' && fixPnpmBuildApprovals(cwd)) {
      logLine('[插件] 检测到 pnpm build 审批配置异常，已自动修复，正在重试...');
      broadcast('plugin:event', { stage: 'log', message: '检测到 pnpm build 审批配置异常，已自动修复，正在重试...' });
      r = await runCommand(exe, args, { cwd, env }, onOut);
    }
    if (r.code === 0) {
      broadcast('plugin:event', { stage: 'done', message: `命令执行完成：${displayCmd}` });
      notify('插件操作完成', displayCmd);
    } else {
      broadcast('plugin:event', {
        stage: 'error',
        message: `命令执行失败（退出码 ${r.code}）：${displayCmd}${(r.error ? ' · ' + r.error : '')}`,
      });
    }
    return { ok: r.code === 0, out: r.out, command: displayCmd };
  } catch (e) {
    broadcast('plugin:event', { stage: 'error', message: '命令执行异常：' + e.message });
    return { ok: false, error: e.message };
  } finally {
    setPluginOp(opKey, null);
  }
}

function failInstall(_opKey, message) {
  broadcast('plugin:event', { stage: 'error', message });
  return { ok: false, error: message };
}

// 一键安装推荐插件（pkg 缺省为 @feiyang666/dsh-usage-plugin）
ipcMain.handle('plugin:install', async (e, payload) => {
  const pkg = payload && typeof payload === 'object' ? payload.pkg : null;
  return await doInstallPlugin(pkg || null);
});

// 自定义包名 / 安装命令安装：支持任意格式，不做限制
// （纯包名 / npm install xxx / npx @deepseek-ai/dsh plugin --profile web add xxx / node / pnpm ...）
ipcMain.handle('plugin:install-custom', async (e, payload) => {
  const input = payload && typeof payload === 'object' ? payload.pkg : payload;
  return await doInstallPlugin(input || '');
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
  setPluginOp(name, { type: 'uninstall', startedAt: Date.now() });
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
      message: r.ok
        ? '卸载完成'
        : `卸载失败：插件目录可能被占用或无法删除（${(r.error || '未知错误').slice(0, 120)}）`,
    });
    return r;
  } catch (e) {
    broadcast('plugin:event', { stage: 'error', pkg: name, message: '卸载异常：' + e.message });
    return { ok: false, error: e.message };
  } finally {
    setPluginOp(name, null);
  }
}

ipcMain.handle('plugin:uninstall', async (e, payload) => {
  const input = payload && typeof payload === 'object' ? payload.pkg : payload;
  return await doUninstallPlugin(input || null);
});

// ============================================================
//  插件市场（扫描 GitHub topic:dsh-plugin 的公开仓库）
// ============================================================

// 供渲染进程查询市场条目是否已安装（把已装的 npm 包名映射成集合）
async function marketInstalledMap() {
  const map = {};
  try {
    const list = pluginMgr.listInstalledPlugins(pluginMgr.profileDir());
    for (const p of list) map[p.pkg] = p;
  } catch (e) { /* ignore */ }
  return map;
}

// 插件市场：列表（搜索 GitHub topic:dsh-plugin）
ipcMain.handle('plugin:market-list', async (e, payload) => {
  payload = payload && typeof payload === 'object' ? payload : {};
  try {
    const result = await pluginMarket.listMarket({
      keyword: payload.keyword || '',
      page: payload.page || 1,
      perPage: payload.perPage || pluginMarket.PER_PAGE,
      resolvePkgNames: payload.resolvePkgNames !== false,
    });
    if (!result.ok) return result;
    // 叠加已安装状态 + 进行中的操作状态
    const installedMap = await marketInstalledMap();
    result.list = result.list.map((item) => {
      if (item.pkgName && installedMap[item.pkgName]) {
        const ins = installedMap[item.pkgName];
        return {
          ...item,
          installed: ins.installed,
          installedVersion: ins.version,
          bundled: !!ins.bundled,
          opType: currentPluginOp(item.pkgName),
        };
      }
      return {
        ...item,
        installed: false,
        installedVersion: '',
        bundled: false,
        opType: item.pkgName ? currentPluginOp(item.pkgName) : null,
      };
    });
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 插件市场：一键安装（按 npm 包名走统一安装入口）
ipcMain.handle('plugin:market-install', async (e, payload) => {
  const pkg = payload && typeof payload === 'object' ? payload.pkg : payload;
  const name = String(pkg || '').trim();
  if (!name) {
    broadcast('plugin:event', { stage: 'error', message: '未识别到可安装的包名' });
    return { ok: false, error: '未识别到可安装的包名' };
  }
  return await doInstallPlugin(name);
});