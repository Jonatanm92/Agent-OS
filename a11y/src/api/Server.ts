import express, { type Express, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { computeMetrics, biggestDropOff } from '../analytics/Metrics.js';
import { buildEvidencePack } from '../evidence/EvidencePack.js';
import { PIPELINE } from '../pipeline/Stages.js';
import { buildRemediation } from '../remediation/RemediationEngine.js';
import { planGithubRemediation } from '../remediation/GithubWorkflow.js';
import type { Platform } from '../services/Platform.js';
import { OutreachService } from '../services/OutreachService.js';
import { PipelineService } from '../services/PipelineService.js';
import { ReportService } from '../services/ReportService.js';
import { ReviewService } from '../services/ReviewService.js';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

const wrap =
  (handler: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent && result !== undefined) res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) res.status(400).json({ error: message });
    }
  };

/**
 * SYSTEM 6 + 13 — the internal console.
 *
 * Internal tool, internal network. There is no authentication here on purpose:
 * bind it to localhost. Anything that leaves this process (a report, an
 * outreach draft) has already been through the review gate.
 */
export function createServer(platform: Platform): Express {
  const app = express();
  const reviews = new ReviewService(platform);
  const pipeline = new PipelineService(platform);
  const outreach = new OutreachService(platform);
  const reports = new ReportService(platform);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/health', wrap(() => ({ ok: true, dataDir: platform.config.dataDir })));

  // ------------------------------------------------------------- prospects
  app.get(
    '/api/prospects',
    wrap((req) => ({
      prospects: platform.store.listProspects({
        stage: req.query.stage as never,
        limit: Number(req.query.limit ?? 100),
      }),
    })),
  );

  app.get(
    '/api/prospects/:id',
    wrap((req) => {
      const prospect = platform.store.getProspect(req.params.id);
      if (!prospect) throw new Error('Unknown prospect');
      const scans = platform.audits.listScans(prospect.id);
      const latest = platform.audits.latestCompletedScan(prospect.id);
      return {
        prospect,
        scans,
        timeline: platform.store.listTimeline(prospect.id),
        provenance: platform.store.listProvenance('prospect', prospect.id),
        reports: platform.audits.listReports(prospect.id),
        retests: platform.audits.listRetests(prospect.id),
        groups: latest ? platform.audits.listGroups(latest.id).filter((g) => g.systemic) : [],
      };
    }),
  );

  // ---------------------------------------------------------------- review
  app.get(
    '/api/review/queue',
    wrap((req) => ({
      items: reviews
        .queue({ prospectId: req.query.prospectId as string | undefined, limit: Number(req.query.limit ?? 60) })
        .map((item) => ({
          ...item,
          pack: buildEvidencePack(item.finding, { group: item.group, storage: platform.storage, inlineImages: false }),
        })),
    })),
  );

  app.post('/api/review/decision', wrap((req) => reviews.apply(req.body)));
  app.post('/api/review/signoff', wrap((req) => {
    reviews.signOff(req.body.prospectId, req.body.reviewer ?? 'operator', req.body.note);
    return { ok: true, prospect: platform.store.getProspect(req.body.prospectId) };
  }));
  app.get('/api/review/trail', wrap((req) => ({ decisions: reviews.auditTrail(req.query.findingId as string, req.query.groupId as string) })));

  // ------------------------------------------------------------- evidence
  app.get('/api/findings/:id', wrap((req) => {
    const finding = platform.audits.getFinding(req.params.id);
    if (!finding) throw new Error('Unknown finding');
    const prospect = platform.store.getProspect(finding.prospectId)!;
    return {
      finding,
      pack: buildEvidencePack(finding, { storage: platform.storage, inlineImages: false }),
      remediation: buildRemediation(finding, { platform: prospect.ecommercePlatform, cms: prospect.cms }),
      githubPlan: planGithubRemediation(finding, { platform: prospect.ecommercePlatform, cms: prospect.cms }),
    };
  }));

  app.get('/evidence/*', (req, res) => {
    const key = decodeURIComponent((req.params as unknown as string[])[0] ?? '');
    if (!key || !platform.storage.exists(key)) {
      res.status(404).send('Not found');
      return;
    }
    res.type(key.endsWith('.png') ? 'image/png' : key.endsWith('.json') ? 'application/json' : 'text/html');
    res.send(platform.storage.get(key));
  });

  // ------------------------------------------------------------- pipeline
  app.get('/api/pipeline', wrap(() => ({
    board: pipeline.board(),
    stages: PIPELINE,
    worklist: pipeline.worklist(60),
  })));
  app.post('/api/pipeline/advance', wrap((req) => pipeline.advance(req.body.prospectId, req.body.stage, { force: req.body.force, note: req.body.note })));

  // ------------------------------------------------------------- outreach
  app.get('/api/outreach', wrap((req) => ({ drafts: outreach.queue((req.query.status as never) ?? 'drafted') })));
  app.post('/api/outreach/draft', wrap((req) => outreach.draft(req.body.prospectId, req.body)));
  app.post('/api/outreach/approve', wrap((req) => outreach.approve(req.body.draftId, req.body.reviewer ?? 'operator', req.body.note)));
  app.post('/api/outreach/reject', wrap((req) => outreach.reject(req.body.draftId, req.body.reviewer ?? 'operator', req.body.note)));
  app.post('/api/outreach/sent', wrap((req) => outreach.markSent(req.body.draftId)));
  app.post('/api/outreach/reply', wrap((req) => outreach.recordReply(req.body.prospectId, req.body.text ?? '', req.body.contactValue)));

  // --------------------------------------------------------- suppressions
  app.get('/api/suppressions', wrap(() => ({ suppressions: platform.store.listSuppressions() })));
  app.post('/api/suppressions', wrap((req) => platform.store.addSuppression(req.body.kind ?? 'domain', req.body.value, req.body.reason ?? 'Manual entry')));

  // -------------------------------------------------------------- reports
  app.post(
    '/api/reports',
    wrap(async (req) => {
      const generated = await reports.generate(req.body.prospectId, { level: req.body.level ?? 'mini', pdf: Boolean(req.body.pdf) });
      return { record: generated.record, findingCount: generated.findings.length };
    }),
  );

  // -------------------------------------------------------------- metrics
  app.get('/api/metrics', wrap(() => {
    const metrics = computeMetrics(platform.db);
    return { metrics, biggestDropOff: biggestDropOff(metrics) };
  }));

  return app;
}

export function startServer(platform: Platform, port = Number(process.env.A11Y_PORT ?? 4300)): Promise<{ port: number; close: () => Promise<void> }> {
  const app = createServer(platform);
  return new Promise((resolve) => {
    // Localhost only: this console shows customer evidence and is not hardened
    // for exposure.
    const server = app.listen(port, '127.0.0.1', () => {
      platform.logger.info('review console listening', { url: `http://localhost:${port}` });
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
