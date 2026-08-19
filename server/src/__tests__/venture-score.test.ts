import { describe, expect, it } from 'vitest';
import { assessVenture, evidenceGaps, normalizeScorecard, scoreVenture } from '../services/venture-score.js';

const strongScorecard = {
  painUrgency: 14,
  willingnessToPay: 13,
  reachability: 11,
  proofSpeed: 9,
  deliveryFeasibility: 9,
  grossMargin: 9,
  recurringPotential: 7,
  differentiation: 7,
  founderFit: 6,
  evidenceQuality: 5,
  riskPenalty: 5,
};

const completeEvidence = {
  painSignals: 10,
  priceSignals: 3,
  reachableProspects: 20,
  technicalProbePassed: true,
  acquisitionPathDocumented: true,
  riskReviewCompleted: true,
};

describe('venture scoring', () => {
  it('uses a deterministic 0-100 score and subtracts risk', () => {
    expect(scoreVenture(strongScorecard)).toBe(85);
  });

  it('clamps model-supplied values instead of trusting them', () => {
    const normalized = normalizeScorecard({
      painUrgency: 999,
      willingnessToPay: -20,
      riskPenalty: 999,
    });

    expect(normalized.painUrgency).toBe(15);
    expect(normalized.willingnessToPay).toBe(0);
    expect(normalized.riskPenalty).toBe(20);
  });

  it('does not allow a high-scoring idea to build without evidence', () => {
    const assessment = assessVenture(strongScorecard, {
      painSignals: 2,
      priceSignals: 0,
      reachableProspects: 4,
      technicalProbePassed: false,
      acquisitionPathDocumented: false,
      riskReviewCompleted: false,
    });

    expect(assessment.score).toBe(85);
    expect(assessment.decision).toBe('EXPERIMENT');
    expect(assessment.canBuild).toBe(false);
    expect(assessment.evidenceGaps.length).toBe(6);
  });

  it('marks strong, evidenced opportunities as priority', () => {
    const assessment = assessVenture(strongScorecard, completeEvidence);

    expect(assessment.decision).toBe('PRIORITY');
    expect(assessment.canBuild).toBe(true);
    expect(assessment.evidenceGaps).toEqual([]);
  });

  it('kills weak ideas regardless of enthusiasm', () => {
    const assessment = assessVenture(
      {
        painUrgency: 4,
        willingnessToPay: 2,
        reachability: 2,
        proofSpeed: 3,
        deliveryFeasibility: 3,
        grossMargin: 4,
        recurringPotential: 2,
        differentiation: 1,
        founderFit: 2,
        evidenceQuality: 0,
        riskPenalty: 8,
      },
      completeEvidence
    );

    expect(assessment.score).toBeLessThan(65);
    expect(assessment.decision).toBe('KILL');
    expect(assessment.canBuild).toBe(false);
  });
});

describe('evidence gate', () => {
  it('requires independent pain, price, prospect, technical, acquisition, and risk evidence', () => {
    expect(evidenceGaps({})).toEqual([
      'Collect 10 more independent pain signal(s).',
      'Collect 3 more price/payment signal(s).',
      'Identify 20 more reachable prospect(s).',
      'Pass a technical feasibility probe with recorded output.',
      'Document one concrete customer-acquisition path.',
      'Complete privacy, legal, security, and delivery-risk review.',
    ]);
  });
});
