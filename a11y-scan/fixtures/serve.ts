/**
 * Minimal static server for the fixture shop.
 *
 * Test-only. Binds 127.0.0.1 on an ephemeral port and serves exactly the files
 * in fixtures/broken-shop — no directory traversal, no upward paths.
 */
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./broken-shop', import.meta.url)));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export interface FixtureServer {
  origin: string;
  close(): Promise<void>;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((req, res) => {
    const requestPath = (req.url ?? '/').split('?')[0] ?? '/';
    const relative = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath).replace(/^\/+/, '');

    const full = resolve(join(ROOT, relative));
    // Even in a test server, refuse anything resolving outside the fixture root.
    if (full !== ROOT && !full.startsWith(ROOT + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!existsSync(full) || !statSync(full).isFile()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<h1>404</h1>');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream' });
    res.end(readFileSync(full));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Fixture server failed to bind.');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
      }),
  };
}

// `npm run fixture-server` starts it for manual inspection.
if (process.argv[1]?.endsWith('serve.ts')) {
  startFixtureServer().then((s) => {
    process.stdout.write(`Fixture shop on ${s.origin}\n`);
  });
}
