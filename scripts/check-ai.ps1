# IceFlow — verify Ollama / Llama is ready for Ashok
$ErrorActionPreference = "Continue"
$url = "http://127.0.0.1:11434"
$model = "llama3.2"

# Read from .env if present
$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) "backend\.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*OLLAMA_URL=(.+)$') { $url = $Matches[1].Trim().Trim('"') }
    if ($_ -match '^\s*OLLAMA_MODEL=(.+)$') { $model = $Matches[1].Trim().Trim('"') }
  }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  IceFlow — Check built-in AI (Ollama)"
Write-Host "========================================"
Write-Host "URL:   $url"
Write-Host "Model: $model"
Write-Host ""

try {
  $tags = Invoke-RestMethod -Uri "$url/api/tags" -TimeoutSec 3
  Write-Host "[OK] Ollama is running" -ForegroundColor Green
  $names = @($tags.models | ForEach-Object { $_.name })
  if ($names.Count -eq 0) {
    Write-Host "[WARN] No models yet. Run: ollama pull $model" -ForegroundColor Yellow
  } else {
    Write-Host "Models: $($names -join ', ')"
    $hit = $names | Where-Object { $_ -like "$model*" -or $_ -like "$model`:*" }
    if ($hit) {
      Write-Host "[OK] Model '$model' found — Ashok can use live DB + LLM" -ForegroundColor Green
    } else {
      Write-Host "[WARN] '$model' not found. Run: ollama pull $model" -ForegroundColor Yellow
    }
  }
} catch {
  Write-Host "[FAIL] Ollama not reachable at $url" -ForegroundColor Red
  Write-Host ""
  Write-Host "On your laptop:"
  Write-Host "  1. Install https://ollama.com"
  Write-Host "  2. ollama pull $model"
  Write-Host "  3. Keep Ollama running, then re-run check-ai.bat"
  Write-Host ""
  Write-Host "Without Ollama, Ashok still answers from the live database (simpler replies)."
  exit 1
}

Write-Host ""
Write-Host "Ashok chat uses LIVE IceFlow database — not canned prompts."
Write-Host ""
