#!/usr/bin/env node
/**
 * agentos — one launcher for every agent's real CLI.
 *
 *   agentos claude     ->  fcc-claude   (Claude Code CLI through FCC)
 *   agentos codex      ->  fcc-codex    (Codex CLI through FCC)
 *   agentos hermes     ->  hermes       (Nous Research Hermes Agent)
 *   agentos            ->  interactive menu
 *   agentos --list     ->  list agents and their commands
 *   agentos <a> --dry  ->  print the command instead of running it
 *
 * Extra args after the agent name are passed through, e.g.
 *   agentos codex exec "hello"
 */
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const AGENTS = [
  { key: 'claude', aliases: ['fcc', 'free-claude-code', 'cc'], cmd: 'fcc-claude', label: 'Free Claude Code (Claude Code CLI via FCC)' },
  { key: 'codex', aliases: [], cmd: 'fcc-codex', label: 'Codex (Codex CLI via FCC)' },
  { key: 'hermes', aliases: ['herm'], cmd: 'hermes', label: 'Hermes (Nous Research Hermes Agent)' },
];

const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function resolve(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  return AGENTS.find((a) => a.key === n || a.aliases.includes(n)) ?? null;
}

function printList() {
  console.log(`\n${C.bold('Agent OS — agents')}\n`);
  for (const a of AGENTS) {
    console.log(`  ${C.cyan(a.key.padEnd(8))} ${C.dim('→ ' + a.cmd.padEnd(11))} ${a.label}`);
  }
  console.log(`\n${C.dim('Usage: agentos <agent> [args]   |   agentos   (menu)')}\n`);
}

function launch(agent, passthrough, dry) {
  const cmdline = [agent.cmd, ...passthrough].join(' ');
  if (dry) {
    console.log(cmdline);
    return;
  }
  console.log(`\n${C.green('▸ launching')} ${C.bold(agent.label)}  ${C.dim('(' + cmdline + ')')}\n`);
  // shell:true so Windows resolves the .cmd/.exe shims on PATH.
  const child = spawn(agent.cmd, passthrough, { stdio: 'inherit', shell: true });
  child.on('error', (err) => {
    console.error(`\n${C.yellow('!')} Could not start "${agent.cmd}": ${err.message}`);
    if (agent.cmd.startsWith('fcc')) {
      console.error(C.dim('  Install/upgrade Free Claude Code, then reopen your terminal:'));
      console.error(C.dim('    macOS/Linux: curl -fsSL "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1" | sh'));
      console.error(C.dim('    Windows:     irm "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.ps1?raw=1" | iex'));
      console.error(C.dim('  Also make sure the proxy is running in another window:  fcc-server'));
    } else if (agent.cmd === 'hermes') {
      console.error(C.dim('  Install Hermes Agent: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash  (then: hermes setup --portal)'));
    }
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function menu() {
  printList();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) =>
    rl.question(C.cyan('Pick an agent: '), (a) => {
      rl.close();
      res(a.trim());
    })
  );
  const agent = resolve(answer);
  if (!agent) {
    console.error(`${C.yellow('!')} Unknown agent "${answer}". Run "agentos --list".`);
    process.exit(1);
  }
  launch(agent, [], false);
}

const argv = process.argv.slice(2);
if (argv[0] === '--list' || argv[0] === '-l') {
  printList();
} else if (!argv[0]) {
  menu();
} else {
  const agent = resolve(argv[0]);
  if (!agent) {
    console.error(`${C.yellow('!')} Unknown agent "${argv[0]}".`);
    printList();
    process.exit(1);
  }
  const rest = argv.slice(1);
  const dry = rest.includes('--dry');
  launch(agent, rest.filter((a) => a !== '--dry'), dry);
}
