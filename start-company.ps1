# Agent OS + Revenue OS — safe Windows company launcher
# Starts the local Agent OS and Revenue OS, verifies both services, then enables
# bounded INTERNAL Revenue OS automation. It never enables outreach, publishing,
# spending, banking, legal acceptance, refunds, or other external actions.

param(
  [string]$RepoPath = "",
  [int]$AutomationDailyLimit = 4,
  [switch]$SkipGitPull,
  [switch]$DoNotOpenDashboard
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "`n>> $Message" -ForegroundColor Cyan
}

function Test-TcpPort([int]$Port) {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(1500, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds, [string]$Name) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -Port $Port) {
      Write-Host "   [OK] $Name is listening on port $Port." -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "$Name did not become reachable on port $Port within $TimeoutSeconds seconds."
}

function Resolve-AgentOsRepo([string]$RequestedPath) {
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) { $candidates += $RequestedPath }
  if ($PSScriptRoot) { $candidates += $PSScriptRoot }
  $candidates += @(
    'F:\Agent-OS',
    'F:\Agent-OS-main',
    'F:\AgentOS',
    'D:\Agent-OS',
    'D:\Agent-OS-main (1)\Agent-OS-main',
    'D:\AgenticOS'
  )

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $resolved = $null
    try { $resolved = (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).Path } catch { continue }
    if ((Test-Path -LiteralPath (Join-Path $resolved 'package.json')) -and
        (Test-Path -LiteralPath (Join-Path $resolved 'start.ps1')) -and
        (Test-Path -LiteralPath (Join-Path $resolved 'revenue-os\start.ps1'))) {
      return $resolved
    }
  }

  throw 'Could not find an Agent-OS repository containing package.json, start.ps1 and revenue-os\start.ps1. Supply -RepoPath with the exact local path.'
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 20 or newer is required.'
}

$major = [int]((node --version).Trim().TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw "Node.js 20 or newer is required; found $(node --version)." }

$repo = Resolve-AgentOsRepo -RequestedPath $RepoPath
$revenue = Join-Path $repo 'revenue-os'
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDir "company-start-$stamp.log"

try { Start-Transcript -Path $logPath -Append | Out-Null } catch {}

try {
  Write-Step "Using Agent OS repository: $repo"

  if (-not $SkipGitPull) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
      throw 'Git was not found. Re-run with -SkipGitPull only when the repository is already current.'
    }
    Write-Step 'Fast-forwarding the local repository to origin/main'
    Push-Location $repo
    try {
      git fetch origin main
      if ($LASTEXITCODE -ne 0) { throw 'git fetch origin main failed.' }
      git checkout main
      if ($LASTEXITCODE -ne 0) { throw 'git checkout main failed.' }
      git pull --ff-only origin main
      if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only origin main failed; local changes were not overwritten.' }
    } finally {
      Pop-Location
    }
  }

  if (-not (Test-TcpPort -Port 3001)) {
    Write-Step 'Starting Agent OS on port 3001'
    Start-Process powershell.exe -WorkingDirectory $repo -ArgumentList @(
      '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repo 'start.ps1')
    ) | Out-Null
  } else {
    Write-Step 'Agent OS is already listening on port 3001; reusing it'
  }
  Wait-ForPort -Port 3001 -TimeoutSeconds 180 -Name 'Agent OS'

  if (-not (Test-TcpPort -Port 3010)) {
    Write-Step 'Starting Revenue OS on port 3010'
    Start-Process powershell.exe -WorkingDirectory $revenue -ArgumentList @(
      '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $revenue 'start.ps1')
    ) | Out-Null
  } else {
    Write-Step 'Revenue OS is already listening on port 3010; reusing it'
  }
  Wait-ForPort -Port 3010 -TimeoutSeconds 60 -Name 'Revenue OS'

  Write-Step 'Checking Revenue OS health'
  $health = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3010/api/health' -TimeoutSec 10
  if (-not $health.ok) { throw 'Revenue OS health endpoint did not return ok=true.' }

  $limit = [Math]::Max(1, [Math]::Min(24, $AutomationDailyLimit))
  Write-Step "Enabling bounded internal automation (daily limit: $limit)"
  $body = @{ enabled = $true; dailyRunLimit = $limit } | ConvertTo-Json
  $automation = Invoke-RestMethod -Method Patch -Uri 'http://127.0.0.1:3010/api/automation' -ContentType 'application/json' -Body $body -TimeoutSec 15
  if (-not $automation.automation.enabled) { throw 'Revenue OS did not confirm that internal automation was enabled.' }
  if ($automation.automation.allowExternalActions) { throw 'Safety failure: external automation must remain disabled.' }

  Write-Host @"

COMPANY RUNTIME STARTED
- Agent OS:   http://127.0.0.1:3001
- Revenue OS: http://127.0.0.1:3010
- Internal automation: ENABLED, limit $limit attempts/day
- External actions: DISABLED
- Log: $logPath
"@ -ForegroundColor Green

  if (-not $DoNotOpenDashboard) {
    Start-Process 'http://127.0.0.1:3010'
  }
} finally {
  try { Stop-Transcript | Out-Null } catch {}
}
