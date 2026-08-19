export const SCORE_LIMITS = {
  painUrgency: 15,
  willingnessToPay: 15,
  reachability: 12,
  proofSpeed: 10,
  deliveryFeasibility: 10,
  grossMargin: 10,
  recurringPotential: 8,
  differentiation: 8,
  founderFit: 7,
  evidenceQuality: 5,
  riskPenalty: 20,
} as const;

export interface VentureScorecard {
  painUrgency: number;
  willingnessToPay: number;
  reachability: number;
  proofSpeed: number;
  deliveryFeasibility: number;
  grossMargin: number;
  recurringPotential: number;
  differentiation: number;
  founderFit: number;
  evidenceQuality: number;
  riskPenalty: number;
}

export interface VentureEvidence {
  painSignals: number;
  priceSignals: number;
  reachableProspects: number;
  technicalProbePassed: boolean;
  acquisitionPathDocumented: boolean;
  riskReviewCompleted: boolean;
}

export type VentureDecision = 'KILL' | 'EXPERIMENT' | 'BUILD_READY' | 'PRIORITY';

export interface VentureAssessment {
  score: number;
  decision: VentureDecision;
  canBuild: boolean;
  evidenceGaps: string[];
  normalizedScorecard: VentureScorecard;
}

const POSITIVE_KEYS: (keyof Omit<VentureScorecard, 'riskPenalty'>)[] = [
  'painUrgency',
  'willingnessToPay',
  'reachability',
  'proofSpeed',
  'deliveryFeasibility',
  'grossMargin',
  'recurringPotential',
  'differentiation',
  'founderFit',
  'evidenceQuality',
];

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: unknown, max: number): number {
  return Math.max(0, Math.min(max, Math.round(finiteNumber(value))));
}

export function normalizeScorecard(input: Partial<VentureScorecard>): VentureScorecard {
  return {
    painUrgency: clamp(input.painUrgency, SCORE_LIMITS.painUrgency),
    willingnessToPay: clamp(input.willingnessToPay, SCORE_LIMITS.willingnessToPay),
    reachability: clamp(input.reachability, SCORE_LIMITS.reachability),
    proofSpeed: clamp(input.proofSpeed, SCORE_LIMITS.proofSpeed),
    deliveryFeasibility: clamp(input.deliveryFeasibility, SCORE_LIMITS.deliveryFeasibility),
    grossMargin: clamp(input.grossMargin, SCORE_LIMITS.grossMargin),
    recurringPotential: clamp(input.recurringPotential, SCORE_LIMITS.recurringPotential),
    differentiation: clamp(input.differentiation, SCORE_LIMITS.differentiation),
    founderFit: clamp(input.founderFit, SCORE_LIMITS.founderFit),
    evidenceQuality: clamp(input.evidenceQuality, SCORE_LIMITS.evidenceQuality),
    riskPenalty: clamp(input.riskPenalty, SCORE_LIMITS.riskPenalty),
  };
}

export function scoreVenture(input: Partial<VentureScorecard>): number {
  const normalized = normalizeScorecard(input);
  const positive = POSITIVE_KEYS.reduce((sum, key) => sum + normalized[key], 0);
  return Math.max(0, Math.min(100, positive - normalized.riskPenalty));
}

export function evidenceGaps(input: Partial<VentureEvidence>): string[] {
  const painSignals = Math.max(0, Math.floor(finiteNumber(input.painSignals)));
  const priceSignals = Math.max(0, Math.floor(finiteNumber(input.priceSignals)));
  const reachableProspects = Math.max(0, Math.floor(finiteNumber(input.reachableProspects)));
  const gaps: string[] = [];

  if (painSignals < 10) gaps.push(`Collect ${10 - painSignals} more independent pain signal(s).`);
  if (priceSignals < 3) gaps.push(`Collect ${3 - priceSignals} more price/payment signal(s).`);
  if (reachableProspects < 20) gaps.push(`Identify ${20 - reachableProspects} more reachable prospect(s).`);
  if (input.technicalProbePassed !== true) gaps.push('Pass a technical feasibility probe with recorded output.');
  if (input.acquisitionPathDocumented !== true) gaps.push('Document one concrete customer-acquisition path.');
  if (input.riskReviewCompleted !== true) gaps.push('Complete privacy, legal, security, and delivery-risk review.');

  return gaps;
}

export function assessVenture(
  scorecard: Partial<VentureScorecard>,
  evidence: Partial<VentureEvidence>
): VentureAssessment {
  const normalizedScorecard = normalizeScorecard(scorecard);
  const score = scoreVenture(normalizedScorecard);
  const gaps = evidenceGaps(evidence);
  const canBuild = score >= 75 && gaps.length === 0;

  let decision: VentureDecision;
  if (score < 65) decision = 'KILL';
  else if (!canBuild) decision = 'EXPERIMENT';
  else if (score >= 85) decision = 'PRIORITY';
  else decision = 'BUILD_READY';

  return {
    score,
    decision,
    canBuild,
    evidenceGaps: gaps,
    normalizedScorecard,
  };
}

export function formatAssessment(assessment: VentureAssessment): string {
  const gaps = assessment.evidenceGaps.length
    ? assessment.evidenceGaps.map((gap) => `- ${gap}`).join('\n')
    : '- None. Evidence gate passed.';

  return [
    `DECISION: ${assessment.decision}`,
    `DETERMINISTIC SCORE: ${assessment.score}/100`,
    `PRODUCTION BUILD ALLOWED: ${assessment.canBuild ? 'YES' : 'NO'}`,
    '',
    'EVIDENCE GAPS:',
    gaps,
  ].join('\n');
}
