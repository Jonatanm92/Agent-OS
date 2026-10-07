# Startar Anbudskollen lokalt på Windows: http://localhost:3020
# Kör från mappen anbudskollen:  powershell -ExecutionPolicy Bypass -File .\start.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js saknas. Installera Node 22 LTS från https://nodejs.org och kör igen." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Skapade .env – fyll i ANTHROPIC_API_KEY och ADMIN_TOKEN för full funktion." -ForegroundColor Yellow
}
if (-not (Test-Path "node_modules")) { npm ci }
Start-Process "http://localhost:3020"
node src/server.mjs
