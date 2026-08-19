[CmdletBinding()]
param(
  [ValidateSet('preflight', 'status', 'start')]
  [string]$Action = 'preflight',

  [string]$PaperclipUrl = 'http://127.0.0.1:3100',
  [string]$AgentOsUrl = 'http://127.0.0.1:3001',
  [string]$HermesGatewayUrl = 'http://127.0.0.1:9119',

  [switch]$OpenDashboards,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogDir = Join-Path $RepoRoot '.company-runtime'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Resolve-SandboxImage {
  param(
    [Parameter(Mandatory)] [string]$EnvironmentVariable,
    [Parameter(Mandatory)] [string]$Fallback
  )

  $candidate = [Environment]::GetEnvironmentVariable($EnvironmentVariable)
  $image = if ([string]::IsNullOrWhiteSpace($candidate)) { $Fallback } else { $candidate.Trim() }
  if (
    $image.Length -gt 255 -or
    $image.StartsWith('-') -or
    $image.Contains('..') -or
    $image -notmatch '^[A-Za-z0-9][A-Za-z0-9._/:@-]*$'
  ) {
    throw "Unsafe sandbox image configured in $EnvironmentVariable."
  }
  return $image
}

$NodeSandboxImage = Resolve-SandboxImage `
  -EnvironmentVariable 'AGENT_OS_NODE_SANDBOX_IMAGE' `
  -Fallback 'node:22-bookworm-slim'
$PythonSandboxImage = Resolve-SandboxImage `
  -EnvironmentVariable 'AGENT_OS_PYTHON_SANDBOX_IMAGE' `
  -Fallback 'python:3.12-slim'

function Get-ToolStatus {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [string[]]$VersionArguments = @('--version'),
    [bool]$Required = $false
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) {
    return [pscustomobject]@{
      kind = 'tool'
      name = $Name
      required = $Required
      ok = $false
      path = $null
      version = $null
      detail = 'not found on PATH'
    }
  }

  $version = $null
  try {
    $version = (& $command.Source @VersionArguments 2>$null | Select-Object -First 1)
    if ($null -ne $version) { $version = [string]$version }
  } catch {
    $version = $null
  }

  [pscustomobject]@{
    kind = 'tool'
    name = $Name
    required = $Required
    ok = $true
    path = $command.Source
    version = $version
    detail = 'available'
  }
}

function Get-DockerEngineStatus {
  $docker = Get-Command 'docker' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $docker) {
    return [pscustomobject]@{
      kind = 'runtime'
      name = 'Docker engine'
      required = $true
      ok = $false
      detail = 'Docker CLI is not installed.'
    }
  }

  try {
    $output = & $docker.Source version --format '{{.Server.Version}}' 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      return [pscustomobject]@{
        kind = 'runtime'
        name = 'Docker engine'
        required = $true
        ok = $false
        detail = (($output | Out-String).Trim() -replace '\s+', ' ')
      }
    }
    return [pscustomobject]@{
      kind = 'runtime'
      name = 'Docker engine'
      required = $true
      ok = $true
      detail = "server $((($output | Select-Object -First 1) | Out-String).Trim())"
    }
  } catch {
    return [pscustomobject]@{
      kind = 'runtime'
      name = 'Docker engine'
      required = $true
      ok = $false
      detail = $_.Exception.Message
    }
  }
}

function Get-DockerImageStatus {
  param([Parameter(Mandatory)] [string]$Image)

  $docker = Get-Command 'docker' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $docker) {
    return [pscustomobject]@{
      kind = 'image'
      name = "Sandbox image: $Image"
      required = $true
      ok = $false
      detail = 'Docker CLI is not installed.'
    }
  }

  try {
    & $docker.Source image inspect $Image *> $null
    $available = $LASTEXITCODE -eq 0
    return [pscustomobject]@{
      kind = 'image'
      name = "Sandbox image: $Image"
      required = $true
      ok = $available
      detail = if ($available) {
        'present locally; automatic pulls disabled'
      } else {
        "missing; review and run: docker pull $Image"
      }
    }
  } catch {
    return [pscustomobject]@{
      kind = 'image'
      name = "Sandbox image: $Image"
      required = $true
      ok = $false
      detail = $_.Exception.Message
    }
  }
}

function Test-Endpoint {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string]$Url,
    [bool]$Required = $false,
    [int]$TimeoutSec = 3
  )

  $started = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -TimeoutSec $TimeoutSec
    $started.Stop()
    return [pscustomobject]@{
      kind = 'endpoint'
      name = $Name
      required = $Required
      ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
      url = $Url
      latencyMs = [math]::Round($started.Elapsed.TotalMilliseconds)
      statusCode = [int]$response.StatusCode
      detail = 'reachable'
    }
  } catch {
    $started.Stop()
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    return [pscustomobject]@{
      kind = 'endpoint'
      name = $Name
      required = $Required
      ok = $false
      url = $Url
      latencyMs = [math]::Round($started.Elapsed.TotalMilliseconds)
      statusCode = $statusCode
      detail = $_.Exception.Message
    }
  }
}

function Get-RuntimeStatus {
  $checks = @(
    (Get-ToolStatus -Name 'node' -Required $true),
    (Get-ToolStatus -Name 'npm' -Required $true),
    (Get-ToolStatus -Name 'git' -Required $true),
    (Get-ToolStatus -Name 'docker' -Required $true),
    (Get-DockerEngineStatus),
    (Get-DockerImageStatus -Image $NodeSandboxImage),
    (Get-DockerImageStatus -Image $PythonSandboxImage),
    (Get-ToolStatus -Name 'hermes' -Required $true),
    (Get-ToolStatus -Name 'paperclipai' -Required $true),
    (Test-Endpoint -Name 'Paperclip API' -Url "$($PaperclipUrl.TrimEnd('/'))/api/health"),
    (Test-Endpoint -Name 'Agent OS API' -Url "$($AgentOsUrl.TrimEnd('/'))/api/status"),
    (Test-Endpoint -Name 'Hermes gateway (optional)' -Url "$($HermesGatewayUrl.TrimEnd('/'))/api/health")
  )

  $node = $checks | Where-Object { $_.kind -eq 'tool' -and $_.name -eq 'node' }
  if ($node.ok -and $node.version -match 'v(?<major>\d+)') {
    if ([int]$Matches.major -lt 20) {
      $node.ok = $false
      $node.detail = 'Node.js 20 or newer is required'
    }
  }

  $requiredOk = -not ($checks | Where-Object { $_.required -and -not $_.ok })
  [pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    repoRoot = $RepoRoot
    requiredOk = $requiredOk
    sandboxImages = @($NodeSandboxImage, $PythonSandboxImage)
    checks = $checks
  }
}

function Write-RuntimeStatus {
  param([Parameter(Mandatory)] $Status)

  if ($Json) {
    $Status | ConvertTo-Json -Depth 6
    return
  }

  Write-Host ''
  Write-Host 'Hermes Oracle Company Runtime' -ForegroundColor Cyan
  Write-Host "Repository: $($Status.repoRoot)"
  Write-Host ''

  foreach ($check in $Status.checks) {
    $mark = if ($check.ok) { '[PASS]' } else { '[----]' }
    $color = if ($check.ok) { 'Green' } elseif ($check.required) { 'Red' } else { 'Yellow' }
    $suffix = switch ($check.kind) {
      'tool' {
        if ($check.version) { "$($check.version) — $($check.path)" } else { $check.detail }
      }
      'endpoint' {
        if ($check.ok) { "HTTP $($check.statusCode), $($check.latencyMs) ms" } else { $check.detail }
      }
      default { $check.detail }
    }
    Write-Host ("{0} {1,-38} {2}" -f $mark, $check.name, $suffix) -ForegroundColor $color
  }

  Write-Host ''
  if ($Status.requiredOk) {
    Write-Host 'Required local prerequisites and sandbox images are available.' -ForegroundColor Green
  } else {
    Write-Host 'A required prerequisite is missing. Resolve the red item before start.' -ForegroundColor Red
  }
}

function Wait-ForEndpoint {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string]$Url,
    [int]$TimeoutSec = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $check = Test-Endpoint -Name $Name -Url $Url -TimeoutSec 2
    if ($check.ok) { return $check }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "$Name did not become reachable at $Url. Inspect logs in $LogDir."
}

function Start-ManagedProcess {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string]$Command,
    [Parameter(Mandatory)] [string]$WorkingDirectory
  )

  $stdout = Join-Path $LogDir "$Name.out.log"
  $stderr = Join-Path $LogDir "$Name.err.log"
  $process = Start-Process `
    -FilePath 'cmd.exe' `
    -ArgumentList @('/d', '/s', '/c', $Command) `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  [pscustomobject]@{
    name = $Name
    pid = $process.Id
    command = $Command
    stdout = $stdout
    stderr = $stderr
  }
}

$status = Get-RuntimeStatus

if ($Action -in @('preflight', 'status')) {
  Write-RuntimeStatus -Status $status
  if (-not $status.requiredOk) { exit 1 }
  exit 0
}

Write-RuntimeStatus -Status $status
if (-not $status.requiredOk) { exit 1 }

$paperclipTool = $status.checks | Where-Object { $_.kind -eq 'tool' -and $_.name -eq 'paperclipai' }
$paperclipEndpoint = $status.checks | Where-Object { $_.kind -eq 'endpoint' -and $_.name -eq 'Paperclip API' }
$agentOsEndpoint = $status.checks | Where-Object { $_.kind -eq 'endpoint' -and $_.name -eq 'Agent OS API' }
$started = @()

if (-not $paperclipEndpoint.ok) {
  if (-not $paperclipTool.ok) {
    throw 'Paperclip CLI is not installed. Complete the reviewed Paperclip onboarding command in docs/START_TODAY.md first.'
  }
  $env:PAPERCLIP_TELEMETRY_DISABLED = '1'
  $started += Start-ManagedProcess -Name 'paperclip' -Command 'paperclipai run' -WorkingDirectory $RepoRoot
  Wait-ForEndpoint -Name 'Paperclip API' -Url "$($PaperclipUrl.TrimEnd('/'))/api/health" | Out-Null
}

if (-not $agentOsEndpoint.ok) {
  if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    throw 'Dependencies are not installed. Run npm ci in the repository root, then run this script again.'
  }
  $started += Start-ManagedProcess -Name 'agent-os' -Command 'npm start' -WorkingDirectory $RepoRoot
  Wait-ForEndpoint -Name 'Agent OS API' -Url "$($AgentOsUrl.TrimEnd('/'))/api/status" | Out-Null
}

if ($OpenDashboards) {
  Start-Process $PaperclipUrl
  Start-Process $AgentOsUrl
}

$result = [pscustomobject]@{
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  ok = $true
  paperclip = $PaperclipUrl
  agentOs = $AgentOsUrl
  hermesMode = 'Paperclip hermes_local adapter launches Hermes per heartbeat; no separate gateway is required.'
  sandbox = [pscustomobject]@{
    engine = 'Docker'
    network = 'disabled per task'
    hostWorkspace = 'read-only mount'
    images = @($NodeSandboxImage, $PythonSandboxImage)
  }
  started = $started
  logDirectory = $LogDir
}

if ($Json) {
  $result | ConvertTo-Json -Depth 5
} else {
  Write-Host ''
  Write-Host 'Company runtime is reachable.' -ForegroundColor Green
  Write-Host "Paperclip: $PaperclipUrl"
  Write-Host "Owner Cockpit: $AgentOsUrl"
  Write-Host "Logs: $LogDir"
  Write-Host 'Hermes employees are started by Paperclip when assigned work or awakened by a routine.'
  Write-Host 'Coding verification uses fixed tasks in no-network, non-root Docker sandboxes.'
}
