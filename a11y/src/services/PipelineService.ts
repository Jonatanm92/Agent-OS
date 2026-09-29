import type { Prospect, SalesStage } from '../core/Types.js';
import { PIPELINE, canTransition, nextActionFor } from '../pipeline/Stages.js';
import type { Platform } from './Platform.js';

export interface PipelineRow {
  prospect: Prospect;
  stageLabel: string;
  nextAction: string;
  daysInStage: number;
}

/** SYSTEM 13 — pipeline movement and the worklist it produces. */
export class PipelineService {
  constructor(private readonly platform: Platform) {}

  advance(prospectId: string, to: SalesStage, options: { force?: boolean; note?: string; nextAction?: string } = {}): Prospect {
    const prospect = this.platform.store.getProspect(prospectId);
    if (!prospect) throw new Error(`Unknown prospect: ${prospectId}`);
    if (!options.force && prospect.salesStage !== to && !canTransition(prospect.salesStage, to)) {
      throw new Error(
        `${prospect.salesStage} → ${to} is not a defined transition. Allowed: ${PIPELINE[prospect.salesStage].next.join(', ') || 'none'}. Pass force to override.`,
      );
    }
    const updated = this.platform.store.setStage(prospectId, to, options.nextAction ?? nextActionFor(to), options.note);
    if (to === 'WON') {
      this.platform.store.upsertSite(prospect.domain, { label: prospect.companyName, monitoringEnabled: true });
    }
    return updated!;
  }

  /** Every prospect with an open next action, most valuable first. */
  worklist(limit = 50): PipelineRow[] {
    const now = Date.now();
    return this.platform.store
      .listProspects({ limit: 500 })
      .filter((p) => !['LOST'].includes(p.salesStage))
      .sort((a, b) => b.leadScore - a.leadScore)
      .slice(0, limit)
      .map((prospect) => ({
        prospect,
        stageLabel: PIPELINE[prospect.salesStage].label,
        nextAction: prospect.nextAction || nextActionFor(prospect.salesStage),
        daysInStage: Math.floor((now - new Date(prospect.updatedAt).getTime()) / 86_400_000),
      }));
  }

  board(): Record<SalesStage, number> {
    const counts = Object.fromEntries(Object.keys(PIPELINE).map((stage) => [stage, 0])) as Record<SalesStage, number>;
    for (const prospect of this.platform.store.listProspects({ limit: 5000 })) counts[prospect.salesStage] += 1;
    return counts;
  }
}
