# Starts Life OS on http://127.0.0.1:3020 and opens it in the browser.
#   .\start.ps1                                   # local only
#   .\start.ps1 -HostAddress 0.0.0.0 -AccessToken "long-random-token"   # phone via Tailscale
param(
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 3020,
  [string]$AccessToken = "",
  [string]$AgentOsUrl = "http://127.0.0.1:3001",
  [string]$AgentOsToken = ""
)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 20+ krävs. Installera från https://nodejs.org och försök igen."
}
$env:LIFE_OS_HOST = $HostAddress
$env:LIFE_OS_PORT = "$Port"
$env:LIFE_OS_TOKEN = $AccessToken
$env:AGENT_OS_URL = $AgentOsUrl
$env:AGENT_OS_TOKEN = $AgentOsToken
$url = "http://127.0.0.1:$Port"
Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 1; Start-Process $u } -ArgumentList $url | Out-Null
node server.mjs
