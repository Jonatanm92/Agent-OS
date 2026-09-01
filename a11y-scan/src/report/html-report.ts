/**
 * Printable single-file HTML report.
 *
 * Security posture (THREAT-MODEL.md T5): this document is opened locally, often
 * from file://, and every string in it that came from the scanned site is
 * attacker-controlled. Therefore:
 *   - every interpolation of target-derived text goes through escapeHtml()
 *   - the document contains NO <script> element and no inline event handlers,
 *     so there is nothing for injected markup to break out into
 *   - disclosure widgets use <details>, which needs no JavaScript
 *   - URLs are re-validated before being rendered as links
 */
import type { Issue, ManualCheck, ScanResult, Severity } from '../types.js';
import { escapeHtml, safeLink } from '../security/escape.js';
import { buildJourney, type JourneyStage } from '../analyze/journey.js';
import { countBySeverity, quickWins } from '../analyze/severity.js';
import { buildHandoff } from './handoff.js';
import { REPORT_DISCLAIMER } from './json-report.js';

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function badge(severity: Severity): string {
  return `<span class="badge badge--${severity}">${SEVERITY_LABEL[severity]}</span>`;
}

function verificationBadge(issue: Issue): string {
  return issue.verification === 'automatic'
    ? '<span class="badge badge--auto">Automatically verified</span>'
    : '<span class="badge badge--manual">Manual check required</span>';
}

function urlList(urls: string[], max = 6): string {
  const shown = urls.slice(0, max);
  const rest = urls.length - shown.length;
  const items = shown
    .map((url) => {
      const link = safeLink(url);
      return link.safe
        ? `<li><a href="${link.href}">${link.text}</a></li>`
        : `<li><code>${link.text}</code></li>`;
    })
    .join('');
  const more = rest > 0 ? `<li class="muted">…and ${rest} more page${rest === 1 ? '' : 's'}</li>` : '';
  return `<ul class="urls">${items}${more}</ul>`;
}

function issueSection(issue: Issue, index: number): string {
  const evidence = issue.examples
    .map((example) => {
      const link = safeLink(example.url);
      return `
        <div class="evidence">
          <div class="evidence__meta">
            <span class="tag">${escapeHtml(example.role)}</span>
            ${link.safe ? `<a href="${link.href}">${link.text}</a>` : `<code>${link.text}</code>`}
          </div>
          <div class="evidence__selector"><strong>Selector</strong> <code>${escapeHtml(example.selector)}</code></div>
          ${
            example.detail
              ? `<p class="evidence__detail"><span class="evidence__tool">Tool output</span> ${escapeHtml(example.detail)}</p>`
              : ''
          }
          <pre class="snippet"><code>${escapeHtml(example.snippet)}</code></pre>
          ${
            example.screenshot && example.screenshot.startsWith('data:image/png;base64,')
              ? `<img class="shot" alt="Screenshot of the affected element" src="${escapeHtml(example.screenshot)}">`
              : ''
          }
        </div>`;
    })
    .join('');

  return `
    <article class="issue" id="${escapeHtml(issue.id)}">
      <header class="issue__head">
        <div class="issue__number">${index + 1}</div>
        <div>
          <h3 class="issue__title">${escapeHtml(issue.title)}</h3>
          <div class="issue__badges">
            ${badge(issue.severity)}
            <span class="badge badge--effort">Effort: ${escapeHtml(issue.effort)}</span>
            ${verificationBadge(issue)}
          </div>
        </div>
      </header>

      <dl class="issue__facts">
        <div><dt>Component</dt><dd><code>${escapeHtml(issue.component)}</code></dd></div>
        <div><dt>Occurrences</dt><dd>${issue.instanceCount} on ${issue.affectedUrls.length} page${issue.affectedUrls.length === 1 ? '' : 's'}</dd></div>
        <div><dt>WCAG</dt><dd>${issue.wcag.length ? issue.wcag.map((w) => escapeHtml(w)).join('<br>') : '<span class="muted">Not mapped</span>'}</dd></div>
        <div><dt>Rule</dt><dd><code>${escapeHtml(issue.ruleId)}</code></dd></div>
      </dl>

      <div class="issue__block">
        <h4>Who this affects, and why it matters</h4>
        <p>${escapeHtml(issue.impact)}</p>
      </div>

      <div class="issue__block">
        <h4>How to fix it</h4>
        <p>${escapeHtml(issue.remediation)}</p>
      </div>

      <div class="issue__block">
        <h4>How to reproduce it</h4>
        <p>${escapeHtml(issue.verify)}</p>
        <p class="muted">Selector: <code>${escapeHtml(issue.examples[0]?.selector ?? issue.component)}</code>${
          issue.examples[0] ? ` on ${safeLink(issue.examples[0].url).text}` : ''
        }</p>
      </div>

      <div class="issue__block">
        <h4>Where it occurs</h4>
        ${urlList(issue.affectedUrls)}
      </div>

      <details class="issue__evidence">
        <summary>Evidence (${issue.examples.length} example${issue.examples.length === 1 ? '' : 's'})</summary>
        ${evidence}
      </details>
    </article>`;
}

function journeyTable(stages: JourneyStage[]): string {
  const rows = stages
    .map(
      (stage) => `
      <tr>
        <th scope="row">${escapeHtml(stage.label)}</th>
        <td>${stage.examined ? `${stage.issueCount}` : '<span class="muted">not examined</span>'}</td>
        <td>${stage.worstSeverity ? badge(stage.worstSeverity) : '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(stage.verdict)}</td>
      </tr>`
    )
    .join('');

  return `
    <table class="table">
      <caption class="visually-hidden">Accessibility findings by customer journey stage</caption>
      <thead>
        <tr><th scope="col">Stage</th><th scope="col">Issues</th><th scope="col">Worst</th><th scope="col">Assessment</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function manualSection(checks: ManualCheck[]): string {
  if (checks.length === 0) return '';
  const items = checks
    .map(
      (check) => `
      <article class="manual">
        <h4>${escapeHtml(check.area)} <span class="badge badge--manual">Manual check required</span></h4>
        ${check.flaggedBy ? `<p class="manual__flag">${escapeHtml(check.flaggedBy)}</p>` : ''}
        <p><strong>Do this:</strong> ${escapeHtml(check.instruction)}</p>
        <p><strong>It passes when:</strong> ${escapeHtml(check.passCriteria)}</p>
        <p class="muted">${check.wcag.map((w) => escapeHtml(w)).join(' · ')}</p>
        <p class="manual__result">Result: <span class="manual__blank">☐ Pass&nbsp;&nbsp;☐ Fail&nbsp;&nbsp;☐ Not applicable</span></p>
      </article>`
    )
    .join('');

  return `
    <section class="section" id="manual">
      <h2>Manual verification script</h2>
      <p class="lede">
        These checks cannot be decided by software. None of them has been performed —
        every one is unverified until a person completes it and records the result below.
      </p>
      ${items}
    </section>`;
}

export function renderHtmlReport(result: ScanResult): string {
  const tested = result.pages.filter((p) => !p.error);
  const failed = result.pages.filter((p) => p.error);
  const rolesExamined = [...new Set(tested.map((p) => p.role))];
  const counts = countBySeverity(result.issues);
  const wins = quickWins(result.issues);
  const journey = buildJourney(result.issues, rolesExamined);
  const handoff = buildHandoff(result);
  const scanDate = new Date(result.scanDate);

  const topFive = result.issues.slice(0, 5);

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Risk Scan — ${escapeHtml(result.domain)}</title>
<style>
  :root {
    --ink: #14161a; --muted: #5b6069; --line: #e2e5ea; --bg: #ffffff; --panel: #f6f7f9;
    --critical: #b3261e; --high: #b3541e; --medium: #8a6d13; --low: #4a5568;
    --accent: #1a4fa0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.02em; }
  h2 { font-size: 1.4rem; margin: 0 0 12px; letter-spacing: -0.01em; }
  h3 { font-size: 1.1rem; margin: 0; }
  h4 { font-size: 0.95rem; margin: 0 0 6px; }
  p { margin: 0 0 12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em;
         background: var(--panel); padding: 1px 5px; border-radius: 4px; word-break: break-word; }
  a { color: var(--accent); }
  .muted { color: var(--muted); }
  .lede { color: var(--muted); font-size: 1.05rem; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .masthead { border-bottom: 3px solid var(--ink); padding-bottom: 20px; margin-bottom: 28px; }
  .masthead__kicker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.75rem;
                      font-weight: 700; color: var(--muted); margin: 0 0 10px; }
  .masthead__meta { display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 0.9rem; color: var(--muted); }

  .disclaimer { border: 2px solid var(--ink); border-radius: 8px; padding: 16px 18px; margin: 0 0 28px;
                background: var(--panel); font-size: 0.92rem; }
  .disclaimer strong { display: block; margin-bottom: 6px; }

  .section { margin: 0 0 40px; }
  .section > h2 { border-bottom: 1px solid var(--line); padding-bottom: 8px; }

  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 20px 0; }
  .stat { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
  .stat__value { font-size: 1.9rem; font-weight: 700; line-height: 1; }
  .stat__label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px; }
  .stat--critical .stat__value { color: var(--critical); }
  .stat--high .stat__value { color: var(--high); }

  .badge { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
           letter-spacing: 0.05em; padding: 3px 8px; border-radius: 999px; border: 1px solid currentColor; }
  .badge--critical { color: var(--critical); }
  .badge--high { color: var(--high); }
  .badge--medium { color: var(--medium); }
  .badge--low { color: var(--low); }
  .badge--effort { color: var(--muted); }
  .badge--auto { color: #1c6b3f; }
  .badge--manual { color: #6b3fa0; }

  .table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  .table th, .table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .table thead th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .table th[scope="row"] { font-weight: 600; }

  .issue { border: 1px solid var(--line); border-radius: 10px; padding: 20px; margin: 0 0 18px; break-inside: avoid; }
  .issue__head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
  .issue__number { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: var(--ink);
                   color: #fff; display: flex; align-items: center; justify-content: center;
                   font-weight: 700; font-size: 0.85rem; }
  .issue__badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .issue__facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin: 0 0 16px;
                  padding: 14px; background: var(--panel); border-radius: 8px; font-size: 0.88rem; }
  .issue__facts dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .issue__facts dd { margin: 2px 0 0; }
  .issue__block { margin: 0 0 14px; }
  .issue__block h4 { color: var(--muted); text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.08em; }
  .urls { margin: 0; padding-left: 18px; font-size: 0.88rem; word-break: break-all; }
  .urls li { margin-bottom: 3px; }

  details { border-top: 1px solid var(--line); padding-top: 10px; }
  summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; }
  .evidence { margin: 12px 0 0; padding: 12px; background: var(--panel); border-radius: 8px; font-size: 0.85rem; }
  .evidence__meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; word-break: break-all; }
  .evidence__detail { margin: 6px 0; color: var(--muted); font-size: 0.82rem; }
  .evidence__tool { display: inline-block; font-size: 0.65rem; letter-spacing: 0.08em;
                    text-transform: uppercase; font-weight: 700; padding: 1px 6px; margin-right: 6px;
                    border: 1px solid var(--line); border-radius: 3px; color: var(--muted); }
  .tag { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; background: var(--ink);
         color: #fff; padding: 2px 7px; border-radius: 4px; }
  .snippet { margin: 8px 0 0; padding: 10px; background: #fff; border: 1px solid var(--line);
             border-radius: 6px; overflow-x: auto; font-size: 0.78rem; }
  .snippet code { background: none; padding: 0; white-space: pre-wrap; word-break: break-word; }
  .shot { display: block; max-width: 100%; margin-top: 10px; border: 1px solid var(--line);
          border-radius: 6px; background: #fff; }

  .manual { border-left: 3px solid #6b3fa0; padding: 4px 0 4px 16px; margin: 0 0 20px; break-inside: avoid; }
  .manual h4 { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 1rem; }
  .manual__flag { background: #fdf3e7; border-left: 3px solid var(--high); padding: 8px 10px;
                  font-size: 0.85rem; margin: 8px 0; }
  .manual__blank { font-family: ui-monospace, monospace; letter-spacing: 0.04em; }

  .win { border: 1px solid var(--line); border-left: 4px solid #1c6b3f; border-radius: 6px;
         padding: 12px 14px; margin-bottom: 10px; }
  .handoff { font-size: 0.85rem; }
  .handoff pre { background: var(--panel); padding: 14px; border-radius: 8px; overflow-x: auto;
                 white-space: pre-wrap; word-break: break-word; }

  @media (min-width: 700px) { .stats { grid-template-columns: repeat(4, 1fr); } }

  @media print {
    .wrap { max-width: none; padding: 0; }
    .issue, .manual, .win { break-inside: avoid; }
    details { display: block; }
    details > summary { display: none; }
    a { color: inherit; text-decoration: none; }
    .snippet { font-size: 0.7rem; }
  }
</style>
</head>
<body>
<main class="wrap">

  <header class="masthead">
    <p class="masthead__kicker">E-commerce Accessibility Risk Scan</p>
    <h1>${escapeHtml(result.domain)}</h1>
    <div class="masthead__meta">
      <span>Scanned ${escapeHtml(scanDate.toISOString().slice(0, 10))}</span>
      <span>${tested.length} page${tested.length === 1 ? '' : 's'} examined</span>
      <span>${result.issues.length} unique issue${result.issues.length === 1 ? '' : 's'}</span>
      <span>Duration ${Math.round(result.durationMs / 1000)}s</span>
    </div>
  </header>

  <div class="disclaimer">
    <strong>What this report is</strong>
    ${escapeHtml(REPORT_DISCLAIMER)}
  </div>

  <section class="section" id="summary">
    <h2>Executive summary</h2>

    <div class="stats">
      <div class="stat stat--critical"><div class="stat__value">${counts.critical}</div><div class="stat__label">Critical</div></div>
      <div class="stat stat--high"><div class="stat__value">${counts.high}</div><div class="stat__label">High</div></div>
      <div class="stat"><div class="stat__value">${counts.medium}</div><div class="stat__label">Medium</div></div>
      <div class="stat"><div class="stat__value">${counts.low}</div><div class="stat__label">Low</div></div>
    </div>

    <h3>Five highest-priority fixes</h3>
    ${
      topFive.length === 0
        ? '<p class="muted">No automated failures were detected on the pages examined. This does not mean the site is accessible — see the manual verification script.</p>'
        : `<ol>${topFive
            .map(
              (issue) =>
                // The component is part of the label: two issues can share a
                // title and differ only by where they occur, and without it the
                // list reads like a de-duplication failure.
                `<li><a href="#${escapeHtml(issue.id)}">${escapeHtml(issue.title)}</a> ` +
                `<code>${escapeHtml(issue.component)}</code> ${badge(issue.severity)} ` +
                `<span class="muted">effort: ${escapeHtml(issue.effort)}</span></li>`
            )
            .join('')}</ol>`
    }

    <h3>Strongest positive observations</h3>
    ${
      result.positives.length === 0
        ? '<p class="muted">The scan did not establish any site-wide positives on the pages examined.</p>'
        : `<ul>${result.positives.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
    }
  </section>

  <section class="section" id="scope">
    <h2>Scope and limitations</h2>
    <p class="lede">
      This scan combined automated testing in a real browser with a generated script of
      checks that require human judgement. The automated part is complete; the manual part
      has not been performed.
    </p>

    <h3>Pages examined</h3>
    <table class="table">
      <thead><tr><th scope="col">URL</th><th scope="col">Type</th><th scope="col">Status</th></tr></thead>
      <tbody>
        ${result.pages
          .map((page) => {
            const link = safeLink(page.url);
            return `<tr>
              <td>${link.safe ? `<a href="${link.href}">${link.text}</a>` : `<code>${link.text}</code>`}</td>
              <td>${escapeHtml(page.role)}</td>
              <td>${page.error ? `<span class="muted">${escapeHtml(page.error)}</span>` : escapeHtml(String(page.status ?? '—'))}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>

    <h3>What was not tested</h3>
    <ul>
      <li>Anything behind a login. The scanner never authenticates and never bypasses authentication.</li>
      <li>The checkout itself. Nothing was added to a cart and no order was placed, so only the checkout entry page could be reached.</li>
      <li>Pages beyond the ${result.limits.maxPages}-page, depth-${result.limits.maxDepth} budget of this scan tier.</li>
      <li>Every item in the manual verification script below.</li>
      ${result.notTested.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
    </ul>

    <h3>Coverage honesty</h3>
    <p>
      Automated rules detect a minority of WCAG success criteria — commonly cited figures put
      it around a third. A page with zero automated failures can still be unusable with a
      keyboard or a screen reader. The manual script exists precisely because the automated
      pass cannot answer those questions, and no item in it has been marked as passing.
    </p>
  </section>

  <section class="section" id="journey">
    <h2>Customer journey</h2>
    <p class="lede">Browse → Product → Add to cart → Cart → Checkout entry.</p>
    ${journeyTable(journey)}
  </section>

  <section class="section" id="quick-wins">
    <h2>Quick wins</h2>
    <p class="lede">High impact for comparatively little work — a sensible first sprint.</p>
    ${
      wins.length === 0
        ? '<p class="muted">No issues fell into the high-impact, low-effort quadrant.</p>'
        : wins
            .slice(0, 8)
            .map(
              (issue) => `
        <div class="win">
          <strong><a href="#${escapeHtml(issue.id)}">${escapeHtml(issue.title)}</a></strong>
          <code>${escapeHtml(issue.component)}</code>
          ${badge(issue.severity)}
          <p class="muted" style="margin:6px 0 0;">${escapeHtml(issue.remediation)}</p>
        </div>`
            )
            .join('')
    }
  </section>

  <section class="section" id="findings">
    <h2>Priority findings</h2>
    ${
      result.issues.length === 0
        ? '<p class="muted">No automated failures were detected on the pages examined.</p>'
        : result.issues.map((issue, index) => issueSection(issue, index)).join('')
    }
  </section>

  ${manualSection(result.manualChecks)}

  <section class="section handoff" id="handoff">
    <h2>Developer handoff</h2>
    <p class="lede">One task per defect, ready to paste into Jira, Linear or GitHub.</p>
    ${
      handoff.length === 0
        ? '<p class="muted">No tasks generated.</p>'
        : `<table class="table">
            <thead><tr><th scope="col">Key</th><th scope="col">Priority</th><th scope="col">Estimate</th><th scope="col">Task</th></tr></thead>
            <tbody>${handoff
              .map(
                (task) =>
                  `<tr><td><code>${escapeHtml(task.key)}</code></td><td>${escapeHtml(task.priority)}</td><td>${escapeHtml(task.estimate)}</td><td>${escapeHtml(task.title)}</td></tr>`
              )
              .join('')}</tbody>
          </table>`
    }
  </section>

  <footer class="section">
    <h2>About this scan</h2>
    <p class="muted">
      Generated by an automated accessibility risk scanner using axe-core plus additional
      structural checks, run in Chromium against ${tested.length} page${tested.length === 1 ? '' : 's'}
      of ${escapeHtml(result.domain)}${result.robotsRespected ? ', respecting robots.txt' : ''}.
      ${failed.length > 0 ? `${failed.length} page${failed.length === 1 ? '' : 's'} could not be examined and ${failed.length === 1 ? 'is' : 'are'} listed above.` : ''}
      No order was placed and no form was submitted during the scan.
    </p>
    <p class="muted">${escapeHtml(REPORT_DISCLAIMER)}</p>
  </footer>

</main>
</body>
</html>`;
}
