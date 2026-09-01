import type { WcagRef } from '../core/Types.js';

/**
 * WCAG 2.1/2.2 level A and AA success criteria. Used for report labelling only.
 *
 * Mapping a finding to a criterion is not a compliance determination: an
 * automated tool can show that a specific criterion is not met on a specific
 * page, never that a site as a whole conforms.
 */
export const WCAG_CRITERIA: Record<string, { level: 'A' | 'AA'; title: string }> = {
  '1.1.1': { level: 'A', title: 'Non-text Content' },
  '1.2.1': { level: 'A', title: 'Audio-only and Video-only (Prerecorded)' },
  '1.2.2': { level: 'A', title: 'Captions (Prerecorded)' },
  '1.2.3': { level: 'A', title: 'Audio Description or Media Alternative' },
  '1.2.4': { level: 'AA', title: 'Captions (Live)' },
  '1.2.5': { level: 'AA', title: 'Audio Description (Prerecorded)' },
  '1.3.1': { level: 'A', title: 'Info and Relationships' },
  '1.3.2': { level: 'A', title: 'Meaningful Sequence' },
  '1.3.3': { level: 'A', title: 'Sensory Characteristics' },
  '1.3.4': { level: 'AA', title: 'Orientation' },
  '1.3.5': { level: 'AA', title: 'Identify Input Purpose' },
  '1.4.1': { level: 'A', title: 'Use of Color' },
  '1.4.2': { level: 'A', title: 'Audio Control' },
  '1.4.3': { level: 'AA', title: 'Contrast (Minimum)' },
  '1.4.4': { level: 'AA', title: 'Resize Text' },
  '1.4.5': { level: 'AA', title: 'Images of Text' },
  '1.4.10': { level: 'AA', title: 'Reflow' },
  '1.4.11': { level: 'AA', title: 'Non-text Contrast' },
  '1.4.12': { level: 'AA', title: 'Text Spacing' },
  '1.4.13': { level: 'AA', title: 'Content on Hover or Focus' },
  '2.1.1': { level: 'A', title: 'Keyboard' },
  '2.1.2': { level: 'A', title: 'No Keyboard Trap' },
  '2.1.4': { level: 'A', title: 'Character Key Shortcuts' },
  '2.2.1': { level: 'A', title: 'Timing Adjustable' },
  '2.2.2': { level: 'A', title: 'Pause, Stop, Hide' },
  '2.3.1': { level: 'A', title: 'Three Flashes or Below Threshold' },
  '2.4.1': { level: 'A', title: 'Bypass Blocks' },
  '2.4.2': { level: 'A', title: 'Page Titled' },
  '2.4.3': { level: 'A', title: 'Focus Order' },
  '2.4.4': { level: 'A', title: 'Link Purpose (In Context)' },
  '2.4.5': { level: 'AA', title: 'Multiple Ways' },
  '2.4.6': { level: 'AA', title: 'Headings and Labels' },
  '2.4.7': { level: 'AA', title: 'Focus Visible' },
  '2.4.11': { level: 'AA', title: 'Focus Not Obscured (Minimum)' },
  '2.5.1': { level: 'A', title: 'Pointer Gestures' },
  '2.5.2': { level: 'A', title: 'Pointer Cancellation' },
  '2.5.3': { level: 'A', title: 'Label in Name' },
  '2.5.4': { level: 'A', title: 'Motion Actuation' },
  '2.5.7': { level: 'AA', title: 'Dragging Movements' },
  '2.5.8': { level: 'AA', title: 'Target Size (Minimum)' },
  '3.1.1': { level: 'A', title: 'Language of Page' },
  '3.1.2': { level: 'AA', title: 'Language of Parts' },
  '3.2.1': { level: 'A', title: 'On Focus' },
  '3.2.2': { level: 'A', title: 'On Input' },
  '3.2.3': { level: 'AA', title: 'Consistent Navigation' },
  '3.2.4': { level: 'AA', title: 'Consistent Identification' },
  '3.2.6': { level: 'A', title: 'Consistent Help' },
  '3.3.1': { level: 'A', title: 'Error Identification' },
  '3.3.2': { level: 'A', title: 'Labels or Instructions' },
  '3.3.3': { level: 'AA', title: 'Error Suggestion' },
  '3.3.4': { level: 'AA', title: 'Error Prevention (Legal, Financial, Data)' },
  '3.3.7': { level: 'A', title: 'Redundant Entry' },
  '3.3.8': { level: 'AA', title: 'Accessible Authentication (Minimum)' },
  '4.1.2': { level: 'A', title: 'Name, Role, Value' },
  '4.1.3': { level: 'AA', title: 'Status Messages' },
};

export function wcagRef(criterion: string): WcagRef | null {
  const entry = WCAG_CRITERIA[criterion];
  return entry ? { criterion, level: entry.level, title: entry.title } : null;
}

export function wcagRefs(criteria: string[]): WcagRef[] {
  return criteria.map(wcagRef).filter((r): r is WcagRef => r !== null);
}

/** axe tags carry criteria as `wcag111` / `wcag1410`. Only map what is unambiguous. */
export function wcagFromAxeTags(tags: string[]): WcagRef[] {
  const refs: WcagRef[] = [];
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
    if (!match) continue;
    const criterion = `${match[1]}.${match[2]}.${Number(match[3])}`;
    const ref = wcagRef(criterion);
    if (ref && !refs.some((r) => r.criterion === criterion)) refs.push(ref);
  }
  return refs;
}
