'use strict';

// ============================================================
//  dsh 官方设置读写（纯 Node，无依赖）
//
//  背景（官方 dsh 0.1.7 起）：
//    - 用户设置改由「当前 Profile 的插件配置」保存，落点是 profile 的
//      patch 文件：$DSH_HOME/profiles/<profile>/cordis.patch.yml
//      （条目形如 `- id: ui-theme` + `config.preference`；
//        官方由 @deepseek-ai/dsh-settings → config-editor 写入）。
//    - 旧的 $DSH_HOME/settings.yaml 只在启动时「导入一次」，导入后文件被
//      改名为 settings.yaml.imported。继续写它不会再生效。
//    - Home patch（$DSH_HOME/cordis.patch.yml）优先级高于 profile patch，
//      只参与读取（官方也不把它当写入目标）。
//
//  因此本模块：
//    读取：按优先级 home patch > profile patch > settings.yaml > .imported
//    写入：settings.yaml 存在时同步写它（兼容旧运行时/尚未导入的 0.1.7），
//          同时写 profile patch 的 ui-theme 条目（0.1.7+ 生效路径）。
//
//  实现原则：
//    - 不做完整 YAML 解析，只做「文本级精确编辑」，注释/其他条目/其他
//      字段（如 fontSize）原样保留，绝不破坏官方格式；
//    - 写入走「临时文件 + rename」原子替换，避免半截文件导致官方启动失败
//      （0.1.7 起 patch 文件解析失败会保留旧配置，但空文件/纯注释文件会
//        直接让 profile 启动失败）；
//    - 文件不存在 / 解析失败时静默回退，不阻塞主流程。
// ============================================================
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const THEME_PREFERENCES = ['light', 'dark', 'system'];

// 官方 ui-theme 设置命名空间 / 字段（见 @deepseek-ai/dsh-client-ui-theme）
const THEME_NAMESPACE = 'ui-theme';
const THEME_PREFERENCE_FIELD = 'preference';
const THEME_FONT_SIZE_FIELD = 'fontSize';

// 桌面端默认操作的 profile（与 plugin-manager.js 的 DEFAULT_PROFILE 一致）
const DEFAULT_PROFILE = 'web';

// 新建 profile patch 时写入的头部注释（与官方语义一致：用户 tweak 层）
const PATCH_HEADER = [
  '# user patch layer for this profile',
  '# 本文件由 dsh（以及桌面端的主题同步）读写；请勿写入空文件或只含注释的内容。',
  '',
].join('\n');

function dshHomeDir() {
  if (process.env.DSH_HOME && String(process.env.DSH_HOME).trim()) {
    return path.resolve(String(process.env.DSH_HOME).trim());
  }
  return path.join(os.homedir(), '.dsh');
}

// 旧版设置文件（<= 0.1.6 的落点；0.1.7 起被导入一次后改名）
function settingsYamlPath() {
  return path.join(dshHomeDir(), 'settings.yaml');
}

// 0.1.7 导入旧设置后留下的文件（仍可作为最后的读取来源）
function settingsImportedPath() {
  return path.join(dshHomeDir(), 'settings.yaml.imported');
}

// Home patch：优先级高于 profile patch，但官方不作为写入目标
function homePatchPath() {
  return path.join(dshHomeDir(), 'cordis.patch.yml');
}

function profileDir(profile) {
  return path.join(dshHomeDir(), 'profiles', profile || DEFAULT_PROFILE);
}

// 0.1.7 起用户设置的真正落点（profile patch）
function profilePatchPath(profile) {
  return path.join(profileDir(profile), 'cordis.patch.yml');
}

// ------------------------------------------------------------
//  通用文本工具
// ------------------------------------------------------------
function readTextOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
}

// 文件主导换行符（默认 LF，与官方 yaml 输出一致）
function dominantEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length;
  return crlf > 0 && crlf * 2 >= lf ? '\r\n' : '\n';
}

// 原子写入：先写同目录临时文件再 rename，避免半截文件
function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.dsh-desktop.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    // rename 失败（例如目标被占用）时退化为直接写入，并清理临时文件
    try { fs.writeFileSync(file, text, 'utf8'); } finally {
      try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
    }
  }
}

// ------------------------------------------------------------
//  旧格式：settings.yaml 的 ui-theme.preference
// ------------------------------------------------------------
// 从文本中提取 ui-theme.preference 的值（'light' | 'dark' | 'system'）。
// 仅匹配顶层 `ui-theme:` 块下的 `preference: <value>` 行（也兼容 flow 写法）。
function extractThemePreference(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/);
  let inThemeBlock = false;
  for (const line of lines) {
    const m = /^(\s*)ui-theme:\s*$/.exec(line);
    if (m) { inThemeBlock = true; continue; }
    // flow 写法：ui-theme: { preference: dark, fontSize: 14 }
    const flow = /^(\s*)ui-theme:\s*\{(.*)\}\s*(?:#.*)?$/.exec(line);
    if (flow) {
      const hit = new RegExp(`${THEME_PREFERENCE_FIELD}\\s*:\\s*['"]?([a-zA-Z]+)['"]?`).exec(flow[2]);
      if (hit && THEME_PREFERENCES.includes(hit[1].toLowerCase())) return hit[1].toLowerCase();
      inThemeBlock = false;
      continue;
    }
    if (inThemeBlock) {
      if (/^\S/.test(line)) { inThemeBlock = false; continue; }
      const pm = /^(\s*)preference:\s*['"]?([a-zA-Z]+)['"]?\s*(?:#.*)?$/.exec(line);
      if (pm) {
        const val = pm[2].toLowerCase();
        if (THEME_PREFERENCES.includes(val)) return val;
      }
    }
  }
  return null;
}

// 文本级写入 settings.yaml 的 ui-theme.preference（保留其余内容与注释）
function writeThemePreferenceToYaml(text, value) {
  const eol = dominantEol(text);
  const lines = text.split(/\r?\n/);
  let inThemeBlock = false;
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(\s*)ui-theme:\s*$/.test(line)) { inThemeBlock = true; continue; }
    if (inThemeBlock) {
      if (/^\S/.test(line)) { inThemeBlock = false; continue; }
      const pm = /^(\s*)preference:\s*.*$/.exec(line);
      if (pm) {
        lines[i] = pm[1] + THEME_PREFERENCE_FIELD + ': ' + value;
        replaced = true;
        break;
      }
    }
  }
  if (replaced) return lines.join(eol);
  const tail = text.replace(/\s+$/, '');
  const sep = tail.length > 0 ? eol : '';
  return tail + sep + `${THEME_NAMESPACE}:${eol}  ${THEME_PREFERENCE_FIELD}: ${value}${eol}`;
}

// ------------------------------------------------------------
//  新格式：profile patch / home patch 的 `- id: ui-theme` 条目
// ------------------------------------------------------------
// 把 patch 文本切成顶层条目（以行首 `- ` 起始）。
// 返回 [{ start, end, text }]，end 为下一条目起始行（不含）。
function splitTopLevelEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^-\s/.test(lines[i])) {
      if (current) { current.end = i; entries.push(current); }
      current = { start: i, end: lines.length, text: '' };
    }
  }
  if (current) { current.end = lines.length; entries.push(current); }
  for (const e of entries) e.text = lines.slice(e.start, e.end).join('\n');
  return { lines, entries };
}

// 匹配条目 id（兼容 `- id: x`、`- id: 'x'`、`- { id: x, ... }`）
function entryIdOf(entryText) {
  const m = /(?:^|[\s{,])id\s*:\s*['"]?([A-Za-z0-9._-]+)['"]?/.exec(entryText);
  return m ? m[1] : null;
}

// 从一个 patch 文本里读出 ui-theme 条目的 preference（找不到返回 null）
function extractPreferenceFromPatch(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const { entries } = splitTopLevelEntries(text);
  for (const e of entries) {
    if (entryIdOf(e.text) !== THEME_NAMESPACE) continue;
    const m = new RegExp(`${THEME_PREFERENCE_FIELD}\\s*:\\s*['"]?([a-zA-Z]+)['"]?`).exec(e.text);
    if (m && THEME_PREFERENCES.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  }
  return null;
}

// 读同一 entry 里已有的 fontSize，便于整体重述配置时不丢字段
function extractFontSizeFromEntry(entryText) {
  const m = new RegExp(`${THEME_FONT_SIZE_FIELD}\\s*:\\s*(\\d+)`).exec(entryText);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// 在 patch 文本里写 ui-theme 的 preference：
//   1) 已有该条目 → 精确替换 preference 叶子（保留注释与其他字段）；
//   2) 没有 → 追加一条完整条目（patch 会整体替换该行 config，故把已知的
//      fontSize 一并重述，避免字号被重置为默认值）。
function writeThemePreferenceToPatch(text, value) {
  const src = typeof text === 'string' ? text : '';
  const eol = dominantEol(src);
  const { lines, entries } = splitTopLevelEntries(src);

  for (const e of entries) {
    if (entryIdOf(e.text) !== THEME_NAMESPACE) continue;
    const block = lines.slice(e.start, e.end);
    // 条目内的 preference 叶子
    for (let i = 0; i < block.length; i++) {
      const pm = /^(\s*)preference:\s*.*$/.exec(block[i]);
      if (pm) {
        const next = lines.slice();
        next[e.start + i] = pm[1] + THEME_PREFERENCE_FIELD + ': ' + value;
        return next.join(eol);
      }
    }
    // 无 preference 叶子：flow 写法或在 config: 之后插入
    const cfgIdx = block.findIndex((l) => /^\s*config\s*:\s*(#.*)?$/.test(l));
    if (cfgIdx >= 0) {
      const indentMatch = /^(\s*)/.exec(block[cfgIdx + 1] || block[cfgIdx]);
      const indent = (indentMatch ? indentMatch[1] : '  ') + '  ';
      const next = lines.slice();
      next.splice(e.start + cfgIdx + 1, 0, `${indent}${THEME_PREFERENCE_FIELD}: ${value}`);
      return next.join(eol);
    }
    // flow 条目（- { id: ui-theme, config: { ... } }）：在 config 大括号内补字段
    const flowCfg = /\bconfig\s*:\s*\{([^}]*)\}/.exec(block[0]);
    if (flowCfg) {
      // 先摘掉可能已存在的 preference 键（避免写出重复键导致读回旧值），再追加
      const kept = flowCfg[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !new RegExp(`^${THEME_PREFERENCE_FIELD}\\s*:`).test(s));
      kept.push(`${THEME_PREFERENCE_FIELD}: ${value}`);
      const next = lines.slice();
      next[e.start] = block[0].replace(flowCfg[0], `config: { ${kept.join(', ')} }`);
      return next.join(eol);
    }
    // 兜底：整体重述该条目（保留已知 fontSize）
    const fontSize = extractFontSizeFromEntry(e.text);
    const restated = [
      `- id: ${THEME_NAMESPACE}`,
      '  config:',
      `    ${THEME_PREFERENCE_FIELD}: ${value}`,
      ...(fontSize === null ? [] : [`    ${THEME_FONT_SIZE_FIELD}: ${fontSize}`]),
    ];
    const next = lines.slice();
    next.splice(e.start, e.end - e.start, ...restated);
    return next.join(eol);
  }

  // 追加新条目（保留原有换行风格；空/纯注释文件也由此变成合法 patch）
  const rowIndent = '  ';
  const entryLines = [
    `- id: ${THEME_NAMESPACE}`,
    `${rowIndent}config:`,
    `${rowIndent}  ${THEME_PREFERENCE_FIELD}: ${value}`,
  ];
  const body = src.replace(/\s+$/, '');
  const head = body.length > 0 ? body + eol : PATCH_HEADER;
  return head + entryLines.join(eol) + eol;
}

// patch 文件是否「有可解析的顶层条目」（0.1.7 起空文件/纯注释文件会让
// profile 启动失败，所以修复类写入必须保证文件里至少有一个 `[]` 或条目）。
function patchHasEntries(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (/^\s*\[\s*\]\s*$/m.test(text)) return true;
  const { entries } = splitTopLevelEntries(text);
  return entries.length > 0;
}

// ------------------------------------------------------------
//  读取：按官方优先级解析生效的 ui-theme.preference
// ------------------------------------------------------------
// 返回 { value, source, path }；value 为 null 表示三处都没有配置。
function readThemePreferenceDetailed(profile) {
  const candidates = [
    { source: 'home-patch', file: homePatchPath(), read: extractPreferenceFromPatch },
    { source: 'profile-patch', file: profilePatchPath(profile), read: extractPreferenceFromPatch },
    { source: 'settings.yaml', file: settingsYamlPath(), read: extractThemePreference },
    { source: 'settings.yaml.imported', file: settingsImportedPath(), read: extractThemePreference },
  ];
  for (const c of candidates) {
    const text = readTextOrNull(c.file);
    if (text === null) continue;
    const value = c.read(text);
    if (value) return { value, source: c.source, path: c.file };
  }
  return { value: null, source: null, path: null };
}

// 读取官方主题偏好；三处都没有时返回 null（调用方自行决定默认值）。
function readThemePreference(profile) {
  return readThemePreferenceDetailed(profile).value;
}

// 读取官方正文字号（0.1.7 起与主题同存于 ui-theme 命名空间）；无则 null。
function readFontSizePreference(profile) {
  const patchFiles = [homePatchPath(), profilePatchPath(profile)];
  for (const file of patchFiles) {
    const text = readTextOrNull(file);
    if (text === null) continue;
    const { entries } = splitTopLevelEntries(text);
    for (const e of entries) {
      if (entryIdOf(e.text) !== THEME_NAMESPACE) continue;
      const size = extractFontSizeFromEntry(e.text);
      if (size !== null) return size;
    }
  }
  const legacy = readTextOrNull(settingsYamlPath());
  if (legacy !== null) {
    const m = new RegExp(`${THEME_FONT_SIZE_FIELD}\\s*:\\s*(\\d+)`).exec(legacy);
    if (m) return Number(m[1]);
  }
  return null;
}

// ------------------------------------------------------------
//  写入：新存储优先，旧存储同步
// ------------------------------------------------------------
// 写入官方主题偏好（'light' | 'dark' | 'system'）。
// 返回 { ok, changed, error, targets[] }：
//   - settings.yaml 存在 → 同步写它（旧运行时 / 尚未被 0.1.7 导入的窗口期）；
//   - profile 目录已存在 → 写 profile patch（0.1.7+ 生效路径），不存在则创建。
function writeThemePreference(preference, profile) {
  const value = THEME_PREFERENCES.includes(preference) ? preference : 'system';
  const targets = [];
  let changed = false;

  const legacyFile = settingsYamlPath();
  const legacyText = readTextOrNull(legacyFile);
  const profilePatch = profilePatchPath(profile);
  const profileReady = fs.existsSync(profileDir(profile)) || fs.existsSync(profilePatch);

  if (legacyText !== null) {
    const current = extractThemePreference(legacyText);
    if (current === value) {
      targets.push({ target: 'settings.yaml', path: legacyFile, changed: false });
    } else {
      try {
        writeFileAtomic(legacyFile, writeThemePreferenceToYaml(legacyText, value));
        targets.push({ target: 'settings.yaml', path: legacyFile, changed: true });
        changed = true;
      } catch (e) {
        return { ok: false, changed, error: 'settings.yaml: ' + e.message, targets };
      }
    }
  }

  // 新版落点：profile patch（profile 尚未初始化时不要抢先创建目录）
  if (profileReady || legacyText === null) {
    const patchText = readTextOrNull(profilePatch);
    if (patchText !== null || profileReady) {
      const current = patchText === null ? null : extractPreferenceFromPatch(patchText);
      if (current === value && patchText !== null) {
        targets.push({ target: 'profile-patch', path: profilePatch, changed: false });
      } else {
        try {
          const base = patchText === null ? '' : patchText;
          const next = writeThemePreferenceToPatch(base, value);
          if (!patchHasEntries(next)) {
            throw new Error('生成的 patch 不含任何条目（官方会拒绝启动）');
          }
          writeFileAtomic(profilePatch, next);
          targets.push({ target: 'profile-patch', path: profilePatch, changed: true });
          changed = true;
        } catch (e) {
          return { ok: false, changed, error: 'cordis.patch.yml: ' + e.message, targets };
        }
      }
    }
  }

  if (targets.length === 0) {
    // 两边都不存在（全新机器、profile 未初始化）：退回旧行为，创建 settings.yaml
    try {
      writeFileAtomic(legacyFile, `${THEME_NAMESPACE}:${'\n'}  ${THEME_PREFERENCE_FIELD}: ${value}\n`);
      targets.push({ target: 'settings.yaml', path: legacyFile, changed: true });
      changed = true;
    } catch (e) {
      return { ok: false, changed: false, error: e.message, targets };
    }
  }

  return { ok: true, changed, error: null, targets };
}

// 需要监听的目录（home 与 profile）：官方 WebUI 改主题时写入其中一处文件。
function watchTargets(profile) {
  return [
    { dir: dshHomeDir(), names: ['cordis.patch.yml', 'cordis.yml', 'settings.yaml', 'settings.yml', 'settings.yaml.imported'] },
    { dir: profileDir(profile), names: ['cordis.patch.yml', 'cordis.yml'] },
  ];
}

module.exports = {
  dshHomeDir,
  settingsYamlPath,
  settingsImportedPath,
  homePatchPath,
  profileDir,
  profilePatchPath,
  // 主题
  extractThemePreference,
  readThemePreference,
  readThemePreferenceDetailed,
  readFontSizePreference,
  writeThemePreference,
  // patch 工具（供设置页/诊断/修复流程复用）
  extractPreferenceFromPatch,
  writeThemePreferenceToPatch,
  patchHasEntries,
  splitTopLevelEntries,
  entryIdOf,
  watchTargets,
  THEME_PREFERENCES,
  THEME_NAMESPACE,
  THEME_PREFERENCE_FIELD,
  THEME_FONT_SIZE_FIELD,
};
