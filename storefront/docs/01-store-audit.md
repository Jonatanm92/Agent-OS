# 1. Current-store audit

Date of audit: 2026-08-31
Audited by: implementation agent, from the `Jonatanm92/Agent-OS` repository checkout.

## Headline finding

**This environment has no connection to Shopify of any kind.** Nothing about the
live store could be inspected, and nothing was changed in it. Every claim below
is something that was actually checked, with the command used.

## What was checked, and what was found

| Check | Command | Result |
|---|---|---|
| Shopify theme files in the repo | `grep -ril shopify .` | none |
| Liquid files anywhere on disk | `find / -name "*.liquid"` | none |
| Theme config (`settings_schema.json`, `.theme-check.yml`) | `find / -iname ...` | none |
| Shopify CLI | `which shopify theme` | not installed |
| Shopify API credentials | `env` scan for `SHOP*`/`*TOKEN*`/`*KEY*` | none |
| Shopify MCP connector | scan of `~/.claude.json` for `mcpServers` | none configured |
| Zendrop / pet-store artifacts | `grep -ril zendrop\|"pet living"\|"jm pet"` | none |
| Git remotes | `git remote -v` | only `github.com/Jonatanm92/Agent-OS` |
| Shopify documentation | `WebFetch shopify.dev`, `help.shopify.com` | **blocked by the session's egress policy** |

## What this repository actually is

`Agent-OS` is an unrelated project: a self-hosted "Mission Control" dashboard
(Node/TypeScript, Vite client, Express server) plus a `revenue-os` module. It has
no e-commerce code. It was chosen as the working directory because it is the only
repository this session has access to — not because it contains the storefront.

## Consequences for this piece of work

Everything that can be built without a store has been built and verified locally:
theme sections, snippets, assets, JSON templates, and a renderer that proves they
work. Everything that genuinely requires Admin access is written up as exact
steps for the owner in `03-admin-steps.md`.

**Nothing in this delivery has touched the live store.** No product was created,
edited, deleted or drafted. No theme was published. Zendrop and every other
existing integration are untouched, because this session could not reach them.

## What the owner still has to confirm (cannot be verified from here)

These are stated as unknowns rather than guessed at:

1. **Which theme is live**, and whether it is an Online Store 2.0 theme. The
   sections require OS 2.0 (JSON templates). Every theme Shopify has shipped
   since mid-2021 qualifies; a much older theme would need the sections placed
   differently. Check: Online Store → Themes — if you can add sections to the
   homepage in the editor, it is OS 2.0.
2. **The real state of the ~112 legacy products** — how many are Draft vs Active,
   and whether any are still in a live collection.
3. **Whether Zendrop is still installed** and whether it has products attached.
4. **The store's plan, currency and tax configuration.** Prices here assume SEK.
5. **Whether the theme hijacks add-to-cart with AJAX** — this one materially
   affects whether file uploads work. See `08-known-limitations.md`.
