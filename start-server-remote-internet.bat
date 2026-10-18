@echo off
title OPPO Remote Control - Ket Noi Tu Xa Qua Internet (4G/5G)
cd /d "%~dp0server-dashboard"

echo ===============================================================
echo   OPPO REMOTE CONTROL - CHE DO KET NOI TU XA (INTERNET / 4G)
echo ===============================================================
echo.

:: 1. Khoi dong server local neu chua chay
start "OPPO Relay Server" /min cmd.exe /c "node server.js"

echo Dang thiet lap duong truyen Cloudflare Tunnel bao mat...
echo Vui long doi vai giay de he thong tao duong link ket noi...
echo.

node start_tunnel.js
pause
