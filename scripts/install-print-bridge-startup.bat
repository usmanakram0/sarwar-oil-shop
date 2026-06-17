@echo off
setlocal

set "TASK_NAME=OilShop Print Bridge"
set "SCRIPT_PATH=%~dp0start-print-bridge.bat"

echo Creating Windows scheduled task: %TASK_NAME%
echo.
echo This runs once. After that, the print bridge starts automatically
echo every time you sign in to Windows.
echo.

schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "\"%SCRIPT_PATH%\" auto" ^
  /SC ONLOGON ^
  /RL LIMITED ^
  /F

if errorlevel 1 (
  echo.
  echo Could not create the scheduled task.
  echo Try right-clicking this file and choosing "Run as administrator".
  pause
  exit /b 1
)

echo.
echo Done. Scheduled task installed successfully.
echo.
echo To remove it later, run:
echo   schtasks /Delete /TN "%TASK_NAME%" /F
echo.
pause
