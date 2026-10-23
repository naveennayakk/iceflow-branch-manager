# IceFlow — paste Supabase URI into backend/.env and sync DB
param(
  [string]$DatabaseUrl = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "========================================"
Write-Host "  IceFlow — Attach YOUR Supabase DB"
Write-Host "========================================"
Write-Host ""
Write-Host "1. Open https://supabase.com -> project -> Connect"
Write-Host "2. Copy Session pooler URI (port 5432)"
Write-Host "3. Paste below"
Write-Host ""

if (-not $DatabaseUrl) {
  $DatabaseUrl = Read-Host "Paste DATABASE_URL"
}

$DatabaseUrl = $DatabaseUrl.Trim().Trim('"').Trim("'")
if (-not $DatabaseUrl) {
  Write-Host "[ERROR] Empty URL. Nothing saved." -ForegroundColor Red
  exit 1
}

if ($DatabaseUrl -notmatch "sslmode=") {
  if ($DatabaseUrl -match "\?") {
    $DatabaseUrl = "$DatabaseUrl&sslmode=require"
  } else {
    $DatabaseUrl = "$DatabaseUrl?sslmode=require"
  }
}

$envPath = Join-Path $root "backend\.env"
$template = Join-Path $root "backend\.env.paste-template"
if (-not (Test-Path $envPath)) {
  if (Test-Path $template) {
    Copy-Item $template $envPath
  } else {
    Write-Host "[ERROR] backend\.env missing" -ForegroundColor Red
    exit 1
  }
}

$lines = Get-Content $envPath
$out = @()
$hasDb = $false
$hasDirect = $false
foreach ($line in $lines) {
  if ($line -match '^\s*DATABASE_URL=') {
    $out += "DATABASE_URL=`"$DatabaseUrl`""
    $hasDb = $true
  } elseif ($line -match '^\s*DIRECT_URL=') {
    $out += "DIRECT_URL=`"$DatabaseUrl`""
    $hasDirect = $true
  } else {
    $out += $line
  }
}
if (-not $hasDb) { $out = @("DATABASE_URL=`"$DatabaseUrl`"") + $out }
if (-not $hasDirect) { $out = @("DIRECT_URL=`"$DatabaseUrl`"") + $out }

Set-Content -Path $envPath -Value $out -Encoding UTF8
Write-Host "Saved DATABASE_URL + DIRECT_URL in backend\.env" -ForegroundColor Green

Write-Host ""
Write-Host "Syncing schema + seed..."
npm run db:generate -w backend
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed — close running IceFlow first" }
npm run db:push -w backend
if ($LASTEXITCODE -ne 0) { throw "db push failed — check Supabase password/URI" }
npm run db:seed -w backend

$dataDir = Join-Path $root "data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
Set-Content -Path (Join-Path $dataDir "pg-ready.flag") -Value "supabase-attached"

Write-Host ""
Write-Host "========================================"
Write-Host "  DONE — Supabase attached"
Write-Host "========================================"
Write-Host "Next: start-iceflow.bat"
Write-Host "AI later: install Ollama, then check-ai.bat"
Write-Host ""
