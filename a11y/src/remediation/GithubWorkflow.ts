import type { Cms, EcommercePlatform, Finding } from '../core/Types.js';
import { ruleTitle } from '../findings/Normalize.js';
import { buildRemediation } from './RemediationEngine.js';

export interface GithubRemediationPlan {
  findingId: string;
  branch: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  /** Commands a human or CI runs; this platform never runs them for a customer. */
  commands: string[];
  requiresHumanApproval: true;
}

/**
 * SYSTEM 9 — GitHub remediation mode (design + artefacts).
 *
 * The workflow is: finding → locate component → branch → patch → tests →
 * targeted accessibility retest → pull request. This module produces the branch
 * name, commit message and the PR body that explains the change.
 *
 * What it deliberately does not do: push, open the PR, or merge. Applying a
 * change to a customer's repository is a human decision, and merging always
 * requires human approval. The platform never deploys to a customer's
 * production system.
 */
export function planGithubRemediation(
  finding: Finding,
  context: { platform: EcommercePlatform; cms: Cms; repo?: string; testCommand?: string },
): GithubRemediationPlan {
  const guidance = buildRemediation(finding, context);
  const slug = finding.rule.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const branch = `a11y/${slug}-${finding.id.slice(-6)}`;
  const title = ruleTitle(finding.rule, 'en');
  const testCommand = context.testCommand ?? 'npm test';

  const prBody = `## Finding being addressed

**${title}** — ${finding.componentLabel ?? finding.selector}
Detected on \`${finding.url}\` (${finding.pageType}) with severity **${finding.severity}**, confidence **${finding.confidence}**.
${finding.wcag.length ? `Maps to ${finding.wcag.map((w) => `WCAG ${w.criterion} (${w.level})`).join(', ')}.` : ''}

### What was observed
${finding.observedBehaviour}

### Why this change is proposed
${finding.userImpact}

Expected behaviour: ${finding.expectedBehaviour}

## Code changed

Stack: ${guidance.stack}
Likely location(s):
${guidance.likelyLocations.map((l) => `- ${l}`).join('\n')}

${guidance.suggestion ? `\`\`\`${guidance.suggestion.language}\n- ${guidance.suggestion.before}\n+ ${guidance.suggestion.after}\n\`\`\`\n\n${guidance.suggestion.note}` : '_No mechanical patch is available for this rule; the change was made by hand — see the steps below._'}

## Tests executed

- \`${testCommand}\`
- Targeted accessibility retest of \`${finding.url}\` using the recorded reproduction:
${finding.reproduction.map((step, i) => `  ${i + 1}. ${step}`).join('\n')}

## Accessibility retest result

_Fill in from the retest run: OPEN / PARTIALLY_FIXED / FIXED / REGRESSED / UNABLE_TO_VERIFY, with the before/after evidence._

---
Human approval is required before merging. This branch was prepared from an automated finding; it has not been deployed anywhere.`;

  return {
    findingId: finding.id,
    branch,
    commitMessage: `fix(a11y): ${title.toLowerCase()} in ${finding.componentLabel ?? finding.pageType}`,
    prTitle: `fix(a11y): ${title} — ${finding.componentLabel ?? finding.pageType}`,
    prBody,
    commands: [
      `git checkout -b ${branch}`,
      '# apply the proposed change in the located component',
      testCommand,
      `# re-run the accessibility retest for ${finding.url}`,
      `git commit -am "fix(a11y): ${title.toLowerCase()}"`,
      `git push -u origin ${branch}`,
      '# open a pull request using the generated body; a human reviews and merges',
    ],
    requiresHumanApproval: true,
  };
}
