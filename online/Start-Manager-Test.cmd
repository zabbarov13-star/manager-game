@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 is required on the host computer.
  pause
  exit /b 1
)
node home-start.cjs
if errorlevel 1 pause
