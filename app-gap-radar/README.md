# App Gap Radar

Finds market gaps in the App Store: it pulls the **top-grossing apps per category**, harvests their **recent reviews**, tags 1–2★ complaints into themes (billing traps, paywalls, ads, bugs, data loss…), and ranks categories and apps by how angry paying users are about things a new entrant can fix.

Zero dependencies (Node ≥ 20). Uses Apple's public RSS and lookup endpoints only.

```bash
node radar.mjs collect --country us --per-category 12 --pages 10   # ~5 min, writes data/raw-us.json
node radar.mjs analyze --country us                                # writes data/report-us.md + report-us.json
```

- `GENRES` in `radar.mjs` lists the categories scanned (games excluded on purpose).
- `THEMES` is the complaint taxonomy: add regexes to track new pain points.
- Gap score = 1–2★ share × fixable-complaint density × (1 + switch/"would pay" rate).

**Limits:** Apple's RSS returns at most 500 recent reviews per app, and some apps return none (ReciMe and NYT Cooking did in the 2026-09-23 run). Theme tagging is keyword-based, so read the quotes (`report-<country>.json → quotes`) before deciding. Google Play isn't covered yet.

The 2026-09-23 US run led to **Jarful** (`../jarful`); see `../jarful/docs/LAUNCH.md` for the reasoning.
