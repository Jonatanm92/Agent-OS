import { existsSync, readFileSync } from 'node:fs';
import type { Finding, FindingGroup, JourneyStep, QualificationStatus, Severity } from '../core/Types.js';
import type { SiteSignals } from '../discovery/PlatformDetect.js';
import { leadValue } from '../findings/LeadValue.js';
import { severityRank } from '../findings/Severity.js';

export interface IcpSignalWeight {
  id: string;
  label: string;
  points: number;
}

export interface IcpConfig {
  /** Below this the prospect is not worth an operator's time. */
  qualifyAtScore: number;
  positive: Record<string, IcpSignalWeight>;
  negative: Record<string, IcpSignalWeight>;
  /** How the final lead score blends ICP fit, evidence strength and reachability. */
  blend: { icp: number; evidence: number; contactability: number };
}

/** SYSTEM 1 — the initial ICP: Swedish B2C ecommerce with real, fixable barriers. */
export const DEFAULT_ICP: IcpConfig = {
  qualifyAtScore: 55,
  positive: {
    ecommerce_detected: { id: 'ecommerce_detected', label: 'Ecommerce behaviour detected on the site', points: 18 },
    known_platform: { id: 'known_platform', label: 'Runs a platform we have remediation adapters for', points: 10 },
    swedish_market: { id: 'swedish_market', label: 'Swedish market (.se domain or sv-SE content)', points: 8 },
    active_store: { id: 'active_store', label: 'Store looks actively maintained', points: 8 },
    journey_testable: { id: 'journey_testable', label: 'Core buying journey could be discovered and tested', points: 12 },
    journey_barriers: { id: 'journey_barriers', label: 'High-severity barriers in the buying journey', points: 22 },
    systemic_component: { id: 'systemic_component', label: 'A shared component fails across several pages', points: 10 },
    contact_path: { id: 'contact_path', label: 'Public business contact path available', points: 8 },
    non_micro_catalogue: { id: 'non_micro_catalogue', label: 'Catalogue breadth suggests a non-micro business', points: 6 },
  },
  negative: {
    unreachable: { id: 'unreachable', label: 'Site could not be tested technically', points: -60 },
    no_ecommerce: { id: 'no_ecommerce', label: 'No ecommerce behaviour found', points: -35 },
    b2b_only: { id: 'b2b_only', label: 'Sells to businesses rather than consumers', points: -25 },
    dormant: { id: 'dormant', label: 'Store shows no signs of being active', points: -20 },
    micro_business: { id: 'micro_business', label: 'Looks like a microbusiness (tiny catalogue, no platform)', points: -18 },
    mature_a11y_program: { id: 'mature_a11y_program', label: 'Already runs a credible accessibility program', points: -45 },
    no_meaningful_findings: { id: 'no_meaningful_findings', label: 'No high-severity findings to lead with', points: -30 },
  },
  blend: { icp: 0.45, evidence: 0.4, contactability: 0.15 },
};

export function loadIcpConfig(path?: string): IcpConfig {
  if (!path || !existsSync(path)) return DEFAULT_ICP;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<IcpConfig>;
  return {
    ...DEFAULT_ICP,
    ...parsed,
    positive: { ...DEFAULT_ICP.positive, ...(parsed.positive ?? {}) },
    negative: { ...DEFAULT_ICP.negative, ...(parsed.negative ?? {}) },
    blend: { ...DEFAULT_ICP.blend, ...(parsed.blend ?? {}) },
  };
}

export interface ScoringInput {
  domain: string;
  signals: SiteSignals | null;
  journey: JourneyStep[];
  findings: Finding[];
  groups: FindingGroup[];
  reachable: boolean;
}

export interface AppliedSignal {
  id: string;
  label: string;
  points: number;
  /** Why the signal fired, in words an operator can check. */
  evidence: string;
}

export interface ScoringResult {
  icpScore: number;
  evidenceScore: number;
  leadScore: number;
  qualification: QualificationStatus;
  applied: AppliedSignal[];
  issueSummary: string;
  /** What a human should confirm before the prospect is worked. */
  reviewFlags: string[];
}

const JOURNEY_CORE = ['product', 'cart', 'category', 'search', 'checkout_entry', 'account'];

/**
 * SYSTEM 1 — qualification.
 *
 * Every point is traceable to something observed on the site. Where a fact
 * cannot be established (company size, revenue, ownership) the model stays
 * silent and raises a review flag rather than guessing.
 */
export function scoreProspect(input: ScoringInput, config: IcpConfig = DEFAULT_ICP): ScoringResult {
  const applied: AppliedSignal[] = [];
  const reviewFlags: string[] = [];
  const add = (weight: IcpSignalWeight, evidence: string) => applied.push({ ...weight, evidence });

  if (!input.reachable) {
    add(config.negative.unreachable, 'The site could not be loaded for testing.');
    return {
      icpScore: 0,
      evidenceScore: 0,
      leadScore: 0,
      qualification: 'disqualified',
      applied,
      issueSummary: 'Site could not be tested.',
      reviewFlags: ['Confirm manually whether the site is reachable from another network before discarding it.'],
    };
  }

  const signals = input.signals;
  const strongFindings = input.findings.filter(
    (f) => severityRank(f.severity) >= severityRank('high') && (f.confidence === 'CONFIRMED_AUTOMATED' || f.confidence === 'HIGH_CONFIDENCE'),
  );
  const journeyFindings = strongFindings.filter((f) => JOURNEY_CORE.includes(f.pageType));
  const reachedSteps = input.journey.filter((s) => s.reached && JOURNEY_CORE.includes(s.pageType));

  if (signals?.ecommerceDetected) add(config.positive.ecommerce_detected, signals.ecommerceEvidence.slice(0, 2).join('; '));
  else add(config.negative.no_ecommerce, signals ? `Only weak ecommerce signals: ${signals.ecommerceEvidence.join('; ') || 'none'}` : 'Homepage signals unavailable.');

  if (signals && signals.platform !== 'unknown' && signals.platform !== 'custom_modern') {
    add(config.positive.known_platform, signals.platformEvidence ?? signals.platform);
  }

  if (input.domain.endsWith('.se')) add(config.positive.swedish_market, `.se domain (${input.domain})`);

  if (signals?.activityEvidence.length) add(config.positive.active_store, signals.activityEvidence.join('; '));
  else if (signals) add(config.negative.dormant, 'No current-year copyright and no merchandised pricing found on the homepage.');

  if (reachedSteps.length >= 2) add(config.positive.journey_testable, `Tested ${reachedSteps.map((s) => s.pageType).join(', ')}`);

  if (journeyFindings.length > 0) {
    // Scaled, not flat: one high-severity barrier is a conversation, five are a project.
    const distinctRules = new Set(journeyFindings.map((f) => f.rule)).size;
    add(
      { ...config.positive.journey_barriers, points: Math.min(config.positive.journey_barriers.points, distinctRules * 6) },
      `${journeyFindings.length} high-severity finding(s) across ${distinctRules} distinct problem(s) on ${[...new Set(journeyFindings.map((f) => f.pageType))].join(', ')}`,
    );
  } else if (strongFindings.length === 0) {
    add(config.negative.no_meaningful_findings, 'No high-severity, high-confidence findings were produced.');
  }

  const systemic = input.groups.filter((g) => g.systemic && severityRank(g.severity) >= severityRank('high'));
  if (systemic.length) {
    add(config.positive.systemic_component, `${systemic[0].componentLabel} fails on ${systemic[0].affectedPageCount} tested pages`);
  }

  if (signals?.contactChannels.length) {
    add(config.positive.contact_path, `${signals.contactChannels[0].kind} found via ${signals.contactChannels[0].source}`);
  }

  if (signals && signals.productLinkCount >= 8) {
    add(config.positive.non_micro_catalogue, `${signals.productLinkCount} product links reachable from the homepage`);
  } else if (signals && signals.productLinkCount < 3 && signals.platform === 'unknown') {
    add(config.negative.micro_business, `Only ${signals.productLinkCount} product links found and no ecommerce platform fingerprint`);
    reviewFlags.push('Microbusiness call is inferred from catalogue size only — confirm before discarding.');
  }

  if (signals?.b2bIndicators.length) {
    add(config.negative.b2b_only, `B2B vocabulary on the homepage: ${signals.b2bIndicators.slice(0, 3).join(', ')}`);
    reviewFlags.push('B2B signal found. Confirm the store is not consumer-facing before disqualifying.');
  }

  if (signals?.accessibilityStatementUrl && strongFindings.length === 0) {
    add(config.negative.mature_a11y_program, `Publishes an accessibility statement (${signals.accessibilityStatementUrl}) and no high-severity findings were produced.`);
  } else if (signals?.accessibilityStatementUrl) {
    reviewFlags.push(`Site publishes an accessibility statement (${signals.accessibilityStatementUrl}) — reference it respectfully in any outreach.`);
  }

  if (signals && !signals.companyName) {
    reviewFlags.push('No company name could be read from the site — do not invent one for outreach.');
  }

  const rawIcp = applied.reduce((sum, s) => sum + s.points, 0);
  const icpScore = clamp(rawIcp);
  const evidenceScore = computeEvidenceScore(input.findings, input.groups);
  const contactability = signals?.contactChannels.length ? Math.min(100, 40 + signals.contactChannels.length * 20) : 0;
  const leadScore = clamp(icpScore * config.blend.icp + evidenceScore * config.blend.evidence + contactability * config.blend.contactability);

  const disqualifiers = applied.filter((s) => s.points <= -25);
  const qualification: QualificationStatus = disqualifiers.length
    ? 'disqualified'
    : leadScore >= config.qualifyAtScore
      ? 'qualified'
      : 'unqualified';

  return {
    icpScore,
    evidenceScore,
    leadScore: Math.round(leadScore),
    qualification,
    applied,
    issueSummary: summarize(input.findings, input.groups),
    reviewFlags,
  };
}

/**
 * Evidence score answers a sales question: do we have something strong enough
 * to put in front of this company?
 *
 * Quantity scores nothing. The score is built from the best few *distinct*
 * problems with sharply diminishing returns, so a site with one devastating,
 * demonstrable barrier outranks a site with forty contrast warnings.
 */
export function computeEvidenceScore(findings: Finding[], groups: FindingGroup[]): number {
  const severityWeights: Record<Severity, number> = { critical: 30, high: 20, medium: 8, low: 2 };
  const usable = findings.filter((f) => f.confidence === 'CONFIRMED_AUTOMATED' || f.confidence === 'HIGH_CONFIDENCE');
  const systemicByRule = new Map(groups.filter((g) => g.systemic).map((g) => [g.rule, g.affectedPageCount]));

  const strengthOf = (finding: Finding): number => {
    let points = severityWeights[finding.severity];
    points += Math.round(leadValue(finding.rule) / 3);
    if (finding.screenshotKey) points += 6;
    if (finding.keyboardReproduction.length) points += 6;
    if (JOURNEY_CORE.includes(finding.pageType)) points += 5;
    if ((systemicByRule.get(finding.rule) ?? 0) >= 2) points += 4;
    return Math.min(45, points);
  };

  // One entry per distinct problem: the same rule five times is one story.
  const bestPerRule = new Map<string, number>();
  for (const finding of usable) {
    const strength = strengthOf(finding);
    if (strength > (bestPerRule.get(finding.rule) ?? 0)) bestPerRule.set(finding.rule, strength);
  }

  const decay = [1, 0.65, 0.45, 0.3, 0.2];
  const top = [...bestPerRule.values()].sort((a, b) => b - a).slice(0, decay.length);
  return clamp(top.reduce((sum, strength, index) => sum + strength * decay[index], 0));
}

function summarize(findings: Finding[], groups: FindingGroup[]): string {
  if (findings.length === 0) return 'No accessibility findings were produced for this site.';
  const bySeverity = (severity: Severity) => findings.filter((f) => f.severity === severity).length;
  const systemic = groups.filter((g) => g.systemic).length;
  const parts = [
    `${bySeverity('critical')} critical`,
    `${bySeverity('high')} high`,
    `${bySeverity('medium')} medium`,
    `${bySeverity('low')} low`,
  ];
  const lead = [...findings]
    .filter((f) => f.confidence !== 'REVIEW_REQUIRED')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  return `${parts.join(', ')}${systemic ? `, ${systemic} systemic component issue(s)` : ''}. Lead finding: ${lead ? `${lead.rule} on ${lead.pageType}` : 'none confirmed automatically'}.`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
