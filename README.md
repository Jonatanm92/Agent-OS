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

### Windows (one command)

In **PowerShell**, from the cloned repo folder:

```powershell
# 1. set up everything (installs uv + FCC, configures Owl Alpha + your key, builds the app)
powershell -ExecutionPolicy Bypass -File .\setup.ps1
# 2. start the proxy + dashboard and open it in your browser
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

`setup.ps1` will prompt you to paste your free OpenRouter key (from
[openrouter.ai/keys](https://openrouter.ai/keys)) and wires it to **Owl Alpha**
automatically. If a command isn't found right after install, close and reopen
PowerShell once, then re-run.

### macOS / Linux

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
- **Memory that compounds** — click **🧠 Save chat to memory** and the agent distils the
  conversation into durable bullet-point facts written back to the vault
  (`Memory/<date>-<title>.md`). Every agent reads those next time, so the *system* gets
  more useful the more you use it. (The model isn't retrained — this is a memory loop, not
  fine-tuning.)
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
| **Kimi Code** | FCC proxy | Messages → `/v1/messages` | `open_router/moonshotai/kimi-k2` |
| **GLM** | FCC proxy | Messages → `/v1/messages` | `open_router/z-ai/glm-4.6` |
| **Grok Build** | FCC proxy | Messages → `/v1/messages` | `open_router/x-ai/grok-code-fast-1` |
| **Local** | FCC proxy | Messages → `/v1/messages` | `ollama/llama3.1` (offline, $0) |

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

### Identity & feedback

- **Identity files (per agent)** — each agent has an editable persona/system prompt
  (role, principles, authority, how to handle ambiguity) in **Settings → Agents**. It's
  injected into every request alongside the shared memory, so behavior is stable and
  auditable.
- **Feedback loop** — 👍/👎 on any assistant reply is stored per message, giving you a
  signal to spot regressions over time.
- **Agent mode (🛠 build)** — toggle it on in chat and the agent runs a real tool loop
  against your active Workspace project: it **writes/reads/lists files and runs commands**
  (`run_command` — `npm install`, run tests, execute scripts) via JSON actions the dashboard
  executes, reading the output back each step. So it can actually build and run code, not
  just talk about it. Model-agnostic (works with Owl Alpha).
- **Save files from a reply** — when an agent pastes code as `### File: path` + fenced
  blocks (instead of using tools), click **💾 Save files** on the message and the
  dashboard writes every named file into your active project. Turns any model's "here's
  the code, you save it" dump into real files in one click.
- **Run & Preview** — in the Workspace, **▶ Run** starts a dev server / command for the
  project (auto-suggests `npm run dev` etc.), streams logs, and **⇗ Preview** opens the
  running app. Build software and watch it run, in the OS.
- **Editable Workspace** — open any file in the Workspace tab to **edit and save** it, or
  create new files. Real coding, in the browser (and on mobile).
- **Terminal tab** — a real shell embedded in the dashboard (xterm.js over a PTY bridge),
  with one-click buttons to launch `agentos claude / codex / hermes`. Use the agent CLIs
  from the browser — even on your phone. Needs the optional `node-pty` native module; if
  it isn't built, the tab shows a one-line install hint and everything else keeps working.

---

## Pipeline — From Inbox to Shipped

The **Pipeline** tab is a kanban that turns ideas into shipped deliverables with a
single human checkpoint:

```
Capture → (agent Shapes it) → Human Gate (you approve) → Execute (agent builds) → Shipped & Filed
```

- **Capture** — drop any idea (project, thought, link) into the inbox.
- **Shape it** — an agent classifies it (type, tags, a 0–100 score, and a short plan)
  and moves it to the gate.
- **Approve** — the one human checkpoint. One click sends it to execution.
- **Build the deliverable** — the agent build loop writes real files into the active
  Workspace project.
- **Shipped & Filed** — every item is also written to your Obsidian vault under
  `Pipeline/`, so the whole flow lives in your notes.

This is the orchestration + handoff layer (Components 6 & 7): each stage hands a
structured item to the next, with you in the loop exactly once. Each shipped item gets
its **own isolated project folder**, the plan is shown on the gate card before you
approve, and shipped cards have **Open in Workspace** to jump straight to the files.

---

## CLI — one launcher for every agent

Each agent also has a real terminal CLI. `agentos` is a single cross-platform
launcher for all of them:

```bash
npm run cli            # interactive menu
npm run cli claude     # -> fcc-claude  (Claude Code CLI via FCC)
npm run cli codex      # -> fcc-codex   (Codex CLI via FCC)
npm run cli hermes     # -> hermes      (Nous Research Hermes Agent)
npm run cli -- --list  # list agents and the command each maps to
```

Extra args pass straight through, e.g. `npm run cli codex exec "hello"`. The
`fcc-*` agents need the FCC proxy running (`fcc-server`) and a tool-capable
model selected in the FCC Admin UI; `hermes` uses its own `hermes setup`.

> This is the real, YouTube-style terminal experience — `fcc-claude` is the
> actual Claude Code CLI. The dashboard's **🛠 build** mode is the in-app
> equivalent that works with any model.

### Will Claude Code work on my free model?

Owl Alpha is great for chat but its tool calls don't round-trip through FCC, so
Claude Code's file tools silently fail on it. **Settings → 🧩 Claude Code — free
coding readiness** removes the guesswork: enter a model, click **Test tool
support**, and it sends a real tool-use probe through FCC and tells you
definitively whether that model works with Claude Code. Click **Set as FCC
model** to write it to `~/.fcc/.env` (then restart `fcc-server`). Good free
picks to try: `open_router/qwen/qwen3-coder:free`,
`open_router/deepseek/deepseek-chat-v3-0324:free`, or NVIDIA NIM's nemotron.

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
| `AGENT_OS_PASSWORD` | _(blank)_ | If set, the dashboard requires this password to log in |

### Mobile & remote access

The dashboard is responsive, so it works on a phone. To reach it from your
phone:

- **Same Wi-Fi:** open `http://<your-computer-LAN-IP>:3001` (allow port 3001 through your firewall).
- **Anywhere (private):** put your computer and phone on a [Tailscale](https://tailscale.com) network and use the computer's `100.x` address.

If you expose it beyond a trusted network, **set `AGENT_OS_PASSWORD`** so a login
is required. Leave it blank for a no-login local setup.

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
