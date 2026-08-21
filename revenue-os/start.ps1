param(
  [int]$Port = 3010,
  [string]$HostAddress = "127.0.0.1",
  [string]$AccessToken = "",
  [string]$AgentOsUrl = "http://127.0.0.1:3001",
  [string]$AgentOsToken = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20 or newer is required."
}

if ($HostAddress -ne "127.0.0.1" -and [string]::IsNullOrWhiteSpace($AccessToken)) {
  throw "A non-local bind requires -AccessToken. Example: .\start.ps1 -HostAddress 0.0.0.0 -AccessToken 'use-a-long-random-token'"
}

$env:REVENUE_OS_PORT = "$Port"
$env:REVENUE_OS_HOST = $HostAddress
$env:AGENT_OS_URL = $AgentOsUrl

if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
  $env:REVENUE_OS_TOKEN = $AccessToken
}
if (-not [string]::IsNullOrWhiteSpace($AgentOsToken)) {
  $env:AGENT_OS_TOKEN = $AgentOsToken
}

Set-Location $PSScriptRoot
node .\server.mjs
