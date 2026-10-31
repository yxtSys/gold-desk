@echo off
cd /d "%~dp0"
title 推送到 GitHub

echo ============================================
echo   黄金研究台 - 推送到 GitHub
echo ============================================
echo.
echo 先做这一步：
echo   1. 打开 https://github.com/new
echo   2. 填个仓库名，比如 gold-desk
echo   3. 选 Public
echo   4. 所有勾选项都不要动，点 Create repository
echo.
echo 然后把新建仓库的地址粘贴到下面，形如：
echo   https://github.com/你的用户名/gold-desk.git
echo.

set REPO=
set /p REPO=仓库地址：
if "%REPO%"=="" goto empty
if "%REPO%"==" " goto empty

echo.
echo [*] 配置远程仓库...
git remote remove origin 2>nul
git remote add origin %REPO%
git branch -M main

echo [*] 开始推送（第一次会弹出 GitHub 登录窗口）...
git push -u origin main
if errorlevel 1 goto failed

echo.
echo ============================================
echo   推送成功
echo ============================================
echo.
echo 接下来必做：配置 4 个 Secrets
echo 仓库页面 - Settings - Secrets and variables - Actions
echo.
echo   DEEPSEEK_API_KEY
echo   QQ_USER
echo   QQ_AUTH_CODE
echo   QQ_TO
echo.
echo 配好后去 Actions 页面点一次 Run workflow 测试。
echo.
goto end

:empty
echo.
echo 没有输入仓库地址，已退出。
goto end

:failed
echo.
echo 推送失败，常见原因：
echo   1. 仓库地址写错
echo   2. 没有登录 GitHub，再运行一次本程序
echo   3. 仓库不是空的（必须新建空仓库，不要勾 README）
echo.

:end
echo.
pause
