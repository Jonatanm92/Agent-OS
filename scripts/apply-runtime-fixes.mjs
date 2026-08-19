import fs from 'node:fs';

const file = 'server/src/index.ts';

function read() {
  return fs.readFileSync(file, 'utf8');
}

function write(content) {
  fs.writeFileSync(file, content, 'utf8');
}

function replaceOnce(before, after) {
  const source = read();
  if (source.includes(after) && !source.includes(before)) return;
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one runtime replacement anchor: ${before.slice(0, 100)}`);
  }
  write(source.slice(0, first) + after + source.slice(first + before.length));
}

function insertBefore(marker, insertion, appliedMarker) {
  const source = read();
  if (source.includes(appliedMarker)) return;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Runtime insertion marker missing: ${marker}`);
  write(source.slice(0, index) + insertion + source.slice(index));
}

// One policy covers every state-changing route. Read-only dashboard evidence is
// available before unlock; POST, PUT, PATCH and DELETE require a configured
// owner password and its token. Auth login and CORS preflight remain public.
insertBefore(
  '// ── Health & status',
  `// Mutating API operations require an authenticated owner.\napi.use((req: Request, res: Response, next: NextFunction) => {\n  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();\n  if (PUBLIC_PATHS.has(req.path)) return next();\n  return requireOwnerPassword(req, res, next);\n});\n\n`,
  'Mutating API operations require an authenticated owner.'
);

replaceOnce(
  `  if (!model) return res.status(400).json({ error: 'model required' });`,
  `  if (!/^[A-Za-z0-9._:/-]{1,200}$/.test(model)) {\n    return res.status(400).json({ error: 'model must be 1-200 safe identifier characters' });\n  }`
);
replaceOnce(
  `      setSetting(key, String(value ?? ''));`,
  `      setSetting(key, String(value ?? '').slice(0, key.startsWith('agent_identity_') ? 50_000 : 2_000));`
);
replaceOnce(
  `  wrap(async (_req, res) => {\n    const hermesUp = await hermes.isAvailable();\n    const agents = listAgentViews().map((a) => ({\n      ...a,\n      available: a.backend === 'cli' ? hermesUp : true,\n    }));`,
  `  wrap(async (_req, res) => {\n    const [hermesUp, gateway] = await Promise.all([hermes.isAvailable(), fcc.getStatus()]);\n    const agents = listAgentViews().map((a) => ({\n      ...a,\n      available: a.backend === 'cli' ? hermesUp : gateway.ok,\n    }));`
);
replaceOnce(
  `const agentId = getAgent(String(req.body?.agentId ?? 'free-claude-code')).id;\n    res.json({ item: await pipeline.shape(req.params.id, agentId) });`,
  `const agentId = getAgent(String(req.body?.agentId ?? 'product-lead')).id;\n    res.json({ item: await pipeline.shape(req.params.id, agentId) });`
);
replaceOnce(
  `const agentId = getAgent(String(req.body?.agentId ?? 'free-claude-code')).id;\n    res.json({ item: await pipeline.execute(req.params.id, agentId) });`,
  `const agentId = getAgent(String(req.body?.agentId ?? 'build-engineer')).id;\n    res.json({ item: await pipeline.execute(req.params.id, agentId) });`
);
replaceOnce(
  `  console.log(\`  ▸ Auth:       ${'${cfg.password ? \'password required\' : \'open (no password set)\'}'}\\n\`);`,
  `  console.log(\`  ▸ Mutations:  ${'${cfg.password ? \'owner password required\' : \'LOCKED — configure AGENT_OS_PASSWORD\'}'}\\n\`);`
);

const output = read();
for (const required of [
  'Mutating API operations require an authenticated owner.',
  "req.body?.agentId ?? 'product-lead'",
  "req.body?.agentId ?? 'build-engineer'",
  'gateway.ok',
  'model must be 1-200 safe identifier characters',
]) {
  if (!output.includes(required)) throw new Error(`Runtime assertion failed: ${required}`);
}

console.log('Applied final runtime policy fixes.');
