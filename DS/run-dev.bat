@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo [INFO] node_modules not found. Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist node_modules\.bin\vite.cmd (
  echo [INFO] Vite not found. Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist node_modules\.bin\vite.cmd (
  echo [ERROR] vite.cmd not found in node_modules\.bin
  echo [HINT] Run npm.cmd install manually in this folder.
  pause
  exit /b 1
)

echo [INFO] Starting DS server on port 5175...
call npm.cmd run dev -- --host 0.0.0.0 --port 5175 --strictPort
