import fs from 'node:fs';
import path from 'node:path';

/**
 * Permission system.
 *
 * Every role gets a RolePolicy: an explicit list of capabilities, the project paths it
 * may write, the exact commands it may execute, and which environment variables reach
 * its processes. OMEGA enforces these itself (path checks, exec allow-list, env
 * scrubbing, post-run git diff checks) — it does not rely on an agent's good behaviour.
 */
export type Capability = 'fs.read' | 'fs.write' | 'exec' | 'git' | 'llm';

export interface ExecRule {
  cmd: string;
  /** The call's args must start with exactly these values. */
  argsPrefix?: string[];
}

export interface RolePolicy {
  role: string;
  capabilities: Capability[];
  /** Project-relative write rules: "src/**" (subtree) or "README.md" (exact file). */
  writePaths: string[];
  exec: ExecRule[];
  /** Extra env var names (exact, or "PREFIX_*") passed to child processes. */
  envPassthrough: string[];
  /** Built-in Claude Code tools the role may use (only for llm roles). */
  llmTools?: string[];
}

export class PolicyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function toPosix(rel: string): string {
  return rel.split(path.sep).join('/').replace(/\\/g, '/');
}

export function matchPathRule(rel: string, rule: string): boolean {
  const r = toPosix(rel);
  if (rule.endsWith('/**')) {
    const prefix = rule.slice(0, -3);
    return r.startsWith(prefix + '/') && r.length > prefix.length + 1;
  }
  return r === rule;
}

const SECRET_NAME = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|kdbx|keystore|jks)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.(npmrc|pypirc|netrc|git-credentials)$/i,
  /^credentials(\..+)?$/i,
  /^secrets?\.(json|ya?ml|toml)$/i,
];

/** True for files that commonly hold credentials. ".env.example" is allowed. */
export function isSecretPath(rel: string): boolean {
  const base = path.posix.basename(toPosix(rel));
  if (/^\.env\.(example|sample|template)$/i.test(base)) return false;
  return SECRET_NAME.some((re) => re.test(base));
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve a project-relative path, refusing anything that escapes the root —
 * including via "..", absolute paths, drive letters, NUL bytes and symlinks.
 */
export function resolveInside(root: string, rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0) throw new PolicyError('path_invalid', 'Empty path');
  if (rel.includes('\0')) throw new PolicyError('path_invalid', 'NUL byte in path');
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith('\\\\')) {
    throw new PolicyError('path_escape', `Absolute paths are not allowed: ${rel}`);
  }
  const rootReal = fs.realpathSync(root);
  const target = path.resolve(rootReal, rel);
  if (!isInside(rootReal, target)) throw new PolicyError('path_escape', `Path escapes project: ${rel}`);
  // Walk up to the nearest existing ancestor and check its real path (symlink escape).
  let probe = target;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const probeReal = fs.realpathSync(probe);
  if (!isInside(rootReal, probeReal)) throw new PolicyError('path_escape', `Path escapes project via symlink: ${rel}`);
  return target;
}

export function checkWrite(policy: RolePolicy, root: string, rel: string): string {
  if (!policy.capabilities.includes('fs.write')) throw new PolicyError('no_capability', `${policy.role} may not write files`);
  const abs = resolveInside(root, rel);
  const posix = toPosix(path.relative(fs.realpathSync(root), abs));
  if (posix.split('/').includes('.git')) throw new PolicyError('path_forbidden', `Writing inside .git is forbidden: ${rel}`);
  if (isSecretPath(posix)) throw new PolicyError('secret_path', `Refusing to write a secret-like file: ${rel}`);
  if (!policy.writePaths.some((rule) => matchPathRule(posix, rule))) {
    throw new PolicyError('path_not_allowed', `${policy.role} may not write ${posix} (allowed: ${policy.writePaths.join(', ') || 'none'})`);
  }
  return abs;
}

export function checkRead(root: string, rel: string): string {
  const abs = resolveInside(root, rel);
  const posix = toPosix(path.relative(fs.realpathSync(root), abs));
  if (posix.split('/').includes('.git')) throw new PolicyError('path_forbidden', 'Reading .git internals via the API is not allowed');
  if (isSecretPath(posix)) throw new PolicyError('secret_path', `Refusing to read a secret-like file: ${rel}`);
  return abs;
}

export function checkExec(policy: RolePolicy, cmd: string, args: string[]): void {
  const needs: Capability = cmd === 'git' ? 'git' : 'exec';
  if (!policy.capabilities.includes(needs)) throw new PolicyError('no_capability', `${policy.role} lacks capability ${needs}`);
  const ok = policy.exec.some(
    (rule) => rule.cmd === cmd && (rule.argsPrefix ?? []).every((a, i) => args[i] === a),
  );
  if (!ok) throw new PolicyError('exec_not_allowed', `${policy.role} may not run: ${cmd} ${args.join(' ')}`);
}

/** Writes permitted for a role, used to verify an agent's changes after the fact. */
export function findWriteViolations(policy: RolePolicy, changed: string[]): string[] {
  return changed.filter((rel) => {
    const posix = toPosix(rel);
    if (isSecretPath(posix)) return true;
    return !policy.writePaths.some((rule) => matchPathRule(posix, rule));
  });
}
