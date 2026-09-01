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

/**
 * SYSTEM 13 — the pipeline, with a defined next action at every stage.
 *
 * `defaultNextAction` is operator-facing — it is exactly what fills the "next
 * action" column in the console's worklist and the CLI's `pipeline worklist`
 * output — so it is written in Swedish, matching `label`. `entryCondition` is
 * never rendered anywhere; it stays in English as documentation for whoever
 * next reads this file.
 */
export const PIPELINE: Record<SalesStage, StageDefinition> = {
  DISCOVERED: {
    stage: 'DISCOVERED',
    label: 'Upptäckt',
    entryCondition: 'Domain is in the prospect database.',
    defaultNextAction: 'Skanna sajten.',
    next: ['SCANNED', 'LOST'],
  },
  SCANNED: {
    stage: 'SCANNED',
    label: 'Skannad',
    entryCondition: 'A scan completed and findings were normalized.',
    defaultNextAction: 'Kontrollera kvalificeringsresultatet; skanna om om sajten blockerade oss.',
    next: ['QUALIFIED', 'LOST'],
  },
  QUALIFIED: {
    stage: 'QUALIFIED',
    label: 'Kvalificerad',
    entryCondition: 'Lead score is above the ICP threshold and no disqualifier fired.',
    defaultNextAction: 'Generera mini-audit.',
    next: ['MINI_AUDIT_READY', 'LOST'],
  },
  MINI_AUDIT_READY: {
    stage: 'MINI_AUDIT_READY',
    label: 'Mini-audit klar',
    entryCondition: 'A mini audit exists with at least one strong finding.',
    defaultNextAction: 'Granska fynden i konsolen och godkänn eller avvisa dem.',
    next: ['REVIEWED', 'LOST'],
  },
  REVIEWED: {
    stage: 'REVIEWED',
    label: 'Granskad',
    entryCondition: 'A human reviewed the findings in the mini audit.',
    defaultNextAction: 'Klarmarkera granskningen för outreach.',
    next: ['READY_FOR_OUTREACH', 'LOST'],
  },
  READY_FOR_OUTREACH: {
    stage: 'READY_FOR_OUTREACH',
    label: 'Klar för kontakt',
    entryCondition: 'Reviewer signed off and a contact path exists.',
    defaultNextAction: 'Generera outreach, godkänn utkastet och skicka det.',
    next: ['CONTACTED', 'LOST'],
  },
  CONTACTED: {
    stage: 'CONTACTED',
    label: 'Kontaktad',
    entryCondition: 'Outreach was sent.',
    defaultNextAction: 'Följ upp inom fem arbetsdagar om inget svar kommit.',
    next: ['REPLIED', 'LOST'],
  },
  REPLIED: {
    stage: 'REPLIED',
    label: 'Svarade',
    entryCondition: 'The prospect replied.',
    defaultNextAction: 'Erbjud en 30-minuters genomgång av fynden.',
    next: ['MEETING', 'LOST'],
  },
  MEETING: {
    stage: 'MEETING',
    label: 'Möte',
    entryCondition: 'A meeting is booked or held.',
    defaultNextAction: 'Skicka en offert för den fullständiga granskningen.',
    next: ['PROPOSAL', 'LOST'],
  },
  PROPOSAL: {
    stage: 'PROPOSAL',
    label: 'Offert',
    entryCondition: 'A proposal was sent.',
    defaultNextAction: 'Följ upp offerten inom en vecka.',
    next: ['WON', 'LOST'],
  },
  WON: {
    stage: 'WON',
    label: 'Vunnen',
    entryCondition: 'The customer accepted.',
    defaultNextAction: 'Leverera den fullständiga granskningen och utvecklarrapporten.',
    next: ['MONITORING', 'LOST'],
  },
  LOST: {
    stage: 'LOST',
    label: 'Förlorad',
    entryCondition: 'The prospect declined or is out of ICP.',
    defaultNextAction: 'Ingen åtgärd. Lägg till i spärrlistan om de bett om att inte bli kontaktade.',
    next: [],
  },
  MONITORING: {
    stage: 'MONITORING',
    label: 'Övervakning',
    entryCondition: 'Remediation is delivered and recurring monitoring is active.',
    defaultNextAction: 'Granska nästa övervakningskörning och rapportera regressioner.',
    next: ['LOST'],
  },
};

export function nextActionFor(stage: SalesStage): string {
  return PIPELINE[stage].defaultNextAction;
}

export function canTransition(from: SalesStage, to: SalesStage): boolean {
  return PIPELINE[from].next.includes(to);
}
