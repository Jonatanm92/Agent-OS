#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createPlatform, type Platform } from '../services/Platform.js';
import { ScanService } from '../services/ScanService.js';
import { ReportService } from '../services/ReportService.js';
import { BatchService } from '../services/BatchService.js';
import { ReviewService } from '../services/ReviewService.js';
import { PipelineService } from '../services/PipelineService.js';
import { OutreachService } from '../services/OutreachService.js';
import { RetestService } from '../services/RetestService.js';
import { MonitoringService } from '../services/MonitoringService.js';
import { buildRemediation } from '../remediation/RemediationEngine.js';
import { planGithubRemediation } from '../remediation/GithubWorkflow.js';
import { computeMetrics, biggestDropOff } from '../analytics/Metrics.js';
import { startServer } from '../api/Server.js';
import type { ReportLevel, SalesStage } from '../core/Types.js';

const USAGE = `A11Y Revenue OS

  a11y-os scan <domain> [--report] [--pdf]      Scan one site end to end
  a11y-os batch <file|domain...> [--concurrency N] [--no-mini]
  a11y-os rank [--limit N]                      Top qualified prospects
  a11y-os report <domain> --level mini|professional|developer [--pdf]
  a11y-os review [<domain>]                     Show the review queue
  a11y-os approve <findingId> [--note "..."]    Approve one finding
  a11y-os reject <findingId> [--note "..."]     Reject one finding
  a11y-os signoff <domain>                      Mark reviewed, ready for outreach
  a11y-os pipeline [board|worklist]
  a11y-os advance <domain> <STAGE> [--force]
  a11y-os outreach <domain>                     Draft outreach from approved findings
  a11y-os outreach-approve <draftId>
  a11y-os outreach-sent <draftId>
  a11y-os outreach-reply <domain> --text "..."  Record a reply; honours opt-outs
  a11y-os retest <domain>                       Re-run and classify each finding
  a11y-os monitor [<domain>]                    Run monitoring (all due sites if omitted)
  a11y-os remediation <findingId> [--github]    Remediation guidance / PR plan
  a11y-os timeline <domain>                     Compliance memory for one customer
  a11y-os metrics                               Business metrics
  a11y-os suppress <domain> [--reason "..."]    Never contact this domain again
  a11y-os console [--port 4300]                 Start the internal review console
  a11y-os demo                                  Run the full slice against local fixtures

Environment: A11Y_DATA_DIR, A11Y_PER_HOST_DELAY_MS, A11Y_MAX_PAGES_PER_SCAN, A11Y_ICP_CONFIG, A11Y_CHROMIUM_PATH`;

interface Args {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else flags[key] = true;
    } else positionals.push(token);
  }
  return { command, positionals, flags };
}

function requireProspect(platform: Platform, domain: string) {
  const prospect = platform.store.findProspectByDomain(domain);
  if (!prospect) throw new Error(`No prospect for ${domain}. Run: a11y-os scan ${domain}`);
  return prospect;
}

const table = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return '(empty)';
  const columns = Object.keys(rows[0]);
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  return [line(columns), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(columns.map((c) => String(r[c] ?? ''))))].join('\n');
};

async function main(): Promise<number> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || flags.help) {
    console.log(USAGE);
    return 0;
  }

  const platform = createPlatform();
  try {
    switch (command) {
      case 'scan': {
        const domain = positionals[0];
        if (!domain) throw new Error('scan needs a domain');
        const outcome = await new ScanService(platform).scanDomain(domain);
        console.log(`\n${outcome.prospect.domain} — ${outcome.prospect.companyName ?? 'company name not published on the site'}`);
        console.log(`platform=${outcome.prospect.ecommercePlatform} cms=${outcome.prospect.cms} scan=${outcome.prospect.scanStatus}`);
        console.log('\nJourney:');
        console.log(table(outcome.journey.map((s) => ({ step: s.pageType, tested: s.reached ? 'yes' : 'no', detail: s.reached ? s.url : s.reason }))));
        console.log(`\nFindings: ${outcome.findings.length} (${outcome.groups.filter((g) => g.systemic).length} systemic components)`);
        console.log(`Lead score ${outcome.prospect.leadScore} · evidence ${outcome.prospect.evidenceScore} · ${outcome.prospect.qualificationStatus}`);
        console.log(`Next action: ${outcome.prospect.nextAction}`);
        if (outcome.scoring?.reviewFlags.length) {
          console.log('\nNeeds a human check:');
          for (const flag of outcome.scoring.reviewFlags) console.log(`  - ${flag}`);
        }
        if (flags.report) {
          const report = await new ReportService(platform).generate(outcome.prospect.id, { level: 'mini', pdf: Boolean(flags.pdf) });
          console.log(`\nMini audit: ${report.htmlPath}`);
          if (report.pdfPath) console.log(`PDF: ${report.pdfPath}`);
        }
        return 0;
      }

      case 'batch': {
        const domains = positionals.flatMap((value) =>
          value.includes('.txt') || value.includes('.csv')
            ? readFileSync(value, 'utf8').split(/\r?\n/).map((l) => l.split(',')[0].trim()).filter((l) => l && !l.startsWith('#'))
            : [value],
        );
        if (domains.length === 0) throw new Error('batch needs domains or a file');
        const batch = new BatchService(platform);
        const { submitted, skipped } = batch.submit(domains);
        console.log(`Submitted ${submitted} domain(s)${skipped.length ? `, skipped ${skipped.length} suppressed` : ''}.`);
        const summary = await batch.run({
          concurrency: Number(flags.concurrency ?? platform.config.scanConcurrency),
          autoMiniAudit: flags['no-mini'] !== true,
        });
        console.log(`\nScanned ${summary.scanned}/${summary.submitted} in ${(summary.durationMs / 1000).toFixed(1)}s`);
        console.log(`qualified=${summary.qualified} disqualified=${summary.disqualified} untestable=${summary.unreachable} failed=${summary.failed}`);
        console.log(`mini audits generated: ${summary.miniAuditsGenerated}`);
        if (summary.errors.length) {
          console.log('\nErrors:');
          for (const error of summary.errors.slice(0, 10)) console.log(`  ${error.domain}: ${error.error}`);
        }
        console.log('\nTop prospects:');
        console.log(table(batch.rank(10).map((p) => ({ domain: p.domain, lead: p.leadScore, evidence: p.evidenceScore, stage: p.salesStage, next: p.nextAction }))));
        return 0;
      }

      case 'rank': {
        const rows = new BatchService(platform).rank(Number(flags.limit ?? 25));
        console.log(table(rows.map((p) => ({ domain: p.domain, company: p.companyName ?? '-', lead: p.leadScore, evidence: p.evidenceScore, platform: p.ecommercePlatform, stage: p.salesStage }))));
        return 0;
      }

      case 'report': {
        const prospect = requireProspect(platform, positionals[0]);
        const level = (flags.level as ReportLevel) ?? 'mini';
        const report = await new ReportService(platform).generate(prospect.id, { level, pdf: Boolean(flags.pdf) });
        console.log(`${level} report with ${report.findings.length} finding(s)`);
        console.log(`HTML: ${report.htmlPath}`);
        console.log(`JSON: ${report.jsonPath}`);
        if (report.pdfPath) console.log(`PDF:  ${report.pdfPath}`);
        return 0;
      }

      case 'review': {
        const prospectId = positionals[0] ? requireProspect(platform, positionals[0]).id : undefined;
        const items = new ReviewService(platform).queue({ prospectId, limit: Number(flags.limit ?? 20) });
        console.log(table(items.map((i) => ({ id: i.finding.id, domain: i.prospectDomain, severity: i.finding.severity, confidence: i.finding.confidence, rule: i.finding.rule, page: i.finding.pageType }))));
        console.log(`\n${items.length} finding(s) awaiting review. Use: a11y-os approve <findingId>`);
        return 0;
      }

      case 'approve':
      case 'reject': {
        const result = new ReviewService(platform).apply({
          reviewer: String(flags.reviewer ?? process.env.USER ?? 'operator'),
          action: command === 'approve' ? 'APPROVE' : 'REJECT',
          findingId: positionals[0],
          note: typeof flags.note === 'string' ? flags.note : undefined,
        });
        console.log(`${result.decision.action} recorded for ${positionals[0]}`);
        return 0;
      }

      case 'signoff': {
        const prospect = requireProspect(platform, positionals[0]);
        new ReviewService(platform).signOff(prospect.id, String(flags.reviewer ?? process.env.USER ?? 'operator'), typeof flags.note === 'string' ? flags.note : undefined);
        console.log(`${prospect.domain} → READY_FOR_OUTREACH`);
        return 0;
      }

      case 'pipeline': {
        const pipeline = new PipelineService(platform);
        if (positionals[0] === 'worklist') {
          console.log(table(pipeline.worklist(40).map((r) => ({ domain: r.prospect.domain, stage: r.stageLabel, lead: r.prospect.leadScore, next: r.nextAction, days: r.daysInStage }))));
        } else {
          console.log(table(Object.entries(pipeline.board()).map(([stage, count]) => ({ stage, count }))));
        }
        return 0;
      }

      case 'advance': {
        const prospect = requireProspect(platform, positionals[0]);
        const updated = new PipelineService(platform).advance(prospect.id, positionals[1] as SalesStage, { force: Boolean(flags.force), note: typeof flags.note === 'string' ? flags.note : undefined });
        console.log(`${updated.domain} → ${updated.salesStage}: ${updated.nextAction}`);
        return 0;
      }

      case 'outreach': {
        const prospect = requireProspect(platform, positionals[0]);
        const draft = new OutreachService(platform).draft(prospect.id, { reportLink: typeof flags.link === 'string' ? flags.link : null });
        console.log(`Draft ${draft.id} → ${draft.toValue ?? 'no contact path found'}\n`);
        console.log(`Subject: ${draft.subject}\n`);
        console.log(draft.body);
        console.log(`\nApprove with: a11y-os outreach-approve ${draft.id}`);
        return 0;
      }

      case 'outreach-approve': {
        const draft = new OutreachService(platform).approve(positionals[0], String(flags.reviewer ?? process.env.USER ?? 'operator'));
        console.log(`Approved ${draft.id}. Send it yourself, then: a11y-os outreach-sent ${draft.id}`);
        return 0;
      }

      case 'outreach-sent': {
        const draft = new OutreachService(platform).markSent(positionals[0]);
        console.log(`Marked ${draft.id} as sent.`);
        return 0;
      }

      case 'outreach-reply': {
        const prospect = requireProspect(platform, positionals[0]);
        const text = typeof flags.text === 'string' ? flags.text : positionals.slice(1).join(' ');
        if (!text) throw new Error('outreach-reply needs the reply text: --text "…"');
        const result = new OutreachService(platform).recordReply(prospect.id, text, typeof flags.contact === 'string' ? flags.contact : undefined);
        if (result.optedOut) {
          console.log(`${prospect.domain} asked not to be contacted. Domain suppressed permanently and marked LOST.`);
        } else {
          const updated = platform.store.getProspect(prospect.id)!;
          console.log(`${updated.domain} → ${updated.salesStage}: ${updated.nextAction}`);
        }
        return 0;
      }

      case 'retest': {
        const prospect = requireProspect(platform, positionals[0]);
        const summary = await new RetestService(platform).retest(prospect.id);
        console.log(table(Object.entries(summary.counts).map(([outcome, count]) => ({ outcome, count }))));
        for (const result of summary.results.filter((r) => r.outcome !== 'OPEN').slice(0, 15)) {
          console.log(`  [${result.outcome}] ${result.detail}`);
        }
        return 0;
      }

      case 'monitor': {
        const monitoring = new MonitoringService(platform);
        const domains = positionals.length ? positionals : monitoring.dueSites().map((s) => s.domain);
        if (domains.length === 0) {
          console.log('No monitored sites are due.');
          return 0;
        }
        for (const domain of domains) {
          const run = await monitoring.runFor(domain);
          console.log(`\n${run.domain}: ${run.alerts.length} alert(s), ${run.suppressedAlertCount} change(s) not escalated`);
          for (const alert of run.alerts) console.log(`  [${alert.severity}] ${alert.kind}: ${alert.title} (${alert.url ?? 'site'})`);
        }
        return 0;
      }

      case 'remediation': {
        const finding = platform.audits.getFinding(positionals[0]);
        if (!finding) throw new Error(`Unknown finding: ${positionals[0]}`);
        const prospect = platform.store.getProspect(finding.prospectId)!;
        const context = { platform: prospect.ecommercePlatform, cms: prospect.cms };
        if (flags.github) {
          const plan = planGithubRemediation(finding, context);
          console.log(`Branch: ${plan.branch}\nCommit: ${plan.commitMessage}\n\n${plan.prBody}\n\nCommands:`);
          for (const cmd of plan.commands) console.log(`  ${cmd}`);
          return 0;
        }
        const guidance = buildRemediation(finding, context);
        console.log(`Stack: ${guidance.stack}\n\nLikely locations:`);
        for (const location of guidance.likelyLocations) console.log(`  - ${location}`);
        console.log('\nSteps:');
        for (const step of guidance.steps) console.log(`  - ${step}`);
        if (guidance.suggestion) {
          console.log(`\nSuggested change (${guidance.suggestion.language}):\n- ${guidance.suggestion.before}\n+ ${guidance.suggestion.after}\n\n${guidance.suggestion.note}`);
        }
        console.log('\nLimitations:');
        for (const limitation of guidance.limitations) console.log(`  - ${limitation}`);
        return 0;
      }

      case 'timeline': {
        const prospect = requireProspect(platform, positionals[0]);
        console.log(table(platform.store.listTimeline(prospect.id).map((e) => ({ at: e.at.slice(0, 19).replace('T', ' '), type: e.type, summary: e.summary }))));
        return 0;
      }

      case 'metrics': {
        const metrics = computeMetrics(platform.db);
        console.log(table(Object.entries(metrics).filter(([, v]) => typeof v !== 'object').map(([metric, value]) => ({ metric, value: String(value) }))));
        console.log('\nConversion rates (%):');
        console.log(table(Object.entries(metrics.rates).map(([step, value]) => ({ step, value: String(value) }))));
        console.log(`\nBiggest drop-off: ${biggestDropOff(metrics)}`);
        return 0;
      }

      case 'suppress': {
        const suppression = platform.store.addSuppression('domain', positionals[0], typeof flags.reason === 'string' ? flags.reason : 'Manual entry');
        console.log(`${suppression.value} will never be contacted again (${suppression.reason}).`);
        return 0;
      }

      case 'console': {
        const handle = await startServer(platform, Number(flags.port ?? process.env.A11Y_PORT ?? 4300));
        console.log(`Review console: http://localhost:${handle.port}`);
        await new Promise(() => undefined);
        return 0;
      }

      case 'demo': {
        const { runDemo } = await import('./Demo.js');
        await runDemo(platform);
        return 0;
      }

      default:
        console.log(USAGE);
        return 1;
    }
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (command !== 'console') platform.close();
  }
}

process.exitCode = await main();
