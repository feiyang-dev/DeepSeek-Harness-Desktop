'use strict';

// ============================================================
//  插件与 DSH 运行时的版本兼容性（纯 Node，无依赖）
//
//  对齐官方 dsh 0.1.7 的行为（见 @deepseek-ai/dsh-app-boot / dsh-plugin-manager）：
//   1) 导入插件前检查其 peerDependencies 中对 `@deepseek-ai/dsh` 与
//      `@deepseek-ai/dsh-*` 的版本范围，与当前运行时版本比较：
//        - 每个声明的范围都必须匹配；
//        - 预发布版本参与范围匹配；
//        - `workspace:^` / `workspace:~` / `workspace:*` 等同运行时（视为匹配）；
//        - 未声明 DSH peer 时不施加约束；
//        - 无效范围视为不兼容（官方语义）。
//   2) 不兼容的插件会被官方拒绝加载：普通行变成游离的 `disabled: true` 行，
//      组合包（bundle）被跳过并在启动时通过 skippedBundles 报告一次。
//   3) 例外（豁免）保存在 profile 自己的 compatibility.json 中：
//        { "<package-name>@<version>": ["<精确 dsh 版本>", ...] }
//      只对「精确版本」生效，插件升级或 DSH 升级都不继承。
//
//  桌面端用途：安装前/安装后给出兼容性结论 + 一键写例外，避免用户以为
//  「插件已安装」但在新版运行时里其实没有加载。
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const COMPATIBILITY_FILENAME = 'compatibility.json';
// 官方检查的 peer 前缀
const DSH_PEER_PREFIX = '@deepseek-ai/dsh';

// ------------------------------------------------------------
//  极简 semver（够用于 peer 范围判定）
// ------------------------------------------------------------
// 解析为 { major, minor, patch, prerelease: [] }；无法解析返回 null。
function parseVersion(input) {
  const raw = String(input == null ? '' : input).trim().replace(/^v/, '');
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(raw);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  };
}

// 官方兼容性豁免只接受「精确版本」（含 build metadata 的规范 SemVer）
function isExactVersion(input) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(input == null ? '' : input).trim());
}

function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  // 有预发布标识的版本小于同号正式版
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const dx = Number(x);
      const dy = Number(y);
      if (dx !== dy) return dx > dy ? 1 : -1;
      continue;
    }
    if (nx !== ny) return nx ? -1 : 1; // 数字标识小于字母标识
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// -1 / 0 / 1；任一无法解析时返回 null
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (va[key] !== vb[key]) return va[key] > vb[key] ? 1 : -1;
  }
  return comparePrerelease(va.prerelease, vb.prerelease);
}

// 判断 version 是否满足单个比较符范围（不含 || 与空格分组）
function satisfiesComparator(version, comparator) {
  const v = parseVersion(version);
  if (!v) return null;
  const raw = comparator.trim();
  if (!raw || raw === '*' || raw === 'x' || raw === 'X') return true;

  // workspace 协议：官方视为同一运行时
  if (/^workspace:/.test(raw)) return true;

  const m = /^(\^|~|>=|<=|>|<|=)?\s*v?(.+)$/.exec(raw);
  if (!m) return null;
  const op = m[1] || '=';
  const targetRaw = m[2].trim();

  // 通配片段（0.1.x / 0.1.* / 0.x）
  if (/[xX*]/.test(targetRaw)) {
    const parts = targetRaw.split('.').map((s) => s.trim());
    const nums = [];
    for (const p of parts) {
      if (/^\d+$/.test(p)) nums.push(Number(p));
      else if (/^[xX*]$/.test(p)) break;
      else return null;
    }
    const fields = ['major', 'minor', 'patch'];
    for (let i = 0; i < nums.length; i++) {
      if (v[fields[i]] !== nums[i]) return false;
    }
    return true;
  }

  const t = parseVersion(targetRaw);
  if (!t) return null;
  const cmp = compareVersions(version, targetRaw);
  if (cmp === null) return null;

  switch (op) {
    case '=': return cmp === 0;
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    case '^': {
      // ^0.1.0 → >=0.1.0-0 <0.2.0；^0.0.3 → >=0.0.3 <0.0.4；^1.2.3 → >=1.2.3 <2.0.0
      const upper = t.major > 0
        ? [t.major + 1, 0, 0]
        : t.minor > 0
          ? [0, t.minor + 1, 0]
          : [0, 0, t.patch + 1];
      if (cmp < 0) return false;
      return compareVersions(version, upper.join('.')) < 0;
    }
    case '~': {
      // ~0.1.0 → >=0.1.0 <0.2.0；~1.2.3 → >=1.2.3 <1.3.0
      const upper = [t.major, t.minor + 1, 0];
      if (cmp < 0) return false;
      return compareVersions(version, upper.join('.')) < 0;
    }
    default: return null;
  }
}

// 完整范围判定：支持 `||`、空格分隔的 AND 组、逗号分隔。
// 返回 true / false；范围无法解析时返回 null（官方把无效范围视为不兼容）。
function satisfies(version, range) {
  const raw = String(range == null ? '' : range).trim();
  if (!raw) return null;
  if (!parseVersion(version)) return null;
  const orGroups = raw.split('||').map((s) => s.trim()).filter(Boolean);
  let sawValid = false;
  for (const group of orGroups) {
    const parts = group.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    let all = true;
    let groupValid = parts.length > 0;
    for (const p of parts) {
      const r = satisfiesComparator(version, p);
      if (r === null) { groupValid = false; break; }
      if (!r) { all = false; break; }
    }
    if (!groupValid) continue;
    sawValid = true;
    if (all) return true;
  }
  return sawValid ? false : null;
}

// ------------------------------------------------------------
//  插件的 DSH peer 声明
// ------------------------------------------------------------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

// 从 package.json 中取出所有 DSH 相关 peer 声明：{ [peerName]: range }
function dshPeersOfManifest(manifest) {
  const peers = (manifest && manifest.peerDependencies) || {};
  const out = {};
  for (const [name, range] of Object.entries(peers)) {
    if (name === DSH_PEER_PREFIX || name.startsWith(DSH_PEER_PREFIX + '-')) {
      out[name] = String(range);
    }
  }
  return out;
}

// 读取一个已安装插件目录的兼容性信息。
// 返回 {
//   pkg, version, peers,      // 声明的 DSH peer
//   constrained,              // 是否声明了 DSH peer（未声明 = 无约束）
//   unsatisfied: [{name, range}],
//   invalidRange: bool,       // 存在无法解析的范围（官方视为不兼容）
//   compatible: true|false,
//   exempted: bool,           // 是否已有精确版本豁免
// }
function inspectPlugin(pkgDir, runtimeVersion, exemptions) {
  const manifest = readJson(path.join(pkgDir, 'package.json'), null);
  const peers = dshPeersOfManifest(manifest || {});
  const names = Object.keys(peers);
  const version = (manifest && manifest.version) || '';
  const exemptKey = manifest && manifest.name ? `${manifest.name}@${version}` : null;
  const exempted = !!(exemptKey && exemptions && Array.isArray(exemptions[exemptKey])
    && runtimeVersion && exemptions[exemptKey].includes(runtimeVersion));

  if (names.length === 0) {
    return {
      pkg: (manifest && manifest.name) || null,
      version,
      peers: {},
      constrained: false,
      unsatisfied: [],
      invalidRange: false,
      compatible: true,
      exempted: false,
    };
  }

  const unsatisfied = [];
  let invalidRange = false;
  for (const name of names) {
    const r = satisfies(runtimeVersion, peers[name]);
    if (r === null) invalidRange = true;
    else if (!r) unsatisfied.push({ name, range: peers[name] });
  }
  const compatible = !invalidRange && unsatisfied.length === 0;
  return {
    pkg: (manifest && manifest.name) || null,
    version,
    peers,
    constrained: true,
    unsatisfied,
    invalidRange,
    compatible,
    exempted,
    // 已有豁免时，官方语义为「允许加载」
    allowed: compatible || exempted,
  };
}

// 与官方一致的拒绝文案（便于日志/界面直接展示）
function incompatibilityMessage(info, runtimeVersion) {
  const key = `${info.pkg || '?'}@${info.version || '?'}`;
  const detail = info.invalidRange
    ? 'peerDependencies 中存在无法解析的版本范围（官方视为不兼容）'
    : `peerDependencies ${JSON.stringify(jsonShaped(info.unsatisfied.reduce((acc, u) => { acc[u.name] = u.range; return acc; }, {})))} 不满足`;
  return `插件 ${key} 与 dsh ${runtimeVersion || '?'} 不兼容：${detail}。`
    + '继续运行可能导致崩溃或数据丢失。请升级插件，或安装与当前 dsh 运行时兼容的版本；'
    + '如确认要承担风险，可对该「精确版本」授予例外（compatibility.json）后重启服务。';
}

function jsonShaped(v) {
  return v;
}

// ------------------------------------------------------------
//  profile 的精确版本豁免（compatibility.json）
// ------------------------------------------------------------
function compatibilityPath(profileDir) {
  return path.join(profileDir, COMPATIBILITY_FILENAME);
}

// 读取豁免表；文件缺失/损坏返回 {}（官方：损坏时不阻断启动）
function readExemptions(profileDir) {
  const file = compatibilityPath(profileDir);
  const data = readJson(file, null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string' && isExactVersion(v))) {
      out[key] = value.slice();
    }
  }
  return out;
}

// 写入/撤销豁免。返回 { ok, error, exemptions }
function writeExemption(profileDir, target, runtimeVersion, enabled) {
  const key = String(target || '').trim();
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(key)) {
    return { ok: false, error: '目标必须形如 package-name@精确版本', exemptions: readExemptions(profileDir) };
  }
  if (!isExactVersion(runtimeVersion)) {
    return { ok: false, error: '运行时版本必须是精确版本号', exemptions: readExemptions(profileDir) };
  }
  const all = readExemptions(profileDir);
  const list = Array.isArray(all[key]) ? all[key].slice() : [];
  const idx = list.indexOf(runtimeVersion);
  if (enabled && idx < 0) list.push(runtimeVersion);
  if (!enabled && idx >= 0) list.splice(idx, 1);
  if (list.length > 0) all[key] = list;
  else delete all[key];

  try {
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(compatibilityPath(profileDir), JSON.stringify(all, null, 2) + '\n', 'utf8');
    return { ok: true, error: null, exemptions: all, path: compatibilityPath(profileDir) };
  } catch (e) {
    return { ok: false, error: e.message, exemptions: all };
  }
}

module.exports = {
  COMPATIBILITY_FILENAME,
  DSH_PEER_PREFIX,
  parseVersion,
  compareVersions,
  satisfies,
  isExactVersion,
  dshPeersOfManifest,
  inspectPlugin,
  incompatibilityMessage,
  compatibilityPath,
  readExemptions,
  writeExemption,
};
