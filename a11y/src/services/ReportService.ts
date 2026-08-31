import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from '../discovery/Browser.js';
import type { Finding, ReportLevel, ReportRecord } from '../core/Types.js';
import { buildEvidencePack } from '../evidence/EvidencePack.js';
import { renderDeveloperReport, renderMiniAudit, renderProfessionalAudit, type ReportContext } from '../reports/Renderers.js';
import type { Platform } from './Platform.js';

export interface GenerateOptions {
  level: ReportLevel;
  scanId?: string;
  /** PDF rendering costs a browser launch; off by default for batch runs. */
  pdf?: boolean;
  branding?: ReportContext['branding'];
}

export interface GeneratedReport {
  record: ReportRecord;
  html: string;
  htmlPath: string;
  jsonPath: string;
  pdfPath: string | null;
  findings: Finding[];
}

const RENDERERS = {
  mini: renderMiniAudit,
  professional: renderProfessionalAudit,
  developer: renderDeveloperReport,
} as const;

/** SYSTEM 7 — report generation and export (HTML, JSON, PDF). */
export class ReportService {
  constructor(private readonly platform: Platform) {}

  async generate(prospectId: string, options: GenerateOptions): Promise<GeneratedReport> {
    const { store, audits, storage, logger } = this.platform;
    const prospect = store.getProspect(prospectId);
    if (!prospect) throw new Error(`Unknown prospect: ${prospectId}`);
    const scan = options.scanId ? audits.getScan(options.scanId) : audits.latestCompletedScan(prospectId);
    if (!scan) throw new Error(`No completed scan for ${prospect.domain} — run a scan first.`);

    const findings = audits.listFindings(scan.id);
    const groups = audits.listGroups(scan.id);
    const context: ReportContext = { prospect, scan, findings, groups, storage, branding: options.branding };

    const { html, findings: included } = RENDERERS[options.level](context);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `reports/${prospect.domain}/${stamp}-${options.level}-${scan.id}`;

    const htmlKey = `${base}.html`;
    await storage.put(htmlKey, html, 'text/html');

    const groupById = new Map(groups.map((g) => [g.id, g]));
    const jsonKey = `${base}.json`;
    const payload = {
      generatedAt: new Date().toISOString(),
      level: options.level,
      prospect: { domain: prospect.domain, companyName: prospect.companyName, platform: prospect.ecommercePlatform, cms: prospect.cms },
      scan: { id: scan.id, startedAt: scan.startedAt, pagesTested: scan.pagesTested, journey: scan.journey, robots: scan.robots },
      disclaimer:
        'Automated testing can demonstrate that a specific barrier exists on a specific page. It cannot establish conformance with WCAG, EN 301 549 or any legislation. This document is technical evidence, not a legal determination or certification.',
      findings: included.map((f) => buildEvidencePack(f, { group: groupById.get(f.groupId ?? '') ?? null, storage, inlineImages: false })),
      systemicGroups: groups.filter((g) => g.systemic),
    };
    await storage.put(jsonKey, JSON.stringify(payload, null, 2), 'application/json');

    let pdfKey: string | null = null;
    if (options.pdf) {
      pdfKey = await this.renderPdf(html, `${base}.pdf`);
    }

    const record = audits.recordReport({
      prospectId,
      scanId: scan.id,
      level: options.level,
      htmlKey,
      jsonKey,
      pdfKey,
      findingCount: included.length,
    });

    store.addTimelineEvent(prospectId, options.level === 'mini' ? 'mini_audit_generated' : 'report_generated', `${options.level} report generated with ${included.length} finding(s)`, {
      reportId: record.id,
      scanId: scan.id,
      level: options.level,
    });

    if (options.level === 'mini' && included.length > 0 && prospect.salesStage === 'QUALIFIED') {
      store.setStage(prospectId, 'MINI_AUDIT_READY', 'Review the mini audit in the console, then approve it for outreach.');
    }

    logger.info('report generated', { domain: prospect.domain, level: options.level, findings: included.length });

    return {
      record,
      html,
      htmlPath: storage.locate(htmlKey),
      jsonPath: storage.locate(jsonKey),
      pdfPath: pdfKey ? storage.locate(pdfKey) : null,
      findings: included,
    };
  }

  private async renderPdf(html: string, key: string): Promise<string | null> {
    const browser = await chromium.launch({
      headless: true,
      executablePath: this.platform.config.chromiumPath,
      args: CHROMIUM_ARGS,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
      });
      await this.platform.storage.put(key, buffer, 'application/pdf');
      return key;
    } catch (error) {
      this.platform.logger.warn('pdf rendering failed', { error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      await browser.close();
    }
  }
}
