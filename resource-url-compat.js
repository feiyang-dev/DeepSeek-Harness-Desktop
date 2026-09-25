'use strict';

// ============================================================
//  官方 Web UI `dsh-resource://` 地址 · Chromium 兼容层（主窗口 preload）
//
//  ── 问题（只在桌面端复现）─────────────────────────────────
//  官方 Web UI 用 `dsh-resource://<type>/…` 表示资源地址，type 就是「资源协议键」，
//  并且用 URL 解析器把它读出来，例如：
//      new URL('dsh-resource://file/session/a/b.txt').hostname   === 'file'
//      new URL('dsh-resource://file/session/a/b.txt').pathname   === '/session/a/b.txt'
//  这是 WHATWG 规范的结果（Node 24 / 新版 Edge、Chrome 都如此）。
//
//  但 Electron 31 用的是 Chromium 126：该内核尚未按规范解析「非特殊 scheme」
//  （non-special scheme）的 authority，同一句会得到：
//      hostname === ''                          pathname === '//file/session/a/b.txt'
//  于是官方前端读不到资源协议键（dsh-client-resources 的 protocolOf → undefined），
//  资源提供方挂不上，侧边栏文件预览就报「文件资源服务不可用」。
//  同一份前端用浏览器打开正常 —— 差别只在 URL 解析器的内核版本。
//
//  ── 本文件做什么 ──────────────────────────────────────────
//  作为主窗口的 preload 运行（隔离世界），只做两件事：
//    1. 检测当前内核是否仍存在上述差异；
//    2. 若存在，在官方页面脚本执行之前，把一小段兼容补丁注入主世界。
//  新内核（差异已消失）下检测直接通过 → 不注入、零影响。
//
//  兼容补丁只做一件事：让被内核算错的 `hostname` / `host` / `pathname` 返回规范
//  结果，且只对「host 被吞进 path」这一类 URL 生效（其它 URL 原样返回）。
//  它不替换 URL 构造函数、不新增页面 API、不碰官方任何代码 —— 官方包可以照常升级。
//
//  相关：官方地址语法见 @deepseek-ai/dsh-util-workspace-path（纯字符串解析，不受影响）；
//        受内核影响的读取点只有 dsh-client-resources 的 protocolOf 与
//        dsh-client-ui-sidebar-right 的 pathOf。
// ============================================================

// 检测：把「规范结果」与「当前内核结果」比一次。异常时按需要兼容处理。
const NEEDS_COMPAT = (() => {
  try {
    const probe = new URL('dsh-resource://file/x');
    return probe.hostname !== 'file' || probe.pathname !== '/x';
  } catch {
    return true;
  }
})();

// 注入主世界执行的补丁。注意：本函数会被 toString() 序列化后独立执行，
// 因此**不得**引用本文件作用域里的任何变量。
function dshResourceUrlCompatPatch() {
  const URLProto = window.URL && window.URL.prototype;
  if (URLProto === undefined || URLProto.__dshResourceCompat === true) return;

  const descHostname = Object.getOwnPropertyDescriptor(URLProto, 'hostname');
  const descHost = Object.getOwnPropertyDescriptor(URLProto, 'host');
  const descPathname = Object.getOwnPropertyDescriptor(URLProto, 'pathname');
  if (descHostname === undefined || descHost === undefined || descPathname === undefined) return;
  if (typeof descHostname.get !== 'function' || typeof descHost.get !== 'function' || typeof descPathname.get !== 'function') return;

  // 旧内核把 authority 吞进 path 的特征：hostname 为空、pathname 以 '//' 开头。
  // 这里把规范下的 host / pathname 还原出来；不属于这一类就返回 null（保持原样）。
  function splitSwallowedAuthority(url) {
    if (descHostname.get.call(url) !== '') return null;
    const pathname = descPathname.get.call(url);
    if (pathname.slice(0, 2) !== '//') return null;
    const rest = pathname.slice(2);
    const cut = rest.search(/[/?#]/);
    const host = cut === -1 ? rest : rest.slice(0, cut);
    if (host === '') return null;
    return { host, pathname: cut === -1 ? '' : rest.slice(cut) };
  }

  // 只重定义这三个派生属性。href / search / hash / toString() / toJSON() 本来就是
  // 正确的（序列化会把 '//host' 拼回去），因此不动；URL 构造函数与原型保持不变，
  // instanceof、fetch()、brand check 全部不受影响。
  Object.defineProperty(URLProto, 'hostname', {
    configurable: true,
    enumerable: descHostname.enumerable,
    get() {
      const fixed = splitSwallowedAuthority(this);
      // 非特殊 scheme 的 host 是 opaque host：规范保留原始大小写，这里不擅自小写
      // （官方 protocolOf 自己会 toLowerCase，大小写由调用方决定）。
      return fixed === null ? descHostname.get.call(this) : fixed.host;
    },
  });
  Object.defineProperty(URLProto, 'host', {
    configurable: true,
    enumerable: descHost.enumerable,
    get() {
      const fixed = splitSwallowedAuthority(this);
      if (fixed === null) return descHost.get.call(this);
      const port = this.port;
      return port === '' ? fixed.host : `${fixed.host}:${port}`;
    },
  });
  Object.defineProperty(URLProto, 'pathname', {
    configurable: true,
    enumerable: descPathname.enumerable,
    get() {
      const fixed = splitSwallowedAuthority(this);
      return fixed === null ? descPathname.get.call(this) : fixed.pathname;
    },
  });
  Object.defineProperty(URLProto, '__dshResourceCompat', { value: true, configurable: true });
}

// 把一段源代码注入主世界：preload 在隔离世界，改不到主世界全局，但两者共享 DOM，
// 插入一个 inline <script> 即可。官方页面没有 CSP（其 <head> 里本就有 inline script），
// 所以这个方式是可行的。
function injectIntoMainWorld(source) {
  const insert = () => {
    const root = document.head || document.documentElement;
    if (root === null || root === undefined) return false;
    const el = document.createElement('script');
    el.textContent = source;
    root.appendChild(el);
    el.remove();
    return true;
  };
  if (insert()) return;
  // preload 比 <head> 更早执行：等 <head>/<html> 出现就立刻注入。
  // 官方模块脚本是异步（外链）加载的，因此这里仍远早于它们执行。
  const observer = new MutationObserver(() => {
    if (insert()) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

if (NEEDS_COMPAT) {
  try {
    injectIntoMainWorld(`;(${dshResourceUrlCompatPatch.toString()})();`);
  } catch {
    /* 兼容层失败不应影响窗口加载：官方原样行为，只是该功能仍旧不可用 */
  }
}
