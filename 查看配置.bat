@echo off
cd /d "%~dp0"
title 查看要填进 GitHub Secrets 的值

echo ============================================================
echo   把下面 4 组值，填进 GitHub 仓库的 Secrets
echo ============================================================
echo.

node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('secrets.json','utf8')).deepseek;const c=JSON.parse(fs.readFileSync('config.json','utf8'));const out=(k,v)=>{console.log('--- '+k+' ---');console.log(v);console.log('');};out('DEEPSEEK_API_KEY', s.apiKey);out('QQ_USER', c.email.user);out('QQ_AUTH_CODE', c.email.authCode);out('QQ_TO', c.email.to);"

echo ============================================================
echo   填完之后，关掉这个窗口
echo ============================================================
pause
