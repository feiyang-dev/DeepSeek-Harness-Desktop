# dsh-desktop 发布全流程指南

> 从版本更新、提交、打包到发布 GitHub Release 的完整操作手册。适用于 `dsh-desktop`（DeepSeek Harness 桌面版）。
>
> **分工约定**：发布动作（更新版本/文档、提交、打标签、创建 GitHub Release 正文、**打包 Windows 安装包并上传资产**、**发布到自建更新服务**）均由 **AI 助手**执行。
>
> 更新服务侧的发布已由 `publish-update-server.js` 一条命令完成（见第 6.3 节），无需再登录管理平台手工上传。

---

## 0. 环境要求与前置准备

| 项目 | 说明 |
| --- | --- |
| Node.js | 18+（开发机当前使用 v24） |
| npm | 随 Node.js 安装 |
| Git | 已配置 Windows 凭据管理器（`git config credential.helper` 为 `manager`） |
| 远程仓库 | `https://github.com/feiyang-dev/DeepSeek-Harness-Desktop.git`（main 分支） |
| GitHub Token | Windows 凭据管理器 `git:https://github.com` 条目（标准 PAT，40 字符） |

> **注意**：开发机 git 全局配置了本地代理 `http://127.0.0.1:26561`，代理未启动时会推送失败；且本地代理证书链不完整，可能报 `SSL certificate problem`。**发布时临时**用以下参数绕过（不改全局配置）：
> ```
> git -c http.proxy= -c https.proxy= -c http.sslVerify=false push ...
> ```

---

## 1. 确认版本与更新日志（AI）

1. 确认 `package.json` 的 `version` 字段与 `CHANGELOG.md` 最新条目一致：
   ```bash
   node -e "const p=require('./package.json'); console.log(p.version)"
   # CHANGELOG.md 第一条应为: ## vX.Y.Z (日期)
   ```
2. 若版本不一致，先更新两者（`package.json` 升版本号；`CHANGELOG.md` 顶部新增条目）。
3. 版本号策略：功能新增 / 体验变更 → `minor`（如 1.9.0 → 1.10.0）；修复为主 → `patch`（如 1.9.0 → 1.9.1）。本次 v1.9.1 为 patch 级别。

---

## 2. 更新发布说明（RELEASE_NOTES.md）（AI）

`RELEASE_NOTES.md` 是 GitHub Release 的正文，每次发布都需更新为最新版本内容：

- 顶部标题改为 `# DeepSeek Harness 桌面版 vX.Y.Z`
- 「安装方式」中的 exe 文件名改成对应版本
- 「本版更新」按 CHANGELOG 最新条目整理，突出用户可感知的变化
- 保留「核心特性」「技术说明」「已知事项」等固定章节
- 同步更新 `README.md` / `README.zh.md` 中可能变化的说明（模式名、行为变更等）

---

## 3. 提交代码并推送 main（AI）

```bash
git add CHANGELOG.md RELEASE_NOTES.md package.json boot/ main.js README.md README.zh.md .github/workflows/ ...
git commit -m "feat: vX.Y.Z <简要描述>"
git push origin main        # 代理失效时用:
# git -c http.proxy= -c https.proxy= -c http.sslVerify=false push origin main
```

> **AI 执行前**：确认工作区改动均为本次发布内容（`git status` / `git diff --stat`），无临时文件混入。

---

## 4. 打标签触发 macOS 云打包（AI）

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
> - 删除远程标签会使已关联的 Release 变为 **draft（untagged）状态**，需重新发布（见第 8 节）。

---

## 5. 创建 GitHub Release（AI，不含安装包）

无 `gh` CLI 时用 GitHub REST API。Token 从 Windows 凭据管理器读取（`git:https://github.com` 条目，标准 PAT，40 字符）。

### 5.1 创建 Release（只建正文，不传资产）

使用仓库内置脚本（读取 `package.json` 版本 + `RELEASE_NOTES.md` 正文）：

```
node --use-system-ca gh-create-release.js
```

等价 REST 调用：

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

### 5.2 创建后反馈

创建成功后把 **Release 页面 URL** 反馈给用户，并提醒用户下一步上传安装包。

---

## 6. 打包 Windows 安装包并发布（AI）

> 说明：原约定「Windows 安装包由用户自行打包并上传」已调整为 AI 全流程执行：打包 → 上传 GitHub Release 资产 → 发布到自建更新服务（客户端「检查更新」读的就是后者）。若只需 GitHub 这一环，做完 6.2 即可。

### 6.1 打包

```bash
cd dsh-desktop
rmdir /s /q release                      # PowerShell: Remove-Item -LiteralPath release -Recurse -Force
npm run dist -- --publish never          # 等价 electron-builder --win；--publish never 避免它自己去动 Release
```

- electron-builder 解压 winCodeSign 需创建符号链接：若报权限错误，用管理员运行（`pack.bat` 内置 UAC 提权逻辑）。
- **打包后必须自检**（历史踩坑）：确认 `release/win-unpacked/resources/app.asar` 内包含 `main.js` 引用的所有本地模块与窗口 preload。`package.json` 的 `build.files` 是**追加**过滤（不会裁剪未列出的文件，但新模块仍建议显式列出），新增 js 模块后务必核对一次，否则会出现"安装包启动即缺模块"。
  ```bash
  # 解析 asar 头部并核对关键文件（示例）
  node -e "const fs=require('fs');const b=fs.readFileSync('release/win-unpacked/resources/app.asar');const n=b.readUInt32LE(12);const j=JSON.parse(b.toString('utf8',16,16+n));const out=[];(function w(x,p){for(const[k,v]of Object.entries(x.files||{})){const f=p?p+'/'+k:k;v.files?w(v,f):out.push(f)}})(j,'');console.log(out.length, out.filter(f=>/^(main|preload|plugin-|dsh-settings|resource-url-compat)/.test(f)))"
  ```

### 6.2 上传到 GitHub Release

```bash
node --use-system-ca gh-upload-asset.js <release_id>   # 自动挑选 release/ 下当前版本的安装包
```

（也可在 Release 页面 Assets → Upload binaries 手动上传 `DeepSeek Harness 桌面版-Setup-X.Y.Z.exe`。）

> **已知事项**：`latest.yml` 中的 `url` 为小写化文件名（如 `dsh-desktop-setup-1.13.0.exe`），与磁盘上的中文文件名不一致，属 electron-builder 行为；GitHub 侧资产名同样会被规范化为 `DeepSeek.Harness.-Setup-X.Y.Z.exe`。

### 6.3 发布到自建更新服务（客户端「检查更新」的数据源）

```bash
set DSH_PUBLISH_API_KEY=<服务端 .env 里的 PUBLISH_API_KEY>     # Linux/macOS: export ...
node --use-system-ca publish-update-server.js
```

脚本会自动取 `package.json` 的版本号、`RELEASE_NOTES.md` 的正文作为更新日志、`release/` 下匹配该版本的安装包，调用 `POST /api/publish/versions` 发布，并在发布后调用 `/api/update/check` 验证客户端能否检测到新版本。

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--dry-run` | 只打印将发送的字段，不发请求 |
| `--mode upsert` / `create` | 默认 `upsert`（已存在则覆盖，可安全重跑）；`create` 遇重复报 409 |
| `--allow-downgrade` | 允许发布低于当前生效最高版本的版本（回退发版） |
| `--file <path>` | 显式指定安装包（默认在 `release/` 里按版本号匹配） |
| `--api <url>` / `--key <key>` | 覆盖服务地址 / 密钥（默认读 `DSH_UPDATE_API` / `DSH_PUBLISH_API_KEY`） |
| `--check-from <ver>` | 发布后用该版本号模拟客户端检查更新（默认 `0.0.0`） |

> 首次使用需在服务端 `.env` 配置 `PUBLISH_API_KEY` 并重启服务，详见 `dsh-update-server/README.md` 的「自动化发布 API」章节；服务端还可用 `npm run test:publish-api` 在无 MySQL 的情况下自测接口。

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

# 3. 更新服务侧已能下发新版本（客户端「检查更新」的数据源）
curl "https://api.deepseekharness.desktop.cwj666.top/api/update/check?appId=dsh-desktop&version=0.0.0&platform=win32&arch=x64"
# 期望: hasUpdate=true，latestVersion 为本次发布版本

# 4. 工作区干净
git status          # 无未提交变更
```

---

## 10. 快速清单（全流程 AI 执行）

```bash
# ===== 准备 =====
# 1. 确认版本号一致 (package.json / CHANGELOG.md)，不一致则更新
# 2. 更新 RELEASE_NOTES.md（+ README 中变化的说明）

# ===== GitHub =====
# 3. 提交: git add -A && git commit -m "feat: vX.Y.Z ..."（中文提交信息建议用 -F <utf8 文件> 避免编码问题）
# 4. 推送 main（代理/证书问题时加: -c http.proxy= -c https.proxy= -c http.sslVerify=false）
# 5. 打标签并推送: git tag -a vX.Y.Z -F <utf8 文件> && git push origin vX.Y.Z   → 触发 macOS 云打包
# 6. 创建 Release（正文取 RELEASE_NOTES.md）: node --use-system-ca gh-create-release.js
# 7. 上传 Windows 安装包: node --use-system-ca gh-upload-asset.js <release_id>

# ===== 自建更新服务（客户端「检查更新」的数据源）=====
# 8. 打包安装包: rmdir /s /q release && npm run dist -- --publish never
# 9. 一条命令发布: set DSH_PUBLISH_API_KEY=... && node --use-system-ca publish-update-server.js
#    （脚本自动取版本号 / RELEASE_NOTES.md / release 下安装包，并在发布后校验更新检查）

# ===== 收尾 =====
# 10. macOS 产物（可选）：等 Actions 跑完后下载 dmg/zip 上传到同一 Release
# 11. 反馈 Release URL + 更新服务发布结果给用户
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
