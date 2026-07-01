import fs from 'fs';
import path from 'path';
import * as workspace from './workspace.js';

/**
 * Project templates — one-click scaffolds.
 *
 * Templates live in the `templates/` folder at the repo root. Each subfolder is
 * a template: its name becomes the template ID, and ALL files inside are copied
 * into the new project. To add a template, just drop a folder there.
 *
 * Also includes hardcoded quick templates (landing page, node CLI) that don't
 * need a folder.
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  source: 'folder' | 'inline';
}

function templatesDir(): string {
  // Resolve relative to the repo root (process.cwd() when the server starts).
  return path.resolve(process.cwd(), 'templates');
}

function readFolderTemplate(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string, prefix: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        try {
          files[rel] = fs.readFileSync(full, 'utf8');
        } catch { /* skip binary files */ }
      }
    }
  };
  walk(dir, '');
  return files;
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Inline templates (no folder needed) ─────────────────────────────────────

const INLINE_TEMPLATES: { id: string; name: string; description: string; files: Record<string, string> }[] = [
  {
    id: 'static-site',
    name: 'Landing Page',
    description: 'Simple HTML/CSS landing page.',
    files: {
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>My Project</title><link rel="stylesheet" href="style.css"></head>\n<body><header><h1>Project Name</h1><p>One line about what it does.</p></header>\n<main><section class="features"><div class="feature">Feature 1</div><div class="feature">Feature 2</div><div class="feature">Feature 3</div></section></main></body></html>`,
      'style.css': `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:system-ui,sans-serif; background:#0a0a0a; color:#eee; min-height:100vh; }\nheader { text-align:center; padding:80px 20px 40px; }\nh1 { font-size:3rem; }\np { color:#888; margin-top:8px; }\n.features { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; max-width:800px; margin:40px auto; padding:0 20px; }\n.feature { background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:24px; text-align:center; }`,
    },
  },
  {
    id: 'node-cli',
    name: 'Node.js CLI Tool',
    description: 'Quick Node.js command-line tool with arg parsing.',
    files: {
      'package.json': `{\n  "name": "my-tool",\n  "version": "1.0.0",\n  "type": "module",\n  "bin": { "my-tool": "index.mjs" },\n  "scripts": { "start": "node index.mjs" }\n}`,
      'index.mjs': `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nconsole.log('Hello from my-tool!', args.length ? 'Args: ' + args.join(', ') : '');`,
    },
  },
];

// ── Public API ──────────────────────────────────────────────────────────────

export function listTemplates(): Template[] {
  const out: Template[] = [];

  // Folder templates.
  const dir = templatesDir();
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const readmePath = path.join(dir, entry.name, 'README.md');
        let desc = `Scaffold from templates/${entry.name}`;
        if (fs.existsSync(readmePath)) {
          const lines = fs.readFileSync(readmePath, 'utf8').split('\n');
          desc = lines.find((l) => l && !l.startsWith('#'))?.trim() || desc;
        }
        out.push({ id: entry.name, name: titleCase(entry.name), description: desc, source: 'folder' });
      }
    }
  }

  // Inline templates.
  for (const t of INLINE_TEMPLATES) {
    out.push({ id: t.id, name: t.name, description: t.description, source: 'inline' });
  }

  return out;
}

export function scaffold(templateId: string, projectName: string): { projectId: string; files: string[] } {
  // Try folder first.
  const folderPath = path.join(templatesDir(), templateId);
  if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
    const files = readFolderTemplate(folderPath);
    const project = workspace.createProject(projectName || titleCase(templateId));
    const written: string[] = [];
    for (const [rel, content] of Object.entries(files)) {
      workspace.writeFileContent(project.id, rel, content);
      written.push(rel);
    }
    return { projectId: project.id, files: written };
  }

  // Try inline.
  const inline = INLINE_TEMPLATES.find((t) => t.id === templateId);
  if (inline) {
    const project = workspace.createProject(projectName || inline.name);
    const written: string[] = [];
    for (const [rel, content] of Object.entries(inline.files)) {
      workspace.writeFileContent(project.id, rel, content);
      written.push(rel);
    }
    return { projectId: project.id, files: written };
  }

  throw new Error(`Unknown template: ${templateId}`);
}
