# Agent OS — the Sovereign Stack you own

A self-hosted **Mission Control** dashboard that wires together a free, open-source
coding agent and a persistent memory layer — no monthly bill, no vendor lock-in.

This is an open implementation of the four-pillar "Sovereign Stack" idea:

| Pillar | Component | What it is |
|--------|-----------|------------|
| **I — Brain** | **[Owl Alpha](https://openrouter.ai/openrouter/owl-alpha)** on OpenRouter | Free 1M-context, tool-use model ($0/token) |
| **II — CLI** | **[Free Claude Code](https://github.com/Alishahryar1/free-claude-code)** (FCC) | An MIT-licensed proxy that routes Claude Code / Codex traffic to any provider |
| **III — Memory** | **Obsidian vault** (plain markdown) | Persistent context the agent reads and writes |
| **IV — Command** | **Agent OS** (this repo) | The dashboard: chat, workspace preview, history, project scoping |

> **How it actually works:** Agent OS never calls a model provider directly. It talks
> to your running **FCC proxy** over its Anthropic-compatible `/v1/messages` endpoint.
> FCC decides which provider/model the traffic routes to (configured once, in its Admin
> UI). Swap the free model the day a better one drops — everything else stays put.

---

## Quick start

```bash
# 0. Install + start Free Claude Code (the proxy)
curl -fsSL "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1" | sh
fcc-server            # opens an Admin UI (default http://127.0.0.1:8082/admin)
#   In the Admin UI: paste your free OpenRouter key (openrouter.ai/keys) and set
#   MODEL="open_router/openrouter/owl-alpha"   # the article's free 1M-context Brain ($0/token)

# 1. Set up + run Agent OS
./setup.sh
npm start             # dashboard on http://127.0.0.1:3001
```

Then open **http://127.0.0.1:3001**.

---

## What you get

- **Chat tab** — prompts route through FCC to your free model. Conversation history is
  saved to SQLite and survives reloads.
- **Workspace tab** — every project is a folder under `~/freeclaude-scratch/<project>/`.
  Files render inline: HTML in a sandboxed iframe, images inline, everything else as
  source, with a Preview/Source toggle.
- **Memory tab** — a plain-markdown editor over your Obsidian vault. Notes are injected
  into chat as context (toggle per message). The same files open in Obsidian.
- **Active project pill** — scope each chat/workspace to a project; create new ones in
  one click.
- **Settings** — point at your FCC proxy (base URL + auth token), pick the model name,
  and set the vault path. Includes a "Test connection" button.

---

## Agents (one shared memory)

Agent OS runs several agents side by side, and **they all share one memory — your
Obsidian vault.** Before each turn the dashboard injects the same vault context into
whichever agent you're talking to, so switching agents never loses the thread.

Each agent has a **backend**:

| Agent | Backend | How it runs | Default model |
|-------|---------|-------------|---------------|
| **Free Claude Code** | FCC proxy | Anthropic Messages → `/v1/messages` | `claude-sonnet-4-20250514` |
| **Codex** | FCC proxy | OpenAI Responses → `/v1/responses` | `gpt-5.3-codex` |
| **Hermes** | local CLI | `hermes chat -q … -Q --yolo` ([Hermes Agent](https://hermes-agent.nousresearch.com)) | uses your `hermes setup` |

- **FCC agents** (Free Claude Code, Codex) route through the proxy you already run — FCC
  decides the provider/free model.
- **Hermes** is the real, free, open-source [Nous Research Hermes Agent](https://hermes-agent.nousresearch.com/docs/),
  a separate local runtime. Install it once:
  ```bash
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
  hermes setup --portal      # one OAuth: free model + tools
  ```
  The dashboard auto-detects whether `hermes` is on your PATH and shows an "install"
  badge until it is. Set a provider/model override in **Settings → Agents** (e.g.
  `--provider openrouter`) or leave blank to use your `hermes setup` config.

Override any agent's model in **Settings → Agents**. Adding a new agent is a one-line
entry in `server/src/services/agents.ts`.

---

## Configuration

Copy `.env.example` to `.env` (the setup script does this). Settings edited in the UI
are stored in SQLite and take precedence over env vars.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3001` | Dashboard port |
| `FCC_BASE_URL` | `http://127.0.0.1:8082` | Where `fcc-server` is listening |
| `FCC_AUTH_TOKEN` | `freecc` | Must match `ANTHROPIC_AUTH_TOKEN` in FCC |
| `MODEL` | `claude-sonnet-4-20250514` | Model name sent to FCC (it routes it) |
| `OBSIDIAN_VAULT_PATH` | `~/freeclaude-vault` | Markdown memory folder |
| `SCRATCH_DIR` | `~/freeclaude-scratch` | Root for project workspaces |

> The `MODEL` value is a *Claude tier name*. FCC maps it to whatever provider you set
> in the FCC Admin UI. To use the article's free Brain, set
> `MODEL="open_router/openrouter/owl-alpha"` there (Owl Alpha — 1M context, tool use,
> $0/token). Owl Alpha is a *stealth* model and may be renamed later; if it disappears,
> swap in any other `:free` slug and keep moving.

---

## Pillar III — full Obsidian memory via MCP (optional)

The Memory tab works on the vault folder directly, so it functions even without the
Obsidian desktop app. To give **Free Claude Code itself** read/write tool access to your
vault, wire the official [`obsidian-mcp-server`](https://github.com/cyanheads/obsidian-mcp-server):

1. In Obsidian, install + enable the **Local REST API** community plugin and copy its key.
2. Copy [`mcp/obsidian.mcp.json`](./mcp/obsidian.mcp.json) into your project's `.mcp.json`
   (or merge into `~/.claude.json`) and set `OBSIDIAN_API_KEY`.
3. Run Claude Code through FCC: `fcc-claude`.

---

## Architecture

```
 Browser ── Agent OS (React)
                │  /api/*
                ▼
        Agent OS server (Express + SQLite)
                │  POST /v1/messages  (Anthropic-compatible)
                ▼
        Free Claude Code proxy  ── routes to ──▶  OpenRouter (free model)
                │
                └── reads/writes ──▶  Obsidian vault (markdown)  ◀── Memory tab
```

- **Backend:** Node/Express, `better-sqlite3` for history, file-based projects + vault.
- **Frontend:** React + Vite (built to `client/dist`, served by Express in production).

### Dev mode

```bash
npm run dev:server   # Express on :3001 (tsx watch)
npm run dev:client   # Vite on :5173, proxies /api to :3001
```

---

## Project layout

```
agent-os/
├── setup.sh                  # one-command setup
├── .env.example
├── mcp/obsidian.mcp.json     # Claude Code MCP config for the vault
├── server/                   # Express + SQLite backend
│   └── src/
│       ├── index.ts          # routes
│       ├── config.ts         # settings resolution
│       ├── db/               # schema + seed
│       └── services/         # fcc, memory, workspace
└── client/                   # React + Vite dashboard
    └── src/
        ├── App.tsx
        ├── api.ts
        └── components/
```

## License

MIT. Free Claude Code and obsidian-mcp-server are independent MIT-licensed projects;
see their repositories for their terms.
