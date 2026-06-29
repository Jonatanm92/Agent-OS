# Agent OS — Windows launcher (PowerShell)
# Starts the Free Claude Code proxy and the Agent OS dashboard in their own
# windows, then opens the dashboard in your browser.
#
# Run from the repo root:   powershell -ExecutionPolicy Bypass -File .\start.ps1

$ErrorActionPreference = 'Continue'
function Say($m) { Write-Host "`n>> $m" -ForegroundColor Cyan }

# 1. Free Claude Code proxy (its own window so you can see logs / the Admin URL)
Say "Starting Free Claude Code proxy (fcc-server)..."
if (Get-Command fcc-server -ErrorAction SilentlyContinue) {
  Start-Process powershell -ArgumentList '-NoExit','-Command','fcc-server'
} else {
  Write-Host "   [!] fcc-server not found. Run setup.ps1 first (and reopen PowerShell)." -ForegroundColor Yellow
}

# Give the proxy a few seconds to bind before the dashboard probes it
Start-Sleep -Seconds 8

# 2. Agent OS dashboard
Say "Starting Agent OS dashboard (npm start)..."
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd `"$here`"; npm start"

# 3. Open the dashboard
Start-Sleep -Seconds 5
Say "Opening the dashboard..."
Start-Process "http://127.0.0.1:3001"

Write-Host @"

  Two PowerShell windows just opened:
    - Free Claude Code  ->  watch for 'Admin UI: http://127.0.0.1:8082/admin'
    - Agent OS          ->  serving http://127.0.0.1:3001

  Keep both windows open while you work. Close them to stop the servers.
"@ -ForegroundColor Green
