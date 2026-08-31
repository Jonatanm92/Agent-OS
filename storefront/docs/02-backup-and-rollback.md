# 2. Backup and rollback

## Status: rollback point NOT yet created

This is stated plainly because it matters: **no backup of the live store exists
yet, and this session could not create one.** Creating it requires Shopify Admin
access, which this environment does not have (see `01-store-audit.md`).

Nothing in this delivery has modified the store, so there is currently nothing to
roll back from. The backup below must be taken **before** the owner applies any
of the steps in `03-admin-steps.md`.

## What IS backed up

The new code is under version control in `Jonatanm92/Agent-OS`, branch
`claude/concert-memory-storefront-8uzlbe`, in `storefront/`. Reverting the code
side of this work is `git revert` of one commit. Nothing outside `storefront/`
was modified.

## Rollback point the owner must create first (about 5 minutes)

Do these four things in order, before anything else.

### 1. Duplicate the live theme — this is the actual rollback point

Online Store → Themes → find the **live** theme → `⋯` → **Duplicate**.
Rename the copy: `BACKUP <today's date> — pre concert pivot`.

Leave it alone permanently. To roll back at any point: `⋯` → **Publish** on that
backup. Rollback takes under a minute and restores the storefront exactly.

### 2. Download the theme off Shopify as well

Same `⋯` menu → **Download theme file**. Shopify emails a `.zip`. Save it
somewhere outside Shopify. This protects against the account itself being the
problem, which a duplicate inside the same store does not.

### 3. Export the product catalogue

Products → **Export** → *All products* → *CSV for Excel/Numbers*. Save the file.

This is the backup for the ~112 legacy products. **No product is deleted by any
step in this delivery** — the export exists so that even an accidental bulk edit
later is recoverable.

### 4. Work on a copy, never on the live theme

Duplicate the live theme a **second** time and name it
`JM Store — Concert Memory (working)`. Apply every step in `03-admin-steps.md`
to *this* theme.

The live storefront keeps serving the current theme the whole time you work. The
pivot goes live only when you press Publish, and one click puts it back.

## Rollback decision table

| Situation | Action | Time |
|---|---|---|
| New storefront is wrong / broken after publishing | Publish `BACKUP <date>` theme | < 1 min |
| One section misbehaves, rest is fine | Theme editor → remove that section | < 1 min |
| Code change was bad, want the previous version | Theme editor → `⋯` → older theme version | < 2 min |
| Want the repo code gone | `git revert` the commit on the branch | < 2 min |
| Products edited by mistake | Re-import the CSV from step 3 | ~10 min |

## What is NOT reversible by a theme rollback

Be aware these live outside the theme, so republishing the backup theme will not
undo them:

- Products created or edited (Admin data, not theme data)
- Settings → Checkout changes (e.g. order-processing / fulfilment settings)
- Apps installed or uninstalled
- Policy page text

Each of these is individually reversible, but by hand. Steps that touch them are
flagged with **[not undone by theme rollback]** in `03-admin-steps.md`.
