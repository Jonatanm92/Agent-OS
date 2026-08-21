#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd(), 'company');
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function filesNamed(dir, filename) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesNamed(full, filename));
    else if (entry.name === filename) out.push(full);
  }
  return out.sort();
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/');
}

function frontmatter(file) {
  const source = read(file);
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) {
    fail(`${relative(file)}: missing YAML frontmatter`);
    return { source, scalar: new Map(), lists: new Map() };
  }

  const scalar = new Map();
  const lists = new Map();
  let activeList = null;
  let activeIndent = -1;

  for (const rawLine of match[1].split(/\r?\n/)) {
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const item = trimmed.match(/^-\s+(.+)$/);
    if (item && activeList && indent > activeIndent) {
      lists.get(activeList).push(unquote(item[1]));
      continue;
    }

    const keyValue = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!keyValue) {
      activeList = null;
      continue;
    }

    const [, key, rawValue] = keyValue;
    if (!rawValue) {
      activeList = key;
      activeIndent = indent;
      if (!lists.has(key)) lists.set(key, []);
    } else {
      activeList = null;
      scalar.set(key, unquote(rawValue));
    }
  }

  return { source, scalar, lists };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function requireScalar(meta, file, key, expected) {
  const value = meta.scalar.get(key);
  if (!value) fail(`${relative(file)}: missing frontmatter field '${key}'`);
  if (expected && value !== expected) {
    fail(`${relative(file)}: expected ${key}: ${expected}, got ${value || '(missing)'}`);
  }
  return value;
}

function scanForSecrets(file) {
  const source = read(file);
  const patterns = [
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
    /\bghp_[A-Za-z0-9]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bAIza[0-9A-Za-z_-]{24,}\b/g,
    /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}/gi,
  ];
  for (const pattern of patterns) {
    if (pattern.test(source)) fail(`${relative(file)}: possible committed secret matched ${pattern}`);
  }
}

if (!fs.existsSync(root)) {
  console.error('company/: package directory is missing');
  process.exit(1);
}

const companyFile = path.join(root, 'COMPANY.md');
if (!fs.existsSync(companyFile)) fail('company/COMPANY.md is missing');
else {
  const meta = frontmatter(companyFile);
  requireScalar(meta, companyFile, 'schema', 'agentcompanies/v1');
  requireScalar(meta, companyFile, 'kind', 'company');
  requireScalar(meta, companyFile, 'slug');
  requireScalar(meta, companyFile, 'name');
  if (!meta.source.includes('external-customer-contact')) {
    fail('company/COMPANY.md: owner gate for external customer contact is missing');
  }
  if (!meta.source.includes('self-modification-promotion')) {
    fail('company/COMPANY.md: owner gate for self-modification promotion is missing');
  }
}

const agentFiles = filesNamed(path.join(root, 'agents'), 'AGENTS.md');
const projectFiles = filesNamed(path.join(root, 'projects'), 'PROJECT.md');
const taskFiles = filesNamed(path.join(root, 'projects'), 'TASK.md');
const skillFiles = filesNamed(path.join(root, 'skills'), 'SKILL.md');

if (agentFiles.length < 8) fail(`expected at least 8 AI employee definitions, found ${agentFiles.length}`);
if (projectFiles.length < 1) fail('expected at least one starter project');
if (taskFiles.length < 1) fail('expected at least one starter task');
if (skillFiles.length < 4) fail(`expected at least 4 reusable skills, found ${skillFiles.length}`);

const agents = new Map();
const agentSkills = new Map();
for (const file of agentFiles) {
  const meta = frontmatter(file);
  requireScalar(meta, file, 'kind', 'agent');
  const slug = requireScalar(meta, file, 'slug');
  requireScalar(meta, file, 'name');
  requireScalar(meta, file, 'title');
  if (slug) {
    if (agents.has(slug)) fail(`${relative(file)}: duplicate agent slug '${slug}'`);
    agents.set(slug, { file, reportsTo: meta.scalar.get('reportsTo') });
    agentSkills.set(slug, meta.lists.get('skills') ?? []);
  }
}

for (const [slug, agent] of agents) {
  const manager = agent.reportsTo;
  if (manager && manager !== 'null' && !agents.has(manager)) {
    fail(`${relative(agent.file)}: reportsTo references missing agent '${manager}'`);
  }
  if (manager === slug) fail(`${relative(agent.file)}: agent cannot report to itself`);
}

const projects = new Set();
for (const file of projectFiles) {
  const meta = frontmatter(file);
  requireScalar(meta, file, 'kind', 'project');
  const slug = requireScalar(meta, file, 'slug');
  requireScalar(meta, file, 'name');
  const owner = requireScalar(meta, file, 'owner');
  if (slug) projects.add(slug);
  if (owner && !agents.has(owner)) fail(`${relative(file)}: owner references missing agent '${owner}'`);
}

const skills = new Set();
for (const file of skillFiles) {
  const meta = frontmatter(file);
  const name = requireScalar(meta, file, 'name');
  requireScalar(meta, file, 'description');
  if (name) {
    if (skills.has(name)) fail(`${relative(file)}: duplicate skill '${name}'`);
    skills.add(name);
  }
}

for (const [agentSlug, refs] of agentSkills) {
  for (const skill of refs) {
    if (!skills.has(skill)) fail(`agent '${agentSlug}' references missing skill '${skill}'`);
  }
}

for (const file of taskFiles) {
  const meta = frontmatter(file);
  requireScalar(meta, file, 'kind', 'task');
  requireScalar(meta, file, 'slug');
  requireScalar(meta, file, 'name');
  const project = requireScalar(meta, file, 'project');
  const assignee = requireScalar(meta, file, 'assignee');
  if (project && !projects.has(project)) fail(`${relative(file)}: project references missing project '${project}'`);
  if (assignee && !agents.has(assignee)) fail(`${relative(file)}: assignee references missing agent '${assignee}'`);
}

const paperclipFile = path.join(root, '.paperclip.yaml');
if (!fs.existsSync(paperclipFile)) {
  warn('company/.paperclip.yaml is missing; package remains portable but has no Paperclip runtime defaults');
} else {
  const sidecar = read(paperclipFile);
  if (!sidecar.includes('schema: paperclip/v1')) fail('company/.paperclip.yaml: expected schema: paperclip/v1');
  for (const slug of agents.keys()) {
    if (!sidecar.includes(`  ${slug}:`)) warn(`company/.paperclip.yaml: no explicit runtime config for agent '${slug}'`);
  }
  if (/\b(?:OPENAI|ANTHROPIC|OPENROUTER)_API_KEY\s*:\s*[^\r\n]+/i.test(sidecar)) {
    fail('company/.paperclip.yaml: provider secret appears to have an inline value');
  }
}

for (const file of [companyFile, ...agentFiles, ...projectFiles, ...taskFiles, ...skillFiles, paperclipFile]) {
  if (file && fs.existsSync(file)) scanForSecrets(file);
}

const summary = {
  package: relative(root),
  agents: agentFiles.length,
  projects: projectFiles.length,
  tasks: taskFiles.length,
  skills: skillFiles.length,
  warnings,
  errors,
};

if (errors.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
