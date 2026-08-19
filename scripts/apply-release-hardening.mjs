import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function replaceOnce(file, before, after) {
  const source = read(file);
  if (source.includes(after) && !source.includes(before)) return false;
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one replacement anchor in ${file}: ${before.slice(0, 80)}`);
  }
  write(file, source.slice(0, first) + after + source.slice(first + before.length));
  return true;
}

function replaceSection(file, startMarker, endMarker, replacement, appliedMarker) {
  const source = read(file);
  if (appliedMarker && source.includes(appliedMarker)) return false;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Section markers missing in ${file}: ${startMarker}`);
  }
  write(file, source.slice(0, start) + replacement + source.slice(end));
  return true;
}

function insertBefore(file, marker, insertion, appliedMarker) {
  const source = read(file);
  if (appliedMarker && source.includes(appliedMarker)) return false;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Insertion marker missing in ${file}: ${marker}`);
  write(file, source.slice(0, index) + insertion + source.slice(index));
  return true;
}

function removeSection(file, startMarker, endMarker, absentMarker) {
  const source = read(file);
  if (!source.includes(startMarker)) {
    if (absentMarker && source.includes(absentMarker)) return false;
    throw new Error(`Removal marker missing in ${file}: ${startMarker}`);
  }
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Removal end marker missing in ${file}: ${endMarker}`);
  write(file, source.slice(0, start) + source.slice(end));
  return true;
}

function assertContains(file, values) {
  const source = read(file);
  for (const value of values) {
    if (!source.includes(value)) throw new Error(`Release assertion failed in ${file}: ${value}`);
  }
}

// Resolve repository-owned capability definitions correctly from both tsx and dist.
const toolRegistry = 'server/src/services/tool-registry.ts';
insertBefore(
  toolRegistry,
  "import {\n  formatSandboxResult,",
  "import { fileURLToPath } from 'node:url';\n",
  "from 'node:url'"
);
replaceSection(
  toolRegistry,
  'function toolsPath(): string {',
  '\n}\n\nfunction normalizeTool',
  `function toolsPath(): string {\n  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));\n  const candidates = [\n    path.resolve(process.cwd(), 'tools.json'),\n    path.resolve(moduleDirectory, '../../../tools.json'),\n  ];\n  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];`,
  'const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));'
);

const index = 'server/src/index.ts';
replaceSection(
  index,
  '// Seed default music-dev skills on first boot.',
  '\n\nconst app = express();',
  `// Company settings, employees, skills, loops, and REV-001 are migrated in db/seed.ts.`,
  'Company settings, employees, skills, loops, and REV-001 are migrated'
);
replaceOnce(
  index,
  `const app = express();\napp.use(cors());\napp.use(express.json({ limit: '10mb' }));`,
  `const app = express();\napp.disable('x-powered-by');\nconst runtimeConfig = resolveConfig();\napp.use(\n  cors({\n    origin(origin, callback) {\n      if (!origin || runtimeConfig.allowedOrigins.includes(origin)) callback(null, true);\n      else callback(new Error('Origin is not allowed by Agent OS policy.'));\n    },\n    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],\n    allowedHeaders: ['Content-Type', 'x-agentos-token'],\n  })\n);\napp.use(express.json({ limit: '2mb' }));`
);
insertBefore(
  index,
  "api.get('/auth/status'",
  `const requireOwnerPassword = (req: Request, res: Response, next: NextFunction) => {\n  const { password } = resolveConfig();\n  if (!password) {\n    return res.status(403).json({\n      error: 'Owner-gated actions require AGENT_OS_PASSWORD. Configure it and sign in first.',\n    });\n  }\n  const token = req.header('x-agentos-token') ?? '';\n  if (token !== password) return res.status(401).json({ error: 'unauthorized' });\n  return next();\n};\n\n`,
  'const requireOwnerPassword ='
);

const directOwnerRoutes = [
  ["api.post('/fcc/set-model', (req, res) => {", "api.post('/fcc/set-model', requireOwnerPassword, (req, res) => {"],
  ["api.post('/settings', (req, res) => {", "api.post('/settings', requireOwnerPassword, (req, res) => {"],
  ["api.post('/run/:projectId/start', (req, res) => {", "api.post('/run/:projectId/start', requireOwnerPassword, (req, res) => {"],
  ["api.post('/run/:projectId/stop', (req, res) => {", "api.post('/run/:projectId/stop', requireOwnerPassword, (req, res) => {"],
  ["api.post('/pipeline/:id/approve', (req, res) => {", "api.post('/pipeline/:id/approve', requireOwnerPassword, (req, res) => {"],
  ["api.post('/loops', (req, res) => res.json({ loop: studio.createLoop(req.body ?? {}) }));", "api.post('/loops', requireOwnerPassword, (req, res) => res.json({ loop: studio.createLoop(req.body ?? {}) }));"],
  ["api.delete('/loops/:id', (req, res) => {", "api.delete('/loops/:id', requireOwnerPassword, (req, res) => {"],
  ["api.post('/loops/:id/toggle', (req, res) => {", "api.post('/loops/:id/toggle', requireOwnerPassword, (req, res) => {"],
  ["api.post('/templates/scaffold', (req, res) => {", "api.post('/templates/scaffold', requireOwnerPassword, (req, res) => {"],
  ["api.post('/git/:projectId/init', (req, res) => {", "api.post('/git/:projectId/init', requireOwnerPassword, (req, res) => {"],
  ["api.post('/git/:projectId/commit', (req, res) => {", "api.post('/git/:projectId/commit', requireOwnerPassword, (req, res) => {"],
  ["api.post('/git/:projectId/push', (req, res) => {", "api.post('/git/:projectId/push', requireOwnerPassword, (req, res) => {"],
];
for (const [before, after] of directOwnerRoutes) replaceOnce(index, before, after);

replaceOnce(
  index,
  `api.post(\n  '/pipeline/:id/shape',\n  wrap(`,
  `api.post(\n  '/pipeline/:id/shape',\n  requireOwnerPassword,\n  wrap(`
);
replaceOnce(
  index,
  `api.post(\n  '/pipeline/:id/execute',\n  wrap(`,
  `api.post(\n  '/pipeline/:id/execute',\n  requireOwnerPassword,\n  wrap(`
);
replaceOnce(
  index,
  `api.post(\n  '/skills/:id/run',\n  wrap(`,
  `api.post(\n  '/skills/:id/run',\n  requireOwnerPassword,\n  wrap(`
);
replaceOnce(
  index,
  `api.post(\n  '/loops/:id/run',\n  wrap(`,
  `api.post(\n  '/loops/:id/run',\n  requireOwnerPassword,\n  wrap(`
);
replaceOnce(
  index,
  `api.post(\n  '/orchestrator/run',\n  wrap(`,
  `api.post(\n  '/orchestrator/run',\n  requireOwnerPassword,\n  wrap(`
);
insertBefore(
  index,
  "api.get('/loops',",
  "api.get('/loops/budget', (_req, res) => res.json(studio.automationBudgetStatus()));\n",
  "'/loops/budget'"
);
replaceOnce(
  index,
  `      },\n      time: new Date().toISOString(),`,
  `      },\n      automation: studio.automationBudgetStatus(),\n      time: new Date().toISOString(),`
);
removeSection(
  index,
  '// ── Guitar reference tools',
  '// ── Orchestrator (auto-chain the squad)',
  '// ── Orchestrator (auto-chain the squad)'
);
replaceOnce(index, 'const { port } = resolveConfig();', 'const { port, host } = runtimeConfig;');
replaceOnce(index, 'httpServer.listen(port, () => {', 'httpServer.listen(port, host, () => {');
replaceOnce(
  index,
  'console.log(`  ▸ Dashboard:  http://127.0.0.1:${port}`);',
  'console.log(`  ▸ Dashboard:  http://${host}:${port}`);'
);

// Standard UI exposes governed employees and operations, not legacy tuning or a host shell.
const appFile = 'client/src/App.tsx';
replaceOnce(appFile, "import { TerminalTab } from './components/TerminalTab';\n", '');
replaceOnce(appFile, "import { TuningTab } from './components/TuningTab';\n", '');
replaceOnce(
  appFile,
  "export type Tab = 'mission' | 'chat' | 'pipeline' | 'studio' | 'workspace' | 'memory' | 'terminal' | 'tuning' | 'settings';",
  "export type Tab = 'mission' | 'chat' | 'pipeline' | 'studio' | 'workspace' | 'memory' | 'settings';"
);
replaceOnce(
  appFile,
  "const [activeAgentId, setActiveAgentId] = useState<string>('free-claude-code');",
  "const [activeAgentId, setActiveAgentId] = useState<string>('ceo');"
);
replaceOnce(appFile, "          {tab === 'terminal' && <TerminalTab />}\n", '');
replaceOnce(appFile, "          {tab === 'tuning' && <TuningTab />}\n", '');
removeSection(appFile, "    case 'terminal':", "    case 'settings':", "    case 'settings':");
replaceOnce(appFile, "      return `${agentLabel ?? 'Free Claude Code'} — Chat`;", "      return `${agentLabel ?? 'CEO / Orchestrator'} — Company channel`;");
replaceOnce(appFile, "      return 'Pipeline — From Inbox to Shipped';", "      return 'Venture Pipeline — Evidence to Verified Delivery';");
replaceOnce(appFile, "      return 'Studio — Skills, Loops & Audit';", "      return 'Agent Operations — Skills, Routines & Audit';");

const sidebar = 'client/src/components/Sidebar.tsx';
replaceOnce(sidebar, "  { id: 'terminal', label: 'Terminal', tab: 'terminal' },\n", '');
replaceOnce(sidebar, '<div className="nav-section-label">Agent runtimes</div>', '<div className="nav-section-label">AI employees</div>');
replaceOnce(sidebar, '<div className="nav-section-label">Operations</div>', '<div className="nav-section-label">Company operations</div>');

const chat = 'client/src/components/ChatTab.tsx';
replaceOnce(chat, "const agentId = activeAgent?.id ?? 'free-claude-code';", "const agentId = activeAgent?.id ?? 'ceo';");
replaceOnce(chat, "const agentLabel = activeAgent?.label ?? 'Free Claude Code';", "const agentLabel = activeAgent?.label ?? 'CEO / Orchestrator';");
replaceOnce(chat, "if (agentId === 'orchestrator') {", "if (agentId === 'ceo') {");
replaceOnce(chat, '<h2>Same engine. Free fuel.</h2>', '<h2>Company command channel.</h2>');
replaceOnce(
  chat,
  '<><br /><strong>🚀 The Orchestrator auto-chains the squad</strong> — give it a goal and it plans, delegates to specialists in order, and gates via Reality Checker.</>',
  '<><br /><strong>The CEO runs the governed company chain</strong> — it delegates only to known employees and always ends at the independent QA & Security gate.</>'
);
replaceOnce(chat, "'🚀 Running the squad — calling agents in sequence…'", "'Running the governed company chain…'");

const mission = 'client/src/components/MissionControlTab.tsx';
replaceSection(
  mission,
  'const FALLBACK_ROLES: CompanyRole[] = [',
  '\n];\n\nconst DEFAULT_OWNER_GATES',
  `const FALLBACK_ROLES: CompanyRole[] = [\n  { id: 'ceo', title: 'CEO / Orchestrator', agent: 'ceo', mandate: 'Own the mission, sequence work, enforce budgets and escalate owner gates.' },\n  { id: 'market', title: 'Market Intelligence', agent: 'market-intelligence', mandate: 'Collect traceable buyer, pain, pricing and distribution evidence.' },\n  { id: 'red-team', title: 'Commercial Red Team', agent: 'commercial-red-team', mandate: 'Try to falsify weak opportunities before time or money is committed.' },\n  { id: 'product', title: 'Product Lead', agent: 'product-lead', mandate: 'Freeze the smallest sellable scope and measurable acceptance contract.' },\n  { id: 'architecture', title: 'Software Architect', agent: 'software-architect', mandate: 'Design the simplest reversible implementation and trust boundaries.' },\n  { id: 'builder', title: 'Build Engineer', agent: 'build-engineer', mandate: 'Implement bounded work inside the governed workspace and sandbox.' },\n  { id: 'qa', title: 'QA & Security', agent: 'qa-security', mandate: 'Independently verify tests, evidence, security, rollback and residual risk.' },\n  { id: 'revenue', title: 'Revenue Operations', agent: 'revenue-operations', mandate: 'Prepare prospects, drafts, CRM and payment readiness without sending.' },`,
  "agent: 'market-intelligence'"
);
replaceOnce(mission, "label: 'Commercial score',", "label: 'Hypothesis score',");
replaceOnce(mission, "label: 'Agent runtimes',", "label: 'AI employees',");
replaceOnce(mission, '<span>Founder price</span>', '<span>Price hypothesis</span>');
replaceOnce(mission, '<strong>6,900 SEK excl. VAT</strong>', '<strong>6,900 SEK excl. VAT · unvalidated</strong>');
replaceOnce(mission, '<div className="section-label">AI employees · open a role runtime</div>', '<div className="section-label">AI employees · open a role channel</div>');

const workspace = 'client/src/components/WorkspaceTab.tsx';
replaceOnce(
  workspace,
  "const [run, setRun] = useState<{ running: boolean; suggested: string } | null>(null);",
  "const [run, setRun] = useState<{ running: boolean; suggested: string; enabled: boolean } | null>(null);"
);
replaceOnce(
  workspace,
  "setRun({ running: st.running, suggested: st.suggested });\n        setRunCmd((c) => c || st.command || st.suggested || '');",
  "setRun({ running: st.running, suggested: st.suggested, enabled: st.enabled === true });\n        setRunCmd(st.command || st.suggested || '');"
);
replaceOnce(
  workspace,
  "if (!runCmd.trim()) return;\n      await api.runStart(activeProject.id, runCmd.trim());",
  "if (!run?.enabled || !run.suggested) return;\n      await api.runStart(activeProject.id, run.suggested);"
);
replaceOnce(
  workspace,
  "setRun((r) => (r ? { ...r, running: true } : { running: true, suggested: '' }));",
  "setRun((r) => (r ? { ...r, running: true } : { running: true, suggested: '', enabled: false }));"
);
replaceOnce(
  workspace,
  `            <input\n              value={runCmd}\n              placeholder={run?.suggested || 'npm run dev'}\n              onChange={(e) => setRunCmd(e.target.value)}\n            />`,
  `            <input\n              value={runCmd}\n              placeholder={run?.enabled ? 'No approved run script found' : 'Host preview disabled by policy'}\n              readOnly\n              aria-label="Approved host preview command"\n            />`
);
replaceOnce(
  workspace,
  `              onClick={toggleRun}\n              title="Start/stop a dev server or command"`,
  `              onClick={toggleRun}\n              disabled={!run?.running && (!run?.enabled || !run?.suggested)}\n              title={run?.enabled ? 'Start or stop the exact owner-reviewed preview script' : 'Set AGENT_OS_ENABLE_HOST_RUNNER=true only after reviewing this project'}`
);
insertBefore(
  workspace,
  '          <div className="ws-run-row">\n            <span className="muted tiny">localhost:</span>',
  `          {!run?.enabled && (\n            <p className="muted tiny">Host preview is off by default. Build and test automation uses the no-network Docker sandbox.</p>\n          )}\n`,
  'Host preview is off by default.'
);

const apiFile = 'client/src/api.ts';
replaceOnce(
  apiFile,
  "req<{ running: boolean; command?: string; pid?: number; startedAt?: string; suggested: string }>(",
  "req<{ running: boolean; command?: string; pid?: number; startedAt?: string; suggested: string; enabled: boolean }>("
);
replaceOnce(
  apiFile,
  "req<{ initialized: boolean; branch: string; files: { path: string; status: string }[]; log: string[]; remotes: string[] }>(",
  "req<{ initialized: boolean; branch: string; files: { path: string; status: string }[]; log: string[]; remotes: string[]; mutationsEnabled: boolean }>("
);

assertContains(index, [
  "const runtimeConfig = resolveConfig();",
  "const requireOwnerPassword =",
  "'/loops/budget'",
  "'/orchestrator/run',\n  requireOwnerPassword",
  'httpServer.listen(port, host',
]);
assertContains(appFile, ["useState<string>('ceo')", "export type Tab = 'mission' | 'chat' | 'pipeline'"]);
assertContains(chat, ["agentId === 'ceo'", 'Company command channel.']);
assertContains(mission, ["agent: 'qa-security'", 'Price hypothesis']);
assertContains(workspace, ['Host preview is off by default.', 'readOnly']);

console.log('Applied the final Company OS release hardening migration.');
