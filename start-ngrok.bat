@echo off
setlocal
cd /d "%~dp0"

set "NGROK_BIN="

if exist "%~dp0ngrok.exe" (
  set "NGROK_BIN=%~dp0ngrok.exe"
)

if not defined NGROK_BIN (
  if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" (
    set "NGROK_BIN=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
  )
)

if not defined NGROK_BIN (
  where ngrok >nul 2>&1
  if not errorlevel 1 (
    set "NGROK_BIN=ngrok"
  )
)

if not defined NGROK_BIN (
  echo [WARN] ngrok executable was not found.
  echo        Install ngrok and add it to PATH, or place ngrok.exe in the repo root.
  exit /b 0
)

powershell -NoProfile -Command "if (Get-Process ngrok -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  start "LGABLEBAND_NGROK_APP" cmd /k "cd /d ""%~dp0"" && ""%NGROK_BIN%"" http http://localhost:5173"
  echo [OK] ngrok is starting for FE/app.
  echo      After it opens, check the HTTPS forwarding URL at http://127.0.0.1:4040
) else (
  echo [SKIP] ngrok is already running.
)

exit /b
