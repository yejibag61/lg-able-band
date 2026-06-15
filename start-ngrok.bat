@echo off
setlocal
cd /d "%~dp0"

set "TARGET_PORT=%~1"
set "TARGET_NAME=%~2"

if not defined TARGET_PORT set "TARGET_PORT=5173"
if not defined TARGET_NAME set "TARGET_NAME=FE/app"

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
    for /f "delims=" %%I in ('where ngrok 2^>nul') do if not defined NGROK_BIN set "NGROK_BIN=%%I"
  )
)

if not defined NGROK_BIN (
  echo [WARN] ngrok executable was not found.
  echo        Install ngrok and add it to PATH, or place ngrok.exe in the repo root.
  exit /b 0
)

call :wait_for_target
if errorlevel 1 exit /b 1

powershell -NoProfile -Command "Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force"
start "LGABLEBAND_NGROK" /D "%~dp0" cmd /k ""%NGROK_BIN%" http http://127.0.0.1:%TARGET_PORT% --log=stdout"
echo [OK] ngrok is starting for %TARGET_NAME%.
echo      Check the HTTPS forwarding URL at http://127.0.0.1:4040
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(10); while ((Get-Date) -lt $deadline) { try { $t=(Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 1).tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1; if ($t.public_url) { Write-Host ('[URL] ' + $t.public_url); exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; Write-Host '[WARN] ngrok URL is not ready yet. Open http://127.0.0.1:4040'; exit 0"

exit /b

:wait_for_target
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(60); $url='http://127.0.0.1:%TARGET_PORT%/'; while ((Get-Date) -lt $deadline) { try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Milliseconds 1000 }; exit 1"
if errorlevel 1 (
  echo [WARN] %TARGET_NAME% is not ready on port %TARGET_PORT%.
  echo        Keep the FE window open, check its error log, then run this ngrok script again.
  exit /b 1
)
echo [OK] %TARGET_NAME% is ready on port %TARGET_PORT%.
exit /b 0
