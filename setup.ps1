# Agent OS — Windows one-shot setup (PowerShell)
# Installs uv + Free Claude Code, configures Owl Alpha with your OpenRouter key,
# installs + builds the dashboard, and seeds your memory vault.
#
# Run from the repo root:   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = 'Stop'
function Say($m)  { Write-Host "`n>> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "   [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "   [!]  $m" -ForegroundColor Yellow }

Say "Checking Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Warn "Node.js is not installed. Install the LTS build from https://nodejs.org then re-run this script."
  exit 1
}
Ok "node $(node --version)"

# 1. uv (FCC uses it to manage Python) ---------------------------------------
Say "Checking uv (Python manager Free Claude Code needs)"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Say "Installing uv..."
  irm https://astral.sh/uv/install.ps1 | iex
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}
if (Get-Command uv -ErrorAction SilentlyContinue) { Ok "uv ready" }
else { Warn "uv installed but not on PATH yet — close & reopen PowerShell, then re-run." ; exit 1 }

# 2. Free Claude Code proxy --------------------------------------------------
Say "Installing Free Claude Code (FCC)"
if (Get-Command fcc-server -ErrorAction SilentlyContinue) {
  Ok "fcc-server already installed"
} else {
  irm "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.ps1?raw=1" | iex
  Warn "If 'fcc-server' isn't found below, close & reopen PowerShell and re-run this script."
}

# 3. Configure FCC: Owl Alpha + your free OpenRouter key ----------------------
Say "Configuring FCC (Owl Alpha + your OpenRouter key)"
$fccDir = Join-Path $env:USERPROFILE ".fcc"
New-Item -ItemType Directory -Force -Path $fccDir | Out-Null
$key = Read-Host "Paste your free OpenRouter API key (from https://openrouter.ai/keys), or press Enter to set it later"
$envLines = @(
  "OPENROUTER_API_KEY=$key",
  "MODEL=open_router/openrouter/owl-alpha",
  "ANTHROPIC_AUTH_TOKEN=freecc"
)
Set-Content -Path (Join-Path $fccDir ".env") -Value ($envLines -join "`n") -Encoding utf8
if ([string]::IsNullOrWhiteSpace($key)) {
  Warn "No key entered. Add it later in the FCC Admin UI (http://127.0.0.1:8082/admin) or edit $fccDir\.env"
} else {
  Ok "Wrote $fccDir\.env with Owl Alpha as the model"
}

# 4. Dashboard deps + build --------------------------------------------------
Say "Installing dashboard dependencies"
npm install --fetch-retries=5 --fetch-timeout=120000
Ok "Dependencies installed"

Say "Building dashboard"
npm run build
Ok "Build complete"

# 5. Memory vault + dashboard .env -------------------------------------------
Say "Seeding memory vault"
$vault = Join-Path $env:USERPROFILE "freeclaude-vault"
New-Item -ItemType Directory -Force -Path $vault | Out-Null
$welcome = Join-Path $vault "Welcome.md"
if (-not (Test-Path $welcome)) {
@"
# Welcome to your Sovereign Stack memory

Notes in this folder are SHARED MEMORY for every agent (Free Claude Code,
Codex, Hermes). Add notes about you, your business, your clients, your voice.
Open this same folder in Obsidian to edit with the full app.
"@ | Set-Content -Path $welcome -Encoding utf8
}
Ok "Vault ready at $vault"

if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Ok "Created .env" }

Say "Setup complete"
Write-Host @"

  Next: start everything with one command ->   powershell -ExecutionPolicy Bypass -File .\start.ps1

  Or manually, in two PowerShell windows:
     1)  fcc-server          (the proxy + Admin UI at http://127.0.0.1:8082/admin)
     2)  npm start           (the dashboard at http://127.0.0.1:3001)

  Optional: install the Obsidian desktop app (https://obsidian.md) and open the
  folder  $vault  to edit your memory with the full app.
"@ -ForegroundColor Green
