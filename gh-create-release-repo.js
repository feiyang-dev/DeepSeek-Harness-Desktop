'use strict';
// 用法: node --use-system-ca gh-create-release-repo.js <repo> [release_name] [notes_file]
//   <repo>        如 dsh-usage-plugin / dsh-vault / DeepSeek-Harness-Desktop
//   release_name  可选，默认 "Release <tag>"
//   notes_file    可选，默认取 <repo>-RELEASE_NOTES.md（不存在则用 git tag 注释）
// 读取本地 package.json version 作为 tag（v<version>）
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OWNER = 'feiyang-dev';
const REPO = process.argv[2];

function readGitHubToken() {
  const psScript = String.raw`
$sig = @'
using System;
using System.Runtime.InteropServices;
public class CredManUp {
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CredRead(string target, int type, int flag, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern void CredFree(IntPtr cred);
    public static string[] Read(string target) {
        IntPtr p;
        if (!CredRead(target, 1, 0, out p)) return null;
        try {
            var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            return new string[] { Marshal.PtrToStringUni(c.UserName), Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize/2) };
        } finally { CredFree(p); }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct CREDENTIAL {
        public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
        public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
        public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias;
        public IntPtr UserName;
    }
}
'@
Add-Type -TypeDefinition $sig
$r = [CredManUp]::Read("git:https://github.com")
if ($r) { $r[1].Trim() } else { "" }
`;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psScript], { encoding: 'utf8', windowsHide: true });
  if (res.status !== 0 || !res.stdout.trim()) throw new Error('无法读取 GitHub token');
  return res.stdout.trim();
}

const TOKEN = readGitHubToken();

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  if (!REPO) { console.error('用法: node gh-create-release-repo.js <repo>'); process.exit(1); }
  // 在调用目录读取该仓库的 package.json
  const cwd = process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const tag = `v${pkg.version}`;
  const name = process.argv[3] || `Release ${tag}`;

  // 读取发布说明：优先 <repo>-RELEASE_NOTES.md，其次 RELEASE_NOTES.md，再 fallback CHANGELOG 头部
  let notes = `Release ${tag}`;
  const candidates = [`${REPO}-RELEASE_NOTES.md`, 'RELEASE_NOTES.md'];
  for (const c of candidates) {
    const fp = path.join(cwd, c);
    if (fs.existsSync(fp)) { notes = fs.readFileSync(fp, 'utf8'); break; }
  }

  const payload = JSON.stringify({
    tag_name: tag,
    name,
    body: notes,
    draft: false,
    prerelease: false,
  });
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases`;
  const r = await request(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'dsh-release',
      Authorization: `token ${TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Accept': 'application/vnd.github+json',
    },
  }, payload);
  if (r.status !== 201) {
    throw new Error(`创建 Release 失败 HTTP ${r.status}: ${r.body.slice(0, 500)}`);
  }
  const j = JSON.parse(r.body);
  console.log(`[OK] Release 已创建: ${j.html_url} (id=${j.id})`);
})().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
