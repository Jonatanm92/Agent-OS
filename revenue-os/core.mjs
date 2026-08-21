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
    'Kill or materially reposition after 30 qualified, personalized prospects produce no credible buying signal.',
    'Kill after two offer iterations and three serious sales conversations produce no payment.',
    'Kill immediately if the wedge collapses into a generic clipper that competes mainly on features or price.',
    'Do not authorize a full software build before a customer pays for the founder workflow.',
  ];

  let nextTest = mission.nextAction || 'Close the highest-risk open gate with the smallest real-world test.';
  if (evaluation.openGates.includes('proofReady')) {
    nextTest = 'Produce one real customer-grade proof using an existing finished performance; evaluate musical coherence, framing, copy and export readiness.';
  } else if (evaluation.openGates.includes('paymentReady')) {
    nextTest = 'Make a legitimate one-time payment path live at the founder price before outreach begins.';
  } else if (evaluation.openGates.includes('reachableProspects')) {
    nextTest = 'Build and qualify a list of 30 reachable buyers who already publish both long-form performances and short-form content.';
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'deterministic',
    verdict: evaluation.decision,
    score: evaluation.score,
    openGates: openGateLabels,
    weakDimensions,
    strongestCaseAgainst: mission.competitionRisk ||
      'The market may prefer broad, inexpensive creator tools rather than a specialist release-pack workflow.',
    nextTest,
    killConditions,
    conclusion:
      evaluation.decision === 'GO'
        ? 'Proceed to a controlled paid validation; keep full build scope frozen.'
        : evaluation.decision === 'TEST'
          ? 'Do not scale or expand scope. Close the open gates through paid-market evidence.'
          : 'Stop work unless a materially different buyer, channel or wedge changes the economics.',
  };
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
    currency: String(input.currency ?? 'USD').toUpperCase(),
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
  return {
    version: defaults.version,
    company: { ...defaults.company, ...(source.company ?? {}) },
    automation: { ...defaults.automation, ...(source.automation ?? {}) },
    roles: Array.isArray(source.roles) && source.roles.length ? source.roles : defaults.roles,
    missions: Array.isArray(source.missions) && source.missions.length ? source.missions : defaults.missions,
    tasks: Array.isArray(source.tasks) && source.tasks.length ? source.tasks : defaults.tasks,
    events: Array.isArray(source.events) ? source.events : [],
    audit: Array.isArray(source.audit) ? source.audit : defaults.audit,
  };
}
