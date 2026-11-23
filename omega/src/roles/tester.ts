import { createWorkspace, disposeWorkspace, type Sandbox } from '../sandbox/sandbox.ts';
import type { Mission, TestSummary } from '../core/types.ts';
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

export interface TestRunOptions {
  sandbox: Sandbox;
  home: string;
  runId: string;
  signal?: AbortSignal;
  limits?: Parameters<Sandbox['run']>[0]['limits'];
}

export const TEST_ARGS = ['--test', '--test-reporter=tap', '--test-timeout=20000', 'test/**/*.test.js'];

/**
 * Run the acceptance tests in a disposable copy of the project, inside the sandbox.
 * The mission repo is never touched by generated code; the copy is always removed.
 */
export async function runAcceptanceTests(mission: Mission, opts: TestRunOptions): Promise<TestRun> {
  const actual = treeDigest(mission.projectDir, 'test').digest;
  const integrity = { expected: mission.testDigest, actual, ok: !mission.testDigest || mission.testDigest === actual };
  const ws = createWorkspace(opts.home, opts.runId, mission.projectDir);
  let res;
  let workspaceRemoved = false;
  try {
    res = await opts.sandbox.run({ runId: opts.runId, workspace: ws.dir, args: TEST_ARGS, signal: opts.signal, limits: opts.limits });
  } finally {
    disposeWorkspace(opts.home, ws);
    workspaceRemoved = true;
  }
  const e = res.enforcement;
  const log = [
    `$ node ${TEST_ARGS.join(' ')}`,
    `# sandbox=${e.driver} exit=${res.code} signal=${res.signal} timedOut=${res.timedOut} aborted=${res.aborted} killedBy=${res.killedBy} wall_ms=${res.durationMs}`,
    ...Object.entries(e).filter(([k]) => k !== 'driver').map(([k, v]) => `# isolation.${k}: ${v}`),
    ws.skippedSymlinks.length ? `# symlinks NOT copied into the sandbox: ${ws.skippedSymlinks.join(', ')}` : '# symlinks: none',
    res.stdout + (res.stderr ? '\n# stderr\n' + res.stderr : ''),
  ].join('\n');
  const tap = parseTap(res.stdout);
  const coverage = coverageFor(mission, tap.results);
  const failures = tap.results.filter((r) => !r.ok).map((r) => r.name);
  if (!integrity.ok) failures.unshift('INTEGRITY: acceptance tests changed after the test-author stage');
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.id);
  if (uncovered.length) failures.push(`UNCOVERED: ${uncovered.join(', ')}`);
  const ok = integrity.ok && res.code === 0 && !res.timedOut && tap.tests > 0 && tap.fail === 0 && coverage.every((c) => c.passing);
  if (res.killedBy) failures.push(`KILLED: ${res.killedBy}`);
  return {
    summary: {
      ok: ok && !res.killedBy,
      tests: tap.tests,
      pass: tap.pass,
      fail: tap.fail,
      durationMs: tap.durationMs,
      failures,
      coverage,
      exitCode: res.code,
      isolation: { driver: e.driver, enforcement: { ...e }, skippedSymlinks: ws.skippedSymlinks, killedBy: res.killedBy, workspaceRemoved },
    },
    log,
    integrity,
  };
}
