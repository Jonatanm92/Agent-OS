/**
 * Developer handoff — a compact task list to paste into Jira, Linear or GitHub.
 *
 * One task per issue, not per instance, so a shared component defect is one
 * ticket with a page count rather than forty tickets.
 */
import type { Issue, ScanResult } from '../types.js';

export interface HandoffTask {
  key: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  estimate: string;
  labels: string[];
  body: string;
}

const PRIORITY: Record<Issue['severity'], HandoffTask['priority']> = {
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};

const ESTIMATE: Record<Issue['effort'], string> = {
  small: '≤ 2h',
  medium: '0.5–2 days',
  large: '> 2 days',
};

export function buildHandoff(result: ScanResult): HandoffTask[] {
  return result.issues.map((issue, index) => {
    const urls = issue.affectedUrls.slice(0, 5);
    const extra = issue.affectedUrls.length - urls.length;

    const body = [
      `**Problem**: ${issue.title}`,
      '',
      `**Component**: \`${issue.component}\``,
      `**WCAG**: ${issue.wcag.length ? issue.wcag.join(', ') : 'see rule documentation'}`,
      `**Verification**: ${issue.verification === 'automatic' ? 'AUTOMATICALLY VERIFIED' : 'MANUAL CHECK REQUIRED'}`,
      '',
      `**Who it affects**: ${issue.impact}`,
      '',
      `**Fix**: ${issue.remediation}`,
      '',
      `**Occurrences**: ${issue.instanceCount} on ${issue.affectedUrls.length} page(s)`,
      ...urls.map((url) => `- ${url}`),
      ...(extra > 0 ? [`- …and ${extra} more`] : []),
      '',
      '**Example markup**:',
      '```html',
      issue.examples[0]?.snippet ?? '(not captured)',
      '```',
      '',
      `**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.`,
    ].join('\n');

    return {
      key: `A11Y-${String(index + 1).padStart(3, '0')}`,
      title: `[${issue.severity.toUpperCase()}] ${issue.title} — ${issue.component}`,
      priority: PRIORITY[issue.severity],
      estimate: ESTIMATE[issue.effort],
      labels: ['accessibility', `wcag-${issue.wcag[0]?.split(' ')[0] ?? 'unmapped'}`, `effort-${issue.effort}`],
      body,
    };
  });
}

/** Markdown rendering for pasting straight into an issue tracker. */
export function handoffToMarkdown(tasks: HandoffTask[]): string {
  const lines: string[] = ['# Accessibility fixes — developer handoff', ''];
  lines.push(
    'One task per defect, not per occurrence. A defect in a shared component is a single fix even when it appears on many pages.',
    ''
  );
  for (const task of tasks) {
    lines.push(`## ${task.key} · ${task.priority} · ${task.estimate}`, '');
    lines.push(`**${task.title}**`, '');
    lines.push(`Labels: ${task.labels.join(', ')}`, '');
    lines.push(task.body, '', '---', '');
  }
  return lines.join('\n');
}
