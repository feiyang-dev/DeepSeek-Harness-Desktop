# dsh-desktop 发布全流程指南

> 从版本更新、提交、打包到发布 GitHub Release 的完整操作手册。适用于 `dsh-desktop`（DeepSeek Harness 桌面版）。

---

## 0. 环境要求与前置准备

| 项目 | 说明 |
| --- | --- |
| Node.js | 18+（开发机当前使用 v24） |
| npm | 随 Node.js 安装 |
| Git | 已配置 Windows 凭据管理器（`git config credential.helper` 为 `manager`） |
| 远程仓库 | `https://github.com/feiyang-dev/DeepSeek-Harness-Desktop.git`（main 分支） |
| 依赖 | 首次需 `npm install`（国内可先 `npm config set registry https://registry.npmmirror.com`） |

> **注意**：开发机 git 全局配置了本地代理 `http://127.0.0.1:26561`，代理未启动时会推送失败；且本地代理证书链不完整，可能报 `SSL certificate problem`。**发布时临时**用以下参数绕过（不改全局配置）：
> ```
> git -c http.proxy= -c https.proxy= -c http.sslVerify=false push ...
> ```

---

## 1. 确认版本与更新日志

1. 确认 `package.json` 的 `version` 字段与 `CHANGELOG.md` 最新条目一致：
   ```bash
   node -e "const p=require('./package.json'); console.log(p.version)"
   # CHANGELOG.md 第一条应为: ## vX.Y.Z (日期)
   ```
2. 若版本不一致，先更新两者。`pack.js`（`node pack.js`）可交互式更新版本号并写日志，但**推荐手动维护**，保证措辞一致。

---

## 2. 更新发布说明（RELEASE_NOTES.md）

`RELEASE_NOTES.md` 是 GitHub Release 的正文，每次发布都需更新为最新版本内容：

- 顶部标题改为 `# DeepSeek Harness 桌面版 vX.Y.Z`
- 「安装方式」中的 exe 文件名改成对应版本
- 「本版更新」按 CHANGELOG 最新条目整理，突出用户可感知的变化
- 保留「核心特性」「技术说明」「已知事项」等固定章节

---

## 3. 打包 Windows 安装包

```bash
# 清理旧产物后重新打包（必须，避免残留导致 rcedit 失败）
cd dsh-desktop
rmdir /s /q release
npm run dist        # 等价于 electron-builder --win
```

产物位于 `release/`：

```
DeepSeek Harness 桌面版-Setup-X.Y.Z.exe   # NSIS 安装包
DeepSeek Harness 桌面版-Setup-X.Y.Z.exe.blockmap
latest.yml                                 # 在线更新清单
win-unpacked/                              # 免安装版
```

> **权限说明**：electron-builder 解压 winCodeSign 需创建符号链接，若报权限错误需以管理员运行（`pack.bat` 内置 UAC 提权逻辑）。本项目当前版本已在普通权限下成功打包。

> **已知事项**：`latest.yml` 中的 `url` 为小写化文件名（如 `dsh-desktop-setup-1.7.0.exe`），与磁盘上的中文文件名不一致，属 electron-builder 行为，在线更新依赖更新服务端（`dsh-update-server`）的映射处理，与 GitHub Release 发布无关。

---

## 4. 提交代码并推送 main

```bash
git add CHANGELOG.md RELEASE_NOTES.md package.json boot/ main.js .github/workflows/ ...
git commit -m "feat: vX.Y.Z <简要描述>"
git push origin main        # 代理失效时用:
# git -c http.proxy= -c https.proxy= -c http.sslVerify=false push origin main
```

---

## 5. 打标签触发 macOS 云打包

`.github/workflows/build-mac.yml` 在推送 `v*` 标签时自动在 macOS runner 上构建 Intel + Apple Silicon 双架构的 dmg/zip。

```bash
git tag -a vX.Y.Z -m "DeepSeek Harness 桌面版 vX.Y.Z"
git push origin vX.Y.Z     # 同样可加 -c 参数绕过代理
```

> **重要（踩坑记录）**：
> - 打标签前**确保 workflow 文件已提交**到将要打标签的 commit（Actions 运行时使用的是**标签指向 commit** 上的 workflow 文件，而不是 main 最新）。
> - 标签应打在**包含所有发布内容（含 workflow 修复）的 commit** 上，否则 CI 用的是旧配置。
> - workflow 中打包命令必须带 `--publish never`：electron-builder 检测到 tag 存在时默认 `onTagOrDraft` 会尝试自动发布到 GitHub Release，而 runner 没有 `GH_TOKEN`，会导致**构建产物已生成但整个 job 报错失败**。
> - 若标签指向有误需重推：`git tag -d vX.Y.Z` → 重建标签 → `git push origin :refs/tags/vX.Y.Z`（删除远程）→ `git push origin vX.Y.Z`。
> - 删除远程标签会使已关联的 Release 变为 **draft（untagged）状态**，需重新发布（见第 7 节）。

---

## 6. 创建 GitHub Release（正文 + 上传 Windows 安装包）

无 `gh` CLI 时用 GitHub REST API。Token 从 Windows 凭据管理器读取（`git:https://github.com` 条目，标准 PAT，40 字符）。

### 6.1 创建 Release

```
POST https://api.github.com/repos/feiyang-dev/DeepSeek-Harness-Desktop/releases
Authorization: token <PAT>
{
  "tag_name": "vX.Y.Z",
  "name": "DeepSeek Harness 桌面版 vX.Y.Z",
  "body": "<RELEASE_NOTES.md 全文>",
  "draft": false,
  "prerelease": false
}
```

> 注意：`body` 必须为字符串，且包含中文时确保以 UTF-8 发送。Windows PowerShell 5.1 的 `Get-Content`/`ConvertTo-Json` 易产生编码问题，推荐用 Node.js 脚本（`fs.readFileSync(..., 'utf8')`）构造 JSON。

### 6.2 上传 Windows 安装包

```
POST https://uploads.github.com/repos/<owner>/<repo>/releases/<release_id>/assets?name=<文件名>
Content-Type: application/octet-stream
Body: 安装包二进制
```

> 上传 70+ MB 文件需较长等待；本机因代理证书问题，Node 请求需加 `--use-system-ca` 参数。

---

## 7. 上传 macOS 产物到 Release（可选但推荐）

macOS dmg/zip 默认在 Actions Artifact 中（网页可下载，但用户侧入口不明显）。**推荐下载后上传到 Release Assets**，与 Windows 安装包并列，方便用户下载。

### 7.1 从 Actions 下载 artifact

- Actions 运行页底部 **Artifacts → `dsh-desktop-mac`**（约 387MB zip）
- 或 API：`GET /repos/<owner>/<repo>/actions/runs/<run_id>/artifacts` 拿 `archive_download_url`
  - 注意该接口会 **302 重定向**到 Azure Blob 带签名 URL，**重定向后必须移除 `Authorization` header**（Azure 用自带签名鉴权），否则 403
  - 本机下载易被杀毒软件锁定/较慢，可在浏览器中直接下载

### 7.2 上传到 Release

解压后 4 个文件，逐一用 6.2 的方式上传到同一 Release：

```
DeepSeek Harness 桌面版-X.Y.Z-mac-x64.dmg / .zip      # Intel
DeepSeek Harness 桌面版-X.Y.Z-mac-arm64.dmg / .zip    # Apple Silicon
```

---

## 8. 特殊情况：标签重建导致 Release 变 draft

删除并重建同名标签后，原 Release 不会自动恢复，而是变成 **draft 状态**且 tag 显示 `untagged-xxxx`，直接访问 `/releases/tags/vX.Y.Z` 返回 404。

恢复方法：

```
PATCH https://api.github.com/repos/<owner>/<repo>/releases/<release_id>
{ "draft": false }
```

> 只要 Release 的 `tag_name` 字段仍是 `vX.Y.Z` 且该标签已重新推送，PATCH 后即恢复公开可访问，原有资产（已上传的 exe）保留。

---

## 9. 发布后验证

```bash
# 1. Release 可访问且资产齐全
GET https://api.github.com/repos/<owner>/<repo>/releases/tags/vX.Y.Z
# 期望: draft=false, assets 含 Windows exe 及（可选）macOS 产物

# 2. Actions 全部成功
GET https://api.github.com/repos/<owner>/<repo>/actions/runs?event=push
# 期望: Build macOS packages 结论 success

# 3. 工作区干净
git status          # 无未提交变更
```

---

## 10. 快速清单（一次发布的最小步骤）

```bash
# 1. 确认版本号一致 (package.json / CHANGELOG.md)
# 2. 更新 RELEASE_NOTES.md
# 3. 打包: rmdir /s /q release && npm run dist
# 4. 提交: git add -A && git commit -m "feat: vX.Y.Z ..."
# 5. 推送 main（代理失效加 -c 参数）
# 6. 打标签并推送: git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z
# 7. 创建 Release + 上传 Windows exe（REST API）
# 8. 下载 Actions artifact 上传 macOS 产物（可选）
# 9. 验证 Release 与 Actions 状态
```

---

## 附：本机发布相关凭证与代理速查

| 内容 | 位置 |
| --- | --- |
| GitHub Token | Windows 凭据管理器，目标 `git:https://github.com`（PAT，40 字符） |
| git 代理 | 全局配置 `http.proxy` / `https.proxy` = `http://127.0.0.1:26561`（代理软件未运行时需绕过） |
| 远程仓库 | `https://github.com/feiyang-dev/DeepSeek-Harness-Desktop.git` |
| macOS workflow | `.github/workflows/build-mac.yml` |
| 更新服务 | `../dsh-update-server`（独立部署，非本次流程范围） |
