@echo off
setlocal

cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if /I "%~1"=="auto" (
  start "Oil Shop Print Bridge" /MIN cmd /k node scripts\print-bridge.mjs
  exit /b 0
)

echo.
echo Oil Shop Print Bridge
echo =====================
echo Keep this window open while printing receipts.
echo Close it only when the shop day is finished.
echo.

node scripts\print-bridge.mjs

if errorlevel 1 (
  echo.
  echo Print bridge stopped with an error.
  pause
)
