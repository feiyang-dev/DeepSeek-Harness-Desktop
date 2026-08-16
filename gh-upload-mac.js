'use strict';
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 用法: node --use-system-ca gh-upload-mac.js <序号 1-4>
const FILES = [
  'DeepSeek Harness 桌面版-1.8.1-mac-arm64.dmg',
  'DeepSeek Harness 桌面版-1.8.1-mac-x64.dmg',
  'DeepSeek Harness 桌面版-1.8.1-mac-arm64.zip',
  'DeepSeek Harness 桌面版-1.8.1-mac-x64.zip',
];
const IDX = parseInt(process.argv[2], 10);
if (!(IDX >= 1 && IDX <= FILES.length)) { console.error('用法: node gh-upload-mac.js <1-4>'); process.exit(1); }
const TARGET = FILES[IDX - 1];

// 从 Windows 凭据管理器读取 GitHub token
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
  if (res.status !== 0 || !res.stdout.trim()) {
    throw new Error('无法从凭据管理器读取 GitHub token');
  }
  return res.stdout.trim();
}

const TOKEN = readGitHubToken();
const OWNER = 'feiyang-dev';
const REPO = 'DeepSeek-Harness-Desktop';
const RELEASE_ID = '371287442';

function uploadAsset(filePath) {
  return new Promise((resolve, reject) => {
    const baseName = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const fileData = fs.readFileSync(filePath);
    const url = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/assets?name=${encodeURIComponent(baseName)}`;
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'dsh-desktop-release',
          Authorization: `token ${TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileData.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode === 201) {
            const j = JSON.parse(data);
            resolve({ name: baseName, size: stat.size, url: j.browser_download_url });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
}

async function main() {
  const fp = path.join(__dirname, TARGET);
  if (!fs.existsSync(fp)) {
    console.error(`[错误] 文件不存在: ${fp}`);
    process.exit(1);
  }
  const mb = (fs.statSync(fp).size / 1024 / 1024).toFixed(1);
  console.log(`上传 ${TARGET} (${mb} MB) ...`);
  try {
    const r = await uploadAsset(fp);
    console.log(`[OK] ${r.name} -> ${r.url}`);
  } catch (e) {
    console.error(`[错误] ${e.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[错误]', e.message || e);
  process.exit(1);
});
