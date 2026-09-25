'use strict';

/**
 * 一键把桌面端新版本发布到自建更新服务（dsh-update-server）
 *
 * 用法（在 dsh-desktop 目录下执行）：
 *   # 先打包（生成 release/DeepSeek Harness 桌面版-Setup-<版本>.exe）
 *   npm run dist
 *
 *   # 发布到更新服务（版本取 package.json，正文取 RELEASE_NOTES.md，安装包在 release/ 自动匹配）
 *   node publish-update-server.js
 *
 *   # 常用参数
 *   node publish-update-server.js --version 1.13.1        # 显式指定版本号
 *   node publish-update-server.js --file "release/xxx.exe" # 显式指定安装包
 *   node publish-update-server.js --notes-file RELEASE_NOTES.md
 *   node publish-update-server.js --mode create           # 默认 upsert（可重跑覆盖）
 *   node publish-update-server.js --api https://your.domain  # 覆盖服务地址
 *   node publish-update-server.js --key <PUBLISH_API_KEY>    # 覆盖密钥（默认读 DSH_PUBLISH_API_KEY）
 *   node publish-update-server.js --check-from 1.0.0      # 发布后用该版本号验证更新检查能否命中
 *   node publish-update-server.js --dry-run                # 只打印将要发送的内容，不发请求
 *
 * 环境变量：
 *   DSH_UPDATE_API        更新服务地址（与桌面端 main.js 用的是同一个变量），
 *                         默认 https://api.deepseekharness.desktop.cwj666.top
 *   DSH_PUBLISH_API_KEY   发布密钥（服务端 .env 里的 PUBLISH_API_KEY）
 *
 * 说明：
 *   - 服务端接口：POST /api/publish/versions（multipart：version/releaseNotes/... + file）
 *   - 本机证书链不完整时（公司代理/自签根证书），用 `node --use-system-ca publish-update-server.js`
 *   - 仅依赖 Node 内置能力（fetch / FormData / Blob），无需安装任何依赖
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function readPkgVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

/** 在 release/ 下找当前版本的安装包（优先 .exe，排除 .blockmap / .yml）。 */
function findInstaller(version) {
  const dir = path.join(ROOT, 'release');
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir)
    .filter((f) => f.includes(version) && /\.(exe|msi|dmg|pkg|zip|7z|AppImage)$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return candidates[0] || null;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const API_BASE = String(args.api || process.env.DSH_UPDATE_API || 'https://api.deepseekharness.desktop.cwj666.top').replace(/\/+$/, '');
const API_KEY = String(args.key || process.env.DSH_PUBLISH_API_KEY || '').trim();
const VERSION = String(args.version || readPkgVersion()).trim();
const MODE = String(args.mode || 'upsert').toLowerCase();
const PLATFORM = String(args.platform || 'win32');
const ARCH = String(args.arch || 'x64');
const APP_ID = String(args.appId || 'dsh-desktop');
const CHECK_FROM = String(args['check-from'] || '0.0.0');
const DRY_RUN = !!args['dry-run'];

function die(msg) {
  console.error('\n[错误] ' + msg);
  process.exit(1);
}

async function main() {
  console.log('============================================================');
  console.log('  DeepSeek Harness 桌面版 → 更新服务发布');
  console.log('============================================================');
  console.log(`  服务地址 : ${API_BASE}`);
  console.log(`  应用标识 : ${APP_ID} (${PLATFORM}/${ARCH})`);
  console.log(`  版本号   : ${VERSION}`);
  console.log(`  发布模式 : ${MODE}${MODE === 'upsert' ? '（已存在则覆盖，可安全重跑）' : '（已存在则报 409）'}`);
  console.log();

  if (!/^\d+\.\d+\.\d+/.test(VERSION)) die(`版本号格式无效：${VERSION}（应为 x.y.z，可用 1.13.1-rc.1）`);
  if (!API_KEY && !DRY_RUN) {
    die('缺少发布密钥：请设置环境变量 DSH_PUBLISH_API_KEY（服务端 .env 的 PUBLISH_API_KEY），或用 --key 传入');
  }

  const installer = args.file ? path.resolve(ROOT, String(args.file)) : findInstaller(VERSION);
  if (!installer || !fs.existsSync(installer)) {
    die(`未找到 v${VERSION} 的安装包。请先执行 npm run dist，或用 --file 指定路径。\n`
      + `         （期望位置：${path.join(ROOT, 'release', `...-Setup-${VERSION}.exe`)}）`);
  }
  const stat = fs.statSync(installer);
  const hash = sha256File(installer);

  const notesFile = path.resolve(ROOT, String(args['notes-file'] || 'RELEASE_NOTES.md'));
  if (!fs.existsSync(notesFile)) die(`未找到更新日志文件：${notesFile}`);
  const notes = fs.readFileSync(notesFile, 'utf8').trim();
  if (!notes) die(`更新日志为空：${notesFile}`);

  console.log(`  安装包   : ${path.basename(installer)}（${(stat.size / 1024 / 1024).toFixed(1)} MB）`);
  console.log(`  SHA256   : ${hash}`);
  console.log(`  更新日志 : ${path.basename(notesFile)}（${notes.length} 字符）`);
  console.log();

  if (DRY_RUN) {
    console.log('[dry-run] 已跳过网络请求。将发送的字段：');
    console.log(`  version=${VERSION} title=${args.title || ''} releaseNotes=${notes.length} 字符`);
    console.log(`  appId=${APP_ID} platform=${PLATFORM} arch=${ARCH} mode=${MODE} isForced=${args.forced || 'false'}`);
    console.log(`  file=${path.basename(installer)}`);
    return;
  }

  // multipart 组装：version 必须排在 file 之前（服务端按 version 生成磁盘文件名）
  const form = new FormData();
  form.append('version', VERSION);
  form.append('appId', APP_ID);
  form.append('platform', PLATFORM);
  form.append('arch', ARCH);
  form.append('mode', MODE);
  form.append('releaseNotes', notes);
  if (args.title) form.append('title', String(args.title));
  if (args.forced) form.append('isForced', String(args.forced));
  if (args.minVersion) form.append('minVersion', String(args.minVersion));
  if (args['allow-downgrade']) form.append('allowDowngrade', 'true');
  form.append('file', new Blob([fs.readFileSync(installer)], { type: 'application/octet-stream' }), path.basename(installer));

  console.log('正在上传安装包并发布...（大文件上传可能需要几十秒到几分钟，请勿中断）');
  const started = Date.now();
  let res;
  try {
    res = await fetch(`${API_BASE}/api/publish/versions`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
      body: form,
    });
  } catch (e) {
    die(`请求失败：${e.message}\n`
      + '        排查：① 服务地址是否正确、服务是否在运行；② 本机证书链问题时改用 node --use-system-ca 执行；\n'
      + '        ③ Nginx client_max_body_size 是否已调大（否则会 413）。');
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* 非 JSON（多为 Nginx 错误页） */ }

  if (!res.ok || !data || data.success !== true) {
    const code = (data && data.code) || `HTTP_${res.status}`;
    const msg = (data && data.message) || text.slice(0, 300);
    console.error(`\n[失败] ${code}: ${msg}`);
    if (res.status === 413) {
      console.error('提示：413 通常是 Nginx 反向代理的 client_max_body_size 限制，请在站点配置 server{} 内加入 client_max_body_size 4096m; 后重载 Nginx。');
    }
    if (code === 'DUPLICATE') {
      console.error('提示：该版本已发布。要覆盖发布请加 --mode upsert（默认就是 upsert）。');
    }
    if (code === 'VERSION_TOO_LOW') {
      console.error('提示：版本号低于当前生效版本。确需回退请加 --allow-downgrade。');
    }
    if (code === 'UNAUTHORIZED') {
      console.error('提示：密钥错误或服务端未配置 PUBLISH_API_KEY（未配置时只能用管理端登录态调用）。');
    }
    process.exit(1);
  }

  const v = data.data.version;
  console.log(`\n[成功] 已${data.data.created ? '发布新版本' : '覆盖发布'}：${v.version} (id=${v.id}, ${(Date.now() - started) / 1000}s)`);
  console.log(`        更新日志：${(v.release_notes || '').length} 字符`);
  console.log(`        安装包  ：${v.original_name}（服务端记录 ${(v.file_size / 1024 / 1024).toFixed(1)} MB）`);
  if (v.file_hash !== hash) {
    console.log(`        [注意] 服务端记录的 SHA256 与本地不一致：\n          本地 ${hash}\n          服务端 ${v.file_hash}`);
  } else {
    console.log('        校验    ：SHA256 与服务端记录一致 ✅');
  }

  // 发布后验证：模拟客户端检查更新，确认新版本真的能被下发
  try {
    const checkUrl = `${API_BASE}/api/update/check?appId=${encodeURIComponent(APP_ID)}&version=${encodeURIComponent(CHECK_FROM)}&platform=${encodeURIComponent(PLATFORM)}&arch=${encodeURIComponent(ARCH)}`;
    const cr = await fetch(checkUrl, { headers: { 'X-API-Key': API_KEY } });
    const cj = await cr.json();
    const d = cj && cj.data;
    if (d && d.hasUpdate) {
      const hit = d.latestVersion === VERSION;
      console.log(`\n[验证] 客户端 ${CHECK_FROM} → 更新检查返回 ${d.latestVersion}（下载地址 ${d.latest.download_url}）`);
      console.log(hit
        ? '        ✅ 与本次发布版本一致，客户端可检测到更新'
        : `        [注意] 返回的是 ${d.latestVersion}（高于本次发布版本，可能你发的是补丁版本线）`);
    } else {
      console.log(`\n[验证] 客户端 ${CHECK_FROM} → 更新检查未返回更新（hasUpdate=${d ? d.hasUpdate : '?'}），请确认 isActive 与平台/架构是否匹配`);
    }
  } catch (e) {
    console.log(`\n[验证] 更新检查请求失败（不影响发布结果）：${e.message}`);
  }

  console.log('\n完成。可在管理平台「版本列表」中查看，或直接访问客户端设置页验证。');
}

main().catch((e) => {
  console.error('\n[异常]', e && e.stack ? e.stack : e);
  process.exit(1);
});
