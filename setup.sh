#!/usr/bin/env bash
#
# Agent OS — Sovereign Stack setup
# Wires the four pillars: Free Claude Code (CLI) + OpenRouter (Brain) +
# Obsidian (Memory) + this dashboard (Command).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

say() { printf "\n\033[1;38;5;209m▸ %s\033[0m\n" "$1"; }
ok()  { printf "  \033[1;32m✓\033[0m %s\n" "$1"; }
warn(){ printf "  \033[1;33m!\033[0m %s\n" "$1"; }

# ── 0. Prerequisites ──────────────────────────────────────────────────────
say "Checking prerequisites"
command -v node >/dev/null || { echo "Node.js >=20 is required."; exit 1; }
ok "node $(node --version)"
command -v npm >/dev/null || { echo "npm is required."; exit 1; }
ok "npm $(npm --version)"

# ── 1. Pillar II — Free Claude Code proxy ─────────────────────────────────
say "Pillar II — Free Claude Code (FCC)"
if command -v fcc-server >/dev/null 2>&1; then
  ok "fcc-server already installed"
else
  if command -v uv >/dev/null 2>&1; then
    warn "fcc-server not found. Install it with:"
    echo "      curl -fsSL \"https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1\" | sh"
  else
    warn "uv not found. Install uv first (https://docs.astral.sh/uv/), then run the FCC installer above."
  fi
fi

# ── 2. Dashboard config ───────────────────────────────────────────────────
say "Configuring the dashboard"
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  ok ".env already exists (left untouched)"
fi

# ── 3. Memory vault ───────────────────────────────────────────────────────
say "Pillar III — Obsidian memory vault"
VAULT="${OBSIDIAN_VAULT_PATH:-$HOME/freeclaude-vault}"
mkdir -p "$VAULT"
if [ ! -f "$VAULT/Welcome.md" ]; then
  cat > "$VAULT/Welcome.md" <<'EOF'
# Welcome to your Sovereign Stack memory

This folder is your Obsidian vault and Agent OS memory. Anything here is
loaded as context when you chat with Free Claude Code (toggle "memory" off
to skip it).

## How to use
- Add notes about yourself, your business, your clients, your brand voice.
- The agent reads the most recently edited notes first.
- Open this same folder in Obsidian to edit with the full app.
EOF
  ok "Seeded vault at $VAULT"
else
  ok "Vault exists at $VAULT"
fi

# ── 4. Scratch (workspace) root ───────────────────────────────────────────
say "Workspace project root"
mkdir -p "${SCRATCH_DIR:-$HOME/freeclaude-scratch}"
ok "Scratch at ${SCRATCH_DIR:-$HOME/freeclaude-scratch}"

# ── 5. Install + build ────────────────────────────────────────────────────
say "Installing dependencies"
npm install --fetch-retries=5 --fetch-timeout=120000
ok "Dependencies installed"

say "Building dashboard"
npm run build
ok "Build complete"

# ── Done ──────────────────────────────────────────────────────────────────
say "Setup complete"
cat <<EOF

  Next steps:
    1. Start Free Claude Code:   fcc-server
       (configure OpenRouter + MODEL="open_router/openrouter/free" in its Admin UI)
    2. Start Agent OS:           npm start
    3. Open the dashboard:       http://127.0.0.1:3001

  Optional — give Claude Code direct vault access:
    Copy mcp/obsidian.mcp.json into your project's .mcp.json and set OBSIDIAN_API_KEY
    (from the Obsidian "Local REST API" plugin).
EOF
