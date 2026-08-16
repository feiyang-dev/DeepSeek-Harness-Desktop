'use strict';
// 用法: node --use-system-ca gh-delete-release.js <release_id> [delete_tag]
// 删除指定 Release；若第二个参数为 delete_tag 则同时删除其 tag
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const OWNER = 'feiyang-dev';
const REPO = 'DeepSeek-Harness-Desktop';
const RELEASE_ID = process.argv[2];
const DELETE_TAG = process.argv[3] === 'delete_tag';

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

function del(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'DELETE',
      headers: { 'User-Agent': 'dsh-delete', Authorization: `token ${TOKEN}` },
    }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  if (!RELEASE_ID) { console.error('用法: node gh-delete-release.js <release_id> [delete_tag]'); process.exit(1); }
  const r = await del(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}`);
  if (r.status === 204) {
    console.log(`[OK] 已删除 Release id=${RELEASE_ID}`);
    if (DELETE_TAG) {
      // 找到 tag 名
      console.log('  提示: tag 需单独删除（本地 git tag -d + push --delete）');
    }
  } else {
    console.log(`删除失败 HTTP ${r.status}: ${r.body.slice(0, 300)}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
