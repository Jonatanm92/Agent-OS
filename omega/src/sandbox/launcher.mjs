// OMEGA cgroup launcher (plain JS, no dependencies).
//
// usage: node launcher.mjs <cgroup.procs file>[,<file>...] -- <command> [args...]
//
// Moves ITSELF into the given cgroups first and only then starts the command, so the
// sandboxed process tree is inside the limits from its very first instruction (no race
// between spawn and joining the cgroup). Exits with the command's exit code; a signal
// death is reported as 128 + signal number, like a shell would.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const sep = process.argv.indexOf('--');
if (sep < 3 || sep === process.argv.length - 1) {
  console.error('launcher: usage: launcher.mjs <procs,...> -- <cmd> [args]');
  process.exit(125);
}
for (const file of process.argv[2].split(',').filter(Boolean)) {
  fs.writeFileSync(file, String(process.pid));
}
const [cmd, ...args] = process.argv.slice(sep + 1);
const child = spawn(cmd, args, { stdio: 'inherit' });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => child.kill(sig));
child.on('error', (err) => {
  console.error(`launcher: ${err.message}`);
  process.exit(126);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? 128 + (os.constants.signals[signal] ?? 0));
});
