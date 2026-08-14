'use strict';

// ============================================================
//  插件管理器（纯 Node 逻辑，无 Electron 依赖，可独立测试）
//
//  功能：在 DSH profile 中一键安装 / 卸载 / 查询插件。
//  默认推荐插件为 @feiyang666/deepseekharnessdesktop（用量与消耗插件），
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

const PLUGIN_PKG = '@feiyang666/deepseekharnessdesktop';
const PLUGIN_VAULT_PKG = '@feiyang666/deepseekharnessdesktop-vault';
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
//  包名 / 安装命令校验
// ------------------------------------------------------------
// 用户可填写 npm 包 spec（包名、@scope/包名、包名@版本、git/tarball 地址等），
// 也可以直接粘贴 `npm install <pkg>` 形式的完整命令。
// 仅允许安全字符（不含 shell 元字符），返回可安全传入 npm install 的参数数组。
const SPEC_TOKEN_RE = /^[A-Za-z0-9@._+~^:=\/#%\[\]-]+$/;

function validatePkgSpec(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: '请输入要安装的插件包名或安装命令' };
  // 剥离可选的 "npm install" / "npm i" / "npm add" 前缀
  let rest = raw.replace(/^(npm\s+(install|i|add))(\s+|$)/i, '').trim();
  if (!rest) return { ok: false, error: '未识别到包名，请填写类似 @scope/plugin-name 的内容' };
  const tokens = rest.split(/\s+/);
  if (tokens.length > 8) return { ok: false, error: '安装命令过长，只支持包名 + 少量参数' };
  for (const t of tokens) {
    if (!SPEC_TOKEN_RE.test(t)) {
      return { ok: false, error: `包含不支持的字符：${t}（仅支持包名/版本/地址，不支持 shell 命令）` };
    }
  }
  // 去掉常见误填的危险标记
  const joined = tokens.join(' ');
  if (/&&|\|\||[;<>`$]|\(|\)/.test(joined)) {
    return { ok: false, error: '不支持 shell 拼接命令，请只填写 npm 包名' };
  }
  return { ok: true, pkg: tokens[0], args: tokens };
}

// ------------------------------------------------------------
//  状态查询
// ------------------------------------------------------------
function pluginStatus(dir, pkg) {
  const name = pkg || PLUGIN_PKG;
  const manifest = readManifest(dir) || {};
  const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];
  const pkgDir = installedPkgDir(dir, name);
  let version = '';
  let bundleDeclared = false;
  if (pkgDir) {
    const p = readJson(path.join(pkgDir, 'package.json'), null);
    if (p) {
      version = p.version || '';
      bundleDeclared = !!(p.dsh && p.dsh.bundle && p.dsh.bundle.patch);
    }
  }
  const inDeps = !!(manifest.dependencies && manifest.dependencies[name]);
  return {
    pkg: name,
    profile: path.basename(dir),
    profileDir: dir,
    installed: !!pkgDir && inDeps,
    bundled: bundles.includes(name),
    version,
    bundleDeclared,
    dshHome: dshHomeDir(),
  };
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
// 移除 bundles 注册 + npm uninstall + 清理 1.0.x 手动接线遗留的
// cordis.patch.yml 里的 usage-plugin 行（升级路径兼容）。
async function uninstallPlugin(options) {
  const name = options.pkg || PLUGIN_PKG;
  const dir = profileDir(options.profile);
  const manifest = readManifest(dir);
  if (!manifest) return { ok: false, error: 'profile 不存在，无需卸载' };

  const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];
  if (bundles.includes(name)) {
    bundles.splice(bundles.indexOf(name), 1);
    writeJson(manifestPath(dir), manifest);
  }

  const env = {
    ...(options.env || process.env),
    npm_config_ignore_scripts: 'true',
  };
  const r = await runCommand(
    options.nodeExe,
    [options.npmCli, 'uninstall', name, '--no-audit', '--no-fund'],
    { cwd: dir, env },
    options.onOut
  );
  const legacyRowRemoved = removeLegacyPatchRow(patchPath(dir), name);
  if (r.code !== 0) {
    return { ok: false, error: r.error || 'npm uninstall 失败', legacyRowRemoved };
  }
  return { ok: true, pkg: name, legacyRowRemoved };
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
  PLUGIN_VAULT_PKG,
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
};
