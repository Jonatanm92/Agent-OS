import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function replaceExact(file, before, after) {
  const source = read(file);
  if (source.includes(after) && !source.includes(before)) return;
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one replacement anchor in ${file}`);
  }
  write(file, source.slice(0, first) + after + source.slice(first + before.length));
}

function removeExact(file, value, alreadyAbsentMarker) {
  const source = read(file);
  if (!source.includes(value)) {
    if (alreadyAbsentMarker && source.includes(alreadyAbsentMarker)) return;
    throw new Error(`Expected removal anchor in ${file}`);
  }
  write(file, source.replace(value, ''));
}

function insertBefore(file, marker, insertion, alreadyMarker) {
  const source = read(file);
  if (alreadyMarker && source.includes(alreadyMarker)) return;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Insertion marker missing in ${file}`);
  write(file, source.slice(0, index) + insertion + source.slice(index));
}

function replaceSection(file, startMarker, endMarker, replacement, alreadyMarker) {
  const source = read(file);
  if (alreadyMarker && source.includes(alreadyMarker)) return;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Section markers missing in ${file}`);
  write(file, source.slice(0, start) + replacement + source.slice(end));
}

const pipeline = 'server/src/services/pipeline.ts';
removeExact(
  pipeline,
  "import { execSync } from 'node:child_process';\n",
  "from './sandbox.js'"
);
insertBefore(
  pipeline,
  "import {\n  assessVenture,",
  "import {\n  formatSandboxResult,\n  runSandboxTask,\n  type SandboxTask,\n} from './sandbox.js';\n",
  "type SandboxTask"
);
replaceExact(
  pipeline,
  `function runVerificationCommand(cwd: string, command: string): { passed: boolean; output: string } {\n  try {\n    const output = execSync(command, {\n      cwd,\n      timeout: 120_000,\n      maxBuffer: 8 * 1024 * 1024,\n      encoding: 'utf8',\n      stdio: ['ignore', 'pipe', 'pipe'],\n    });\n    return { passed: true, output: (output || '(completed with no output)').slice(0, 5000) };\n  } catch (error) {\n    const detail = error as { stdout?: string; stderr?: string; message?: string; status?: number };\n    const output = \`${'${detail.stdout ?? \'\'}'}${'${detail.stderr ?? \'\'}'}\` || detail.message || 'unknown error';\n    return { passed: false, output: \`exit ${'${detail.status ?? \'?\'}'}: ${'${output.slice(0, 5000)}'}\` };\n  }\n}\n`,
  `function runVerificationTask(\n  cwd: string,\n  task: SandboxTask\n): { passed: boolean; output: string } {\n  const result = runSandboxTask(cwd, task, 120_000);\n  return { passed: result.passed, output: formatSandboxResult(result) };\n}\n`
);
replaceExact(
  pipeline,
  "const result = runVerificationCommand(project.path, 'npm test');",
  "const result = runVerificationTask(project.path, 'node-test');"
);
replaceExact(
  pipeline,
  "const result = runVerificationCommand(project.path, 'npm run build');",
  "const result = runVerificationTask(project.path, 'node-build');"
);
replaceExact(
  pipeline,
  "const result = runVerificationCommand(project.path, 'python -m pytest -q');",
  "const result = runVerificationTask(project.path, 'python-test');"
);

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
  `// Seed governed Company OS skills on first boot.\nif (studio.listSkills().length === 0) {\n  studio.createSkill({\n    name: 'Venture: Evidence packet',\n    prompt: 'For {{input}}, create a source-traceable evidence packet covering buyer, painful job, current workaround, payment signals, reachable prospects, acquisition route, feasibility, and risks. Mark every unsupported claim as UNKNOWN.',\n    agent_id: 'market-intelligence',\n  });\n  studio.createSkill({\n    name: 'Venture: Commercial red team',\n    prompt: 'Attack the commercial case for {{input}}. Identify why customers may not pay, acquisition failure, delivery burden, privacy/security/legal risks, and the cheapest decisive falsification test. Do not invent evidence.',\n    agent_id: 'reality-checker',\n  });\n  studio.createSkill({\n    name: 'Delivery: Acceptance contract',\n    prompt: 'Turn {{input}} into a narrow acceptance contract with inputs, outputs, exclusions, deterministic tests, evidence artifacts, stop conditions, owner gates, cost ceiling, and rollback.',\n    agent_id: 'backend-architect',\n  });\n  studio.createSkill({\n    name: 'Revenue: Founder validation pack',\n    prompt: 'Prepare a founder validation pack for {{input}}: fixed offer, ICP, qualification rules, 30-prospect research schema, outreach drafts not yet sent, CRM fields, payment readiness checklist, objections, and kill thresholds. External contact remains owner-gated.',\n    agent_id: 'growth-hacker',\n  });\n}`,
  '// Seed governed Company OS skills on first boot.'
);
replaceExact(
  index,
  `const app = express();\napp.use(cors());\napp.use(express.json({ limit: '10mb' }));`,
  `const app = express();\napp.disable('x-powered-by');\nconst runtimeConfig = resolveConfig();\napp.use(\n  cors({\n    origin(origin, callback) {\n      if (!origin || runtimeConfig.allowedOrigins.includes(origin)) callback(null, true);\n      else callback(new Error('Origin is not allowed by Agent OS policy.'));\n    },\n    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],\n    allowedHeaders: ['Content-Type', 'x-agentos-token'],\n  })\n);\napp.use(express.json({ limit: '2mb' }));`
);
insertBefore(
  index,
  "api.get('/auth/status'",
  `const requireOwnerPassword = (req: Request, res: Response, next: NextFunction) => {\n  const { password } = resolveConfig();\n  if (!password) {\n    return res.status(403).json({\n      error: 'This owner-gated action requires AGENT_OS_PASSWORD.',\n    });\n  }\n  const token = req.header('x-agentos-token') ?? '';\n  if (token !== password) return res.status(401).json({ error: 'unauthorized' });\n  return next();\n};\n\n`,
  'const requireOwnerPassword ='
);
replaceExact(
  index,
  "api.post('/fcc/set-model', (req, res) => {",
  "api.post('/fcc/set-model', requireOwnerPassword, (req, res) => {"
);
replaceExact(
  index,
  "api.post('/run/:projectId/start', (req, res) => {",
  "api.post('/run/:projectId/start', requireOwnerPassword, (req, res) => {"
);
replaceExact(
  index,
  "api.post('/run/:projectId/stop', (req, res) => {",
  "api.post('/run/:projectId/stop', requireOwnerPassword, (req, res) => {"
);
replaceExact(
  index,
  "api.post('/git/:projectId/init', (req, res) => {",
  "api.post('/git/:projectId/init', requireOwnerPassword, (req, res) => {"
);
replaceExact(
  index,
  "api.post('/git/:projectId/commit', (req, res) => {",
  "api.post('/git/:projectId/commit', requireOwnerPassword, (req, res) => {"
);
replaceExact(
  index,
  "api.post('/git/:projectId/push', (req, res) => {",
  "api.post('/git/:projectId/push', requireOwnerPassword, (req, res) => {"
);
replaceExact(
  index,
  'const { port } = resolveConfig();',
  'const { port, host } = runtimeConfig;'
);
replaceExact(
  index,
  'httpServer.listen(port, () => {',
  'httpServer.listen(port, host, () => {'
);
replaceExact(
  index,
  'console.log(`  ▸ Dashboard:  http://127.0.0.1:${port}`);',
  'console.log(`  ▸ Dashboard:  http://${host}:${port}`);'
);

console.log('Applied Company OS release hardening.');
