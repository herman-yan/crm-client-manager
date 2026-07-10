@echo off
title CRM 管理系统服务器
cd /d "%~dp0"
echo ========================================
echo   CRM 管理系统服务器
echo   访问地址：http://localhost:8088
echo ========================================
echo.
echo 按 Ctrl+C 可停止服务器
echo.
REM 先尝试 WorkBuddy 内置的 Node，如果没有则用系统安装的
if exist "C:\Users\81797\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
    C:\Users\81797\.workbuddy\binaries\node\versions\22.22.2\node.exe proxy_server.js
) else (
    node proxy_server.js
)
echo.
echo 服务器已停止，按任意键退出...
pause >nul
