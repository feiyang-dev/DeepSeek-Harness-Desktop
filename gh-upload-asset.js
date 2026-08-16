'use strict';
// 用法: node --use-system-ca gh-upload-asset.js <release_id> [glob]
// 上传资产到指定 Release。glob 缺省时自动上传 release/ 下匹配当前版本的
// Setup exe / dmg / zip 等产物（避免 PowerShell 中文参数编码问题）。
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OWNER = 'feiyang-dev';
const REPO = 'DeepSeek-Harness-Desktop';
const RELEASE_ID = process.argv[2];
const VERSION = require('./package.json').version;

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

(async () => {
  if (!RELEASE_ID) { console.error('用法: node gh-upload-asset.js <release_id>'); process.exit(1); }
  const releaseDir = path.join(__dirname, 'release');
  // 自动挑选当前版本的产物（exe / dmg / zip / blockmap）
  const candidates = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir).filter((f) => f.includes(VERSION) && /\.(exe|dmg|zip|blockmap)$/.test(f))
    : [];
  const FILE_PATH = candidates[0];
  if (!FILE_PATH) { console.error(`release/ 下未找到匹配 v${VERSION} 的产物`); process.exit(1); }
  const full = path.join(releaseDir, FILE_PATH);
  const baseName = path.basename(full);
  const stat = fs.statSync(full);
  const fileData = fs.readFileSync(full);

  const url = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/assets?name=${encodeURIComponent(baseName)}`;
  const req = https.request(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'dsh-upload',
      Authorization: `token ${TOKEN}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileData.length,
    },
  }, (r) => {
    let d = '';
    r.on('data', (c) => (d += c));
    r.on('end', () => {
      if (r.statusCode !== 201) {
        console.error(`上传 ${baseName} 失败 HTTP ${r.statusCode}: ${d.slice(0, 400)}`);
        process.exit(1);
      }
      const j = JSON.parse(d);
      console.log(`[OK] 已上传: ${baseName} (${(stat.size / 1024 / 1024).toFixed(1)} MB) -> ${j.browser_download_url}`);
    });
  });
  req.on('error', (e) => { console.error('[错误]', e.message); process.exit(1); });
  req.write(fileData);
  req.end();
})().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
