import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  BwrapSandbox,
  createWorkspace,
  disposeWorkspace,
  DockerSandbox,
  NoSandbox,
  resetSandboxCache,
  resolveSandbox,
  SandboxUnavailableError,
  type Sandbox,
  type SandboxLimits,
} from '../src/sandbox/sandbox.ts';
import { runAcceptanceTests } from '../src/roles/tester.ts';
import type { Mission } from '../src/core/types.ts';
import { tempHome } from './helpers.ts';

/*
 * Adversarial tests: "generated code" (probe.js) actively tries to escape. They run
 * against every sandbox driver that is really available on this machine. Set
 * OMEGA_REQUIRE_SANDBOX=bwrap,docker (CI does) to turn a missing driver into a FAILURE
 * instead of a skip, so a green run can never mean "nothing was tested".
 */
const IMAGE = process.env.OMEGA_SANDBOX_IMAGE ?? 'node:22-alpine';
const required = (process.env.OMEGA_REQUIRE_SANDBOX ?? '').split(',').filter(Boolean);

function available(): { name: string; make: () => Sandbox; reason?: string }[] {
  const out: { name: string; make: () => Sandbox; reason?: string }[] = [];
  for (const [name, mode] of [['bwrap', 'bwrap'], ['docker', 'docker']] as const) {
    resetSandboxCache();
    try {
      const sb = resolveSandbox({ mode, allowUnsandboxed: false, dockerImage: IMAGE });
      out.push({ name, make: () => sb });
    } catch (err) {
      out.push({ name, make: () => { throw err; }, reason: (err as Error).message });
    }
  }
  resetSandboxCache();
  return out;
}

const DRIVERS = available();

test('required sandbox drivers are present (OMEGA_REQUIRE_SANDBOX)', () => {
  for (const name of required) {
    const d = DRIVERS.find((x) => x.name === name);
    assert.ok(d && !d.reason, `${name} required but unavailable: ${d?.reason}`);
  }
});

interface ProbeRun {
  out: Record<string, string>;
  res: Awaited<ReturnType<Sandbox['run']>>;
  ws: ReturnType<typeof createWorkspace>;
}

/** Put probe.js (and optional extra files/links) in a project, run it in the sandbox. */
async function probe(sb: Sandbox, code: string, opts: { limits?: Partial<SandboxLimits>; setup?: (dir: string) => void; signal?: AbortSignal; keep?: boolean } = {}): Promise<ProbeRun> {
  const home = tempHome('omega-sbx-home-');
  const project = path.join(home, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(
    path.join(project, 'probe.js'),
    `const fs = require('fs'); const out = {};\nconst t = (k, f) => { try { out[k] = 'OK:' + String(f()).slice(0, 80); } catch (e) { out[k] = 'BLOCKED:' + (e.code || e.message); } };\n${code}\nprocess.on('exit', () => console.log('PROBE ' + JSON.stringify(out)));\n`,
  );
  opts.setup?.(project);
  const runId = `t${Math.random().toString(16).slice(2, 10)}`;
  const ws = createWorkspace(home, runId, project);
  // The project dir is a CommonJS context for probe.js.
  fs.writeFileSync(path.join(ws.dir, 'package.json'), '{"type":"commonjs"}');
  if (process.getuid?.() === 0) fs.chmodSync(ws.dir, 0o777); // writable for uid 65534 under bwrap as root
  try {
    const res = await sb.run({ runId, workspace: ws.dir, args: ['probe.js'], limits: { wallMs: 30_000, ...opts.limits }, signal: opts.signal });
    const line = res.stdout.split('\n').find((l) => l.startsWith('PROBE '));
    return { out: line ? JSON.parse(line.slice(6)) : {}, res, ws };
  } finally {
    if (!opts.keep) disposeWorkspace(home, ws);
  }
}

for (const d of DRIVERS) {
  const skip = d.reason ? `${d.name} unavailable: ${d.reason}` : false;

  test(`[${d.name}] filesystem: host secrets, OMEGA home and traversal are unreachable; only /work is writable`, { skip }, async () => {
    const secretDir = tempHome('omega-host-secret-');
    const secret = path.join(secretDir, 'id_rsa');
    fs.writeFileSync(secret, 'HOST-PRIVATE-KEY');
    const home = os.homedir();
    const { out, res } = await probe(d.make(), `
      t('abs', () => fs.readFileSync(${JSON.stringify(secret)}, 'utf8'));
      t('traversal', () => fs.readFileSync('/work/../../..' + ${JSON.stringify(secret)}, 'utf8'));
      t('homedir', () => fs.readdirSync(${JSON.stringify(home)}).join(','));
      t('omegaRepo', () => fs.readdirSync(${JSON.stringify(path.resolve('.'))}).join(','));
      t('writeUsr', () => fs.writeFileSync('/usr/pwned', 'x'));
      t('writeRoot', () => fs.writeFileSync('/pwned', 'x'));
      t('writeWork', () => { fs.writeFileSync('/work/ok.txt', 'x'); return 'written'; });
    `);
    assert.equal(res.code, 0, res.stderr);
    for (const k of ['abs', 'traversal', 'homedir', 'omegaRepo', 'writeUsr', 'writeRoot']) assert.match(out[k], /^BLOCKED/, `${k}: ${out[k]}`);
    assert.equal(out.writeWork, 'OK:written');
    assert.equal(fs.existsSync('/usr/pwned') || fs.existsSync('/pwned'), false);
  });

  test(`[${d.name}] symlinks: links to host files are not copied in, and new links cannot reach the host`, { skip }, async () => {
    const secretDir = tempHome('omega-host-secret-');
    const secret = path.join(secretDir, 'token.txt');
    fs.writeFileSync(secret, 'HOST-TOKEN');
    let skipped: string[] = [];
    const { out } = await probe(
      d.make(),
      `
      t('copiedLink', () => fs.readFileSync('/work/leak.txt', 'utf8'));
      t('dirLink', () => fs.readdirSync('/work/hostdir').join(','));
      t('newLink', () => { fs.symlinkSync(${JSON.stringify(secret)}, '/work/new-link'); return fs.readFileSync('/work/new-link', 'utf8'); });
    `,
      {
        setup: (dir) => {
          fs.symlinkSync(secret, path.join(dir, 'leak.txt'));
          fs.symlinkSync(secretDir, path.join(dir, 'hostdir'), 'dir');
        },
      },
    ).then((r) => {
      skipped = r.ws.skippedSymlinks;
      return r;
    });
    assert.deepEqual(skipped.sort(), ['hostdir', 'leak.txt']);
    assert.match(out.copiedLink, /^BLOCKED/);
    assert.match(out.dirLink, /^BLOCKED/);
    assert.match(out.newLink, /^BLOCKED/, 'a link created inside resolves inside the sandbox, where the host path does not exist');
  });

  test(`[${d.name}] network: no outbound traffic and no access to services on the host's loopback`, { skip }, async () => {
    const server = net.createServer((s) => s.end('HOST-SERVICE')).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as net.AddressInfo).port;
    try {
      const { out } = await probe(d.make(), `
        const net = require('net');
        const tryConnect = (k, host, port) => new Promise((resolve) => {
          const s = net.connect({ host, port, timeout: 3000 });
          s.on('data', (b) => { out[k] = 'OK:' + b; s.destroy(); resolve(); });
          s.on('connect', () => { out[k] = 'OK:connected'; });
          s.on('error', (e) => { out[k] = 'BLOCKED:' + e.code; resolve(); });
          s.on('timeout', () => { out[k] = 'BLOCKED:timeout'; s.destroy(); resolve(); });
        });
        (async () => { await tryConnect('internet', '1.1.1.1', 80); await tryConnect('hostLoopback', '127.0.0.1', ${port}); })();
      `);
      assert.match(out.internet, /^BLOCKED/, out.internet);
      assert.match(out.hostLoopback, /^BLOCKED/, out.hostLoopback);
    } finally {
      server.close();
    }
  });

  test(`[${d.name}] environment: host credentials never reach generated code`, { skip }, async () => {
    process.env.GH_TOKEN = 'ghp_should_not_leak';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-leak';
    process.env.OMEGA_TOKEN = 'omega-should-not-leak';
    try {
      const { out } = await probe(d.make(), `t('env', () => JSON.stringify(process.env));`);
      assert.ok(!/should-not-leak|ghp_|sk-ant/.test(out.env), out.env);
    } finally {
      delete process.env.GH_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OMEGA_TOKEN;
    }
  });

  test(`[${d.name}] CPU-time limit kills a busy loop`, { skip }, async () => {
    const { res } = await probe(d.make(), `while (true) {}`, { limits: { cpuSeconds: 2, wallMs: 30_000 } });
    assert.notEqual(res.code, 0);
    assert.equal(res.timedOut, false, 'killed by the CPU limit, not the wall clock');
    assert.ok(res.durationMs < 15_000, `took ${res.durationMs}ms`);
  });

  test(`[${d.name}] memory limit stops an allocation bomb`, { skip }, async () => {
    const { out, res } = await probe(d.make(), `t('alloc', () => { const b = Buffer.alloc(1800 * 1024 * 1024, 1); return b.length; });`, { limits: { memoryMb: 256 } });
    assert.notEqual(out.alloc?.startsWith('OK'), true, `allocation succeeded: ${JSON.stringify(out)} (memory: ${res.enforcement.memory})`);
  });

  test(`[${d.name}] process limit stops a fork bomb (or the record says it is not enforced)`, { skip }, async (t) => {
    const { out, res } = await probe(d.make(), `
      const cp = require('child_process'); let ok = 0, failed = 0;
      for (let i = 0; i < 60; i++) { try { const c = cp.spawn(process.execPath, ['-e', 'setTimeout(()=>{},2000)']); c.on('error', () => failed++); ok++; } catch { failed++; } }
      setTimeout(() => { out.spawn = 'tried:' + ok + ' failed:' + failed; process.exit(0); }, 1200);
    `, { limits: { pids: 16 } });
    if (res.enforcement.pids.startsWith('NOT ENFORCED')) {
      assert.ok(!process.env.OMEGA_REQUIRE_CGROUP, `OMEGA_REQUIRE_CGROUP is set but: ${res.enforcement.pids}`);
      t.diagnostic(`pids not enforced on this host: ${res.enforcement.pids}`);
      return;
    }
    const failed = Number(/failed:(\d+)/.exec(out.spawn ?? '')?.[1] ?? 0);
    assert.ok(failed > 0, `no spawn failed: ${out.spawn} (${res.enforcement.pids})`);
  });

  test(`[${d.name}] file-size limit stops disk filling`, { skip }, async () => {
    const { out } = await probe(d.make(), `t('big', () => fs.writeFileSync('/work/big.bin', Buffer.alloc(8 * 1024 * 1024)));`, { limits: { fileSizeMb: 1 } });
    assert.match(out.big ?? 'BLOCKED:killed', /^BLOCKED/);
  });

  test(`[${d.name}] wall-clock timeout and abort kill the whole tree; nothing is left running`, { skip }, async () => {
    const marker = `omega-marker-${Math.random().toString(16).slice(2)}`;
    const code = `require('child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', '${marker}'], { stdio: 'ignore' }); setInterval(() => {}, 1000);`;
    const timed = await probe(d.make(), code, { limits: { wallMs: 1500 } });
    assert.equal(timed.res.timedOut, true);
    assert.equal(timed.res.killedBy, 'wall');
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 1000);
    const aborted = await probe(d.make(), code, { signal: ctl.signal });
    assert.equal(aborted.res.aborted, true);
    assert.equal(aborted.res.killedBy, 'abort');
    assert.ok(aborted.res.durationMs < 10_000);
    await new Promise((r) => setTimeout(r, 1500));
    if (process.platform === 'linux') {
      const ps = spawnSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).stdout;
      assert.ok(!ps.includes(marker), 'a sandboxed child process survived the kill');
    }
    if (d.name === 'docker') {
      const names = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout;
      assert.ok(!/omega-run-/.test(names), `containers left behind: ${names}`);
    }
  });

  test(`[${d.name}] separate run workspaces cannot see each other`, { skip }, async () => {
    const home = tempHome('omega-sbx-home-');
    const other = path.join(home, 'other-project');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'secret.txt'), 'OTHER-MISSION');
    const otherWs = createWorkspace(home, 'otherrun', other);
    try {
      const { out } = await probe(d.make(), `t('other', () => fs.readFileSync(${JSON.stringify(path.join(otherWs.dir, 'secret.txt'))}, 'utf8'));`);
      assert.match(out.other, /^BLOCKED/);
    } finally {
      disposeWorkspace(home, otherWs);
    }
  });

  test(`[${d.name}] tester: hostile tests cannot modify the mission repo; run workspace is removed`, { skip }, async () => {
    const home = tempHome('omega-sbx-home-');
    const projectDir = path.join(home, 'projects', 'p');
    fs.mkdirSync(path.join(projectDir, 'test'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'));
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(projectDir, 'src', 'index.js'), 'export const x = 1;\n');
    fs.writeFileSync(
      path.join(projectDir, 'test', 'evil.test.js'),
      "import { test } from 'node:test';\nimport fs from 'node:fs';\ntest('AC1: vandal', () => { fs.writeFileSync('src/index.js', 'pwned'); fs.rmSync('package.json'); });\n",
    );
    const before = fs.readFileSync(path.join(projectDir, 'src', 'index.js'), 'utf8');
    if (process.getuid?.() === 0) fs.chmodSync(home, 0o755);
    const mission = { projectDir, spec: { acceptanceCriteria: [{ id: 'AC1', text: 'x' }] } } as unknown as Mission;
    const run = await runAcceptanceTests(mission, { sandbox: d.make(), home, runId: 'vandal' });
    assert.equal(fs.readFileSync(path.join(projectDir, 'src', 'index.js'), 'utf8'), before);
    assert.ok(fs.existsSync(path.join(projectDir, 'package.json')));
    assert.equal(run.summary.isolation?.workspaceRemoved, true);
    assert.equal(fs.existsSync(path.join(home, 'runs', 'vandal')), false);
    assert.equal(run.summary.isolation?.driver, d.name);
  });
}

test('none: refuses to run unisolated unless explicitly allowed, and says so when it does', async () => {
  resetSandboxCache();
  assert.throws(() => resolveSandbox({ mode: 'none', allowUnsandboxed: false, dockerImage: IMAGE }), SandboxUnavailableError);
  resetSandboxCache();
  const sb = resolveSandbox({ mode: 'none', allowUnsandboxed: true, dockerImage: IMAGE });
  assert.ok(sb instanceof NoSandbox);
  const { res } = await probe(sb, `t('x', () => 1);`);
  assert.match(res.enforcement.network, /NOT ENFORCED/);
  assert.match(res.enforcement.filesystem, /NOT ENFORCED/);
  resetSandboxCache();
});

test('drivers build the documented isolation flags', () => {
  assert.ok(new BwrapSandbox().describe().includes('no network'));
  assert.ok(new DockerSandbox({ image: IMAGE }).describe().includes('--network none'));
});
