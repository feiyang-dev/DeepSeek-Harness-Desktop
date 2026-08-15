# assets

放置打包用资源：
- `icon.ico` —— Windows 应用图标（64x64+ 多尺寸，electron-builder 自动使用）
- 可将应用图标命名为 `icon.ico` 放在此目录，并在 `package.json` 的 `build.win.icon` 中指定。
- `icon-1024.png` —— macOS 打包图标（1024x1024，electron-builder 自动转为 icns），在 `package.json` 的 `build.mac.icon` 中指定；如需高清可替换为 1024×1024 原图。
