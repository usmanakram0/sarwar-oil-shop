@echo off
setlocal

set "TASK_NAME=OilShop Print Bridge"

echo Removing scheduled task: %TASK_NAME%
echo.

schtasks /Delete /TN "%TASK_NAME%" /F

if errorlevel 1 (
  echo Task was not found or could not be removed.
  pause
  exit /b 1
)

echo Scheduled task removed.
pause
