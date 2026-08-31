import type { Cms, EcommercePlatform, Finding } from '../core/Types.js';

export interface CodeSuggestion {
  /** What the markup looks like now, taken from the finding's DOM evidence. */
  before: string;
  /** Proposed replacement. Always a suggestion for a human to apply. */
  after: string;
  language: 'html' | 'liquid' | 'php' | 'jsx' | 'tsx' | 'css' | 'vue';
  note: string;
}

export interface RemediationGuidance {
  findingId: string;
  stack: string;
  /** Where in a project of this stack the component most likely lives. */
  likelyLocations: string[];
  /** Ordered, concrete steps for a developer on this stack. */
  steps: string[];
  suggestion: CodeSuggestion | null;
  /** How to verify the fix, mirroring the finding's own reproduction. */
  verification: string[];
  /** Stated plainly when the adapter can only give partial guidance. */
  limitations: string[];
}

export interface StackAdapter {
  id: string;
  label: string;
  matches(context: { platform: EcommercePlatform; cms: Cms }): boolean;
  /** File/dir globs where the failing component probably lives. */
  locate(finding: Finding): string[];
  /** Stack-specific steps appended to the generic ones. */
  steps(finding: Finding): string[];
  language: CodeSuggestion['language'];
}
