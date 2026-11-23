<#
.SYNOPSIS
  OMEGA Phase-1 inventory for a Windows PC. STRICTLY READ-ONLY.

.DESCRIPTION
  Reports drives and free space, agent tooling on PATH (with versions), and git
  repositories under the roots you pass in. It never modifies anything, never reads
  the contents of .env / key files (it only lists their names), and strips
  credentials from git remote URLs. Output: a JSON file you can inspect before
  sharing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\inventory-windows.ps1 -Roots F:\dev,C:\Users\me\source
#>
param(
  [string[]]$Roots = @(),
  [string]$Out = ".\omega-inventory.json",
  [int]$Depth = 3
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-ToolInfo([string]$Name, [string[]]$VersionArgs = @('--version')) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) { return [ordered]@{ name = $Name; found = $false } }
  $version = $null
  try { $version = (& $cmd.Source @VersionArgs 2>&1 | Select-Object -First 1) -as [string] } catch { $version = "error: $($_.Exception.Message)" }
  [ordered]@{ name = $Name; found = $true; path = $cmd.Source; type = "$($cmd.CommandType)"; version = $version }
}

function Get-Remote([string]$RepoDir) {
  $cfg = Join-Path $RepoDir '.git\config'
  if (-not (Test-Path $cfg)) { return $null }
  $text = Get-Content $cfg -Raw
  if ($text -match '\[remote "origin"\][^\[]*?url\s*=\s*(\S+)') {
    return ($Matches[1] -replace '^(\w+://)[^@/]+@', '$1***@')
  }
  return $null
}

$secretPatterns = @('^\.env(\..+)?$', '\.(pem|key|p12|pfx|kdbx)$', '^id_(rsa|ed25519|ecdsa)', '^\.(npmrc|netrc|git-credentials)$', '^credentials')

$repos = @()
foreach ($root in $Roots) {
  if (-not (Test-Path $root)) { continue }
  $gitDirs = Get-ChildItem -Path $root -Directory -Filter '.git' -Recurse -Depth $Depth -Force -ErrorAction SilentlyContinue | Select-Object -First 80
  foreach ($g in $gitDirs) {
    $dir = $g.Parent.FullName
    $head = (Get-Content (Join-Path $g.FullName 'HEAD') -Raw) -replace 'ref: refs/heads/', ''
    $secretFiles = Get-ChildItem -Path $dir -File -Force -ErrorAction SilentlyContinue |
      Where-Object { $n = $_.Name; ($secretPatterns | Where-Object { $n -match $_ }).Count -gt 0 } |
      Select-Object -ExpandProperty Name
    $last = $null
    $dirty = $null
    if (Get-Command git -ErrorAction SilentlyContinue) {
      $last = git -C $dir log -1 --format=%cI 2>$null
      $dirty = (git -C $dir status --porcelain 2>$null | Measure-Object).Count
    }
    $repos += [ordered]@{
      path = $dir; name = $g.Parent.Name; branch = $head.Trim(); remote = (Get-Remote $dir)
      lastCommit = $last; dirtyFiles = $dirty; secretLikeFiles = @($secretFiles)
    }
  }
}

$drives = Get-PSDrive -PSProvider FileSystem | ForEach-Object {
  [ordered]@{ name = $_.Name; root = $_.Root; freeGb = [math]::Round($_.Free / 1GB, 1); usedGb = [math]::Round($_.Used / 1GB, 1) }
}

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name

$report = [ordered]@{
  collectedAt = (Get-Date).ToString('o')
  system = [ordered]@{
    os = $os.Caption; version = $os.Version; cpu = $cpu.Name; cores = $cpu.NumberOfLogicalProcessors
    memoryGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1); gpus = @($gpu)
  }
  drives = @($drives)
  fDrivePresent = (Test-Path 'F:\')
  tools = @(
    (Get-ToolInfo 'claude'), (Get-ToolInfo 'codex'), (Get-ToolInfo 'git'), (Get-ToolInfo 'node'), (Get-ToolInfo 'npm'),
    (Get-ToolInfo 'gh'), (Get-ToolInfo 'docker'), (Get-ToolInfo 'ollama'), (Get-ToolInfo 'tailscale' @('version')),
    (Get-ToolInfo 'python'), (Get-ToolInfo 'uv'), (Get-ToolInfo 'code')
  )
  repos = $repos
  notes = @(
    'Read-only scan. Secret-like files are listed by name only; contents were not read.',
    'claude found as a .cmd/.ps1 shim means an npm install; OMEGA spawns without a shell and needs the native claude.exe (set OMEGA_CLAUDE_BIN).'
  )
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Path $Out -Encoding UTF8
Write-Host "Wrote $Out ($($repos.Count) repos, $(@($drives).Count) drives). Review it before sharing."
