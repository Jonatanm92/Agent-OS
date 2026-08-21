import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import * as workspace from './workspace.js';

/**
 * Capability-limited project templates.
 *
 * Only repository-owned folders with validated IDs are readable. Symbolic links,
 * binary/oversized files, unbounded recursion, and traversal are rejected.
 * Legacy personal-project templates are hidden from the Company OS by default.
 */

const MAX_TEMPLATE_FILES = 500;
const MAX_TEMPLATE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_TEMPLATE_DEPTH = 30;
const LEGACY_TEMPLATE_IDS = new Set(['erra-amp-sim']);

export interface Template {
  id: string;
  name: string;
  description: string;
  source: 'folder' | 'inline';
}

function templatesDir(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'templates'),
    path.resolve(moduleDirectory, '../../../templates'),
  ];
  const candidate = candidates.find((value) => fs.existsSync(value)) ?? candidates[0];
  if (!fs.existsSync(candidate)) return candidate;
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Template root must be a real directory.');
  }
  return fs.realpathSync(candidate);
}

function validTemplateId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value);
}

function showLegacyTemplates(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.AGENT_OS_SHOW_LEGACY_TEMPLATES ?? '');
}

function folderFor(templateId: string): string | null {
  if (!validTemplateId(templateId)) return null;
  if (LEGACY_TEMPLATE_IDS.has(templateId) && !showLegacyTemplates()) return null;
  const root = templatesDir();
  const candidate = path.resolve(root, templateId);
  if (candidate === root || !candidate.startsWith(root + path.sep) || !fs.existsSync(candidate)) {
    return null;
  }
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
  const real = fs.realpathSync(candidate);
  if (!real.startsWith(root + path.sep)) return null;
  return real;
}

function readFolderTemplate(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  let totalBytes = 0;

  const walk = (current: string, prefix: string, depth: number): void => {
    if (depth > MAX_TEMPLATE_DEPTH) throw new Error('Template exceeds the depth limit.');
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (Object.keys(files).length >= MAX_TEMPLATE_FILES) {
        throw new Error('Template exceeds the file-count limit.');
      }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(full, relative, depth + 1);
      } else if (stat.isFile()) {
        if (stat.size > MAX_TEMPLATE_FILE_BYTES) {
          throw new Error(`Template file is too large: ${relative}`);
        }
        totalBytes += stat.size;
        if (totalBytes > MAX_TEMPLATE_TOTAL_BYTES) {
          throw new Error('Template exceeds the total-size limit.');
        }
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes('\0')) continue;
        files[relative] = content;
      }
    }
  };

  walk(directory, '', 0);
  return files;
}

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

const INLINE_TEMPLATES: {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
}[] = [
  {
    id: 'static-site',
    name: 'Landing Page',
    description: 'Simple HTML/CSS validation landing page.',
    files: {
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Validation Page</title><link rel="stylesheet" href="style.css"></head>\n<body><header><h1>Offer name</h1><p>One clear sentence about the painful job and outcome.</p></header>\n<main><section class="features"><div class="feature">Outcome</div><div class="feature">Fixed scope</div><div class="feature">Owner-approved CTA</div></section></main></body></html>`,
      'style.css': `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:system-ui,sans-serif; background:#0a0a0a; color:#eee; min-height:100vh; }\nheader { text-align:center; padding:80px 20px 40px; }\nh1 { font-size:3rem; }\np { color:#aaa; margin-top:8px; }\n.features { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; max-width:800px; margin:40px auto; padding:0 20px; }\n.feature { background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:24px; text-align:center; }`,
    },
  },
  {
    id: 'node-cli',
    name: 'Node.js CLI Tool',
    description: 'Minimal Node.js command-line validation utility.',
    files: {
      'package.json': `{\n  "name": "validation-tool",\n  "version": "1.0.0",\n  "type": "module",\n  "bin": { "validation-tool": "index.mjs" },\n  "scripts": { "start": "node index.mjs" }\n}`,
      'index.mjs': `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nconsole.log('Validation tool', args.length ? 'Args: ' + args.join(', ') : '');`,
    },
  },
];

export function listTemplates(): Template[] {
  const output: Template[] = [];
  const root = templatesDir();

  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        entry.name.startsWith('.') ||
        !validTemplateId(entry.name) ||
        (LEGACY_TEMPLATE_IDS.has(entry.name) && !showLegacyTemplates())
      ) {
        continue;
      }
      const folder = folderFor(entry.name);
      if (!folder) continue;
      const readmePath = path.join(folder, 'README.md');
      let description = `Scaffold from templates/${entry.name}`;
      if (fs.existsSync(readmePath)) {
        const stat = fs.lstatSync(readmePath);
        if (!stat.isSymbolicLink() && stat.isFile() && stat.size <= MAX_TEMPLATE_FILE_BYTES) {
          const lines = fs.readFileSync(readmePath, 'utf8').split('\n');
          description = lines.find((line) => line && !line.startsWith('#'))?.trim() || description;
        }
      }
      output.push({
        id: entry.name,
        name: titleCase(entry.name),
        description: description.slice(0, 240),
        source: 'folder',
      });
    }
  }

  for (const template of INLINE_TEMPLATES) {
    output.push({
      id: template.id,
      name: template.name,
      description: template.description,
      source: 'inline',
    });
  }
  return output;
}

export function scaffold(
  templateId: string,
  projectName: string
): { projectId: string; files: string[] } {
  const id = templateId.trim();
  if (!validTemplateId(id)) throw new Error('Invalid template ID.');

  const folder = folderFor(id);
  if (folder) {
    const files = readFolderTemplate(folder);
    const project = workspace.createProject(projectName || titleCase(id));
    const written: string[] = [];
    for (const [relative, content] of Object.entries(files)) {
      workspace.writeFileContent(project.id, relative, content);
      written.push(relative);
    }
    return { projectId: project.id, files: written };
  }

  const inline = INLINE_TEMPLATES.find((template) => template.id === id);
  if (inline) {
    const project = workspace.createProject(projectName || inline.name);
    const written: string[] = [];
    for (const [relative, content] of Object.entries(inline.files)) {
      workspace.writeFileContent(project.id, relative, content);
      written.push(relative);
    }
    return { projectId: project.id, files: written };
  }

  throw new Error(`Unknown or disabled template: ${id}`);
}
