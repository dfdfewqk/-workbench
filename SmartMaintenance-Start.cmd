@echo off
setlocal
cd /d "%~dp0"
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo Windows PowerShell is required.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
if errorlevel 1 pause
