import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), path.join(dist, 'public'), { recursive: true });
await cp(path.join(root, 'fixtures'), path.join(dist, 'fixtures'), { recursive: true });
await mkdir(path.join(dist, 'src'), { recursive: true });
await cp(path.join(root, 'src', 'workflow.mjs'), path.join(dist, 'src', 'workflow.mjs'));
await cp(path.join(root, 'src', 'server.mjs'), path.join(dist, 'src', 'server.mjs'));
await cp(path.join(root, 'package.json'), path.join(dist, 'package.json'));

const html = await readFile(path.join(dist, 'public', 'index.html'), 'utf8');
const app = await readFile(path.join(dist, 'public', 'app.js'), 'utf8');
if (!html.includes('Syntetisk demo') || !html.includes('Manuellt godkännande')) {
  throw new Error('Build contract failed: safety notices are missing from index.html.');
}
if (/https?:\/\//.test(app)) {
  throw new Error('Build contract failed: app.js contains an external URL.');
}

const manifest = {
  builtAt: new Date().toISOString(),
  mode: 'synthetic-only',
  externalActions: false,
  files: [
    'public/index.html',
    'public/app.js',
    'public/styles.css',
    'src/workflow.mjs',
    'src/server.mjs',
    'fixtures/inquiries.json',
  ],
};
await writeFile(path.join(dist, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built synthetic demonstration: ${dist}`);
