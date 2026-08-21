import { randomUUID } from 'node:crypto';

export const SCORE_WEIGHTS = Object.freeze({
  painIntensity: 20,
  buyerReachability: 20,
  evidenceQuality: 15,
  timeToFirstPayment: 15,
  manualFulfillability: 10,
  differentiation: 10,
  assetLeverage: 5,
  riskProfile: 5,
});

export const SCORE_LABELS = Object.freeze({
  painIntensity: 'Pain intensity',
  buyerReachability: 'Buyer reachability',
  evidenceQuality: 'Evidence quality',
  timeToFirstPayment: 'Time to first payment',
  manualFulfillability: 'Manual fulfillability',
  differentiation: 'Differentiation',
  assetLeverage: 'Existing asset leverage',
  riskProfile: 'Low risk / support burden',
});

export const REQUIRED_GATES = Object.freeze([
  'buyerIdentified',
  'painEvidence',
  'reachableProspects',
  'manualFulfillment',
  'proofReady',
  'paymentReady',
  'noBuildBeforeSale',
  'legalManageable',
]);

export const GATE_LABELS = Object.freeze({
  buyerIdentified: 'Specific buyer is identified',
  painEvidence: 'Pain is evidenced, not imagined',
  reachableProspects: 'Qualified prospects are directly reachable',
  manualFulfillment: 'Founder version can be fulfilled manually',
  proofReady: 'A real proof/demo is ready',
  paymentReady: 'A legitimate payment path is live',
  noBuildBeforeSale: 'No full product build before paid validation',
  legalManageable: 'Legal, platform and support risk is manageable',
});

export const STAGES = Object.freeze([
  'evidence',
  'offer',
  'presell',
  'fulfill',
  'paid',
  'scale',
  'killed',
]);

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

export function calculateScore(input = {}) {
  const normalized = {};
  const breakdown = {};
  let total = 0;

  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    const rating = clampRating(input[key]);
    const points = (rating / 5) * weight;
    normalized[key] = rating;
    breakdown[key] = {
      rating,
      weight,
      points: Math.round(points * 10) / 10,
    };
    total += points;
  }

  return {
    score: Math.round(total),
    normalized,
    breakdown,
  };
}

export function evaluateMission(scoreInput = {}, hardGates = {}, fatalRisks = []) {
  const scoreResult = calculateScore(scoreInput);
  const openGates = REQUIRED_GATES.filter((key) => hardGates[key] !== true);
  const cleanFatalRisks = Array.isArray(fatalRisks)
    ? fatalRisks.map(String).map((s) => s.trim()).filter(Boolean)
    : [];

  let decision = 'TEST';
  const reasons = [];

  if (cleanFatalRisks.length > 0) {
    decision = 'KILL';
    reasons.push(`Fatal risk: ${cleanFatalRisks[0]}`);
  } else if (scoreResult.score < 60) {
    decision = 'KILL';
    reasons.push(`Commercial score ${scoreResult.score}/100 is below the 60-point kill line.`);
  } else if (scoreResult.score >= 75 && openGates.length === 0) {
    decision = 'GO';
    reasons.push('Commercial score is at least 75 and every hard gate is closed.');
  } else {
    decision = 'TEST';
    if (scoreResult.score < 75) {
      reasons.push(`Commercial score ${scoreResult.score}/100 has not reached the 75-point go line.`);
    }
    if (openGates.length > 0) {
      reasons.push(`${openGates.length} hard gate${openGates.length === 1 ? '' : 's'} remain open.`);
    }
  }

  return {
    ...scoreResult,
    decision,
    openGates,
    fatalRisks: cleanFatalRisks,
    reasons,
  };
}

export function buildDeterministicGrill(mission) {
  const evaluation = evaluateMission(
    mission.scoreInput,
    mission.hardGates,
    mission.fatalRisks,
  );

  const weakDimensions = Object.entries(evaluation.breakdown)
    .filter(([, value]) => value.rating < 4)
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([key, value]) => ({
      key,
      label: SCORE_LABELS[key] ?? key,
      rating: value.rating,
      weight: value.weight,
    }));

  const openGateLabels = evaluation.openGates.map((key) => GATE_LABELS[key] ?? key);
  const killConditions = [
    'Kill or materially reposition after 20–30 qualified, personalized offers produce zero payment, after deliverability and channel quality have been verified.',
    'Do not accept a binding order or start delivery before the approved self-employment company is the contracting party.',
    'Kill immediately if the service drifts into legal advice, unsupported attestations, autonomous bid submission or claims that cannot be traced to the procurement documents.',
    'Do not build SaaS before at least three unrelated customers have paid for and received the manual founder service.',
  ];

  let nextTest = mission.nextAction || 'Close the highest-risk open gate with the smallest real-world test.';
  if (evaluation.openGates.includes('proofReady')) {
    nextTest = 'Produce one customer-grade BidSprint 48 sample from official procurement documents and verify every requirement, deadline and recommendation against a cited source location.';
  } else if (evaluation.openGates.includes('reachableProspects')) {
    nextTest = 'Build 30 source-backed Swedish service-company prospects with public business contact routes and a relevant procurement fit; prepare the first ten for CEO review.';
  } else if (evaluation.openGates.includes('paymentReady')) {
    nextTest = 'Complete the legitimate Swedish B2B payment and contracting path through Frilans Finans first, with Cool Company only as reserve.';
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'deterministic',
    verdict: evaluation.decision,
    score: evaluation.score,
    openGates: openGateLabels,
    weakDimensions,
    strongestCaseAgainst: mission.competitionRisk ||
      'The buyer may prefer internal bid staff, a specialist procurement consultant, or a free self-review rather than trusting a low-priced founder service.',
    nextTest,
    killConditions,
    conclusion:
      evaluation.decision === 'GO'
        ? 'Proceed to a controlled paid founder validation; keep software scope frozen.'
        : evaluation.decision === 'TEST'
          ? 'Do not scale or expand scope. Close the open gates through real proof, a legitimate contracting path and paid-market evidence.'
          : 'Stop work unless a materially different buyer, channel or service boundary changes the economics.',
  };
}

export function countAutomationAttempts(audit = [], date = new Date().toISOString().slice(0, 10)) {
  return (Array.isArray(audit) ? audit : []).filter((entry) =>
    entry?.type === 'automation' && String(entry?.at || '').startsWith(date)
  ).length;
}

export function computeMetrics(state) {
  const events = Array.isArray(state?.events) ? state.events : [];
  let grossRevenueCents = 0;
  let refundsCents = 0;
  let contacted = 0;
  let replies = 0;
  let calls = 0;
  const payingCustomers = new Set();

  for (const event of events) {
    const amount = Math.max(0, Number(event.amountCents) || 0);
    switch (event.kind) {
      case 'payment':
        grossRevenueCents += amount;
        payingCustomers.add(event.customerKey || event.id);
        break;
      case 'refund':
        refundsCents += amount;
        break;
      case 'prospect_contacted':
        contacted += 1;
        break;
      case 'positive_reply':
        replies += 1;
        break;
      case 'sales_call':
        calls += 1;
        break;
      default:
        break;
    }
  }

  return {
    grossRevenueCents,
    refundsCents,
    netRevenueCents: grossRevenueCents - refundsCents,
    payingCustomers: payingCustomers.size,
    prospectsContacted: contacted,
    positiveReplies: replies,
    salesCalls: calls,
    activeMissions: (state?.missions ?? []).filter((m) => !['killed', 'scale'].includes(m.stage)).length,
  };
}

export function createCandidateMission(input = {}) {
  const now = new Date().toISOString();
  const name = String(input.name ?? '').trim();
  const buyer = String(input.buyer ?? '').trim();
  const problem = String(input.problem ?? '').trim();
  const offer = String(input.offer ?? '').trim();

  if (!name || !buyer || !problem || !offer) {
    throw new Error('name, buyer, problem and offer are required');
  }

  const scoreInput = {
    painIntensity: clampRating(input.scoreInput?.painIntensity ?? 2),
    buyerReachability: clampRating(input.scoreInput?.buyerReachability ?? 2),
    evidenceQuality: clampRating(input.scoreInput?.evidenceQuality ?? 1),
    timeToFirstPayment: clampRating(input.scoreInput?.timeToFirstPayment ?? 2),
    manualFulfillability: clampRating(input.scoreInput?.manualFulfillability ?? 2),
    differentiation: clampRating(input.scoreInput?.differentiation ?? 2),
    assetLeverage: clampRating(input.scoreInput?.assetLeverage ?? 2),
    riskProfile: clampRating(input.scoreInput?.riskProfile ?? 3),
  };

  const hardGates = Object.fromEntries(REQUIRED_GATES.map((key) => [key, false]));
  hardGates.buyerIdentified = true;
  hardGates.noBuildBeforeSale = true;

  return {
    id: randomUUID(),
    name,
    brand: String(input.brand ?? 'TBD').trim() || 'TBD',
    thesis: String(input.thesis ?? problem).trim(),
    buyer,
    problem,
    offer,
    priceCents: Math.max(0, Number(input.priceCents) || 0),
    currency: String(input.currency ?? 'SEK').toUpperCase(),
    primaryChannel: String(input.primaryChannel ?? '').trim(),
    stage: 'evidence',
    status: 'active',
    scoreInput,
    hardGates,
    fatalRisks: [],
    competitionRisk: String(input.competitionRisk ?? '').trim(),
    nextAction: 'Find direct evidence and close the highest-risk hard gate before building.',
    ownerDecision: '',
    grillReports: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function nextRunnableTask(state) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  return tasks
    .filter((task) => task.status === 'queued' && task.executionMode === 'internal')
    .sort((a, b) => {
      const priorityDiff = (Number(a.priority) || 99) - (Number(b.priority) || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    })[0] ?? null;
}

export function appendAudit(state, entry) {
  const audit = Array.isArray(state.audit) ? state.audit : (state.audit = []);
  audit.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    status: 'ok',
    ...entry,
  });
  if (audit.length > 500) audit.length = 500;
}

export function hydrateState(state, defaults) {
  const source = state && typeof state === 'object' ? state : {};
  const sourceMissions = Array.isArray(source.missions) ? source.missions : [];
  const sourceEvents = Array.isArray(source.events) ? source.events : [];
  const replaceUnusedLegacySeed =
    Number(source.version || 0) < Number(defaults.version || 0) &&
    sourceEvents.length === 0 &&
    sourceMissions.length === 1 &&
    sourceMissions[0]?.id === 'mission-release-pack';

  const migratedAudit = replaceUnusedLegacySeed
    ? [
        {
          id: 'audit-migrate-bidsprint-48',
          at: new Date().toISOString(),
          type: 'system',
          title: 'Revenue mission migrated to BidSprint 48',
          detail: 'The unused Music Performance Release Pack seed was replaced by the later CEO-approved Swedish public-procurement service. No revenue events were discarded.',
          status: 'warning',
        },
        ...(Array.isArray(source.audit) ? source.audit : []),
      ]
    : (Array.isArray(source.audit) ? source.audit : defaults.audit);

  return {
    version: defaults.version,
    company: { ...defaults.company, ...(source.company ?? {}) },
    automation: replaceUnusedLegacySeed
      ? defaults.automation
      : { ...defaults.automation, ...(source.automation ?? {}) },
    roles: replaceUnusedLegacySeed
      ? defaults.roles
      : (Array.isArray(source.roles) && source.roles.length ? source.roles : defaults.roles),
    missions: replaceUnusedLegacySeed
      ? defaults.missions
      : (sourceMissions.length ? sourceMissions : defaults.missions),
    tasks: replaceUnusedLegacySeed
      ? defaults.tasks
      : (Array.isArray(source.tasks) && source.tasks.length ? source.tasks : defaults.tasks),
    events: sourceEvents,
    audit: migratedAudit,
  };
}
