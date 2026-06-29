# Agent OS — Windows launcher (PowerShell)
# Rebuilds the app, stops any old dashboard server, then starts the Free Claude
# Code proxy and the Agent OS dashboard, and opens the dashboard in your browser.
#
# Run from the repo root:   powershell -ExecutionPolicy Bypass -File .\start.ps1

$ErrorActionPreference = 'Continue'
function Say($m) { Write-Host "`n>> $m" -ForegroundColor Cyan }
$here = $PSScriptRoot
if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }

# 0. Stop any previous Agent OS dashboard server (so we never serve stale code) -
Say "Stopping any previous Agent OS dashboard..."
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*server\dist\index.js*' } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }

# 1. ALWAYS rebuild so the running code matches the source you have ------------
Say "Building the latest code (this is what makes 'git pull' take effect)..."
Push-Location $here
npm run build
Pop-Location

# 2. Free Claude Code proxy (only start one if it isn't already responding) -----
Say "Starting Free Claude Code proxy (fcc-server)..."
$fccUp = $false
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8082/admin' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
  if ($r.StatusCode -eq 200) { $fccUp = $true }
} catch { $fccUp = $false }

if ($fccUp) {
  Say "FCC already running on http://127.0.0.1:8082 — reusing it."
} elseif (Get-Command fcc-server -ErrorAction SilentlyContinue) {
  Start-Process powershell -ArgumentList '-NoExit','-Command','fcc-server'
  Start-Sleep -Seconds 8
} else {
  Write-Host "   [!] fcc-server not found. Run setup.ps1 first (and reopen PowerShell)." -ForegroundColor Yellow
}

# 3. Agent OS dashboard --------------------------------------------------------
Say "Starting Agent OS dashboard (npm start)..."
Start-Process powershell -WorkingDirectory $here -ArgumentList '-NoExit','-Command','npm start'

# 4. Open the dashboard --------------------------------------------------------
Start-Sleep -Seconds 5
Say "Opening the dashboard..."
Start-Process "http://127.0.0.1:3001"

Write-Host @"

  Done. If a browser tab was already open, press Ctrl+F5 to hard-refresh.
  Keep the two PowerShell windows open while you work; close them to stop the servers.
"@ -ForegroundColor Green
