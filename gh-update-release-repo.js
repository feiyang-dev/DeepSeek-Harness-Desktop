'use strict';
// 用法: node --use-system-ca gh-update-release-repo.js <repo> <release_id> [notes_file]
// 更新指定 Release 的 body
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OWNER = 'feiyang-dev';
const REPO = process.argv[2];
const RELEASE_ID = process.argv[3];
const NOTES_FILE = process.argv[4];

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
  if (!REPO || !RELEASE_ID) { console.error('用法: node gh-update-release-repo.js <repo> <release_id> [notes_file]'); process.exit(1); }
  const cwd = process.cwd();
  let notes = '';
  const fp = NOTES_FILE ? path.resolve(NOTES_FILE) : path.join(cwd, 'CHANGELOG.md');
  if (fs.existsSync(fp)) notes = fs.readFileSync(fp, 'utf8');
  if (!notes) { console.log('未找到发布说明文件，body 保持原样'); process.exit(0); }

  const payload = JSON.stringify({ body: notes });
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}`;
  const r = await request(url, {
    method: 'PATCH',
    headers: {
      'User-Agent': 'dsh-release',
      Authorization: `token ${TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Accept': 'application/vnd.github+json',
    },
  }, payload);
  if (r.status !== 200) {
    throw new Error(`更新 Release 失败 HTTP ${r.status}: ${r.body.slice(0, 500)}`);
  }
  const j = JSON.parse(r.body);
  console.log(`[OK] Release body 已更新: ${j.html_url}`);
})().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
