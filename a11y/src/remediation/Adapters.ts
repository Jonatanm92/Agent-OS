import type { Cms, EcommercePlatform, Finding } from '../core/Types.js';
import type { StackAdapter } from './Types.js';

const componentHint = (finding: Finding): string => {
  const classes = /class="([^"]+)"/.exec(finding.html)?.[1]?.split(/\s+/).slice(0, 3).join(' ') ?? '';
  return classes || finding.selector.split('>').pop()?.trim() || 'the component';
};

/** SYSTEM 8 — stack adapters. New stacks are added by appending to this list. */
export const ADAPTERS: StackAdapter[] = [
  {
    id: 'shopify',
    label: 'Shopify / Liquid',
    language: 'liquid',
    matches: ({ platform, cms }) => platform === 'shopify' || cms === 'shopify',
    locate: (finding) => [
      `sections/*.liquid — search for "${componentHint(finding)}"`,
      'snippets/*.liquid — shared components such as product cards and drawers',
      'assets/*.js — theme behaviour, where click-only handlers usually live',
      'assets/*.css — focus styling overrides',
    ],
    steps: (finding) => [
      'Run `shopify theme pull` to get the live theme locally, then work on a duplicated (unpublished) theme.',
      `Search the theme for the selector \`${finding.selector}\` or the class names in the DOM evidence.`,
      'Apply the change in the snippet or section so every template using it is fixed at once.',
      'Preview the unpublished theme and re-run the reproduction steps before publishing.',
    ],
  },
  {
    id: 'woocommerce',
    label: 'WordPress / WooCommerce',
    language: 'php',
    matches: ({ platform, cms }) => platform === 'woocommerce' || cms === 'wordpress',
    locate: (finding) => [
      `wp-content/themes/<theme>/ — search for "${componentHint(finding)}"`,
      'wp-content/themes/<theme>/woocommerce/ — template overrides for shop pages',
      'wp-content/themes/<theme>/assets/js/ — theme scripts',
      'Check whether the markup comes from a plugin before editing theme files.',
    ],
    steps: (finding) => [
      'Reproduce on a staging copy first — never edit a live WooCommerce theme.',
      `Locate the template producing \`${finding.selector}\`. If it is a Woo template, copy it into the theme\'s woocommerce/ folder rather than editing the plugin.`,
      'If the markup comes from a plugin, prefer a filter/hook over editing plugin files, so the fix survives updates.',
      'Clear any page cache and re-run the reproduction steps.',
    ],
  },
  {
    id: 'react',
    label: 'React',
    language: 'jsx',
    matches: ({ cms }) => cms === 'react_spa',
    locate: (finding) => [
      `src/components/** — search for the class names in the DOM evidence ("${componentHint(finding)}")`,
      'src/components/**/*.test.* — existing tests for the component',
    ],
    steps: () => [
      'Fix the shared component rather than its call sites, so every page using it is fixed at once.',
      'Prefer semantic elements over ARIA: a <button> needs no role, tabIndex or key handling.',
      'Add a test asserting the keyboard behaviour (fireEvent.keyDown / userEvent.tab) so it cannot regress.',
    ],
  },
  {
    id: 'next',
    label: 'Next.js',
    language: 'tsx',
    matches: ({ cms }) => cms === 'next',
    locate: (finding) => [
      `components/** or src/components/** — search for "${componentHint(finding)}"`,
      'app/**/page.tsx or pages/** — the route that renders the affected page',
    ],
    steps: () => [
      'Fix the shared component; App Router pages usually compose the same UI primitives.',
      'Keep the fix server-renderable — focus management belongs in a client component ("use client").',
      'Add a Playwright test covering the keyboard path, which the retest engine can reuse.',
    ],
  },
  {
    id: 'generic',
    label: 'Generic HTML/CSS',
    language: 'html',
    matches: () => true,
    locate: (finding) => [`Search the codebase for the markup shown in the DOM evidence, or for the selector \`${finding.selector}\`.`],
    steps: () => ['Apply the change wherever the shared component is defined so it is fixed everywhere at once.'],
  },
];

export function adapterFor(context: { platform: EcommercePlatform; cms: Cms }): StackAdapter {
  return ADAPTERS.find((adapter) => adapter.matches(context)) ?? ADAPTERS[ADAPTERS.length - 1];
}
