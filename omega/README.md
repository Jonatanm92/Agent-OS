# OMEGA v0.1

Ett personligt AI-operativsystem för styrt utvecklingsarbete med flera agenter. Du beskriver en idé
(från mobilen eller datorn), OMEGA gör om den till ett strukturerat projekt, låter roller med begränsade
rättigheter bygga det, verifierar resultatet självständigt och lägger fram det för ditt godkännande –
med evidens för varje steg.

```
idé ─▶ produkt ─▶ arkitekt ─▶ testförfattare ─▶ kodare ─▶ testare ─▶ säkerhet ─▶ dokumentation ─▶ du
        (AI)       (kod)        (AI, test/**)   (AI, src/**)  (OMEGA)   (OMEGA)      (OMEGA)      godkänner
```

**Status:** fungerande första version. Ett riktigt end-to-end-flöde med Claude Code är genomfört och
dokumenterat (`docs/04-verification.md`): 95 s, $0,35, 8/8 acceptanskriterier verifierade.

## Snabbstart

Kräver **Node.js ≥ 22.18** och **git**. För AI-motorn: **Claude Code CLI**, inloggad.

```powershell
cd omega
node src/cli.ts serve
```

Öppna länken som skrivs ut (`http://127.0.0.1:7420/#token=…`). Token sparas i webbläsaren; själva filen
ligger i `OMEGA_HOME\token`.

Utan att spendera något (mallmotorn, ingen AI):

```powershell
node src/cli.ts demo                                     # temperaturomvandlare, hela pipelinen
npm test                                                 # 24 tester, ~3 s
node scripts/verify-evidence.ts docs/evidence/real-run-msn_990c384537ee   # 28 kontroller av den riktiga körningen
```

Med riktiga agenter (kostar pengar – du godkänner utgiften):

```powershell
node src/cli.ts demo --engine claude-code --approve-spend          # eller beställ i dashboarden
```

### Windows-noteringar
- `OMEGA_HOME` blir automatiskt `F:\OMEGA` om F: finns, annars `%LOCALAPPDATA%\OMEGA`.
- OMEGA startar program utan skal. Om `claude` är installerat via npm (en `.cmd`-fil) – installera den
  inbyggda versionen eller sätt `OMEGA_CLAUDE_BIN` till sökvägen till `claude.exe`. `omega inventory` varnar.
- Inventera datorn: `scripts\inventory-windows.ps1 -Roots F:\dev` (skrivskyddat).

## Kommandon

| | |
|---|---|
| `serve` | Dashboard + API + arbetare (bara medan processen kör) |
| `demo [--engine claude-code] [--idea "…"] [--approve-spend]` | Ett uppdrag hela vägen, skriver ut evidensen |
| `mission new "…"` / `run` | Köa ett uppdrag / arbeta av kön utan server |
| `status [id]`, `approvals`, `approve <id>`, `reject <id> --note …` | Följa upp och besluta |
| `verify <id>`, `audit` | Räkna om evidens / kontrollera revisionskedjan |
| `inventory [--json]` | Verktyg, diskar, repon (`OMEGA_PROJECT_ROOTS`) |

## Konfiguration (miljövariabler)

| Variabel | Standard | |
|---|---|---|
| `OMEGA_HOME` | `F:\OMEGA` / `%LOCALAPPDATA%\OMEGA` / `~/.omega` | All data |
| `OMEGA_PORT`, `OMEGA_HOST` | `7420`, `127.0.0.1` | Annan host kräver `OMEGA_ALLOW_REMOTE=1` |
| `OMEGA_MODEL` | `claude-opus-5-5` | Kan sättas per uppdrag |
| `OMEGA_MISSION_BUDGET_USD` / `OMEGA_PER_RUN_BUDGET_USD` / `OMEGA_DAILY_BUDGET_USD` | 3 / 1,5 / 10 | Budgettak |
| `OMEGA_AUTO_APPROVE_UNDER_USD` | 0 | 0 = varje AI-utgift kräver ditt godkännande |
| `OMEGA_MAX_FIX_ITERATIONS` | 1 | Rättningsvarv när testerna fallerar |
| `OMEGA_CLAUDE_BIN` | `claude` | Sökväg till Claude Code |
| `OMEGA_PROJECT_ROOTS` | – | Rötter för skrivskyddad inventering |

## Dokumentation

- [`docs/01-inventory.md`](docs/01-inventory.md) – Fas 1: miljö, verktyg, kostnader, repon, risker
- [`docs/02-architecture.md`](docs/02-architecture.md) – Fas 2: kö, tillståndsmaskiner, roller, behörigheter, budget, väg framåt
- [`docs/03-security.md`](docs/03-security.md) – hotbild, skydd, kvarvarande risker, mobilåtkomst
- [`docs/04-verification.md`](docs/04-verification.md) – Fas 4: den riktiga körningen och hur du kontrollerar den
- [`REMAINING.md`](REMAINING.md) – ärlig lista över vad som återstår

## Kodkarta

```
src/core/      state.ts (tillståndsmaskiner) queue.ts store.ts audit.ts budget.ts policy.ts exec.ts vcs.ts
src/roles/     registry.ts (roller + behörigheter) spec.ts tester.ts security.ts scaffold.ts
src/engine/    orchestrator.ts (livscykel, arbetare, grindar, evidens) engines.ts (claude-code, template)
src/adapters/  claude-code.ts (headless CLI, låst läge) recipes/ (mallmotorns recept)
src/server/    http.ts (API, autentisering, statiska filer)
src/inventory/ inventory.ts
public/        dashboard (vanilla JS, mobil först)
```

Inga runtime-beroenden. `typescript` och `@types/node` används bara för `npm run typecheck`.
