@echo off
cd /d "%~dp0"
title 黄金研究台 - 邮箱配置
node scripts\setup-mail.mjs
echo.
pause
