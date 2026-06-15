@echo off
setlocal
cd /d "%~dp0"

call :start_if_free 5173 LGABLEBAND_FE_APP "cd /d ""%~dp0FE\app"" && npm run dev"
call :start_if_free 5174 LGABLEBAND_FE_WEARABLE "cd /d ""%~dp0FE\wearable"" && npm run dev"
exit /b

:start_if_free
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  start "%~2" cmd /k "%~3"
) else (
  echo [SKIP] %~2 is already running on port %1.
)
exit /b
