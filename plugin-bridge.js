'use strict';

// ============================================================
//  插件数据桥接（纯 Node 逻辑，无 Electron 依赖）
//
//  设计原则：桌面端**不重复实现**插件功能——用量统计、数据备份、
//  移动端远程控制等能力都完整存在于各插件 npm 包中，且不依赖桌面端
//  即可独立使用（`dsh plugin --profile web add <pkg>` 一条命令装好就能用）。
//  桌面端只做「桥接消费」：通过插件暴露在 dsh web 同端口上的 HTTP API
//  拉取原始数据，做展示层聚合（按模型/按服务商/按周期汇总等纯数学运算）。
//  计费逻辑仍在插件内完成（list 返回每条记录的 autoCost 等成本字段）。
//
//  插件未安装 / 服务未就绪 / 接口失败时，对应快照返回 available:false，
//  由 UI 优雅降级（不显示或提示去「插件管理」页安装），绝不影响主流程。
// ============================================================
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_HOST = '127.0.0.1';
const TIMEOUT_MS = 5000;
// 余额查询可能触发插件的 node 子进程网络请求，单独放宽超时
const BALANCE_TIMEOUT_MS = 15000;

function httpJsonRequest(opts) {
  const { host = DEFAULT_HOST, port, path: reqPath, method = 'GET', body, timeoutMs = TIMEOUT_MS } = opts || {};
  return new Promise((resolve) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    let req;
    try {
      req = http.request({
        host,
        port: Number(port) || 3080,
        path: reqPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
          catch (e) { resolve({ status: res.statusCode, json: null, raw: String(data).slice(0, 500) }); }
        });
      });
    } catch (e) {
      return resolve({ status: 0, error: e.message });
    }
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- 北京时间工具（与 dsh-usage-plugin 的 bjKey 一致） ----------
function bjParts(ts) {
  const d = new Date(Number(ts) + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    ymd: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()),
    ym: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1),
    dow: d.getUTCDay(), // 0=周日
    date: d.getUTCDate(),
  };
}
function bjTodayKey(now) { return bjParts(now || Date.now()).ymd; }
// 本周一（北京时间）的 YYYY-MM-DD
function bjWeekKey(now) {
  const d = new Date((now || Date.now()) + 8 * 3600 * 1000);
  const shift = (d.getUTCDay() + 6) % 7; // 距周一的天数
  d.setUTCDate(d.getUTCDate() - shift);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}
function bjMonthKey(now) { return bjParts(now || Date.now()).ym; }

// ---------- 路径工具 ----------
function toAbsolute(p) {
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/');
  if (s.startsWith('~/')) s = (process.env.USERPROFILE || process.env.HOME || '') + s.slice(1);
  if (!path.isAbsolute(s)) s = path.join(process.cwd(), s);
  return s;
}
async function dirSize(dir) {
  try {
    const stat = await fs.promises.stat(dir);
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(full);
      else { try { total += (await fs.promises.stat(full)).size; } catch (err) { /* ignore */ } }
    }
    return total;
  } catch (e) { return 0; }
}
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(2) + ' MB';
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// ---------- 用量聚合（纯数学，成本字段来自插件的 list 返回） ----------
function makeBucket() {
  return { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, baseCost: 0, peakValleyCost: 0, autoCost: 0 };
}
function addToBucket(b, x) {
  b.calls += x.calls || 0;
  b.inputTokens += x.inputTokens || 0;
  b.cacheReadTokens += x.cacheReadTokens || 0;
  b.cacheWriteTokens += x.cacheWriteTokens || 0;
  b.outputTokens += x.outputTokens || 0;
  b.reasoningTokens += x.reasoningTokens || 0;
  b.baseCost += x.baseCost || 0;
  b.peakValleyCost += x.peakValleyCost || 0;
  b.autoCost += x.autoCost || 0;
  return b;
}
function bucketToRow(b, key) {
  const hit = b.cacheReadTokens, miss = b.inputTokens;
  return {
    key,
    calls: b.calls,
    inputTokens: b.inputTokens,
    cacheReadTokens: b.cacheReadTokens,
    cacheWriteTokens: b.cacheWriteTokens,
    outputTokens: b.outputTokens,
    reasoningTokens: b.reasoningTokens,
    hitRate: (hit + miss) > 0 ? hit / (hit + miss) : 0,
    baseCost: b.baseCost,
    peakValleyCost: b.peakValleyCost,
    autoCost: b.autoCost,
  };
}

// ---- 用量插件（@feiyang666/dsh-usage-plugin）：完整明细 ----
async function getUsageDetail(port) {
  const r = await httpJsonRequest({ port, path: '/usage/api', method: 'POST', body: { action: 'list' } });
  if (r.status !== 200 || !r.json || r.json.ok !== true) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const items = Array.isArray(r.json.records) ? r.json.records : [];
  const days = Array.isArray(r.json.days) ? r.json.days : [];

  const now = Date.now();
  const keys = { today: bjTodayKey(now), week: bjWeekKey(now), month: bjMonthKey(now) };
  const periods = { today: null, week: null, month: null, all: null };
  const modelMap = new Map();
  const providerMap = new Map();
  let totHit = 0, totMiss = 0;

  for (const rec of items) {
    const day = bjParts(rec.time).ymd;
    const x = {
      calls: 1,
      inputTokens: Number(rec.inputTokens) || 0,
      cacheReadTokens: Number(rec.cacheReadTokens) || 0,
      cacheWriteTokens: Number(rec.cacheWriteTokens) || 0,
      outputTokens: Number(rec.outputTokens) || 0,
      reasoningTokens: Number(rec.reasoningTokens) || 0,
      baseCost: Number(rec.baseCost) || 0,
      peakValleyCost: Number(rec.peakValleyCost) || 0,
      autoCost: Number(rec.autoCost) || 0,
    };
    totHit += x.cacheReadTokens; totMiss += x.inputTokens;
    for (const k of ['today', 'week', 'month']) {
      const kk = k === 'today' ? keys.today : k === 'week' ? keys.week : keys.month;
      if (kk && day >= kk) {
        if (!periods[k]) periods[k] = makeBucket();
        addToBucket(periods[k], x);
      }
    }
    if (!periods.all) periods.all = makeBucket();
    addToBucket(periods.all, x);

    const mk = String(rec.model || '').trim() || '(未知)';
    let mb = modelMap.get(mk); if (!mb) { mb = makeBucket(); modelMap.set(mk, mb); }
    addToBucket(mb, x);

    const pk = String(rec.provider || '').trim() || '(未知)';
    let pb = providerMap.get(pk); if (!pb) { pb = makeBucket(); providerMap.set(pk, pb); }
    addToBucket(pb, x);
  }

  const byModel = Array.from(modelMap.entries())
    .map(([k, b]) => bucketToRow(b, k))
    .sort((a, b) => b.autoCost - a.autoCost || b.calls - a.calls);
  const byProvider = Array.from(providerMap.entries())
    .map(([k, b]) => bucketToRow(b, k))
    .sort((a, b) => b.autoCost - a.autoCost || b.calls - a.calls);

  const days30 = days.slice(0, 30).map((d) => ({
    day: d.day, calls: d.calls, miss: d.miss, hit: d.hit, write: d.write, out: d.out, reason: d.reason,
    peakCalls: d.peakCalls, offPeakCalls: d.offPeakCalls,
    baseCost: d.baseCost, peakValleyCost: d.peakValleyCost, autoCost: d.autoCost,
  }));

  // 最近 200 条原始记录（倒序）
  const recent = items.slice(-200).reverse().map((rec) => ({
    time: rec.time, model: rec.model, provider: rec.provider, purpose: rec.purpose,
    inputTokens: rec.inputTokens, outputTokens: rec.outputTokens,
    cacheReadTokens: rec.cacheReadTokens, cacheWriteTokens: rec.cacheWriteTokens,
    reasoningTokens: rec.reasoningTokens, finishReason: rec.finishReason,
    autoCost: Number(rec.autoCost) || 0, peak: rec.peak === true,
  }));

  return {
    available: true,
    dataPath: r.json.dataPath || '',
    persistOk: !!r.json.persistOk,
    persistError: r.json.persistError || '',
    effectiveAt: r.json.effectiveAt || '',
    fx: r.json.fx || null,
    totalCalls: r.json.count || items.length,
    overallHitRate: (totHit + totMiss) > 0 ? totHit / (totHit + totMiss) : 0,
    period: {
      today: periods.today ? bucketToRow(periods.today, 'today') : null,
      week: periods.week ? bucketToRow(periods.week, 'week') : null,
      month: periods.month ? bucketToRow(periods.month, 'month') : null,
      all: periods.all ? bucketToRow(periods.all, 'all') : null,
    },
    byModel,
    byProvider,
    days30,
    recent,
  };
}

// ---- 余额与凭据 ----
// 注意：usage 插件的 `balanceCredentialStatus` 对 DeepSeek / SiliconFlow 返回
// `ok:false`（"该服务商不支持在余额页管理凭据"），这**不代表凭据未配置**——
// 这些服务商走模型 provider 引用 apiKeyEnv，仍可直接查余额。因此不能以
// `balanceCredentialStatus.configured` 作为是否查询余额的前置条件。
// 正确策略：`queryMode === 'unsupported'`（如 AMD）跳过；其余服务商一律直接查余额。
async function getBalances(port) {
  const r = await httpJsonRequest({ port, path: '/usage/api', method: 'POST', body: { action: 'balanceProviders' } });
  if (r.status !== 200 || !r.json || r.json.ok !== true) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const providers = (Array.isArray(r.json.providers) ? r.json.providers : []).map((p) => ({
    id: p.id, name: p.name, queryMode: p.queryMode, credentialHint: p.credentialHint || '', credentialHelpUrl: p.credentialHelpUrl || '',
    credentialStatus: null, balance: null,
  }));
  if (providers.length === 0) return { available: true, providers };

  // 凭据配置状态（本地查询，仅作展示辅助；不可作为查余额的前置判断）
  const statuses = await Promise.all(providers.map((p) =>
    httpJsonRequest({ port, path: '/usage/api', method: 'POST', body: { action: 'balanceCredentialStatus', provider: p.id } })
  ));
  statuses.forEach((s, i) => {
    providers[i].credentialStatus = (s.status === 200 && s.json) ? s.json : { ok: false, error: s.error || ('HTTP ' + s.status) };
  });

  // 直接查询余额：除 unsupported 外全部尝试（网络请求，慢，串行限制并发）
  const queries = await Promise.all(providers.map((p) => {
    if (p.queryMode === 'unsupported') return Promise.resolve(null);
    return httpJsonRequest({ port, path: '/usage/api', method: 'POST', body: { action: 'balance', provider: p.id }, timeoutMs: BALANCE_TIMEOUT_MS })
      .then((x) => (x.status === 200 && x.json) ? x.json : { ok: false, error: x.error || ('HTTP ' + x.status) })
      .catch(() => ({ ok: false, error: '请求超时' }));
  }));
  queries.forEach((q, i) => { providers[i].balance = q; });

  return { available: true, providers };
}

// ---- 数据保险箱（@feiyang666/dsh-vault）：备份列表（含本地大小统计） ----
async function getVaultDetail(port) {
  const r = await httpJsonRequest({ port, path: '/api/dsh-vault', method: 'POST', body: { action: 'status' } });
  if (r.status !== 200 || !r.json || r.json.ok !== true) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const root = toAbsolute(r.json.backupRoot);
  const list = Array.isArray(r.json.backups) ? r.json.backups : [];
  const backups = [];
  for (const b of list) {
    const dir = path.join(root, String(b.name || ''));
    backups.push({
      name: b.name, createdAt: b.createdAt || '', sessionCount: b.sessionCount || 0, hasUsage: !!b.hasUsage,
      size: await dirSize(dir),
    });
  }
  return {
    available: true,
    dshHome: r.json.dshHome || '',
    backupRoot: r.json.backupRoot || '',
    lastBackup: r.json.lastBackup || null,
    detected: r.json.detected || null,
    backups,
  };
}

// 立即手动备份
async function triggerBackup(port) {
  const r = await httpJsonRequest({ port, path: '/api/dsh-vault', method: 'POST', body: { action: 'backup' } });
  if (r.status !== 200 || !r.json) return { ok: false, error: r.error || ('HTTP ' + r.status) };
  return r.json;
}

// ---- 移动端远程控制（@feiyang666/dsh-mobile-remote）：完整状态 ----
// 注意：/__dsh_remote/status 端点**不返回 { ok:true } 包装**，而是直接返回状态对象
// （host / remoteEnabled / deviceCount / devices / external ...）。因此只能按
// HTTP 200 + 非空 JSON 判定可用，不能用 `json.ok`。
async function getRemoteDetail(port) {
  const r = await httpJsonRequest({ port, path: '/__dsh_remote/status' });
  if (r.status !== 200 || !r.json) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const auth = await httpJsonRequest({ port, path: '/__dsh_remote/auth-status' }).catch(() => null);
  return {
    available: true,
    status: r.json,
    auth: (auth && auth.status === 200 && auth.json) ? auth.json : null,
  };
}

// ---------- 汇总快照 ----------
// 数据中心页面：完整详细数据（并行拉取）
async function getDataCenterSnapshot(port) {
  const [usage, balances, vault, remote] = await Promise.all([
    getUsageDetail(port).catch((e) => ({ available: false, error: e.message })),
    getBalances(port).catch((e) => ({ available: false, error: e.message })),
    getVaultDetail(port).catch((e) => ({ available: false, error: e.message })),
    getRemoteDetail(port).catch((e) => ({ available: false, error: e.message })),
  ]);
  return { usage, balances, vault, remote };
}

// 首页运行状态控制台：轻量快照（只取概要字段）
async function getUsageSummary(port) {
  const r = await httpJsonRequest({ port, path: '/usage/api', method: 'POST', body: { action: 'list' } });
  if (r.status !== 200 || !r.json || r.json.ok !== true) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const days = Array.isArray(r.json.days) ? r.json.days : [];
  const todayKey = bjTodayKey();
  const today = days.find((d) => d && d.day === todayKey) || null;
  const last7 = days.slice(0, 7);
  const sum = (arr, f) => arr.reduce((a, d) => a + (Number(d && d[f]) || 0), 0);
  return {
    available: true,
    dataPath: r.json.dataPath || '',
    persistOk: !!r.json.persistOk,
    totalCalls: r.json.count || sum(days, 'calls'),
    today: today ? { day: today.day, calls: today.calls, cost: today.autoCost } : null,
    last7: { calls: sum(last7, 'calls'), cost: sum(last7, 'autoCost') },
  };
}

async function getBalance(port) {
  const r = await httpJsonRequest({ port, path: '/usage/api', method: 'POST', body: { action: 'balance' }, timeoutMs: BALANCE_TIMEOUT_MS });
  if (r.status !== 200 || !r.json) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const j = r.json;
  return {
    available: j.ok === true,
    ok: j.ok === true,
    // usage 插件 balance 返回的是 totalBalance 字段（含 details 明细）
    balance: j.ok ? j.totalBalance : null,
    currency: (j.ok && j.currency) || '',
    provider: (j.ok && j.provider) || '',
    error: j.ok ? '' : (j.error || null),
  };
}

async function getVaultStatus(port) {
  const r = await httpJsonRequest({ port, path: '/api/dsh-vault', method: 'POST', body: { action: 'status' } });
  if (r.status !== 200 || !r.json || r.json.ok !== true) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const backups = Array.isArray(r.json.backups) ? r.json.backups : [];
  const latest = backups[backups.length - 1] || null;
  return {
    available: true,
    backupRoot: r.json.backupRoot || '',
    lastBackupAt: (r.json.lastBackup && r.json.lastBackup.at) || (latest && latest.createdAt) || null,
    backupCount: backups.length,
    latestHasUsage: !!(latest && latest.hasUsage),
  };
}

async function getRemoteStatus(port) {
  const r = await httpJsonRequest({ port, path: '/__dsh_remote/status' });
  if (r.status !== 200 || !r.json) {
    return { available: false, error: r.error || (r.status ? 'HTTP ' + r.status : '未就绪') };
  }
  const j = r.json;
  return {
    available: true,
    deviceCount: typeof j.deviceCount === 'number' ? j.deviceCount : 0,
    remoteEnabled: !!j.remoteEnabled,
    patchEnabled: !!j.patchEnabled,
    lanAddresses: Array.isArray(j.lanAddresses) ? j.lanAddresses : [],
    external: (j.external && typeof j.external === 'object') ? j.external : null,
  };
}

// 首页运行状态控制台：轻量快照（并行）
async function getPluginSnapshots(port) {
  const [usage, balance, vault, remote] = await Promise.all([
    getUsageSummary(port).catch((e) => ({ available: false, error: e.message })),
    getBalance(port).catch((e) => ({ available: false, error: e.message })),
    getVaultStatus(port).catch((e) => ({ available: false, error: e.message })),
    getRemoteStatus(port).catch((e) => ({ available: false, error: e.message })),
  ]);
  return { usage, balance, vault, remote };
}

// ---------- 数据变化检测（事件推送用，非轮询刷新） ----------
// 主进程低频调用：对比服务运行状态 + 关键指标（调用次数 / 备份份数 / 最近备份 /
// 在线设备数），仅在**发生变化**时返回 true，由主进程推送「数据已变化」事件给前端。
// 前端收到事件才静默更新页面，数据不变时不打扰。
let lastChangeSig = null;
let changeInitialized = false;

async function detectDataChange(port, running) {
  const sig = { running: !!running, data: null };
  if (running) {
    const [usage, vault, remote] = await Promise.all([
      getUsageSummary(port).catch(() => null),
      getVaultStatus(port).catch(() => null),
      getRemoteStatus(port).catch(() => null),
    ]);
    sig.data = {
      u: usage && usage.available ? String(usage.totalCalls || 0) + '|' + String((usage.today && usage.today.calls) || 0) : null,
      v: vault && vault.available ? String(vault.backupCount || 0) + '|' + String(vault.lastBackupAt || '') : null,
      r: remote && remote.available ? String(remote.deviceCount || 0) : null,
    };
  }
  // 首次调用只建立基线，不推送（避免启动时无意义刷新）
  if (!changeInitialized) { changeInitialized = true; lastChangeSig = sig; return false; }
  const changed = JSON.stringify(sig) !== JSON.stringify(lastChangeSig);
  lastChangeSig = sig;
  return changed;
}

// ---------- SSE 实时订阅（插件数据变化即时推送） ----------
// 长连接监听各插件的 SSE 事件端点，收到任意"数据已变化"事件即回调 cb()。
// 断线自动重连（指数退避 3s → 30s 封顶）；停止时返回函数销毁所有连接。
const EVENT_ENDPOINTS = [
  '/usage/api/events',
  '/api/dsh-vault/events',
  '/__dsh_remote/events',
];

function createEventSubscription(port, cb) {
  let aborted = false;
  const timers = new Set();
  const activeReqs = new Set();

  function schedule(endpoint, delay) {
    if (aborted) return;
    const t = setTimeout(() => connect(endpoint), delay);
    timers.add(t);
  }

  function connect(endpoint) {
    if (aborted) return;
    let req;
    try {
      req = http.request({ host: DEFAULT_HOST, port, path: endpoint, method: 'GET', timeout: 0 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          schedule(endpoint, 5000);
          return;
        }
        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
          // SSE 事件以空行分隔；块内含 "data:" 行即视为变化通知
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (/^data:/m.test(block)) {
              try { if (typeof cb === 'function') cb(endpoint); } catch (e) { /* 忽略回调异常 */ }
            }
          }
        });
        res.on('end', () => { activeReqs.delete(req); schedule(endpoint, 5000); });
        res.on('error', () => { activeReqs.delete(req); schedule(endpoint, 5000); });
      });
    } catch (e) {
      schedule(endpoint, 5000);
      return;
    }
    activeReqs.add(req);
    req.on('error', () => { activeReqs.delete(req); schedule(endpoint, 5000); });
    req.end();
  }

  // 初始连接：错开启动，避免三路同时握手
  EVENT_ENDPOINTS.forEach((ep, i) => schedule(ep, i * 300));

  return () => {
    aborted = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const r of activeReqs) { try { r.destroy(); } catch (e) { /* ignore */ } }
    activeReqs.clear();
  };
}

module.exports = {
  httpJsonRequest,
  getDataCenterSnapshot,
  triggerBackup,
  getPluginSnapshots,
  detectDataChange,
  createEventSubscription,
  getUsageDetail,
  getBalances,
  getVaultDetail,
  getRemoteDetail,
  getUsageSummary,
  getBalance,
  getVaultStatus,
  getRemoteStatus,
  fmtBytes,
};
