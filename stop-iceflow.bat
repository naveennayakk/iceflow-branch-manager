@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title IceFlow Branch Manager - Stopping

echo.
echo ========================================
echo   IceFlow Branch Manager - STOP
echo ========================================
echo.

echo Stopping API (4000) and Web (5173)...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = 4000,5173; foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('Stopping PID ' + $_.OwningProcess + ' on port ' + $p); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Get-CimInstance Win32_Process -Filter \"name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'vite|tsx watch|concurrently|iceflow-branch-manager') } | ForEach-Object { Write-Host ('Stopping node PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo.
echo Done. IceFlow should be stopped.
echo You can close any leftover "npm run dev" window if it is still open.
echo ========================================
echo.
pause
