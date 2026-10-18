@echo off
title OPPO Remote Control Relay Server
cd /d "%~dp0server-dashboard"
echo ========================================================
echo   OPPO REMOTE CONTROL RELAY SERVER (ColorOS Pro)
echo ========================================================
echo.
echo Installing dependencies if needed...
call npm install --no-audit
echo.
echo Starting Server...
node server.js
pause
