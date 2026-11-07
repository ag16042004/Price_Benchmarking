@echo off
REM One-click start for Windows: creates backend\.env if missing, installs packages once, starts the backend and the frontend, opens the browser.
REM Double-click this file, or run it from the casper folder.
setlocal
cd /d "%~dp0"

if not exist backend\.env (
  copy .env.demo.example backend\.env >nul
  echo Created backend\.env from .env.demo.example
)

if not exist backend\node_modules (
  echo Installing backend packages ^(first time only, can take several minutes on a slow connection^)...
  pushd backend
  call npm install --no-audit --no-fund --prefer-offline
  popd
)
if not exist frontend\node_modules (
  echo Installing frontend packages ^(first time only^)...
  pushd frontend
  call npm install --no-audit --no-fund --prefer-offline
  popd
)

start "CASPER backend" cmd /k "cd /d %~dp0backend && npm run dev"
start "CASPER frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Waiting for the servers to start...
timeout /t 10 >nul
start http://localhost:5173
echo.
echo CASPER is starting in two new windows. Close those windows to stop it.
echo To check the setup, open a terminal in the backend folder and run:  npm run doctor
endlocal
