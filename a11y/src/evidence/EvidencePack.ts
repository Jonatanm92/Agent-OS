import type { Finding, FindingGroup, WcagRef } from '../core/Types.js';
import type { ObjectStorage } from './Storage.js';
import { ruleTitle } from '../findings/Normalize.js';

export interface EvidencePack {
  findingId: string;
  title: string;
  url: string;
  pageType: string;
  severity: Finding['severity'];
  confidence: Finding['confidence'];
  component: string;
  wcag: WcagRef[];
  screenshot: { key: string; dataUri: string | null } | null;
  reproduction: string[];
  keyboardReproduction: string[];
  expectedBehaviour: string;
  observedBehaviour: string;
  userImpact: string;
  remediation: string;
  domSnippet: string;
  selector: string;
  sourceEngine: string;
  detectedAt: string;
  /** Populated when the same component fails on more than one tested page. */
  systemic: { affectedPageCount: number; affectedPageTypes: string[]; instanceCount: number } | null;
}

/**
 * SYSTEM 5 — evidence pack.
 *
 * The test of a good pack is simple: can a developer who has never seen our
 * report reproduce the problem from it alone? Everything here exists to answer
 * yes, which is why screenshots are inlined rather than linked.
 */
export function buildEvidencePack(
  finding: Finding,
  options: { group?: FindingGroup | null; storage?: ObjectStorage; inlineImages?: boolean } = {},
): EvidencePack {
  const { group, storage, inlineImages = true } = options;
  let screenshot: EvidencePack['screenshot'] = null;
  if (finding.screenshotKey) {
    let dataUri: string | null = null;
    if (inlineImages && storage?.exists(finding.screenshotKey)) {
      try {
        dataUri = `data:image/png;base64,${storage.get(finding.screenshotKey).toString('base64')}`;
      } catch {
        dataUri = null;
      }
    }
    screenshot = { key: finding.screenshotKey, dataUri };
  }

  return {
    findingId: finding.id,
    title: ruleTitle(finding.rule),
    url: finding.url,
    pageType: finding.pageType,
    severity: finding.severity,
    confidence: finding.confidence,
    component: finding.componentLabel ?? group?.componentLabel ?? ruleTitle(finding.rule),
    wcag: finding.wcag,
    screenshot,
    reproduction: finding.reproduction,
    keyboardReproduction: finding.keyboardReproduction,
    expectedBehaviour: finding.expectedBehaviour,
    observedBehaviour: finding.observedBehaviour,
    userImpact: finding.userImpact,
    remediation: finding.remediation,
    domSnippet: finding.html,
    selector: finding.selector,
    sourceEngine: finding.sourceEngine,
    detectedAt: finding.detectedAt,
    systemic:
      group && group.systemic
        ? { affectedPageCount: group.affectedPageCount, affectedPageTypes: group.affectedPageTypes, instanceCount: group.instanceCount }
        : null,
  };
}

/** Enough to reproduce, or not enough to send. Used to gate the mini audit. */
export function packQuality(pack: EvidencePack): { score: number; missing: string[] } {
  const missing: string[] = [];
  let score = 0;
  if (pack.screenshot?.dataUri) score += 30;
  else missing.push('screenshot');
  if (pack.reproduction.length >= 2) score += 20;
  else missing.push('reproduction steps');
  if (pack.keyboardReproduction.length) score += 15;
  if (pack.domSnippet.length > 20) score += 15;
  else missing.push('DOM evidence');
  if (pack.wcag.length) score += 10;
  if (pack.remediation.length > 40) score += 10;
  else missing.push('remediation guidance');
  return { score, missing };
}
