import fs from 'node:fs';

function readPlaybook(name) {
  return fs.readFileSync(new URL(`./playbooks/${name}`, import.meta.url), 'utf8').trim();
}

export const FOUNDER_INTAKE_DELIVERY = readPlaybook('founder-intake-delivery.md');
export const FOUNDER_OFFER = readPlaybook('founder-offer.md');
export const FOUNDER_PROOF_ACCEPTANCE = readPlaybook('founder-proof-acceptance.md');
export const OFFER_RED_TEAM = readPlaybook('offer-red-team.md');
export const OUTREACH_FRAMEWORK = readPlaybook('outreach-framework.md');
export const PAYMENT_READINESS = readPlaybook('payment-readiness.md');
export const PROSPECT_RUBRIC = readPlaybook('prospect-rubric.md');
