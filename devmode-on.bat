@echo off
setlocal
chcp 65001 >nul
title 启用 Windows 开发者模式
echo ============================================================
echo   启用 Windows 开发者模式（解决打包符号链接权限问题）
echo ============================================================
echo.
echo 原理：electron-builder 解压 winCodeSign 需要创建符号链接
echo 未开启开发者模式时非管理员会被拒绝，开启后可免 UAC 打包
echo.
echo [提示] 本操作需要管理员权限
echo.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 当前不是管理员，正在请求管理员权限（请在弹窗中选择"是"）...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)
echo [1/1] 写入开发者模式注册表项...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f
if errorlevel 1 (
    echo.
    echo [错误] 写入注册表失败
    pause
    exit /b 1
)
echo.
echo ============================================================
echo   开发者模式已启用！
echo   现在可以重新运行 pack.bat 打包，无需管理员权限
echo ============================================================
echo.
pause
exit /b 0
