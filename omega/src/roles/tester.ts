import { runControlled } from '../core/exec.ts';
import type { Mission, TestSummary } from '../core/types.ts';
import { getRole } from './registry.ts';
import { treeDigest } from './files.ts';

/**
 * Independent verification: runs the project's tests with Node's own test runner
 * (TAP output), in a scrubbed environment, and derives per-acceptance-criterion
 * coverage from test names. The coder never reports its own test results.
 */
export interface TapParse {
  tests: number;
  pass: number;
  fail: number;
  durationMs: number;
  results: { name: string; ok: boolean }[];
}

export function parseTap(tap: string): TapParse {
  const num = (key: string) => {
    const m = tap.match(new RegExp(`^# ${key} (\\d+(?:\\.\\d+)?)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  const results: { name: string; ok: boolean }[] = [];
  for (const line of tap.split('\n')) {
    const m = line.match(/^\s*(ok|not ok) \d+ - (.+?)(?:\s+#\s.*)?$/);
    if (m) results.push({ ok: m[1] === 'ok', name: m[2].trim() });
  }
  return { tests: num('tests'), pass: num('pass'), fail: num('fail'), durationMs: num('duration_ms'), results };
}

export function coverageFor(mission: Mission, results: { name: string; ok: boolean }[]): TestSummary['coverage'] {
  return (mission.spec?.acceptanceCriteria ?? []).map((ac) => {
    const re = new RegExp(`\\b${ac.id}\\b`, 'i');
    const hits = results.filter((r) => re.test(r.name));
    return { id: ac.id, covered: hits.length > 0, passing: hits.length > 0 && hits.every((h) => h.ok), tests: hits.map((h) => h.name) };
  });
}

export interface TestRun {
  summary: Omit<TestSummary, 'logEvidence' | 'runId'>;
  log: string;
  integrity: { expected?: string; actual: string; ok: boolean };
}

export async function runAcceptanceTests(mission: Mission): Promise<TestRun> {
  const actual = treeDigest(mission.projectDir, 'test').digest;
  const integrity = { expected: mission.testDigest, actual, ok: !mission.testDigest || mission.testDigest === actual };
  const res = await runControlled({
    policy: getRole('tester').policy,
    cwd: mission.projectDir,
    cmd: 'node',
    args: ['--test', '--test-reporter=tap', '--test-timeout=20000', 'test/**/*.test.js'],
    timeoutMs: 180_000,
  });
  const log = `$ node ${res.args.join(' ')}\n# exit=${res.code} signal=${res.signal} timedOut=${res.timedOut} wall_ms=${res.durationMs}\n${res.stdout}${res.stderr ? '\n# stderr\n' + res.stderr : ''}`;
  const tap = parseTap(res.stdout);
  const coverage = coverageFor(mission, tap.results);
  const failures = tap.results.filter((r) => !r.ok).map((r) => r.name);
  if (!integrity.ok) failures.unshift('INTEGRITY: acceptance tests changed after the test-author stage');
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.id);
  if (uncovered.length) failures.push(`UNCOVERED: ${uncovered.join(', ')}`);
  const ok = integrity.ok && res.code === 0 && !res.timedOut && tap.tests > 0 && tap.fail === 0 && coverage.every((c) => c.passing);
  return {
    summary: { ok, tests: tap.tests, pass: tap.pass, fail: tap.fail, durationMs: tap.durationMs, failures, coverage, exitCode: res.code },
    log,
    integrity,
  };
}
