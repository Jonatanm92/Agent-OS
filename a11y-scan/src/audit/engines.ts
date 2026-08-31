/**
 * The seam that keeps a second analysis engine a new file rather than a
 * refactor. axe-core is the only implementation in v1; ARCHITECTURE.md explains
 * why pa11y and Lighthouse were evaluated and left out.
 */
import type { Page } from 'playwright';
import type { Finding, PageRole } from '../types.js';

export interface EngineContext {
  url: string;
  role: PageRole;
  maxSnippetChars: number;
}

export interface Engine {
  name: string;
  run(page: Page, context: EngineContext): Promise<Finding[]>;
}
