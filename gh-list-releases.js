'use strict';
// 用法: node --use-system-ca gh-list-releases.js
// 列出仓库全部 Release（id / tag / 资产）
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const OWNER = 'feiyang-dev';
const REPO = 'DeepSeek-Harness-Desktop';

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
    https.get(url, { headers: { 'User-Agent': 'dsh-list', Authorization: `token ${TOKEN}` } }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', reject);
  });
}

(async () => {
  let page = 1;
  while (true) {
    const r = await get(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=50&page=${page}`);
    if (r.status !== 200) { console.log(`失败 HTTP ${r.status}: ${r.body.slice(0, 200)}`); break; }
    const releases = JSON.parse(r.body);
    if (!releases.length) break;
    releases.forEach((rel) => {
      console.log(`id=${rel.id} | tag=${rel.tag_name} | name=${rel.name} | draft=${rel.draft}`);
      rel.assets.forEach((a) => console.log(`   asset: id=${a.id} name=${a.name}`));
    });
    if (releases.length < 50) break;
    page++;
  }
})().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
