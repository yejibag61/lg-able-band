@echo off
setlocal
cd /d "%~dp0"

set "ML_PYTHON=C:\Users\lab4dx\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%ML_PYTHON%" set "ML_PYTHON=python"

call :start_and_wait 8000 /health LGABLEBAND_CONTEXT_AI "%~dp0ML\context" """%ML_PYTHON%"" server.py"
if errorlevel 1 exit /b %errorlevel%
call :start_and_wait 8001 /health LGABLEBAND_WARNING_AI "%~dp0ML\warning" """%ML_PYTHON%"" server.py"
if errorlevel 1 exit /b %errorlevel%
call :start_and_wait 8002 /health LGABLEBAND_SOUND_CHATBOT "%~dp0ML\sound_chatbot" """%ML_PYTHON%"" server.py"
if errorlevel 1 exit /b %errorlevel%
call :start_and_wait 8004 /health LGABLEBAND_INFO_AGENT "%~dp0" """%ML_PYTHON%"" -m ML.info_agent.info_agent_server"
if errorlevel 1 exit /b %errorlevel%
call :start_and_wait 8003 /health LGABLEBAND_EMERGENCY_AI "%~dp0ML\emergency" """%ML_PYTHON%"" server.py"
if errorlevel 1 exit /b %errorlevel%
exit /b

:start_and_wait
set "TARGET_PORT=%~1"
set "TARGET_PATH=%~2"
set "TARGET_NAME=%~3"
set "TARGET_DIR=%~4"
set "TARGET_CMD=%~5"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%TARGET_PORT%%TARGET_PATH%'; try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; if (Get-NetTCPConnection -State Listen -LocalPort %TARGET_PORT% -ErrorAction SilentlyContinue) { exit 2 }; exit 1"
if errorlevel 2 (
  echo [RESTART] %TARGET_NAME% port %TARGET_PORT% is in use but health check failed.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=%TARGET_PORT%; $listeners=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue; if ($listeners) { $owners=@(); foreach ($listener in @($listeners)) { if ($owners -notcontains $listener.OwningProcess) { $owners += $listener.OwningProcess } }; foreach ($owner in $owners) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue } }; $deadline=(Get-Date).AddSeconds(10); while ((Get-Date) -lt $deadline) { if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { exit 0 }; Start-Sleep -Milliseconds 300 }; exit 1"
  if errorlevel 1 (
    echo [WARN] %TARGET_NAME% could not release port %TARGET_PORT%.
    exit /b 1
  )
  start "%TARGET_NAME%" /D "%TARGET_DIR%" cmd /k "%TARGET_CMD%"
) else if errorlevel 1 (
  start "%TARGET_NAME%" /D "%TARGET_DIR%" cmd /k "%TARGET_CMD%"
) else (
  echo [SKIP] %TARGET_NAME% is already healthy on port %TARGET_PORT%.
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(60); $url='http://127.0.0.1:%TARGET_PORT%%TARGET_PATH%'; while ((Get-Date) -lt $deadline) { try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Milliseconds 1000 }; exit 1"
if errorlevel 1 (
  echo [WARN] %TARGET_NAME% did not become healthy on port %TARGET_PORT%.
  echo        Check the %TARGET_NAME% window for the Python error.
  exit /b 1
)
echo [OK] %TARGET_NAME% is healthy on port %TARGET_PORT%.
exit /b
