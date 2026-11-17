@echo off
title Knock - close this window to stop the game server
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js not found. Install it from https://nodejs.org and try again. & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies... & call npm install || (pause & exit /b 1))
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173"
echo Game running at http://localhost:5173  -  close this window to stop.
node server.js
if errorlevel 1 pause
