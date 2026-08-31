import type { SalesStage } from '../core/Types.js';

export interface StageDefinition {
  stage: SalesStage;
  label: string;
  /** What must be true to enter this stage. */
  entryCondition: string;
  /** The single next action an operator should take from here. */
  defaultNextAction: string;
  /** Stages reachable from here. Everything else needs an explicit override. */
  next: SalesStage[];
}

/** SYSTEM 13 — the pipeline, with a defined next action at every stage. */
export const PIPELINE: Record<SalesStage, StageDefinition> = {
  DISCOVERED: {
    stage: 'DISCOVERED',
    label: 'Upptäckt',
    entryCondition: 'Domain is in the prospect database.',
    defaultNextAction: 'Scan the site.',
    next: ['SCANNED', 'LOST'],
  },
  SCANNED: {
    stage: 'SCANNED',
    label: 'Skannad',
    entryCondition: 'A scan completed and findings were normalized.',
    defaultNextAction: 'Check the qualification result; re-scan if the site blocked us.',
    next: ['QUALIFIED', 'LOST'],
  },
  QUALIFIED: {
    stage: 'QUALIFIED',
    label: 'Kvalificerad',
    entryCondition: 'Lead score is above the ICP threshold and no disqualifier fired.',
    defaultNextAction: 'Generate the mini audit.',
    next: ['MINI_AUDIT_READY', 'LOST'],
  },
  MINI_AUDIT_READY: {
    stage: 'MINI_AUDIT_READY',
    label: 'Mini-audit klar',
    entryCondition: 'A mini audit exists with at least one strong finding.',
    defaultNextAction: 'Review the findings in the console and approve or reject them.',
    next: ['REVIEWED', 'LOST'],
  },
  REVIEWED: {
    stage: 'REVIEWED',
    label: 'Granskad',
    entryCondition: 'A human reviewed the findings in the mini audit.',
    defaultNextAction: 'Sign the audit off for outreach.',
    next: ['READY_FOR_OUTREACH', 'LOST'],
  },
  READY_FOR_OUTREACH: {
    stage: 'READY_FOR_OUTREACH',
    label: 'Klar för kontakt',
    entryCondition: 'Reviewer signed off and a contact path exists.',
    defaultNextAction: 'Generate outreach, approve the draft and send it.',
    next: ['CONTACTED', 'LOST'],
  },
  CONTACTED: {
    stage: 'CONTACTED',
    label: 'Kontaktad',
    entryCondition: 'Outreach was sent.',
    defaultNextAction: 'Follow up in five working days if there is no reply.',
    next: ['REPLIED', 'LOST'],
  },
  REPLIED: {
    stage: 'REPLIED',
    label: 'Svarade',
    entryCondition: 'The prospect replied.',
    defaultNextAction: 'Offer a 30-minute walkthrough of the findings.',
    next: ['MEETING', 'LOST'],
  },
  MEETING: {
    stage: 'MEETING',
    label: 'Möte',
    entryCondition: 'A meeting is booked or held.',
    defaultNextAction: 'Send a proposal for the full audit.',
    next: ['PROPOSAL', 'LOST'],
  },
  PROPOSAL: {
    stage: 'PROPOSAL',
    label: 'Offert',
    entryCondition: 'A proposal was sent.',
    defaultNextAction: 'Follow up on the proposal within a week.',
    next: ['WON', 'LOST'],
  },
  WON: {
    stage: 'WON',
    label: 'Vunnen',
    entryCondition: 'The customer accepted.',
    defaultNextAction: 'Deliver the professional audit and the developer report.',
    next: ['MONITORING', 'LOST'],
  },
  LOST: {
    stage: 'LOST',
    label: 'Förlorad',
    entryCondition: 'The prospect declined or is out of ICP.',
    defaultNextAction: 'No action. Add to the suppression list if they asked not to be contacted.',
    next: [],
  },
  MONITORING: {
    stage: 'MONITORING',
    label: 'Övervakning',
    entryCondition: 'Remediation is delivered and recurring monitoring is active.',
    defaultNextAction: 'Review the next monitoring run and report regressions.',
    next: ['LOST'],
  },
};

export function nextActionFor(stage: SalesStage): string {
  return PIPELINE[stage].defaultNextAction;
}

export function canTransition(from: SalesStage, to: SalesStage): boolean {
  return PIPELINE[from].next.includes(to);
}
