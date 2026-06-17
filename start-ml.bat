@echo off
setlocal
cd /d "%~dp0"

set "INFO_AGENT_PYTHON=python"
if exist "%USERPROFILE%\anaconda3\python.exe" set "INFO_AGENT_PYTHON=%USERPROFILE%\anaconda3\python.exe"

call :start_if_unhealthy 8000 /health LGABLEBAND_CONTEXT_AI "cd /d ""%~dp0ML\context"" && python server.py"
call :start_if_unhealthy 8001 /health LGABLEBAND_WARNING_AI "cd /d ""%~dp0ML\warning"" && python server.py"
call :start_if_unhealthy 8002 /health LGABLEBAND_SOUND_CHATBOT "cd /d ""%~dp0ML\sound_chatbot"" && python server.py"
call :start_if_unhealthy 8004 /health LGABLEBAND_INFO_AGENT "cd /d ""%~dp0"" && ""%INFO_AGENT_PYTHON%"" -m ML.info_agent.info_agent_server"
call :start_if_unhealthy 8003 /health LGABLEBAND_EMERGENCY_AI "cd /d ""%~dp0ML\emergency"" && python server.py"
exit /b

:start_if_unhealthy
set "TARGET_PORT=%~1"
set "TARGET_PATH=%~2"
set "TARGET_NAME=%~3"
set "TARGET_CMD=%~4"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%TARGET_PORT%%TARGET_PATH%'; try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; if (Get-NetTCPConnection -State Listen -LocalPort %TARGET_PORT% -ErrorAction SilentlyContinue) { exit 2 }; exit 1"
if errorlevel 2 (
  echo [WARN] %TARGET_NAME% port %TARGET_PORT% is already in use but health check failed.
  echo        Close the stale window/process for port %TARGET_PORT%, then run start-ml.bat again.
) else if errorlevel 1 (
  start "%TARGET_NAME%" cmd /k "%TARGET_CMD%"
) else (
  echo [SKIP] %TARGET_NAME% is already healthy on port %TARGET_PORT%.
)
exit /b
