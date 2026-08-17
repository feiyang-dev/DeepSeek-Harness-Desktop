'use strict';

// ============================================================
//  插件管理器（纯 Node 逻辑，无 Electron 依赖，可独立测试）
//
//  功能：在 DSH profile 中一键安装 / 卸载 / 查询插件。
//  默认推荐插件为 @feiyang666/dsh-usage-plugin（用量与消耗插件，新包名；
//  旧包名 @feiyang666/deepseekharnessdesktop 已停止维护），
//  同时支持用户自定义包名 / 安装命令（npm 包 spec）。
//
//  安装逻辑与官方 `dsh plugin --profile <name> add <pkg>` 等价，但不依赖
//  pnpm 与 dsh CLI：用 npm 把包装进 profile 目录的 node_modules，再把包名
//  写入 profile 的 package.json -> dsh.profile.bundles（官方 bundle 机制，
//  插件包内的 cordis.patch.yml 会在 dsh 启动时自动挂载插件行）。
// ============================================================
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用量与消耗插件：新包名（推荐安装用）
const PLUGIN_PKG = '@feiyang666/dsh-usage-plugin';
// 用量与消耗插件：旧包名（@feiyang666/deepseekharnessdesktop，已停止维护，
// 仅用于兼容识别旧安装，避免「装了旧包还显示未装」）
const PLUGIN_PKG_LEGACY = '@feiyang666/deepseekharnessdesktop';
// 数据保险箱：新包名（推荐安装用）
const PLUGIN_VAULT_PKG = '@feiyang666/dsh-vault';
// 数据保险箱：旧包名（@feiyang666/deepseekharnessdesktop-vault，已停止维护，
// 仅用于兼容识别旧安装）
const PLUGIN_VAULT_PKG_LEGACY = '@feiyang666/deepseekharnessdesktop-vault';
const PLUGIN_VAULT_PKGS = [PLUGIN_VAULT_PKG, PLUGIN_VAULT_PKG_LEGACY];
// 全部推荐插件包名（新名 + 旧名），用于识别「已安装（含旧包名安装）」
const PLUGIN_PKGS = [PLUGIN_PKG, PLUGIN_PKG_LEGACY, PLUGIN_VAULT_PKG, PLUGIN_VAULT_PKG_LEGACY];
const DEFAULT_PROFILE = 'web';

// 推荐插件列表（桌面端「插件管理」页推荐区域展示）
const RECOMMENDED_PLUGINS = [
  {
    pkg: PLUGIN_PKG,
    title: '用量与消耗插件',
    desc: '用量统计 / 余额查询 / 导出报表',
  },
  {
    pkg: PLUGIN_VAULT_PKG,
    title: '数据保险箱',
    desc: '自动备份 / 清空检测 / 一键恢复，保护聊天记录与工作区数据',
  },
];

// profile 模板自带的基础依赖（不属于用户安装的插件，列表展示时跳过）
const BASE_PKGS = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];

// dsh web 官方 profile 模板（仅在 profile 首次创建时使用，与 dsh 初始化一致）
const PROFILE_TEMPLATES = {
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
};

// ------------------------------------------------------------
//  路径 / 文件工具
// ------------------------------------------------------------
function dshHomeDir() {
  if (process.env.DSH_HOME && String(process.env.DSH_HOME).trim()) {
    return path.resolve(String(process.env.DSH_HOME).trim());
  }
  return path.join(os.homedir(), '.dsh');
}

function profileDir(profile) {
  return path.join(dshHomeDir(), 'profiles', profile || DEFAULT_PROFILE);
}

function manifestPath(dir) {
  return path.join(dir, 'package.json');
}

function patchPath(dir) {
  return path.join(dir, 'cordis.patch.yml');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function readManifest(dir) {
  return readJson(manifestPath(dir), null);
}

function installedPkgDir(dir, pkg) {
  const p = path.join(dir, 'node_modules', ...String(pkg).split('/'));
  return fs.existsSync(path.join(p, 'package.json')) ? p : null;
}

// 确保 profile 目录存在且结构合法（与 dsh initProfile 等价）：
// package.json（首次创建时按 profile 模板写入 bundles）+ cordis.patch.yml
function ensureProfile(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let manifest = readManifest(dir);
  const profileName = path.basename(dir);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    manifest = {
      name: `dsh-profile-${profileName}`,
      private: true,
      dependencies: {},
      dsh: {
        profile: {
          bundles: [...(PROFILE_TEMPLATES[profileName] || [])],
        },
      },
    };
    writeJson(manifestPath(dir), manifest);
  }
  // 规范化缺失字段（保留已有内容）
  if (!manifest.dependencies || typeof manifest.dependencies !== 'object') manifest.dependencies = {};
  if (!manifest.dsh || typeof manifest.dsh !== 'object') manifest.dsh = {};
  if (!manifest.dsh.profile || typeof manifest.dsh.profile !== 'object') manifest.dsh.profile = {};
  if (!Array.isArray(manifest.dsh.profile.bundles)) manifest.dsh.profile.bundles = [];
  writeJson(manifestPath(dir), manifest);
  if (!fs.existsSync(patchPath(dir))) {
    fs.writeFileSync(patchPath(dir), '# user patch layer for this profile\n[]\n', 'utf8');
  }
  return manifest;
}

// ------------------------------------------------------------
//  包名 / 安装命令解析
// ------------------------------------------------------------
// 不做限制：用户给什么命令就安装什么。支持：
//   - 纯包名：@scope/plugin-name、plugin-name@1.2.3、git/tarball 地址等
//   - npm 命令：npm install <pkg> / npm i <pkg> / npm add <pkg>
//   - npx 命令：npx @deepseek-ai/dsh plugin --profile web add <pkg>
//   - node / pnpm 等任意命令
// 返回统一结构：
//   { ok: true, type: 'pkg', pkg }                 -> 走标准安装（带镜像切换 + bundles 注册）
//   { ok: true, type: 'command', command, tokens } -> 原样执行用户命令（spawn 数组参数，不经 shell）
//   { ok: false, error }                           -> 非法输入
function validatePkgSpec(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: '请输入要安装的插件包名或安装命令' };
  // 按空白拆分为命令 token（数组参数传给 spawn，不经 shell，无注入风险）
  const tokens = raw.split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';

  // 以 npx / npm / node / pnpm 开头 → 原样执行用户命令
  if (/^(npx|npm|node|pnpm)$/i.test(first)) {
    const cmd = first.toLowerCase();
    // `npm install <pkg>` / `npm i <pkg>` / `npm add <pkg>` 且剩余为单个包 spec：
    // 剥离前缀走标准安装（享受镜像自动切换），其余一律原样执行
    if (cmd === 'npm' || cmd === 'pnpm') {
      const sub = (tokens[1] || '').toLowerCase();
      const rest = tokens.slice(2);
      if ((sub === 'install' || sub === 'i' || sub === 'add') && rest.length >= 1 && !rest[0].startsWith('-')) {
        if (rest.length === 1) {
          return { ok: true, type: 'pkg', pkg: rest[0] };
        }
        // 带额外参数（如 --save-dev）：原样执行
      }
    }
    return { ok: true, type: 'command', command: raw, tokens };
  }

  // 其他可执行命令（git 地址、脚本等）：原样执行
  if (/\s/.test(raw)) {
    return { ok: true, type: 'command', command: raw, tokens };
  }

  // 纯包名 / 包 spec（单 token）
  return { ok: true, type: 'pkg', pkg: tokens[0] };
}

// ------------------------------------------------------------
//  状态查询
// ------------------------------------------------------------
// 别名感知：查询某包时，若其「旧名别名」已安装（如数据保险箱
// @feiyang666/deepseekharnessdesktop-vault -> @feiyang666/dsh-vault），
// 状态仍判为已安装，并返回 legacyAlias 供前端提示「可迁移到新包名」。
function pluginStatus(dir, pkg) {
  const name = pkg || PLUGIN_PKG;
  const manifest = readManifest(dir) || {};
  const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];

  // 新包名查询，若新包未装但旧名已装 → 用旧名状态兜底（识别为已安装）
  let effectiveName = name;
  if (!installedPkgDir(dir, name) && !(manifest.dependencies && manifest.dependencies[name])) {
    const legacy = legacyAliasFor(name);
    if (legacy && installedPkgDir(dir, legacy)) effectiveName = legacy;
  }

  const pkgDir = installedPkgDir(dir, effectiveName);
  let version = '';
  let bundleDeclared = false;
  if (pkgDir) {
    const p = readJson(path.join(pkgDir, 'package.json'), null);
    if (p) {
      version = p.version || '';
      bundleDeclared = !!(p.dsh && p.dsh.bundle && p.dsh.bundle.patch);
    }
  }
  const inDeps = !!(manifest.dependencies && manifest.dependencies[effectiveName]);
  return {
    pkg: name,
    installedPkg: effectiveName, // 实际命中的包名（可能为旧名）
    legacyInstalled: effectiveName !== name,
    profile: path.basename(dir),
    profileDir: dir,
    installed: !!pkgDir && inDeps,
    bundled: bundles.includes(effectiveName),
    version,
    bundleDeclared,
    dshHome: dshHomeDir(),
  };
}

// 查询某包对应的旧名/新名别名（双向）：
//   - 用量插件：@feiyang666/deepseekharnessdesktop <-> @feiyang666/dsh-usage-plugin
//   - 数据保险箱：@feiyang666/deepseekharnessdesktop-vault <-> @feiyang666/dsh-vault
function legacyAliasFor(name) {
  if (name === PLUGIN_PKG) return PLUGIN_PKG_LEGACY;
  if (name === PLUGIN_PKG_LEGACY) return PLUGIN_PKG;
  if (name === PLUGIN_VAULT_PKG) return PLUGIN_VAULT_PKG_LEGACY;
  if (name === PLUGIN_VAULT_PKG_LEGACY) return PLUGIN_VAULT_PKG;
  return null;
}

// 列出 profile 中用户安装的插件（含依赖中声明且在 node_modules 中有实体的包）
function listInstalledPlugins(dir) {
  const manifest = readManifest(dir) || {};
  const deps = (manifest.dependencies && typeof manifest.dependencies === 'object') ? manifest.dependencies : {};
  const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];
  const names = new Set([...Object.keys(deps), ...bundles]);
  const list = [];
  for (const name of names) {
    if (BASE_PKGS.includes(name)) continue;
    const pkgDir = installedPkgDir(dir, name);
    if (!pkgDir) continue; // 只展示真正装上了的
    const p = readJson(path.join(pkgDir, 'package.json'), null);
    list.push({
      pkg: name,
      version: (p && p.version) || '',
      installed: !!deps[name],
      bundled: bundles.includes(name),
      bundleDeclared: !!(p && p.dsh && p.dsh.bundle && p.dsh.bundle.patch),
    });
  }
  list.sort((a, b) => a.pkg.localeCompare(b.pkg));
  return list;
}

// ------------------------------------------------------------
//  子进程执行
// ------------------------------------------------------------
function runCommand(exe, args, opts, onOut) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(opts || {}),
      });
    } catch (e) {
      return resolve({ code: -1, out: '', error: e.message });
    }
    let out = '';
    const onData = (d) => {
      const s = String(d);
      out += s;
      if (onOut) onOut(s);
    };
    child.stdout && child.stdout.on('data', onData);
    child.stderr && child.stderr.on('data', onData);
    child.on('error', (err) => resolve({ code: -1, out, error: err.message }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

// ------------------------------------------------------------
//  已知插件兼容性补丁
// ------------------------------------------------------------
// dsh-vault（@feiyang666/deepseekharnessdesktop-vault）在注册 backup_vault 工具时，
// 在字段类型上误用 `required: true`（违反 JSON Schema 规范），导致 dsh 运行时打印：
//   [dsh-vault] backup_vault 工具注册失败（不影响备份/恢复）:
//     unsupported JSON schema: schema.properties.ok.required is not supported on type "boolean"
// 这里在安装 / 升级插件后自动把 required 从字段内部挪到 schema 顶层，消除该报警。
// 全程基于精确短串匹配：命中旧写法才替换，已是新写法 / 结构变化时安全跳过，不报错。
function applyVaultSchemaPatch(pkgDir) {
  if (!pkgDir) return false;
  const indexFile = path.join(pkgDir, 'lib', 'index.js');
  if (!fs.existsSync(indexFile)) return false;
  let text;
  try {
    text = fs.readFileSync(indexFile, 'utf8');
  } catch (e) {
    return false;
  }
  let next = text;

  // 1) 字段上的 required:true 逐处移除
  //    action 输入字段：`action: { type: 'string', required: true, ...`
  next = next.replace(
    /(action:\s*\{\s*type:\s*'string',\s*)\brequired:\s*true,\s*/,
    '$1'
  );
  //    ok 输出字段：`ok: { type: 'boolean', required: true },` → `ok: { type: 'boolean' },`
  next = next.replace(
    /(ok:\s*\{\s*type:\s*'boolean')(\s*,\s*required:\s*true)(\s*\})/,
    '$1$3'
  );

  // 2) 顶层 required 数组：锚定到各自的 properties 内容，区分 input / output
  //    input：properties 下第一个字段是 action
  if (!next.includes("required: ['action']")) {
    next = next.replace(
      /(additionalProperties:\s*false,[\r\n]+)(\s*)(properties:\s*\{\s*action)/,
      (m, g1, sp, g3) => g1 + sp + "required: ['action'],\n" + sp + g3
    );
  }
  //    output：properties 下第一个字段是 ok
  if (!next.includes("required: ['ok']")) {
    next = next.replace(
      /(additionalProperties:\s*false,[\r\n]+)(\s*)(properties:\s*\{\s*ok)/,
      (m, g1, sp, g3) => g1 + sp + "required: ['ok'],\n" + sp + g3
    );
  }

  if (next === text) return false; // 无任何改动（已是新写法或不含该 bug）
  fs.writeFileSync(indexFile, next, 'utf8');
  return true;
}

// ------------------------------------------------------------
//  安装
// ------------------------------------------------------------
// options: { nodeExe, npmCli, registry, profile, pkg, onOut, env }
// 与 `dsh plugin --profile <name> add <pkg>` 等价：
//   1) npm install <pkg>（cwd = profile 目录，使用已选镜像）
//   2) 包声明 dsh.bundle.patch 时，把包名写入 dsh.profile.bundles
async function installPlugin(options) {
  const name = options.pkg || PLUGIN_PKG;
  const dir = profileDir(options.profile);
  ensureProfile(dir);

  // 旧包名自动迁移：安装新包名时，若旧名别名已安装（如数据保险箱
  // @feiyang666/deepseekharnessdesktop-vault -> @feiyang666/dsh-vault），
  // 先卸载旧包，避免新旧包并存导致功能重复/冲突。
  const legacy = legacyAliasFor(name);
  if (legacy) {
    const legacyManifest = readManifest(dir);
    const legacyPkgDir = installedPkgDir(dir, legacy);
    const legacyInDeps = !!(legacyManifest && legacyManifest.dependencies && legacyManifest.dependencies[legacy]);
    if (legacyPkgDir && legacyInDeps) {
      if (options.onOut) options.onOut(`检测到旧包名 ${legacy}，先卸载旧包再安装新包名...`);
      await uninstallPlugin({ nodeExe: options.nodeExe, npmCli: options.npmCli, registry: options.registry, pkg: legacy, onOut: options.onOut });
    }
  }

  const env = {
    ...(options.env || process.env),
    npm_config_ignore_scripts: 'true', // 跳过 koffi 等源码编译
    npm_config_progress: 'true',
  };
  const args = ['install', name, '--registry', options.registry, '--no-audit', '--no-fund'];
  const r = await runCommand(options.nodeExe, [options.npmCli, ...args], { cwd: dir, env }, options.onOut);
  if (r.code !== 0) {
    return { ok: false, error: r.error || 'npm install 失败', out: r.out };
  }

  // 注册 bundle 层
  const manifest = ensureProfile(dir);
  const pkgDir = installedPkgDir(dir, name);
  let version = '';
  let bundleDeclared = false;
  if (pkgDir) {
    const pkg = readJson(path.join(pkgDir, 'package.json'), null);
    if (pkg) {
      version = pkg.version || '';
      bundleDeclared = !!(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch);
    }
  }
  if (bundleDeclared && !manifest.dsh.profile.bundles.includes(name)) {
    manifest.dsh.profile.bundles.push(name);
    writeJson(manifestPath(dir), manifest);
  }
  // 已知插件兼容性补丁（dsh-vault schema 修正）：匹配到旧写法时替换，消除工具注册报警
  if (PLUGIN_VAULT_PKGS.includes(name)) {
    applyVaultSchemaPatch(pkgDir);
  }
  return {
    ok: true,
    pkg: name,
    installed: !!pkgDir,
    bundled: manifest.dsh.profile.bundles.includes(name),
    version,
    bundleDeclared,
  };
}

// ------------------------------------------------------------
//  卸载
// ------------------------------------------------------------
// 移除 bundles 注册 + 清理 package.json / package-lock.json / node_modules /
// cordis.patch.yml 中的插件痕迹（含 1.0.x 手动接线遗留的 usage-plugin 行）。
//
// 性能 / 健壮性说明（历史踩坑）：
//  - profile 的 node_modules 可能是 pnpm 布局（nodeLinker: hoisted，带 .pnpm
//    虚拟目录），npm uninstall 对这类目录清理不可靠，常出现实体目录残留，
//    导致「卸载了但列表里还有 / 反复卸载不干净」。
//  - npm uninstall 在没有 registry / manifest 与 lockfile 不同步时会重建整个
//    依赖树并访问默认 registry，表现为"卡住很久才完成"。而这里把该包从
//    manifest 与 lockfile 中剥离、再直接删除实体目录，全程纯本地操作，秒级完成，
//    因此不依赖 npm 子进程，只在目录删除失败（如被占用）时以 --offline 快速兜底。
async function uninstallPlugin(options) {
  const name = options.pkg || PLUGIN_PKG;
  const dir = profileDir(options.profile);
  const manifest = readManifest(dir);
  if (!manifest) return { ok: false, error: 'profile 不存在，无需卸载' };

  // 卸载目标集合：请求的包名 + 其旧名/新名别名（若已安装）。
  // 关键：推荐卡片的包名可能是「新包名」，但用户实际装的是「旧包名」，
  // 若只卸载新包名会"假卸载"（新包不存在但返回 ok）。这里把所有
  // 已安装的关联包名一并清理，保证真正卸载干净。
  const targets = [name];
  const alias = legacyAliasFor(name);
  if (alias) {
    const aliasManifest = readManifest(dir);
    const aliasPkgDir = installedPkgDir(dir, alias);
    const aliasInDeps = !!(aliasManifest && aliasManifest.dependencies && aliasManifest.dependencies[alias]);
    if (aliasPkgDir || aliasInDeps) targets.push(alias);
  }

  const results = { removedDirs: [], legacyRowRemoved: 0, lockCleaned: 0 };
  let anyError = null;

  for (const target of targets) {
    // 1) 移除 bundles 注册
    const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];
    if (bundles.includes(target)) {
      bundles.splice(bundles.indexOf(target), 1);
      writeJson(manifestPath(dir), manifest);
    }

    // 2) 移除 manifest dependencies 中的声明（若存在）
    if (manifest.dependencies && manifest.dependencies[target]) {
      delete manifest.dependencies[target];
      writeJson(manifestPath(dir), manifest);
    }

    // 3) 剥离 package-lock.json 中该包的引用（避免与 manifest 不同步引发 npm 卡顿）
    results.lockCleaned += scrubLockfile(dir, target) ? 1 : 0;

    // 4) 清理 cordis.patch.yml 中手动接线遗留的插件行
    results.legacyRowRemoved += removeLegacyPatchRow(patchPath(dir), target) ? 1 : 0;

    // 5) 直接删除实体目录（顶层 node_modules/<pkg> 与 .pnpm 虚拟目录）
    results.removedDirs.push(...removeResidualNodeModules(dir, target));
  }

  // 6) 兜底：实体目录仍残留（可能被占用），用 npm uninstall --offline 再试
  const stillThere = targets.some((t) =>
    fs.existsSync(path.join(dir, 'node_modules', ...String(t).split('/')))
  );
  let npmFallback = null;
  if (stillThere && options.nodeExe && options.npmCli) {
    const env = {
      ...(options.env || process.env),
      npm_config_ignore_scripts: 'true',
    };
    for (const target of targets) {
      const args = ['uninstall', target, '--no-audit', '--no-fund', '--offline', '--prefer-offline'];
      if (options.registry) args.push('--registry', options.registry);
      npmFallback = await runCommand(
        options.nodeExe,
        [options.npmCli, ...args],
        { cwd: dir, env },
        options.onOut
      );
      if (npmFallback && npmFallback.code !== 0) anyError = npmFallback.error || 'npm uninstall 失败';
      results.removedDirs.push(...removeResidualNodeModules(dir, target));
    }
  }

  const finalStillThere = targets.some((t) =>
    fs.existsSync(path.join(dir, 'node_modules', ...String(t).split('/')))
  );
  return {
    ok: !finalStillThere,
    pkg: name,
    uninstalledPkgs: targets,
    legacyRowRemoved: results.legacyRowRemoved,
    lockCleaned: results.lockCleaned,
    removedDirs: results.removedDirs,
    npmFallbackUsed: !!npmFallback,
    error: anyError || (finalStillThere ? '插件目录可能被占用，删除失败' : null),
  };
}

// 从 package-lock.json 中移除对指定包名的引用（顶层 deps + packages 记录）。
// 当 profile 的 manifest 与 lockfile 不同步（历史卸载残留 / 手动改过 package.json）
// 时，npm uninstall 会被不一致状态卡住，这里提前剥离该包引用让其恢复正常。
function scrubLockfile(dir, pkgName) {
  const lockPath = path.join(dir, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return false;
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (e) {
    return false;
  }
  let changed = false;
  if (lock.packages && typeof lock.packages === 'object') {
    // 顶层 "" 的 dependencies/devDependencies 里剥离该包
    const root = lock.packages[''];
    if (root && typeof root === 'object') {
      for (const key of ['dependencies', 'devDependencies']) {
        if (root[key] && root[key][pkgName]) {
          delete root[key][pkgName];
          changed = true;
        }
      }
    }
    // 移除该包自身的记录（含 scoped 路径 node_modules/@scope/pkg）
    const rel = 'node_modules/' + String(pkgName);
    const keys = Object.keys(lock.packages).filter((k) => k === rel || k === '.' + rel);
    for (const k of keys) {
      delete lock.packages[k];
      changed = true;
    }
  }
  if (changed) {
    try {
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
    } catch (e) {
      return false;
    }
  }
  return changed;
}

// 手动删除 profile 中残留的插件实体目录（npm 对 pnpm hoisted 布局清理不彻底）。
// 覆盖：node_modules/<pkg>（含 scoped）与 node_modules/.pnpm/<pkg>@<version>。
// 返回删除成功的目录列表；目录不存在则跳过，不报错。
function removeResidualNodeModules(dir, pkgName) {
  const removed = [];
  const nm = path.join(dir, 'node_modules');

  // 1) 顶层包目录：node_modules/<pkg> 或 node_modules/@scope/<name>
  const top = path.join(nm, ...String(pkgName).split('/'));
  if (fs.existsSync(top)) {
    try {
      fs.rmSync(top, { recursive: true, force: true });
      removed.push(top);
    } catch (e) { /* 忽略权限/占用错误 */ }
  }

  // 2) pnpm 虚拟目录：node_modules/.pnpm/<pkg>@<version> 与 <pkg>@<version>_...
  const pnpmDir = path.join(nm, '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    const base = String(pkgName).replace('/', '+'); // scoped 包在 .pnpm 中形如 @scope+name
    try {
      const entries = fs.readdirSync(pnpmDir);
      for (const e of entries) {
        if (e.startsWith(base + '@')) {
          const full = path.join(pnpmDir, e);
          try {
            fs.rmSync(full, { recursive: true, force: true });
            removed.push(full);
          } catch (err) { /* 忽略 */ }
        }
      }
    } catch (e) { /* 忽略 */ }
  }

  return removed;
}

// 从 cordis.patch.yml 中移除含指定插件 name 的顶层 "- insert:" 块
// （1.0.x 手动接线时代会往 profile 的 cordis.patch.yml 写这个块）。
// 逐行解析：顶层 `- insert:` 起始，收集到下一个顶层条目为止。
function removeLegacyPatchRow(cordisPath, pkgName) {
  const name = pkgName || PLUGIN_PKG;
  let text;
  try {
    text = fs.readFileSync(cordisPath, 'utf8');
  } catch (e) {
    return false;
  }
  const lines = text.split(/\r?\n/);
  const out = [];
  let changed = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*- insert:\s*$/.test(line)) {
      const block = [line];
      let j = i + 1;
      while (j < lines.length && !/^-\s/.test(lines[j])) {
        block.push(lines[j]);
        j++;
      }
      const blockText = block.join('\n');
      if (blockText.includes(`name: '${name}'`) || blockText.includes(`name: "${name}"`)) {
        changed = true;
      } else {
        out.push(...block);
      }
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  if (changed) {
    let result = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (result.length > 0) result += '\n';
    fs.writeFileSync(cordisPath, result, 'utf8');
  }
  return changed;
}

module.exports = {
  PLUGIN_PKG,
  PLUGIN_PKG_LEGACY,
  PLUGIN_VAULT_PKG,
  PLUGIN_VAULT_PKG_LEGACY,
  PLUGIN_VAULT_PKGS,
  PLUGIN_PKGS,
  legacyAliasFor,
  DEFAULT_PROFILE,
  BASE_PKGS,
  RECOMMENDED_PLUGINS,
  dshHomeDir,
  profileDir,
  pluginStatus,
  listInstalledPlugins,
  ensureProfile,
  installPlugin,
  uninstallPlugin,
  validatePkgSpec,
  removeLegacyPatchRow,
  applyVaultSchemaPatch,
};
