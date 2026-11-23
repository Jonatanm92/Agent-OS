import type { RolePolicy } from '../core/policy.ts';
import type { RoleId } from '../core/types.ts';

/**
 * The agent roster. Each role has one responsibility and the narrowest policy that
 * lets it do that job. "usesEngine" roles are the ones that can be backed by an LLM
 * agent (Claude Code); the others are deterministic programs, which is deliberate:
 * verification (tests, security scan) must not be done by the same thing that wrote
 * the code.
 */
export interface RoleDef {
  id: RoleId;
  title: string;
  responsibility: string;
  status: 'implemented' | 'planned';
  usesEngine: boolean;
  policy: RolePolicy;
}

/** Environment the Claude Code CLI needs (auth + proxy/CA). No GitHub/cloud tokens. */
export const CLAUDE_ENV_PASSTHROUGH = [
  'ANTHROPIC_*',
  'CLAUDE_*',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
];

const LLM_FILE_TOOLS = ['Read', 'Glob', 'Grep', 'Write', 'Edit'];

export const ROLES: Record<RoleId, RoleDef> = {
  product: {
    id: 'product',
    title: 'Produktledning',
    responsibility: 'Turns a free-text idea into a structured spec with testable acceptance criteria.',
    status: 'implemented',
    usesEngine: true,
    policy: { role: 'product', capabilities: ['llm'], writePaths: [], exec: [], envPassthrough: CLAUDE_ENV_PASSTHROUGH, llmTools: [] },
  },
  research: {
    id: 'research',
    title: 'Research',
    responsibility: 'Read-only web research for unknown domains (planned: WebSearch/WebFetch only, no writes).',
    status: 'planned',
    usesEngine: true,
    policy: { role: 'research', capabilities: ['llm'], writePaths: [], exec: [], envPassthrough: CLAUDE_ENV_PASSTHROUGH, llmTools: ['WebSearch', 'WebFetch'] },
  },
  architect: {
    id: 'architect',
    title: 'Arkitektur',
    responsibility: 'Creates the project structure: package.json (zero deps, node --test), layout, spec file.',
    status: 'implemented',
    usesEngine: false,
    policy: {
      role: 'architect',
      capabilities: ['fs.write'],
      writePaths: ['package.json', '.gitignore', 'OMEGA.md', 'src/.gitkeep', 'test/.gitkeep'],
      exec: [],
      envPassthrough: [],
    },
  },
  'test-author': {
    id: 'test-author',
    title: 'Testning (författare)',
    responsibility: 'Writes acceptance tests from the spec before any code exists. May only write test/**.',
    status: 'implemented',
    usesEngine: true,
    policy: { role: 'test-author', capabilities: ['llm', 'fs.read', 'fs.write'], writePaths: ['test/**'], exec: [], envPassthrough: CLAUDE_ENV_PASSTHROUGH, llmTools: LLM_FILE_TOOLS },
  },
  coder: {
    id: 'coder',
    title: 'Kodning',
    responsibility: 'Implements the spec so the acceptance tests pass. May only write src/**; cannot run commands.',
    status: 'implemented',
    usesEngine: true,
    policy: { role: 'coder', capabilities: ['llm', 'fs.read', 'fs.write'], writePaths: ['src/**'], exec: [], envPassthrough: CLAUDE_ENV_PASSTHROUGH, llmTools: LLM_FILE_TOOLS },
  },
  tester: {
    id: 'tester',
    title: 'Testning (verifiering)',
    responsibility: 'Runs the acceptance tests independently, checks test integrity and per-criterion coverage.',
    status: 'implemented',
    usesEngine: false,
    policy: { role: 'tester', capabilities: ['exec', 'fs.read'], writePaths: [], exec: [{ cmd: 'node', argsPrefix: ['--test'] }], envPassthrough: [] },
  },
  security: {
    id: 'security',
    title: 'Säkerhetsgranskning',
    responsibility: 'Static review: secrets, dangerous APIs, network use, dependencies, unexpected files.',
    status: 'implemented',
    usesEngine: false,
    policy: { role: 'security', capabilities: ['fs.read'], writePaths: [], exec: [], envPassthrough: [] },
  },
  docs: {
    id: 'docs',
    title: 'Dokumentation',
    responsibility: 'Writes the README from spec, verified test results and provenance; seals the evidence manifest.',
    status: 'implemented',
    usesEngine: false,
    policy: { role: 'docs', capabilities: ['fs.write'], writePaths: ['README.md', 'docs/**'], exec: [], envPassthrough: [] },
  },
};

export const DEFAULT_PLAN: RoleId[] = ['product', 'architect', 'test-author', 'coder', 'tester', 'security', 'docs'];

export function getRole(id: RoleId): RoleDef {
  const role = ROLES[id];
  if (!role) throw new Error(`Unknown role ${id}`);
  return role;
}
