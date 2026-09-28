# Aura

**An adaptive operating system for everyday life — in a living forest.**
Aura works out what matters right now and reduces the amount of thinking,
planning and remembering you have to do. Four companions share the work:

| Companion | World | Holds |
|---|---|---|
| **Klara** (bunny, vardagscoach) | Idag, Coach | *Just nu*, Min dag, Töm huvudet, Låg energi, Kaos, check-ins with AI support |
| **Liv** (bunny, PMS & cykel) | Cykel | symptoms, cycle map, body support (optional module) |
| **Maja** (hamster, mönster & minnen) | Livet | inbox, shopping, errands, home chores, projects, routines, Kvällsavslut, Veckan, Mönster |
| **Astrid** (owl, stjärnor & tarot) | Mystik | star sky, tarot, rituals (optional module) |

This folder is the live **Aura — Josefin Edition** from Vercel
(`aura-josefin-demo`), imported unchanged in its own commit and then
extended with the everyday engine. The forest worlds, companions, sounds,
coach, cycle, Mystik and patterns are the live app's own work and are kept
as they were. No person is hardcoded in the logic: the name and rhythm are
stored preferences (the edition label in `index.html` and the manifest is
branding).

## What the everyday engine adds

| Where | What |
|---|---|
| **Idag** | *Just nu*: one thing, with a one-sentence reason and a duration — **Gör det · Något lättare · Något annat · Inte nu**. Or calm states: an event running, leaving soon (travel margin included), wind down, nothing urgent. One-tap energy (1–5). Today at a glance: **Måste · Bra om det hinns · Kan vänta**, one contextual suggestion, quick add, quick actions. |
| **Min dag** | Day mode (automatic, work, free, low, chaos, recovery), fixed times, the three groups with reorder, routines of the day, done today, and **Bygg om min dag** with a preview of what stays, moves (and to which day) or is brought in. |
| **Töm huvudet** | Messy text → shopping, tasks, errands, chores, reminders, fixed times, notes and ideas, with dates, times, deadlines and repeats. Every candidate is shown and editable; ambiguous and high-impact ones are marked; nothing is created before confirming. |
| **Låg energi** | What truly must happen, one small win, and exactly where everything else moves — applied only on a tap, undone in one. Offered after a low check-in or one-tap energy, never forced. |
| **Kaos** | Dump everything → one thing at a time; finishing reveals the next; the rest stays out of sight. |
| **Kvällsavslut** | What got done (the forest remembers), one decision per unfinished thing, empty your head into the inbox, a glance at tomorrow. |
| **Veckan** | Done per day, what moved often, routines, Maja's observations (dismissible), the week ahead. |
| **Livet** | Inbox (no Inbox-Zero pressure), shopping by department with usuals, errands (needs action / waiting / follow up), home chores that repeat, projects (only the next step reaches the day), adaptive routines, and Mönster. |
| **Fråga Aura** (on Klara's page) | *Vad skulle jag köpa? Vad har jag skjutit upp? Vad väntar jag på? Vad behöver bli klart före fredag?* — answered exactly from your own lists, labelled "ingen AI". |

Completing things lights the forest (the live app's forest moments), so the
new systems speak the same language as the old ones. Every change shows a
toast with **Ångra**.

## Architecture

No build step. The page loads classic engine scripts (`core/`, on
`globalThis.Aura`) and then the ES modules.

```
index.html            shell, dialogs, nav (Idag · Coach · Livet · Cykel · Mystik)
styles.css            the live design system + "Version 36: vardagen i skogen"
app.js                the live app: routing, worlds, coach, cycle, Mystik, patterns
everyday.js           NEW — the everyday pages, sheets and actions, in the forest design
life.js               NEW — bridge: state.life, pulse from check-ins, undo, daily housekeeping
storage.js            the live storage (one localStorage key), now with the life slice
logic.js, care-tools.js, insights-engine.js, wellness-data.js, mystic-data.js,
tarot-data.js, audio-scapes.js, client-safety.js, coach-transcript.js   the live modules
sw.js                 offline cache (every page asset and module; lint-checked)
core/                 the everyday engine — pure functions, same code in Node tests
  util i18n model items planner routines engine apply parse evening patterns review search notify compact
assets/               the live art (worlds, companions, tarot), audio, fonts, icons (+ new icons)
test/                 unit tests, bridge tests, e2e, lint, local server, bundle
```

**The Aura Engine** (`core/engine.js`) combines the clock, fixed events and
travel margins, today's groups, energy and stress from the check-ins, the
mode, routines in their window and what was declined today; it scores
candidates (deadlines, fit before the next commitment, energy match, office
hours for calls, background tasks, postponements, your own order) and
returns one recommendation with its most salient reason. Deterministic,
instant and free.

**Every change is an op** (`core/apply.js`): described in words, applied
to a copy, logged for patterns and the weekly review, and undoable.

## Data and privacy

- Everything stays in the browser, in the live app's single key
  `min-dag:josefin-edition:v1` (state version 9). Existing data is kept:
  version 8 loads unchanged and gains a `life` slice (items, fixed events,
  routines, projects, day notes, a compact log).
- Body state has one source: the check-ins and the one-tap energy
  (`state.logs`). The planner reads them; nothing is duplicated.
- Retention: finished items 60 days, day details 90, the log 180.
- Export and "Radera allt" in Settings cover the everyday data too.
- If the browser refuses to save, every toast says "sparas inte" — Aura
  never implies a save that did not happen.
- No console logging, no other hosts, no second storage key (lint-checked).

## AI

| Feature | How | Sent |
|---|---|---|
| Klara's and Liv's check-in answers | the live `/api/coach` Vercel function (Gemini), unchanged | the current check-in and conversation, as before |
| Just nu, Min dag, Töm huvudet, Låg energi, Kaos, Fråga Aura, evening, week | rules in `core/`, on the phone | nothing |

The everyday features are labelled as rules/"ingen AI" where it matters. A
unit test checks the coach request carries no plans, lists or journal.

## Run and test

```bash
cd aura
npm start            # http://127.0.0.1:4173 — live headers; /api/* answers 503 locally
npm run lint         # syntax, engine strings (sv/en), privacy/CSP rules, offline cache coverage
npm test             # engine unit tests + bridge/migration tests
npm run test:e2e     # Pixel 7 browser under the live CSP (needs Playwright + Chromium)
npm run bundle       # dist/ = exactly the files the deployment serves
```

## Deploying to the existing Vercel project

1. `npm run bundle`.
2. Copy `dist/` over the Vercel project's root files. **Keep the project's
   own `api/` folder and `vercel.json`** — the Gemini function and the
   security headers are not part of this folder and must not be replaced.
3. Deploy as usual. The service worker's cache name changed
   (`aura-v36-everyday-r1`), so phones pick up the new version on their
   next visit; existing data carries over.

`test/serve.js` reproduces the live response headers (CSP, permissions,
frame, referrer, nosniff), so the tests run under the same rules as
production.

## Not shipped (earlier work in this folder)

`app/`, `core/cycle.js`, `core/reflect.js` and `test/unit-platform.js` are
from the earlier claude.ai Artifact build. They are not loaded, cached,
bundled or deployed; they can be removed once the owner agrees.

## Deliberately deferred

- **AI brain-dump sorting**: the Gemini function's code is not in this
  folder, so no new endpoint was invented; sorting uses rules.
- **Calendar sync**: fixed times are entered in Aura.
- **Push notifications**: reminders appear while Aura is open (as before);
  the engine's notification rules show as one quiet line on Idag.
- **Built-in microphone**: the live `Permissions-Policy` disables it; the
  phone keyboard's microphone works in every field.
- **English UI**: the live product is Swedish; the engine has both languages.
