/**
 * Every limit the scanner obeys, in one file.
 *
 * These are safety controls, not tuning knobs — see THREAT-MODEL.md T6/T7.
 * Raising them raises the load placed on someone else's shop.
 */

export interface Limits {
  maxPages: number;
  maxDepth: number;
  /** Cap on the discovery queue, so a faceted-search explosion cannot grow unbounded. */
  maxQueued: number;
  navigationTimeoutMs: number;
  /** Whole-run wall clock. Checked between pages; a slow site yields fewer pages, never a hang. */
  runBudgetMs: number;
  /** Politeness delay between navigations. */
  requestDelayMs: number;
  maxResponseBytes: number;
  /** Truncation applied to DOM snippets before they enter a report. */
  maxSnippetChars: number;
  /** Element screenshots captured per page. Keeps report size and runtime bounded. */
  maxScreenshotsPerPage: number;
  /** A capture larger than this is discarded rather than embedded. */
  maxScreenshotBytes: number;
}

export const SCAN_LIMITS: Limits = {
  maxPages: 12,
  maxDepth: 2,
  maxQueued: 300,
  navigationTimeoutMs: 20_000,
  runBudgetMs: 5 * 60_000,
  requestDelayMs: 400,
  maxResponseBytes: 8 * 1024 * 1024,
  maxSnippetChars: 400,
  maxScreenshotsPerPage: 4,
  maxScreenshotBytes: 120 * 1024,
};

export const PRESCAN_LIMITS: Limits = {
  ...SCAN_LIMITS,
  maxPages: 4,
  maxDepth: 1,
  maxQueued: 60,
  navigationTimeoutMs: 15_000,
  runBudgetMs: 90_000,
  // A prospect summary is a text artefact; screenshots would only slow it down.
  maxScreenshotsPerPage: 0,
};

/** Desktop viewport used for the main pass. */
export const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;

/**
 * Mobile viewport for the touch-target and reflow pass.
 * 360x740 is the most common Android class in Swedish e-commerce traffic.
 */
export const MOBILE_VIEWPORT = { width: 360, height: 740 } as const;

/**
 * WCAG 1.4.10 Reflow is specified at 320 CSS px wide.
 */
export const REFLOW_WIDTH = 320;

/**
 * Identifies the scanner to site owners so they can see who is crawling and
 * contact us. Crawling anonymously would be the rude option.
 */
export const USER_AGENT =
  'A11yRiskScan/0.1 (accessibility pre-audit; +https://example.se/accessibility-scan)';

/** The robots.txt token this crawler answers to, in addition to `*`. */
export const ROBOTS_TOKEN = 'a11yriskscan';
