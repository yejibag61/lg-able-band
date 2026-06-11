@echo off
setlocal

for %%P in (8080 5173 5174 8000 8001 8002 8003) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%A /F >nul 2>&1
  )
)

echo Attempted to stop Able Band servers.
