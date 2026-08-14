'use strict';

/**
 * 打包脚本（交互式）
 * 用法：node pack.js
 *  - 输入新版本号（回车默认递增 patch 版本）
 *  - 输入本次更新日志（多行，空行结束；可直接回车跳过）
 *  - 自动更新 package.json 的 version 与 CHANGELOG.md
 *  - 调用 electron-builder 生成 Windows 安装包
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const APP_DIR = __dirname;
const PKG_PATH = path.join(APP_DIR, 'package.json');
const CHANGELOG_PATH = path.join(APP_DIR, 'CHANGELOG.md');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// 自己维护输入行队列，兼容交互式终端与管道/重定向输入
const _lineQueue = [];
const _waiters = [];
rl.on('line', (line) => {
  if (_waiters.length > 0) _waiters.shift()(line);
  else _lineQueue.push(line);
});
rl.on('close', () => {
  // 输入流结束：唤醒所有等待者，返回空行避免挂死
  while (_waiters.length > 0) _waiters.shift()('');
});

function readLine() {
  return new Promise((resolve) => {
    if (_lineQueue.length > 0) {
      const line = _lineQueue.shift();
      process.nextTick(() => resolve(line));
      return;
    }
    _waiters.push(resolve);
  });
}

function ask(question) {
  process.stdout.write(question);
  return readLine().then((answer) => answer.trim());
}

// 多行输入：逐行读取，空行结束
async function askMultiline(question) {
  const lines = [];
  console.log(question);
  for (;;) {
    process.stdout.write('> ');
    const line = await readLine();
    if (line.trim() === '') break;
    lines.push(line.trim());
  }
  return lines;
}

function nextPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version || '');
  if (!m) return '1.0.1';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function dateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function updatePackageJson(newVersion) {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const old = pkg.version;
  pkg.version = newVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return { old, next: newVersion };
}

function updateChangelog(newVersion, lines) {
  const date = dateStr();
  const entryLines = [`## v${newVersion} (${date})`, ''];
  if (lines && lines.length > 0) {
    entryLines.push(...lines.map((l) => `- ${l}`));
  } else {
    entryLines.push('- 常规更新与修复');
  }
  const entry = entryLines.join('\n');

  let content = '';
  if (fs.existsSync(CHANGELOG_PATH)) {
    content = fs.readFileSync(CHANGELOG_PATH, 'utf8').trim();
  } else {
    content = '# DeepSeek Harness 桌面版 - 更新日志';
  }

  // 找到第一个版本条目（## v...），新条目插到它前面（保持最新在上）
  const idx = content.indexOf('\n## v');
  let result;
  if (idx >= 0) {
    const head = content.slice(0, idx).trimEnd();
    const rest = content.slice(idx).trimStart();
    result = head + '\n\n' + entry + '\n\n' + rest;
  } else {
    result = content.trimEnd() + '\n\n' + entry;
  }
  fs.writeFileSync(CHANGELOG_PATH, result + '\n', 'utf8');
}

async function main() {
  console.log('============================================================');
  console.log('  DeepSeek Harness 桌面版 - 打包');
  console.log('============================================================');
  console.log();

  if (!fs.existsSync(PKG_PATH)) {
    console.error('[错误] 未找到 package.json，请确认在 dsh-desktop 目录下运行。');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const current = pkg.version || '1.0.0';
  const suggested = nextPatch(current);

  console.log(`当前版本: v${current}`);
  const versionInput = await ask(`请输入新版本号（回车使用 ${suggested}）: `);
  const newVersion = versionInput || suggested;
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error(`[错误] 版本号格式无效: ${newVersion}（应为 x.y.z）`);
    rl.close();
    process.exit(1);
  }
  console.log();

  const lines = await askMultiline('请输入本次更新日志（多行，每行一条；输入空行结束，可直接回车跳过）:');
  console.log();

  // 更新文件
  const { old } = updatePackageJson(newVersion);
  updateChangelog(newVersion, lines);
  console.log(`[OK] 版本已更新: v${old} -> v${newVersion}`);
  console.log(`[OK] 更新日志已写入 CHANGELOG.md`);

  const skip = await ask('是否立即开始打包？(y/n，默认 y): ');
  rl.close();
  if (skip && skip.toLowerCase() === 'n') {
    console.log('已跳过打包，仅更新了版本号与日志。');
    process.exit(0);
  }
  console.log();

  // 清理上一次打包的残留（防止 rcedit 因文件占用/只读而无法写入 exe）
  const releaseDir = path.join(APP_DIR, 'release');
  if (fs.existsSync(releaseDir)) {
    console.log('正在清理上次打包的残留目录 release/ ...');
    const psClean = `Remove-Item -LiteralPath '${releaseDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`;
    spawnSync('powershell.exe', ['-NoProfile', '-Command', psClean], { windowsHide: true });
    if (fs.existsSync(releaseDir)) {
      console.log('[警告] release/ 目录清理不完整，可能有进程占用。请关闭杀毒软件实时防护后重试。');
    } else {
      console.log('[OK] release/ 已清理。');
    }
  }

  console.log('开始打包（electron-builder --win）...');
  console.log('首次打包会下载 electron 与 NSIS 组件，请耐心等待。');
  console.log();
  const r = spawnSync('npm', ['run', 'dist'], {
    cwd: APP_DIR,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    console.error('\n[错误] 打包失败，请查看上方错误信息。');
    console.error('\n[提示] 若报错包含 "Unable to commit changes" 或 "EPERM"，');
    console.error('       多为杀毒软件/实时防护锁定 exe 文件导致。');
    console.error('       请先关闭杀毒软件实时防护（或为本目录添加信任区），再重新打包。');
    process.exit(r.status || 1);
  }

  console.log('\n============================================================');
  console.log('  打包完成！安装包位于 release/ 目录。');
  console.log(`  版本: v${newVersion}`);
  console.log('============================================================');
}

main().catch((e) => {
  console.error('[错误]', e);
  rl.close();
  process.exit(1);
});
