import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLoopback, type OmegaConfig } from '../config.ts';
import { checkRead, PolicyError } from '../core/policy.ts';
import type { EngineId } from '../core/types.ts';
import { writeFileAtomic } from '../core/util.ts';
import { Omega, OmegaError } from '../engine/orchestrator.ts';
import { collectInventory, type Inventory } from '../inventory/inventory.ts';
import { DEFAULT_PLAN, ROLES } from '../roles/registry.ts';

/**
 * Dashboard + JSON API on node:http. Security posture:
 *  - binds loopback by default; any other host requires OMEGA_ALLOW_REMOTE=1
 *  - every /api route except /api/health needs `Authorization: Bearer <token>`
 *    (header auth, no cookies → no CSRF); constant-time comparison; failed attempts
 *    are rate limited per client
 *  - no terminal, no arbitrary command endpoint: the API can only drive missions
 *  - JSON bodies ≤ 64 KB; strict CSP; static files served from a fixed allow-list
 */
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json' },
  '/icon.svg': { file: 'icon.svg', type: 'image/svg+xml' },
};

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
};

export function loadOrCreateToken(home: string): { token: string; created: boolean; file: string } {
  const file = path.join(home, 'token');
  const fromEnv = process.env.OMEGA_TOKEN;
  if (fromEnv) {
    if (fromEnv.length < 24) throw new Error('OMEGA_TOKEN must be at least 24 characters');
    return { token: fromEnv, created: false, file: '(env OMEGA_TOKEN)' };
  }
  if (fs.existsSync(file)) return { token: fs.readFileSync(file, 'utf8').trim(), created: false, file };
  const token = crypto.randomBytes(32).toString('base64url');
  writeFileAtomic(file, token + '\n', 0o600);
  return { token, created: true, file };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: http.ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8'): void {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(payload);
}

async function readJson(req: http.IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Content-Type must be application/json');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export interface OmegaServer {
  server: http.Server;
  url: string;
  token: string;
  stop: () => Promise<void>;
}

export async function startServer(cfg: OmegaConfig, omega: Omega, opts: { worker?: boolean; workerIntervalMs?: number } = {}): Promise<OmegaServer> {
  if (!isLoopback(cfg.host) && !cfg.allowRemote) {
    throw new Error(`Refusing to bind ${cfg.host}: OMEGA only listens on loopback unless OMEGA_ALLOW_REMOTE=1. For phone access use a private tunnel such as Tailscale (see docs/03-security.md).`);
  }
  const { token } = loadOrCreateToken(cfg.home);
  const failures = new Map<string, { count: number; since: number }>();
  let inventory: { at: number; data: Inventory } | null = null;

  const authorised = (req: http.IncomingMessage): boolean => {
    const ip = req.socket.remoteAddress ?? '?';
    const f = failures.get(ip);
    if (f && Date.now() - f.since < 60_000 && f.count >= 10) throw new HttpError(429, 'Too many failed attempts; wait a minute');
    const header = req.headers.authorization ?? '';
    const ok = header.startsWith('Bearer ') && safeEqual(header.slice(7), token);
    if (!ok) {
      const cur = f && Date.now() - f.since < 60_000 ? f : { count: 0, since: Date.now() };
      cur.count++;
      failures.set(ip, cur);
    }
    return ok;
  };

  const handleApi = async (req: http.IncomingMessage, url: URL): Promise<[number, unknown]> => {
    const method = req.method ?? 'GET';
    const p = url.pathname;
    if (p === '/api/health') return [200, { ok: true, name: 'omega', version: '0.1.0' }];
    if (!authorised(req)) throw new HttpError(401, 'Missing or invalid bearer token');

    let m: RegExpMatchArray | null;
    if (p === '/api/overview' && method === 'GET') return [200, omega.overview()];
    if (p === '/api/roles' && method === 'GET') return [200, { plan: DEFAULT_PLAN, roles: Object.values(ROLES) }];
    if (p === '/api/missions' && method === 'GET') return [200, omega.listMissions()];
    if (p === '/api/missions' && method === 'POST') {
      const body = await readJson(req);
      const mission = await omega.createMission({
        idea: String(body.idea ?? ''),
        engine: (body.engine as EngineId | undefined) ?? undefined,
        budgetUsd: body.budgetUsd === undefined || body.budgetUsd === '' ? undefined : Number(body.budgetUsd),
        model: typeof body.model === 'string' && body.model ? body.model : undefined,
        actor: 'dashboard',
      });
      return [201, mission];
    }
    if ((m = p.match(/^\/api\/missions\/(msn_[0-9a-f]{12})$/)) && method === 'GET') return [200, await omega.missionDetail(m[1])];
    if ((m = p.match(/^\/api\/missions\/(msn_[0-9a-f]{12})\/(cancel|retry|reverify|verify-evidence)$/)) && method === 'POST') {
      const [, id, action] = m;
      if (action === 'cancel') return [200, omega.cancelMission(id, 'dashboard')];
      if (action === 'retry') return [200, omega.retryMission(id, 'dashboard')];
      if (action === 'reverify') return [200, await omega.reverify(id, 'dashboard')];
      return [200, await omega.verifyEvidence(id)];
    }
    if ((m = p.match(/^\/api\/missions\/(msn_[0-9a-f]{12})\/artifacts\/([\w.-]+)$/)) && method === 'GET') {
      return [200, { name: m[2], content: omega.readArtifact(m[1], m[2]) }];
    }
    if ((m = p.match(/^\/api\/missions\/(msn_[0-9a-f]{12})\/file$/)) && method === 'GET') {
      const mission = omega.getMission(m[1]);
      const rel = url.searchParams.get('path') ?? '';
      const abs = checkRead(mission.projectDir, rel);
      const stat = fs.statSync(abs);
      if (!stat.isFile()) throw new HttpError(400, 'Not a file');
      if (stat.size > 512 * 1024) throw new HttpError(413, 'File too large to display');
      return [200, { path: rel, content: fs.readFileSync(abs, 'utf8') }];
    }
    if (p === '/api/approvals' && method === 'GET') {
      const state = url.searchParams.get('state');
      return [200, omega.listApprovals(state === 'pending' || state === 'approved' || state === 'rejected' ? state : undefined)];
    }
    if ((m = p.match(/^\/api\/approvals\/(apr_[0-9a-f]{12})\/decide$/)) && method === 'POST') {
      const body = await readJson(req);
      const decision = body.decision;
      if (decision !== 'approve' && decision !== 'reject') throw new HttpError(400, 'decision must be approve or reject');
      return [200, await omega.decideApproval(m[1], decision, 'dashboard', String(body.note ?? '').slice(0, 2000), body.acknowledgeRisks === true)];
    }
    if (p === '/api/audit' && method === 'GET') {
      const missionId = url.searchParams.get('missionId') ?? undefined;
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 1000);
      return [200, omega.audit.list({ missionId, limit })];
    }
    if (p === '/api/audit/verify' && method === 'GET') return [200, omega.audit.verify()];
    if (p === '/api/inventory' && method === 'GET') {
      const refresh = url.searchParams.get('refresh') === '1';
      if (!inventory || refresh || Date.now() - inventory.at > 5 * 60_000) inventory = { at: Date.now(), data: await collectInventory(cfg) };
      return [200, inventory.data];
    }
    throw new HttpError(404, 'Not found');
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://omega.local');
    try {
      if (url.pathname.startsWith('/api/')) {
        const [status, body] = await handleApi(req, url);
        send(res, status, body);
        return;
      }
      const asset = STATIC[url.pathname];
      if (!asset || (req.method !== 'GET' && req.method !== 'HEAD')) {
        send(res, 404, { error: 'Not found' });
        return;
      }
      send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, asset.file)), asset.type);
    } catch (err) {
      const status = err instanceof HttpError || err instanceof OmegaError ? err.status : err instanceof PolicyError ? 403 : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 500) console.error('[omega] internal error:', err);
      send(res, status, { error: status === 500 ? 'Internal error (see server log)' : message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : cfg.port;
  const hostForUrl = cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host;

  let timer: NodeJS.Timeout | undefined;
  if (opts.worker !== false) {
    timer = setInterval(() => {
      omega.runUntilIdle(1).catch((err) => console.error('[omega] worker error:', err));
    }, opts.workerIntervalMs ?? 1000);
  }

  return {
    server,
    url: `http://${hostForUrl}:${port}`,
    token,
    stop: () =>
      new Promise((resolve) => {
        if (timer) clearInterval(timer);
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
