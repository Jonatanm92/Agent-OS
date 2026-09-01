/**
 * The order bundle is what an operator actually works from after a payment,
 * so its contents and its data-minimisation promise are both tested.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Finding, ScanResult } from '../src/types.js';
import { buildIssues } from '../src/analyze/normalize.js';
import { buildManualScript } from '../src/analyze/manual-script.js';
import { collectPositives } from '../src/analyze/journey.js';
import { manualChecklistMarkdown, writeOrderBundle } from '../src/report/order-bundle.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'ars-orders-'));
  dirs.push(d);
  return d;
}

/** A 1x1 transparent PNG, so screenshot extraction has something real to write. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'button-name',
    title: 'Buttons have no accessible name',
    source: 'axe',
    verification: 'automatic',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact: 'Screen reader users cannot tell what the control does.',
    remediation: 'Give the button an accessible name.',
    verify: 'Tab to the control and listen with a screen reader.',
    instance: {
      url: 'https://shop.example.se/cart',
      role: 'cart',
      selector: '.remove',
      snippet: '<button class="remove"></button>',
      screenshot: PNG,
    },
    ...overrides,
  };
}

function scanResult(findings: Finding[] = [finding()]): ScanResult {
  const issues = buildIssues(findings, 4);
  return {
    target: 'https://shop.example.se',
    domain: 'shop.example.se',
    scanDate: '2026-09-01T09:00:00.000Z',
    durationMs: 42_000,
    pages: [
      { url: 'https://shop.example.se/', role: 'home', depth: 0, title: 'Shop', status: 200 },
      { url: 'https://shop.example.se/cart', role: 'cart', depth: 1, title: 'Cart', status: 200 },
    ],
    issues,
    manualChecks: buildManualScript(issues, ['home', 'cart']),
    positives: collectPositives(issues, ['home', 'cart']),
    notTested: [],
    limits: { maxPages: 12, maxDepth: 2 },
    robotsRespected: true,
  };
}

describe('order bundle contents', () => {
  it('writes every artefact the operator workflow promises', () => {
    const root = tempRoot();
    const bundle = writeOrderBundle(scanResult(), { orderId: '1234', toolVersion: '0.2.0' }, root);

    for (const name of ['report.html', 'scan.json', 'handoff.md', 'manual-checklist.md', 'run-metadata.json']) {
      expect(existsSync(join(bundle.directory, name)), name).toBe(true);
    }
    expect(existsSync(join(bundle.directory, 'evidence'))).toBe(true);
  });

  it('isolates each order in its own folder', () => {
    const root = tempRoot();
    writeOrderBundle(scanResult(), { orderId: '1001', toolVersion: '0.2.0' }, root);
    writeOrderBundle(scanResult(), { orderId: '1002', toolVersion: '0.2.0' }, root);
    expect(readdirSync(root).sort()).toEqual(['1001', '1002']);
  });

  it('extracts embedded screenshots as real image files', () => {
    const root = tempRoot();
    const bundle = writeOrderBundle(scanResult(), { orderId: '1234', toolVersion: '0.2.0' }, root);
    const shots = readdirSync(join(bundle.directory, 'evidence'));
    expect(shots.length).toBe(1);
    expect(shots[0]).toMatch(/^01-button-name\.png$/);
    // Real PNG magic bytes, not a base64 string written to a .png.
    const bytes = readFileSync(join(bundle.directory, 'evidence', shots[0]!));
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('still writes a bundle when there is nothing to screenshot', () => {
    const root = tempRoot();
    const noShot = finding();
    delete noShot.instance.screenshot;
    const bundle = writeOrderBundle(scanResult([noShot]), { orderId: '77', toolVersion: '0.2.0' }, root);
    expect(readdirSync(join(bundle.directory, 'evidence'))).toEqual([]);
    expect(existsSync(join(bundle.directory, 'report.html'))).toBe(true);
  });
});

describe('data minimisation', () => {
  it('records the order reference and target but no personal data', () => {
    const root = tempRoot();
    const bundle = writeOrderBundle(
      scanResult(),
      { orderId: '1234', company: 'Nordvik Hemtextil AB', toolVersion: '0.2.0' },
      root
    );
    const meta = JSON.parse(readFileSync(join(bundle.directory, 'run-metadata.json'), 'utf8'));

    expect(meta.order.reference).toBe('1234');
    expect(meta.order.company).toBe('Nordvik Hemtextil AB');
    expect(meta.scan.target).toBe('https://shop.example.se');

    // The fields Shopify already holds must not be duplicated here.
    for (const key of ['contactName', 'email', 'organisationNumber', 'phone']) {
      expect(meta.order[key]).toBeUndefined();
    }
  });

  it('marks the draft as not yet reviewed by a human', () => {
    const root = tempRoot();
    const bundle = writeOrderBundle(scanResult(), { orderId: '1234', toolVersion: '0.2.0' }, root);
    const meta = JSON.parse(readFileSync(join(bundle.directory, 'run-metadata.json'), 'utf8'));
    expect(meta.delivery.humanReviewCompleted).toBe(false);
    expect(meta.delivery.deliveredAt).toBeNull();
  });
});

describe('path safety (T3)', () => {
  it('sanitises an order reference that tries to traverse', () => {
    const root = tempRoot();
    const bundle = writeOrderBundle(
      scanResult(),
      { orderId: '../../etc/cron.d', toolVersion: '0.2.0' },
      root
    );
    expect(bundle.directory.startsWith(root)).toBe(true);
    expect(bundle.directory).not.toContain('..');
  });

  it('falls back to a safe name when nothing survives sanitisation', () => {
    const root = tempRoot();
    const bundle = writeOrderBundle(scanResult(), { orderId: '///', toolVersion: '0.2.0' }, root);
    expect(bundle.directory).toBe(join(root, 'order'));
  });
});

describe('manual checklist', () => {
  const result = scanResult();
  const md = manualChecklistMarkdown(result.manualChecks, result);

  it('is a tickable checklist, not prose', () => {
    expect(md).toMatch(/- \[ \] Pass/);
    expect(md).toMatch(/- \[ \] Fail/);
  });

  it('states plainly that nothing has been performed', () => {
    expect(md).toMatch(/None of them has been performed/);
    expect(md).toMatch(/Do not\ntick one you did not perform/);
  });

  it('marks the areas the automated pass flagged', () => {
    // The cart button finding should flag the keyboard and cart areas.
    expect(md).toMatch(/— flagged/);
  });

  it('carries every check from the generated script', () => {
    for (const check of result.manualChecks) {
      expect(md).toContain(check.area);
    }
  });
});
