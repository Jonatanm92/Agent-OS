#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, type OmegaConfig } from './config.ts';
import type { EngineId, Mission } from './core/types.ts';
import { Omega } from './engine/orchestrator.ts';
import { collectInventory } from './inventory/inventory.ts';
import { loadOrCreateToken, startServer } from './server/http.ts';

/**
 * OMEGA command line. Mutating commands take a process lock on OMEGA_HOME so the CLI
 * and a running server never write the state file concurrently.
 */
const HELP = `OMEGA — governed multi-agent missions

usage: node src/cli.ts <command> [options]

  serve                         start dashboard + API + worker (127.0.0.1:7420)
  demo [--engine E] [--idea T]  run one mission end to end and print the evidence
       [--approve-spend]        (claude-code engine: you approve the spend gate here)
  mission new "<idea>"          queue a mission  [--engine template|claude-code] [--budget USD] [--model ID]
  run                           work the queue until idle (no server)
  status [missionId]            list missions or show one
  approvals                     list pending approvals
  approve <approvalId>          [--note TEXT] [--ack-risks]
  reject <approvalId> --note T
  verify <missionId>            recompute evidence hashes, commits and audit chain
  audit                         verify the audit log hash chain
  inventory [--json]            read-only scan of tools, disks and repos (OMEGA_PROJECT_ROOTS)
  token                         show where the API token is stored

common: --home DIR (default: $OMEGA_HOME, F:\\OMEGA on Windows when F: exists, else ~/.omega)`;

function lockFile(cfg: OmegaConfig): string {
  return path.join(cfg.home, 'omega.lock');
}

function acquireLock(cfg: OmegaConfig, label: string): () => void {
  fs.mkdirSync(cfg.home, { recursive: true });
  const file = lockFile(cfg);
  if (fs.existsSync(file)) {
    const { pid, label: held } = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid: number; label: string };
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = pid !== process.pid;
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`OMEGA is already running "${held}" (pid ${pid}) on ${cfg.home}. Use the dashboard, or stop it first.`);
  }
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, label, at: new Date().toISOString() }));
  const release = () => {
    try {
      const cur = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid: number };
      if (cur.pid === process.pid) fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  };
  process.once('exit', release);
  return release;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function printMission(m: Mission): void {
  console.log(`\n${m.title}  [${m.state}]  ${m.id}`);
  console.log(`  engine: ${m.engine}${m.engine === 'claude-code' ? ` (${m.model})` : ''}   spent: ${fmtUsd(m.spentUsd)} of $${m.budgetUsd.toFixed(2)}`);
  console.log(`  project: ${m.projectDir}`);
  for (const s of m.stages) {
    const commit = s.commit ? ` commit ${s.commit.slice(0, 10)}` : '';
    const cost = s.costUsd ? ` ${fmtUsd(s.costUsd)}` : '';
    console.log(`  - ${s.role.padEnd(12)} #${s.iteration} ${s.state.padEnd(9)}${cost}${commit}  ${s.summary ?? ''}`);
    if (s.error) console.log(`      error: ${s.error}`);
    for (const e of s.evidence) console.log(`      evidence ${e.name}  sha256:${e.sha256.slice(0, 16)}…  ${e.summary}`);
  }
  if (m.tests) {
    console.log(`  tests (run ${m.tests.runId}): ${m.tests.pass}/${m.tests.tests} passed, exit ${m.tests.exitCode}`);
    for (const c of m.tests.coverage) console.log(`    ${c.passing ? '✔' : '✘'} ${c.id}  ${c.tests.join(' | ')}`);
  }
  if (m.security) console.log(`  security: ${m.security.high} high, ${m.security.medium} medium, ${m.security.findings.length} findings`);
  if (m.error) console.log(`  error: ${m.error}`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      home: { type: 'string' },
      engine: { type: 'string' },
      idea: { type: 'string' },
      budget: { type: 'string' },
      model: { type: 'string' },
      note: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      json: { type: 'boolean' },
      'approve-spend': { type: 'boolean' },
      'ack-risks': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...rest] = positionals;
  if (!cmd || values.help) {
    console.log(HELP);
    return;
  }
  const cfg = loadConfig({
    ...(values.home ? { home: path.resolve(values.home) } : {}),
    ...(values.port ? { port: Number(values.port) } : {}),
    ...(values.host ? { host: values.host } : {}),
  });

  switch (cmd) {
    case 'serve': {
      acquireLock(cfg, 'serve');
      const omega = new Omega(cfg);
      const srv = await startServer(cfg, omega);
      const tok = loadOrCreateToken(cfg.home);
      console.log(`OMEGA dashboard: ${srv.url}/#token=${srv.token}`);
      console.log(`(token stored in ${tok.file}; the #fragment is never sent to the server)`);
      console.log(`home: ${cfg.home}\nworkspace: ${cfg.workspaceRoot}\nworker: running in this process only while it is open — no background service is installed.`);
      const shutdown = async () => {
        await srv.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      return;
    }
    case 'demo': {
      acquireLock(cfg, 'demo');
      const engine = (values.engine ?? 'template') as EngineId;
      const idea = values.idea ?? (engine === 'template'
        ? 'Jag vill ha en liten app som omvandlar temperaturer mellan Celsius, Fahrenheit och Kelvin, både som bibliotek och kommandorad.'
        : 'Bygg en liten app som räknar ut dricks och delar notan mellan flera personer, med avrundning till hela kronor och ett kommandoradsverktyg.');
      const omega = new Omega(cfg);
      console.log(`OMEGA demo — engine: ${engine}\nidea: ${idea}`);
      let m = await omega.createMission({ idea, engine, budgetUsd: values.budget ? Number(values.budget) : undefined, model: values.model, actor: 'cli' });
      if (m.state === 'blocked') {
        const gate = omega.listApprovals('pending').find((a) => a.missionId === m.id)!;
        console.log(`\nSpend gate pending: ${gate.title} (${gate.id})`);
        if (!values['approve-spend']) {
          console.log('Not approved. Re-run with --approve-spend, or approve it in the dashboard / with `approve <id>`.');
          return;
        }
        await omega.decideApproval(gate.id, 'approve', 'cli-operator', 'approved via omega demo --approve-spend');
        console.log('Spend approved by the operator (--approve-spend).');
      }
      const started = Date.now();
      await omega.runUntilIdle();
      m = omega.getMission(m.id);
      printMission(m);
      const ev = await omega.verifyEvidence(m.id);
      console.log(`\nevidence check: ${ev.ok ? 'OK' : 'FAILED'}`);
      for (const c of ev.checks) console.log(`  ${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`);
      const review = omega.listApprovals('pending').find((a) => a.missionId === m.id && a.kind === 'final_review');
      console.log(`\nwall time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (review) console.log(`Final review waiting for you: ${review.id}\n  approve: node src/cli.ts approve ${review.id} --note "..."  (or use the dashboard)`);
      return;
    }
    case 'mission': {
      if (rest[0] !== 'new') throw new Error('usage: mission new "<idea>"');
      acquireLock(cfg, 'mission new');
      const omega = new Omega(cfg);
      const m = await omega.createMission({ idea: rest.slice(1).join(' ') || values.idea || '', engine: values.engine as EngineId | undefined, budgetUsd: values.budget ? Number(values.budget) : undefined, model: values.model, actor: 'cli' });
      console.log(`created ${m.id} [${m.state}]`);
      return;
    }
    case 'run': {
      acquireLock(cfg, 'run');
      const n = await new Omega(cfg).runUntilIdle();
      console.log(`ran ${n} task(s)`);
      return;
    }
    case 'status': {
      const omega = new Omega(cfg);
      if (rest[0]) printMission(omega.getMission(rest[0]));
      else for (const m of omega.listMissions()) console.log(`${m.id}  ${m.state.padEnd(15)} ${fmtUsd(m.spentUsd).padStart(9)}  ${m.title}`);
      return;
    }
    case 'approvals': {
      for (const a of new Omega(cfg).listApprovals('pending')) console.log(`${a.id}  ${a.kind.padEnd(12)} ${a.missionId}  ${a.title}`);
      return;
    }
    case 'approve':
    case 'reject': {
      acquireLock(cfg, cmd);
      const a = await new Omega(cfg).decideApproval(rest[0], cmd === 'approve' ? 'approve' : 'reject', 'cli-operator', values.note ?? '', Boolean(values['ack-risks']));
      console.log(`${a.id} → ${a.state}`);
      return;
    }
    case 'verify': {
      const res = await new Omega(cfg).verifyEvidence(rest[0]);
      for (const c of res.checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`);
      console.log(res.ok ? 'OK' : 'FAILED');
      process.exitCode = res.ok ? 0 : 1;
      return;
    }
    case 'audit': {
      const res = new Omega(cfg).audit.verify();
      console.log(JSON.stringify(res, null, 2));
      process.exitCode = res.ok ? 0 : 1;
      return;
    }
    case 'inventory': {
      const inv = await collectInventory(cfg);
      if (values.json) {
        console.log(JSON.stringify(inv, null, 2));
        return;
      }
      console.log(`system: ${inv.system.platform} ${inv.system.release} ${inv.system.arch}, ${inv.system.cpus} CPU, ${inv.system.memoryGb} GB RAM, node ${inv.system.node}`);
      console.log(`omega home: ${inv.omega.home}`);
      for (const d of inv.disks) console.log(`disk ${d.path}: ${d.freeGb} GB free of ${d.totalGb} GB`);
      for (const t of inv.tools) console.log(`${t.found ? '✔' : '·'} ${t.label.padEnd(18)} ${(t.version ?? 'not found').padEnd(40)} [${t.omegaStatus}]`);
      for (const r of inv.repos) console.log(`repo ${r.name} (${r.branch ?? '?'}) ${r.remote ?? 'no remote'} dirty=${r.dirtyFiles ?? '?'} last=${r.lastCommit ?? '?'}`);
      for (const r of inv.risks) console.log(`risk: ${r}`);
      for (const n of inv.notes) console.log(`note: ${n}`);
      return;
    }
    case 'token': {
      const t = loadOrCreateToken(cfg.home);
      console.log(`token file: ${t.file}${t.created ? ' (just created)' : ''}`);
      return;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`omega: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
