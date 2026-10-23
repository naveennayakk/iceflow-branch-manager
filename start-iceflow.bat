@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title IceFlow Branch Manager - Starting

echo.
echo ========================================
echo   IceFlow Branch Manager - START
echo ========================================
echo.
echo  On YOUR laptop later:
echo    1. attach-supabase.bat   ^(paste Supabase URL^)
echo    2. check-ai.bat          ^(after installing Ollama^)
echo    3. See PASTE-ON-MY-LAPTOP.md
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install Node.js 20+ from https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  if exist "backend\.env.paste-template" (
    copy /Y "backend\.env.paste-template" "backend\.env" >nul
    echo [!] Created backend\.env from paste template.
    echo     Run attach-supabase.bat first to paste your Supabase URL.
    pause
    exit /b 1
  )
)

findstr /C:"PASTE_SUPABASE" "backend\.env" >nul 2>&1
if not errorlevel 1 (
  echo [!] DATABASE_URL still has PASTE_SUPABASE placeholder.
  echo     Run attach-supabase.bat and paste your Supabase connection string.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/4] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [1/4] Dependencies already installed.
)

echo [2/4] Database...
findstr /C:"localhost:5432" "backend\.env" >nul 2>&1
if not errorlevel 1 (
  where docker >nul 2>&1
  if not errorlevel 1 (
    docker compose up -d >nul 2>&1
    echo       Local Docker Postgres ^(dev only^). Prefer Supabase on your laptop.
  ) else (
    echo [!] .env points to localhost Postgres but Docker was not found.
    echo     On your laptop: run attach-supabase.bat
    pause
    exit /b 1
  )
) else (
  echo       Using DATABASE_URL from backend\.env ^(Supabase / remote^)
)

echo [3/4] Syncing schema...
call npm run db:generate -w backend
if errorlevel 1 (
  echo [ERROR] prisma generate failed. Close other IceFlow windows and retry.
  pause
  exit /b 1
)
call npm run db:push -w backend
if errorlevel 1 (
  echo [ERROR] Database push failed.
  echo         Fix URI with attach-supabase.bat  or see PASTE-ON-MY-LAPTOP.md
  pause
  exit /b 1
)

if not exist "data\pg-ready.flag" (
  echo       First run — seeding demo users + items...
  call npm run db:seed -w backend
  if not errorlevel 1 (
    if not exist "data\" mkdir data
    echo seeded> "data\pg-ready.flag"
  )
) else if "%ICEFLOW_SEED%"=="1" (
  echo       Force re-seed...
  call npm run db:seed -w backend
)

echo [4/4] Starting API + Web...
echo.
echo   UI:  http://localhost:5173
echo   API: http://localhost:4000
echo.
echo   Login: mainadmin@iceflow.app / IceFlow@Main2026
echo          madhapur@iceflow.app  / Branch@007
echo.
echo Keep this window open. Use stop-iceflow.bat to stop.
echo ========================================
echo.

call npm run dev
