'use strict';
// 用法: node --use-system-ca gh-create-release.js
// 仅创建 Release（不上传资产），正文取 RELEASE_NOTES.md
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
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
  const notes = fs.readFileSync(path.join(__dirname, 'RELEASE_NOTES.md'), 'utf8');
  const payload = JSON.stringify({
    tag_name: TAG,
    name: `DeepSeek Harness 桌面版 ${TAG}`,
    body: notes,
    draft: false,
    prerelease: false,
  });
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases`;
  const r = await request(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'dsh-desktop-release',
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
