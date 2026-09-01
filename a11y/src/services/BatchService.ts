import { normalizeDomain } from '../core/Ids.js';
import type { Prospect } from '../core/Types.js';
import { Queue } from '../queue/Queue.js';
import type { Platform } from './Platform.js';
import { ScanService } from './ScanService.js';
import { ReportService } from './ReportService.js';

export interface BatchOptions {
  /** Parallel scans. Each scan targets one host, so this is cross-host only. */
  concurrency?: number;
  /** Generate a mini audit for every prospect that qualifies. */
  autoMiniAudit?: boolean;
}

export interface BatchSummary {
  submitted: number;
  scanned: number;
  qualified: number;
  disqualified: number;
  unreachable: number;
  failed: number;
  miniAuditsGenerated: number;
  durationMs: number;
  errors: { domain: string; error: string }[];
}

/**
 * VERTICAL SLICE 2 — 100 domains in, a ranked prospect list out.
 *
 * The queue is what makes a 100-domain run survivable: a crash on domain 63
 * loses domain 63, not the run.
 */
export class BatchService {
  private readonly queue: Queue;

  constructor(private readonly platform: Platform) {
    this.queue = new Queue(platform.db);
  }

  submit(domains: string[]): { submitted: number; skipped: string[] } {
    const skipped: string[] = [];
    let submitted = 0;
    for (const raw of domains) {
      const domain = normalizeDomain(raw);
      if (!domain) continue;
      if (this.platform.store.isSuppressed('domain', domain)) {
        skipped.push(domain);
        continue;
      }
      this.platform.store.upsertProspect({ domain });
      this.queue.enqueue('scan', { domain: raw.trim() });
      submitted += 1;
    }
    return { submitted, skipped };
  }

  async run(options: BatchOptions = {}): Promise<BatchSummary> {
    const started = Date.now();
    const concurrency = Math.max(1, options.concurrency ?? this.platform.config.scanConcurrency);
    const scans = new ScanService(this.platform);
    const reports = new ReportService(this.platform);
    const summary: BatchSummary = {
      submitted: 0,
      scanned: 0,
      qualified: 0,
      disqualified: 0,
      unreachable: 0,
      failed: 0,
      miniAuditsGenerated: 0,
      durationMs: 0,
      errors: [],
    };

    this.queue.recoverStale();

    const worker = async () => {
      for (;;) {
        const job = this.queue.claim('scan');
        if (!job) return;
        const domain = String(job.payload.domain ?? '');
        summary.submitted += 1;
        try {
          const outcome = await scans.scanDomain(domain);
          summary.scanned += 1;
          if (outcome.prospect.scanStatus === 'unreachable' || outcome.prospect.scanStatus === 'blocked') summary.unreachable += 1;
          else if (outcome.prospect.qualificationStatus === 'qualified') {
            summary.qualified += 1;
            if (options.autoMiniAudit !== false) {
              const report = await reports.generate(outcome.prospect.id, { level: 'mini' });
              if (report.findings.length > 0) summary.miniAuditsGenerated += 1;
            }
          } else if (outcome.prospect.qualificationStatus === 'disqualified') summary.disqualified += 1;
          this.queue.complete(job.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          summary.failed += 1;
          summary.errors.push({ domain, error: message });
          this.queue.fail(job.id, message);
          this.platform.logger.error('batch job failed', { domain, error: message });
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    summary.durationMs = Date.now() - started;
    return summary;
  }

  /** SYSTEM 1 — the ranked worklist an operator actually opens in the morning. */
  rank(limit = 25): Prospect[] {
    return this.platform.store
      .listProspects({ limit: 500 })
      .filter((p) => p.qualificationStatus === 'qualified')
      .sort((a, b) => b.leadScore - a.leadScore || b.evidenceScore - a.evidenceScore)
      .slice(0, limit);
  }

  queueStats() {
    return this.queue.stats();
  }
}
