@echo off
setlocal
cd /d "%~dp0"
call "%~dp0start-be.bat"
call :wait_for_http 8080 /api/db/status LGABLEBAND_BE
call "%~dp0start-fe.bat"
call "%~dp0start-ml.bat"
echo Able Band server start checks completed.
exit /b

:wait_for_http
set "TARGET_PORT=%~1"
set "TARGET_PATH=%~2"
set "TARGET_NAME=%~3"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(60); $url='http://localhost:%TARGET_PORT%%TARGET_PATH%'; while ((Get-Date) -lt $deadline) { try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Milliseconds 1000 }; exit 1"
if errorlevel 1 (
  echo [WARN] %TARGET_NAME% did not become ready on port %TARGET_PORT%.
  echo        Keep the backend window open, check its error log, then refresh the FE.
) else (
  echo [OK] %TARGET_NAME% is ready on port %TARGET_PORT%.
)
exit /b
