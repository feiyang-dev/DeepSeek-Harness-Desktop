@echo off
setlocal
chcp 65001 >nul
title DeepSeek Harness 桌面版 - 开发启动

echo ============================================================
echo   DeepSeek Harness 桌面版（开发模式）
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] 检查 electron 依赖...
if not exist node_modules (
    echo       首次运行，正在安装依赖（国内请先执行 npm config set registry https://registry.npmmirror.com）...
    call npm install
    if errorlevel 1 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
)
echo       依赖已就绪。

echo [2/2] 启动桌面客户端...
echo       客户端会自动执行以下流程（进度在窗口中显示）:
echo        - 检测 Node.js 环境
echo        - 检测 / 安装 DeepSeek Harness（首次约需下载数百 MB）
echo        - 启动 dsh web 服务
echo        - 打开主界面
echo.
echo       打包命令: npm run dist  （生成安装包到 release/ 目录）
echo.
call npx electron .

echo.
echo 客户端已退出。
pause
exit /b 0
