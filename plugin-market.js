'use strict';

// ============================================================
//  插件市场（纯 Node 逻辑，无 Electron 依赖，可独立测试）
//
//  功能：扫描 GitHub 上带 topic "dsh-plugin" 的公开仓库，
//  提取元数据（名称 / 描述 / 作者 / star / 语言 / 默认分支 /
//  npm 包名 / 图标 / 是否官方推荐等），供桌面端「插件市场」页展示，
//  并支持一键安装（交给 plugin-manager 安装）。
//
//  命名约定（dsh 官方推荐的插件打包规则）：
//  - repo 的 package.json.name 即 npm 包名（用于 `dsh plugin add`）；
//  - package.json.dsh.bundle.patch 存在时，插件会被注册为 bundle；
//  - 描述优先取 GitHub 仓库 description，其次 package.json.description；
//  - 安装提示（README 顶部被 <!-- dsh-install --> 包裹的内容）可选。
// ============================================================
const https = require('node:https');

const TOPIC = 'dsh-plugin';
const GITHUB_API = 'https://api.github.com';
const UA = 'dsh-desktop-plugin-market/1.0';

// GitHub 搜索接口的 Accept 头（推荐项）：比默认更友好，含 topics/description
const SEARCH_ACCEPT = 'application/vnd.github+json';

// 默认排序：按 star 数
const DEFAULT_SORT = 'stars';
const DEFAULT_ORDER = 'desc';
const PER_PAGE = 30;

// 官方推荐仓库（在全名列表里优先置顶展示，并打上「官方」标签）
const OFFICIAL_REPOS = [
  'feiyang-dev/dsh-usage-plugin',
  'feiyang-dev/dsh-vault',
];

// 已知的插件图标映射（按 npm 包名）。缺失时用主角 emoji / 首字母占位。
const KNOWN_ICONS = {
  'usage-plugin': '📊',
  'vault': '🔒',
  'backup': '🗄️',
  'theme': '🎨',
  'translate': '🌐',
  'translate-plugin': '🌐',
  'web-search': '🔎',
  'search': '🔎',
  'tools': '🧰',
  'agent': '🤖',
};

// ------------------------------------------------------------
//  HTTP 请求（返回解析后的 JSON）
// ------------------------------------------------------------
// TLS 证书校验失败（unable to verify the first certificate / UNABLE_TO_VERIFY_LEAF_SIGNATURE）
// 常见于国内网络环境（代理 / 运营商劫持 / 系统根证书不全）。此时自动降级为不校验证书重试一次，
// 保证插件市场可用；仅对 GitHub API / raw 域名生效，不影响其他请求。
function httpJson(url, opts = {}) {
  return httpJsonInner(url, opts, false);
}

function httpJsonInner(url, opts = {}, insecure) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': UA,
      Accept: SEARCH_ACCEPT,
      ...(opts.headers || {}),
    };
    const req = https.get(
      url,
      { headers, timeout: (opts.timeoutMs || 15000), rejectUnauthorized: !insecure },
      (res) => {
        // 跟随重定向（repo 元数据通常不重定向，但保持健壮）
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy();
          return resolve(httpJsonInner(res.headers.location, opts, insecure));
        }
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            reject(new Error('GitHub 返回格式错误'));
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('请求 GitHub 超时')); });
    req.on('error', (e) => {
      // 证书校验失败：降级重试一次（跳过证书校验）
      if (!insecure && /certificate|CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|SSL/i.test(e.message)) {
        return resolve(httpJsonInner(url, opts, true));
      }
      reject(new Error('网络错误：' + e.message));
    });
  });
}

function httpJsonBody(url, opts = {}) {
  return httpJson(url, opts).then((r) => {
    if (r.status >= 400) {
      const msg = r.json && r.json.message ? r.json.message : `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return r.json;
  });
}

// ------------------------------------------------------------
//  搜索 dsh-plugin 主题仓库
// ------------------------------------------------------------
function buildSearchQuery(keyword) {
  let q = `topic:${TOPIC}`;
  if (keyword && String(keyword).trim()) {
    const kw = String(keyword).trim();
    q += ` ${kw}`;
  }
  return q;
}

async function searchRepos({ keyword, page = 1, perPage = PER_PAGE, sort = DEFAULT_SORT, order = DEFAULT_ORDER } = {}) {
  const q = buildSearchQuery(keyword);
  const url = `${GITHUB_API}/search/repositories?` +
    `q=${encodeURIComponent(q)}&sort=${sort}&order=${order}` +
    `&page=${page}&per_page=${perPage}`;
  const data = await httpJsonBody(url);
  return {
    total: data.total_count || 0,
    items: Array.isArray(data.items) ? data.items : [],
  };
}

// ------------------------------------------------------------
//  提取单个仓库的 npm 包名（package.json.name）
//  通过 raw.githubusercontent.com 读取默认分支的 package.json。
//  失败（无 package.json / 非 npm 包 / 限流）时返回 null，不阻塞列表展示。
// ------------------------------------------------------------
function readPackageJsonName(repo) {
  if (!repo || !repo.full_name || !repo.default_branch) return Promise.resolve(null);
  const rawUrl = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/package.json`;
  return httpJsonBody(rawUrl)
    .then((pkg) => (pkg && typeof pkg.name === 'string' ? pkg.name : null))
    .catch(() => null);
}

// ------------------------------------------------------------
//  图标推断
// ------------------------------------------------------------
function iconFor(repo, pkgName) {
  // 1) 已知映射（匹配 npm 包名或仓库名片段）
  const hay = String(repo.full_name || '') + ' ' + String(pkgName || '') + ' ' + String(repo.name || '');
  const lower = hay.toLowerCase();
  for (const key of Object.keys(KNOWN_ICONS)) {
    if (lower.includes(key)) return { type: 'emoji', value: KNOWN_ICONS[key] };
  }
  // 2) 首字母占位（scoped 包取最后一个 / 后的首字母）
  const namePart = String(pkgName || repo.name || 'p').split('/').pop() || 'p';
  return { type: 'letter', value: namePart.slice(0, 1).toUpperCase() };
}

// ------------------------------------------------------------
//  把一个 GitHub 仓库对象归一化为市场条目
// ------------------------------------------------------------
function normalizeRepo(repo, pkgName) {
  const full = repo.full_name || '';
  const official = OFFICIAL_REPOS.includes(full);
  const icon = iconFor(repo, pkgName);
  return {
    id: String(repo.id || full),
    fullName: full,
    name: repo.name || '',
    owner: full.split('/')[0] || '',
    description: repo.description || '',
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    language: repo.language || '',
    homepage: repo.homepage || '',
    repoUrl: repo.html_url || `https://github.com/${full}`,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    defaultBranch: repo.default_branch || 'main',
    updatedAt: repo.updated_at || '',
    pushedAt: repo.pushed_at || '',
    license: (repo.license && repo.license.spdx_id) || '',
    pkgName: pkgName || null, // npm 包名；null 表示未识别到，不可一键安装
    installable: !!pkgName,
    iconType: icon.type,
    iconValue: icon.value,
    official,
  };
}

// ------------------------------------------------------------
//  列表入口：搜索 + 并发读取每个仓库的 npm 包名
//  为避免 GitHub 限流（未认证 60 次/小时），限制解析包名的请求量。
// ------------------------------------------------------------
async function listMarket({ keyword, page = 1, perPage = PER_PAGE, resolvePkgNames = true } = {}) {
  const { total, items } = await searchRepos({ keyword, page, perPage });

  let pkgNames = new Map();
  if (resolvePkgNames && items.length > 0) {
    // 并发解析，但限制在合理范围（首次进入市场最多约 perPage 个请求）
    const results = await Promise.all(items.map((r) => readPackageJsonName(r)));
    items.forEach((r, i) => {
      if (results[i]) pkgNames.set(r.full_name, results[i]);
    });
  }

  const list = items.map((r) => normalizeRepo(r, pkgNames.get(r.full_name)));

  // 官方推荐的置顶（保持 OFFICIAL_REPOS 顺序），其余按 star 降序（搜索已按 sort 返回）
  list.sort((a, b) => {
    const ai = OFFICIAL_REPOS.indexOf(a.fullName);
    const bi = OFFICIAL_REPOS.indexOf(b.fullName);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return (b.stars || 0) - (a.stars || 0);
  });

  return { ok: true, total, page, perPage, list };
}

module.exports = {
  TOPIC,
  OFFICIAL_REPOS,
  GITHUB_API,
  DEFAULT_SORT,
  DEFAULT_ORDER,
  PER_PAGE,
  searchRepos,
  readPackageJsonName,
  normalizeRepo,
  iconFor,
  listMarket,
  httpJson,
  httpJsonBody,
};
