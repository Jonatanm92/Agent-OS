# Fas 1 – Inventering

Datum: 2026-11-23. Den här rapporten skiljer på **verifierat** (kört/läst i den här sessionen) och
**ej verifierat** (kunde inte kontrolleras härifrån).

## 1. Vad som faktiskt kunde inspekteras

OMEGA byggdes i en **moln-container (Linux)** via Claude Code, inte på din Windows-dator.
Ingen dator var ansluten till sessionen (Remote Control-listan var tom), så **din PC:s
diskar, F:, installerade verktyg och lokala repon är inte inventerade**. I stället levereras två
skrivskyddade verktyg som du kör själv:

| Verktyg | Kommando | Vad det gör |
|---|---|---|
| `omega inventory` | `node src/cli.ts inventory` (sätt `OMEGA_PROJECT_ROOTS=F:\dev;C:\Users\du\source`) | Verktyg på PATH + versioner, diskar, git-repon (gren, remote utan inloggningsuppgifter, ändrade filer), riskflaggor |
| `scripts/inventory-windows.ps1` | `powershell -ExecutionPolicy Bypass -File scripts\inventory-windows.ps1 -Roots F:\dev` | Samma sak i ren PowerShell + CPU/GPU/RAM, skriver `omega-inventory.json` |

Båda läser **aldrig innehållet** i `.env`/nyckelfiler (bara att de finns) och ändrar ingenting.

## 2. Byggmiljön (verifierad)

| Komponent | Resultat |
|---|---|
| OS / resurser | Linux x64, 4 CPU, ~16 GB RAM, ~64 GB ledigt |
| Node.js | v22.23.5 (kör TypeScript direkt via type stripping) |
| git | 2.43.0 |
| **Claude Code CLI** | 2.1.330 – **headless-läget testat och fungerar** (se nedan) |
| GitHub CLI | 2.89.0 (används inte av OMEGA) |
| Docker | 29.10.0 (används inte i v1) |
| OpenAI Codex CLI | **saknas** – kunde inte testas |
| Ollama, Tailscale | saknas |

## 3. Agentverktyg och dokumenterade integrationsmöjligheter

### Claude Code (integrerad i OMEGA)
Verifierat med riktiga körningar i den här sessionen:

- `claude -p` läser prompten från stdin och skriver ett JSON-resultat (`--output-format json`)
  med bl.a. `total_cost_usd`, `num_turns`, `permission_denials`, `structured_output`.
- `--json-schema` ger validerad strukturerad output (används av produktrollen).
- `--permission-mode dontAsk` + `--tools Read,Write,...` + `--allowedTools 'Edit(src/**)'`:
  **testat** – agenten fick skriva `src/hello.js` men nekades `other.txt`, och nekandet
  rapporterades i `permission_denials`.
- `--max-budget-usd`, `--max-turns`, `--strict-mcp-config`, `--no-session-persistence`,
  `--setting-sources project` (utesluter dina användarinställningar så att breda allow-regler
  eller hooks i `~/.claude` inte kan vidga agentens rättigheter – testat, autentiseringen fungerar ändå).
- Körs med **rensad miljö**: inga `GH_TOKEN`, `GITHUB_TOKEN`, `AWS_*` m.fl. når agenten (testat).

### OpenAI Codex CLI (planerad, ej integrerad)
Codex har ett dokumenterat icke-interaktivt läge (`codex exec`) med sandbox- och
godkännandeinställningar. CLI:t fanns inte i byggmiljön, så flaggorna är **inte verifierade** och
ingen adapter skrevs – hellre ingen adapter än en otestad. Adaptergränssnittet (`Engine` i
`src/engine/engines.ts`) är förberett för den.

### Övriga
- **gh**: kan senare öppna PR efter godkännande. Används inte i v1 (inga pushar).
- **Docker**: kandidat för starkare sandlåda för att köra genererad kod (se `REMAINING.md`).
- **Ollama**: kandidat för en gratis lokal motor. Ingen adapter ännu.
- **Tailscale**: rekommenderad väg för mobilåtkomst (privat nät). Inte installerad av OMEGA.

## 4. Kostnader och begränsningar

Listpriser per miljon tokens (Anthropic, cachade 2026-11-03): Opus 5.5 $4 in / $20 ut,
Sonnet 5.5 $2 / $10, Haiku 5.5 $0,10 / $0,50.

Uppmätt i den här sessionen (kostnad enligt Claude Codes egen rapport):

| Körning | Modell | Kostnad |
|---|---|---|
| Trivial fråga ("svara OK") | Opus 5.5 | $0,113 (nästan allt är cache-skrivning av CLI:ts ~13k-tokens systemprompt) |
| Skriva en fil + nekad skrivning | Haiku 5.5 | $0,00096 |
| Strukturerad output | Haiku 5.5 | $0,00073 |
| Hela OMEGA-uppdraget i Fas 4 | Opus 5.5 | se `docs/04-verification.md` |

Viktigt:
- Varje agentanrop har en fast startkostnad (systemprompten). Med Opus blir även små steg ~$0,1.
  Billigare modell väljs per uppdrag (`--model claude-sonnet-5-5` eller fältet i dashboarden).
- `total_cost_usd` är vad Claude Code rapporterar. Om du kör Claude Code på ett abonnemang i
  stället för API-nyckel kan siffran vara ett API-ekvivalent värde snarare än en faktisk debitering –
  kontrollera din plan. OMEGA använder siffran för sina budgettak oavsett.
- Taket per körning upprätthålls av CLI:t (`--max-budget-usd`); OMEGA registrerar faktisk
  rapporterad kostnad och stoppar nästa körning när uppdrags- eller dagsbudgeten är slut.
- Codex-kostnader beror på din OpenAI-plan och är inte verifierade här.

## 5. Relevanta befintliga repon

GitHub-åtkomsten i sessionen ser 14 repon under `Jonatanm92` (endast metadata, **innehållet har
inte lästs** utom Agent-OS):

| Repo | Synlighet | Senaste push |
|---|---|---|
| arkivpilot-next | privat | 2026-11-22 |
| Agent-OS | publik | 2026-11-19 |
| studio-one | privat | 2026-11-13 |
| arkivpilot | privat | 2026-11-12 |
| nordicops | privat | 2026-11-12 |
| apexamp | publik | 2026-10-09 |
| aura | publik | 2026-09-28 |
| Skymt- / Skymt | publik / privat | 2026-09-27 |
| Training-Reset | privat | 2026-09-19 |
| one-person-company | privat | 2026-09-16 |
| thallbyssal, thall-forge | publik | 2026-07 / 2026-06 |
| tillganglighetsakuten | privat | 2026-06-11 |

OMEGA rör inga av dessa. Uppdrag får egna repon under `OMEGA_HOME/projects`. Att låta ett
uppdrag arbeta mot ett befintligt repo (på egen gren, med PR efter godkännande) står i `REMAINING.md`.

## 6. Säkerhetsrisker i den befintliga Agent-OS-koden

OMEGA ligger isolerat i `omega/` och återanvänder inte koden nedan, men den finns i samma repo
och bör åtgärdas innan Agent-OS exponeras:

| Fynd | Plats | Risk |
|---|---|---|
| Servern lyssnar på **alla nätverksgränssnitt** (ingen host anges) | `server/src/index.ts:660` | Nåbar från LAN/Wi-Fi |
| Inloggning är **avstängd** när `AGENT_OS_PASSWORD` är tomt (standard) | `server/src/index.ts:102`, `.env.example` | Öppet API |
| **PTY-terminal över WebSocket**, token i query-strängen | `server/src/terminal.ts` | Fjärrskal om node-pty är installerat |
| Agentens `run_command` kör godtycklig skalsträng via `execSync`, utan allow-list, med full miljö | `server/src/services/agentic.ts:92` | Modellen kan köra vad som helst och läsa alla tokens i miljön |

Kombinationen öppen port + ingen inloggning + terminal är exakt den "fritt webbexponerade terminal"
som uppdraget förbjuder. OMEGA har därför ingen terminal, ingen godtycklig kommando-endpoint, binder
bara loopback och kräver alltid token.
