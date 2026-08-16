'use strict';
// 用法: node --use-system-ca gh-verify.js
// 验证 vX.Y.Z 的 Release 与最近 Actions 运行状态
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const OWNER = 'feiyang-dev';
const REPO = 'DeepSeek-Harness-Desktop';
const VERSION = require('./package.json').version;
const TAG = `v${VERSION}`;

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

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'verify-release', Authorization: `token ${TOKEN}` } }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', reject);
  });
}

(async () => {
  console.log(`=== 验证 ${TAG} ===`);
  const relRes = await get(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  if (relRes.status !== 200) {
    console.log(`Release 不可访问 HTTP ${relRes.status}: ${relRes.body.slice(0, 200)}`);
  } else {
    const rel = JSON.parse(relRes.body);
    console.log(`Release: ${rel.name}`);
    console.log(`  tag_name: ${rel.tag_name} | draft: ${rel.draft} | prerelease: ${rel.prerelease}`);
    console.log(`  html_url: ${rel.html_url}`);
    console.log(`  assets (${rel.assets.length}):`);
    rel.assets.forEach((a) => console.log(`    - ${a.name} (${(a.size / 1024 / 1024).toFixed(1)} MB)`));
  }

  console.log('\n=== 最近 Actions 运行 ===');
  const runsRes = await get(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?event=push&per_page=5`);
  if (runsRes.status !== 200) {
    console.log(`Actions 查询失败 HTTP ${runsRes.status}: ${runsRes.body.slice(0, 200)}`);
  } else {
    const runs = JSON.parse(runsRes.body);
    runs.workflow_runs.forEach((r) => {
      console.log(`  ${r.name} | branch=${r.head_branch} | status=${r.status} | conclusion=${r.conclusion} | created=${r.created_at}`);
      console.log(`    -> ${r.html_url}`);
      console.log(`    -> run_id=${r.id}`);
    });
  }
})().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
