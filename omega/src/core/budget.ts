import type { OmegaConfig } from '../config.ts';
import type { LedgerEntry, Mission } from './types.ts';

/**
 * Budget limits, checked before every paid agent invocation:
 *   per run     — passed to the agent CLI as a hard cap (--max-budget-usd)
 *   per mission — mission.budgetUsd minus what the ledger says was spent
 *   per day     — sum of today's (UTC) ledger entries across all missions
 * Spend is recorded from the cost the agent tool itself reports, never estimated.
 */
export const MIN_RUN_USD = 0.05;

export function spentToday(ledger: LedgerEntry[], now = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  return ledger.filter((e) => e.at.slice(0, 10) === day).reduce((sum, e) => sum + e.usd, 0);
}

export function missionSpent(ledger: LedgerEntry[], missionId: string): number {
  return ledger.filter((e) => e.missionId === missionId).reduce((sum, e) => sum + e.usd, 0);
}

export interface BudgetDecision {
  ok: boolean;
  allowedUsd: number;
  reason?: string;
  missionRemaining: number;
  dailyRemaining: number;
}

export function checkBudget(cfg: OmegaConfig, mission: Mission, ledger: LedgerEntry[], now = new Date()): BudgetDecision {
  const missionRemaining = mission.budgetUsd - missionSpent(ledger, mission.id);
  const dailyRemaining = cfg.dailyBudgetUsd - spentToday(ledger, now);
  const allowedUsd = Math.max(0, Math.min(cfg.perRunBudgetUsd, missionRemaining, dailyRemaining));
  if (missionRemaining < MIN_RUN_USD) {
    return { ok: false, allowedUsd: 0, missionRemaining, dailyRemaining, reason: `Mission budget exhausted ($${missionRemaining.toFixed(2)} left)` };
  }
  if (dailyRemaining < MIN_RUN_USD) {
    return { ok: false, allowedUsd: 0, missionRemaining, dailyRemaining, reason: `Daily budget exhausted ($${dailyRemaining.toFixed(2)} left)` };
  }
  return { ok: true, allowedUsd: Math.floor(allowedUsd * 100) / 100, missionRemaining, dailyRemaining };
}
