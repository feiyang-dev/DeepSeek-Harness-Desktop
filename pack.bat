@echo off
setlocal
chcp 65001 >nul
title DeepSeek Harness 桌面版 - 打包

REM ============================================================
REM  管理员权限检查：
REM  electron-builder 解压 winCodeSign 签名工具时需要创建符号链接，
REM  非管理员权限会报 "Cannot create symbolic link" 导致打包失败。
REM  无权限时自动请求管理员提升（会弹出 UAC 确认窗口）。
REM ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   打包需要管理员权限（解压签名工具时需要创建符号链接）。
    echo   正在请求管理员权限，请在弹窗中选择"是"...
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b 0
)
cd /d "%~dp0"

echo ============================================================
echo   DeepSeek Harness 桌面版（打包）
echo   将询问版本号与更新日志，自动更新并生成安装包
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装: https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo 首次运行，正在安装依赖（国内请先执行 npm config set registry https://registry.npmmirror.com）...
    call npm install
    if errorlevel 1 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
)

echo 依赖已就绪。
echo 开始打包（按提示输入版本号与更新日志）...
echo.
call node pack.js
if errorlevel 1 (
    echo.
    echo [错误] 打包失败或已中止。
    pause
    exit /b 1
)

echo.
pause
exit /b 0
