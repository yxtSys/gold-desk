@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 推送到 GitHub

echo ============================================
echo   黄金研究台 - 推送到 GitHub
echo ============================================
echo.
echo 先做这一步：
echo   1. 打开 https://github.com/new
echo   2. Repository name 随便填，比如 gold-desk
echo   3. 选择 Public（重要！私有仓库 Actions 要算分钟数）
echo   4. 什么都不要勾选（不要 README、不要 .gitignore）
echo   5. 点 Create repository
echo.
echo 然后把你新建仓库的地址粘贴到下面。
echo.

set /p REPO=仓库地址：
if "%REPO%"=="" (
  echo 没有输入，退出。
  pause
  exit /b 1
)

echo.
echo [*] 配置远程仓库...
git remote remove origin 2>nul
git remote add origin %REPO%
git branch -M main

echo [*] 开始推送（如果弹出登录窗口，用浏览器登录 GitHub 授权即可）...
git push -u origin main

if %errorlevel%==0 (
  echo.
  echo ============================================
  echo   ✓ 推送成功
  echo ============================================
  echo.
  echo 接下来必须配置 4 个 Secrets，否则 Actions 跑不起来：
  echo   打开 https://github.com/设置页/secrets/actions
  echo.
  echo   DEEPSEEK_API_KEY   DeepSeek 的 API Key
  echo   QQ_USER            你的 QQ 邮箱
  echo   QQ_AUTH_CODE       16 位授权码
  echo   QQ_TO              收件邮箱
  echo.
  echo 配好之后去 Actions 页面点一次 "Run workflow" 手动测试。
) else (
  echo.
  echo [x] 推送失败。常见原因：
  echo   - 仓库地址填错
  echo   - 没有登录 GitHub（再运行一次，登录窗口会弹出）
  echo   - 仓库不是空的（必须新建空仓库）
)
echo.
pause
