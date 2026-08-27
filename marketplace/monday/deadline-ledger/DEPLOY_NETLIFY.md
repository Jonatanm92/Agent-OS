# Deadline Ledger — Netlify deploy handoff

A dedicated empty Netlify project already exists:

- Project name: `deadline-ledger`
- Project/Site ID: `457b89f4-6e5c-46d2-85c5-59229c5b3505`
- Intended primary URL after first production deploy: `https://deadline-ledger.netlify.app`

No source code has been falsely claimed as deployed there yet.

## Windows / PowerShell production deploy

Run from the local `Agent-OS` repository on branch `forge/deadline-ledger-mvp`:

```powershell
git switch forge/deadline-ledger-mvp
git pull
cd marketplace\monday\deadline-ledger
npm ci
npm test
npm run build
$env:NETLIFY_SITE_ID="457b89f4-6e5c-46d2-85c5-59229c5b3505"
npx -y netlify-cli@latest deploy --prod --dir=dist
```

If Netlify CLI asks for authentication, complete the normal Netlify login flow for the already connected account and re-run only the final deploy command.

`NETLIFY_SITE_ID` is not a secret; it identifies the target project. Do **not** put Netlify access tokens, monday Client Secret, Signing Secret or any temporary MCP proxy URL into this repository.

## Why deploy the built `dist` directory

- CI already builds the same Vite app from the committed `package-lock.json`.
- `npm ci` makes local deployment use the locked dependency graph.
- `netlify.toml` supplies the static security headers and iframe `frame-ancestors` policy.
- A manual production deploy is enough for the private QA gate; Git-based continuous deployment can be connected later if desired.

## Verification after deploy

Open:

`https://deadline-ledger.netlify.app`

Expected outside monday: the shell may report missing monday board context because it is designed to run as a Board View.

Then update the **draft** monday Board View feature deployment to:

`https://deadline-ledger.netlify.app`

Promote that draft, open `Deadline Ledger — QA`, and run the embedded save/reload acceptance test.

## Do not merge PR #11 yet

Merge only after:

1. Netlify deploy is live over HTTPS.
2. monday Board View loads the Netlify URL.
3. Live Date/Timeline changes render.
4. A reason saves to global board-scoped monday storage.
5. The same reason remains after reload/view switch.
6. CI is still green on the exact merged candidate.
