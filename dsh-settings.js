'use strict';

// ============================================================
//  dsh 官方设置文件读写（纯 Node，无依赖）
//
//  目标文件：~/.dsh/settings.yaml（官方 user-settings 文档）
//  用途：读取 / 写入官方 `ui-theme.preference`（'light' | 'dark' | 'system'），
//        使桌面端控制面板与官方 WebUI 的主题选择双向同步。
//
//  实现原则：
//  - 不做完整 YAML 解析（官方文件可能含 flow 风格 { ... } 等复杂结构），
//    仅做「文本级精确替换」，其余内容原样保留，绝不破坏官方格式；
//  - 文件不存在 / 解析失败时静默回退，不阻塞主流程。
// ============================================================
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const THEME_PREFERENCES = ['light', 'dark', 'system'];

function dshHomeDir() {
  if (process.env.DSH_HOME && String(process.env.DSH_HOME).trim()) {
    return path.resolve(String(process.env.DSH_HOME).trim());
  }
  return path.join(os.homedir(), '.dsh');
}

function settingsYamlPath() {
  return path.join(dshHomeDir(), 'settings.yaml');
}

// 从文本中提取 ui-theme.preference 的值（'light' | 'dark' | 'system'）。
// 仅匹配顶层 `ui-theme:` 块下的 `preference: <value>` 行。
function extractThemePreference(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/);
  let inThemeBlock = false;
  for (const line of lines) {
    const m = /^(\s*)ui-theme:\s*$/.exec(line);
    if (m) { inThemeBlock = true; continue; }
    if (inThemeBlock) {
      // 下一顶层键（无缩进或缩进小于 ui-theme 所在行）即退出
      if (!m && /^\S/.test(line)) { inThemeBlock = false; continue; }
      const pm = /^(\s*)preference:\s*['"]?([a-zA-Z]+)['"]?\s*(?:#.*)?$/.exec(line);
      if (pm) {
        const val = pm[2].toLowerCase();
        if (THEME_PREFERENCES.includes(val)) return val;
      }
    }
  }
  return null;
}

// 读取官方主题偏好。文件缺失 / 异常返回 null（调用方自行决定默认值）。
function readThemePreference() {
  try {
    const text = fs.readFileSync(settingsYamlPath(), 'utf8');
    return extractThemePreference(text);
  } catch (e) {
    return null;
  }
}

// 写入官方主题偏好（'light' | 'dark' | 'system'）。
// 返回 { ok, changed, error }；文件不存在时自动创建最小结构。
function writeThemePreference(preference) {
  const value = THEME_PREFERENCES.includes(preference) ? preference : 'system';
  const file = settingsYamlPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      text = '';
    }

    const current = extractThemePreference(text);
    if (current === value) return { ok: true, changed: false, error: null };

    const lines = text.split(/\r?\n/);
    let inThemeBlock = false;
    let replaced = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = /^(\s*)ui-theme:\s*$/.exec(line);
      if (m) {
        inThemeBlock = true;
        continue;
      }
      if (inThemeBlock) {
        if (/^\S/.test(line)) inThemeBlock = false; // 遇到下一个顶层键
        else {
          const pm = /^(\s*)preference:\s*.*$/.exec(line);
          if (pm) {
            lines[i] = pm[1] + 'preference: ' + value;
            replaced = true;
            break;
          }
        }
      }
    }

    if (!replaced) {
      // 无 ui-theme 块：追加到文件末尾
      const tail = text.trimEnd();
      const sep = tail.length > 0 ? '\n' : '';
      text = tail + sep + 'ui-theme:\n  preference: ' + value + '\n';
      fs.writeFileSync(file, text, 'utf8');
      return { ok: true, changed: true, error: null };
    }

    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    return { ok: true, changed: true, error: null };
  } catch (e) {
    return { ok: false, changed: false, error: e.message };
  }
}

module.exports = {
  dshHomeDir,
  settingsYamlPath,
  extractThemePreference,
  readThemePreference,
  writeThemePreference,
  THEME_PREFERENCES,
};
