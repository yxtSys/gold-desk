@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 黄金研究台

echo ============================================
echo   黄金研究台 启动中...
echo   看板地址：http://127.0.0.1:8848
echo   关闭本窗口 = 停止盯盘
echo ============================================
echo.

start "" /min cmd /c "timeout /t 4 /nobreak >nul & explorer http://127.0.0.1:8848"

node server.mjs

echo.
echo 服务已停止。
pause
