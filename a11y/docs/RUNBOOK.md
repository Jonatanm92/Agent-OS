# Operator runbook: from zero to a sent mini audit

Written for the person actually working the pipeline, not for the person who
wrote it. Everything below is a real command.

## One-time setup

```bash
cd a11y
npm install
npm run build
export A11Y_DATA_DIR=~/a11y-data            # database, screenshots and reports live here
export A11Y_SENDER_NAME="Jonatan"           # used in outreach drafts
export A11Y_SENDER_COMPANY="Ditt bolag"
```

Sanity check before touching anyone's website:

```bash
node dist/cli/Main.js demo
```

That runs the whole pipeline against local fixture storefronts. If the demo
produces a mini audit you would be willing to send, the machine is working.

## Day one: the first 100 domains

### 1. Build the seed list

A plain text file, one domain per line, `#` for comments. Anything after a comma
is ignored, so a CSV export works too.

```
# svenska b2c-butiker, inredning
nordvikhem.se
klarsiktform.se
```

Sources that work: industry association member lists, Shopify/WooCommerce
showcase pages, ecommerce award shortlists, your own browsing history. Do not
scrape a directory that forbids it — the whole business depends on being the
people who respect boundaries.

### 2. Scan the batch

```bash
node dist/cli/Main.js batch domains.txt --concurrency 3
```

Budget roughly **7–9 seconds per domain** at the default 1.5 s per-host delay,
so 100 domains is about 25–40 minutes. Leave it running.

The batch is crash-safe: it claims jobs from a SQLite queue, so if it dies on
domain 63 you re-run the same command and it picks up where it stopped.

### 3. Read the ranked list

```bash
node dist/cli/Main.js rank
```

Expect roughly a third to qualify. The rest is normal and correct:

| Outcome | What it means | What to do |
|---|---|---|
| `qualified` | Real barriers in the buying journey, contact path exists | Work it |
| `disqualified` — no meaningful findings | The store is well built | Leave them alone |
| `disqualified` — B2B | Sells to businesses | Leave them alone |
| `disqualified` — accessibility program | They already have this covered | Leave them alone |
| `unreachable` / `blocked` | Bot protection, robots.txt, or the site was down | Check one by hand before discarding |

### 4. Review before anything leaves the building

```bash
node dist/cli/Main.js console      # http://localhost:4300
```

Work the review queue. For each finding you are answering one question: **would
I defend this in front of the company's developer?** Approve, reject, or change
the severity. A systemic component is one decision, not one per page.

Then "Klarmarkera prospektet" to sign the audit off.

This step is not optional and it is not a rubber stamp. The whole offer rests on
the recipient finding that every claim is true.

### 5. Draft and send

```bash
node dist/cli/Main.js outreach nordvikhem.se
```

Read the draft. It cites real findings from their site — check that it reads
like a person wrote it about their shop, because that is the only reason anyone
replies. Then:

```bash
node dist/cli/Main.js outreach-approve out_xxx
# send it yourself, from your own mailbox, with the mini audit attached
node dist/cli/Main.js outreach-sent out_xxx
```

The platform never sends mail. That is deliberate: a send button here would turn
this into a spam cannon within a week.

### 6. Handle the replies

```bash
# they replied with interest
node dist/cli/Main.js advance nordvikhem.se REPLIED

# they asked to be left alone — this suppresses the domain permanently
node dist/cli/Main.js outreach-reply nordvikhem.se --text "Nej tack"
```

Opt-outs are honoured immediately and permanently. Never contact a suppressed
domain again, in any campaign, for any reason.

## After you win one

```bash
node dist/cli/Main.js advance nordvikhem.se WON --force
node dist/cli/Main.js report nordvikhem.se --level professional --pdf
node dist/cli/Main.js report nordvikhem.se --level developer
```

Winning also registers the domain as a monitored site. After they ship fixes:

```bash
node dist/cli/Main.js retest nordvikhem.se     # FIXED / PARTIALLY_FIXED / OPEN / REGRESSED
node dist/cli/Main.js monitor                  # runs every site that is due
node dist/cli/Main.js timeline nordvikhem.se   # the customer's whole history
```

## Weekly: is the process improving?

```bash
node dist/cli/Main.js metrics
```

Look at the **biggest drop-off** line first — it names the step that is leaking.

- Leaking at *scan → qualified*: the seed list is wrong. Change where you source
  domains, not the scoring threshold.
- Leaking at *contacted → response*: the mini audits are not convincing. Read
  five of them as if you were the recipient.
- Leaking at *response → meeting*: the offer is wrong, not the evidence.

Also watch `computeCostPerAuditSek` and `deliveryHoursPerCustomer`. If delivery
hours per customer are not falling as you win more customers, the remediation
guidance is not doing its job.

## When something goes wrong

**A scan says `unreachable`.** Open the site yourself. Bot protection
(Cloudflare, Akamai) is common and is not worth fighting — mark it and move on.

**Every finding on a site is inside a cookie banner.** The consent overlay could
not be declined. The report will say so. Those findings are attributed to the
CMP vendor and never lead a mini audit.

**A journey step is always untested.** Client-rendered navigation may render
after the crawler's wait window. Raise `A11Y_NAV_TIMEOUT_MS`, or accept it —
untested steps are always reported as untested, never as passing.

**A finding looks wrong.** Reject it in the console with a note. That is the
audit trail working. If the same false positive appears repeatedly, the rule
needs fixing in `src/findings/RuleCatalog.ts` — tell whoever maintains it.

## Tuning the ICP

`A11Y_ICP_CONFIG=/path/to/icp.json` overrides any subset of the scoring model:

```json
{
  "qualifyAtScore": 60,
  "positive": { "journey_barriers": { "id": "journey_barriers", "label": "High-severity barriers in the buying journey", "points": 30 } }
}
```

Change the threshold when the *worked* prospects are consistently good or
consistently bad — not because a batch produced a number you did not like.
