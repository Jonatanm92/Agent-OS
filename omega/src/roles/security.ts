import fs from 'node:fs';
import path from 'node:path';
import { isSecretPath } from '../core/policy.ts';
import type { SecurityFinding } from '../core/types.ts';
import { listFiles } from './files.ts';

/**
 * Deterministic security review of a generated project. It is a static pattern
 * scan — useful as a gate, not a substitute for a human or a full SAST tool.
 */
interface Rule {
  id: string;
  severity: SecurityFinding['severity'];
  re: RegExp;
  message: string;
  /** Only apply to paths starting with this prefix. */
  scope?: string;
}

const SECRET_RULES: Rule[] = [
  { id: 'secret.private-key', severity: 'high', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: 'Private key material' },
  { id: 'secret.aws-key', severity: 'high', re: /\bAKIA[0-9A-Z]{16}\b/, message: 'AWS access key id' },
  { id: 'secret.github-token', severity: 'high', re: /\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/, message: 'GitHub token' },
  { id: 'secret.anthropic-key', severity: 'high', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, message: 'Anthropic API key' },
  { id: 'secret.openai-key', severity: 'high', re: /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/, message: 'OpenAI-style API key' },
  { id: 'secret.assignment', severity: 'medium', re: /\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i, message: 'Hard-coded credential-like assignment' },
];

const CODE_RULES: Rule[] = [
  { id: 'code.eval', severity: 'high', re: /\beval\s*\(|new\s+Function\s*\(/, message: 'Dynamic code evaluation', scope: 'src/' },
  { id: 'code.child-process', severity: 'high', re: /['"](node:)?child_process['"]/, message: 'Spawns processes from application code', scope: 'src/' },
  { id: 'code.network', severity: 'medium', re: /\bfetch\s*\(|['"](node:)?(http|https|net|dgram|tls)['"]|WebSocket\s*\(/, message: 'Network access (spec says offline)', scope: 'src/' },
  { id: 'code.fs-destructive', severity: 'medium', re: /\b(rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink)\s*\(/, message: 'Deletes files', scope: 'src/' },
  { id: 'code.env', severity: 'low', re: /process\.env\b/, message: 'Reads environment variables', scope: 'src/' },
];

const MAX_BYTES = 1024 * 1024;

export function scanProject(root: string): { findings: SecurityFinding[]; filesScanned: number } {
  const findings: SecurityFinding[] = [];
  const files = listFiles(root);
  let scanned = 0;
  for (const rel of files) {
    if (isSecretPath(rel)) {
      findings.push({ severity: 'high', rule: 'file.secret-name', file: rel, message: 'Secret-like file present in project' });
      continue;
    }
    const abs = path.join(root, rel);
    const size = fs.statSync(abs).size;
    if (size > MAX_BYTES) {
      findings.push({ severity: 'info', rule: 'file.large', file: rel, message: `Skipped large file (${size} bytes)` });
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    scanned++;
    const lines = text.split('\n');
    for (const rule of [...SECRET_RULES, ...CODE_RULES]) {
      if (rule.scope && !rel.startsWith(rule.scope)) continue;
      lines.forEach((line, i) => {
        if (rule.re.test(line)) findings.push({ severity: rule.severity, rule: rule.id, file: rel, line: i + 1, message: rule.message });
      });
    }
    if (!/^(src|test|docs)\//.test(rel) && !['package.json', '.gitignore', 'README.md', 'OMEGA.md'].includes(rel)) {
      findings.push({ severity: 'low', rule: 'layout.unexpected-file', file: rel, message: 'File outside the expected project layout' });
    }
  }
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, Record<string, string> | undefined>;
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
        const deps = Object.keys(pkg[field] ?? {});
        if (deps.length) findings.push({ severity: 'medium', rule: 'deps.declared', file: 'package.json', message: `${field}: ${deps.join(', ')} (spec requires zero dependencies; nothing was installed)` });
      }
      const scripts = pkg.scripts ?? {};
      for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
        if (scripts[hook]) findings.push({ severity: 'high', rule: 'deps.install-script', file: 'package.json', message: `Install lifecycle script "${hook}"` });
      }
    } catch {
      findings.push({ severity: 'medium', rule: 'package.invalid', file: 'package.json', message: 'package.json is not valid JSON' });
    }
  }
  return { findings, filesScanned: scanned };
}
