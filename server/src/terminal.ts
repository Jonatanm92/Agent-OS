import { timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { resolveConfig } from './config.js';

function sameSecret(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Optional owner terminal at /api/terminal.
 *
 * A real shell is never available by default. It requires both:
 *   AGENT_OS_ENABLE_TERMINAL=true
 *   AGENT_OS_PASSWORD=<non-empty owner secret>
 *
 * The WebSocket Origin must also match the configured local/approved dashboard
 * origins. This blocks drive-by websites from opening a shell on localhost.
 */
export function attachTerminal(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/terminal' });

  wss.on('connection', async (ws, req) => {
    const send = (type: string, data: unknown) => {
      try {
        ws.send(JSON.stringify({ type, data }));
      } catch {
        /* socket closed */
      }
    };
    const reject = (message: string) => {
      send('output', `\r\n\x1b[31m${message}\x1b[0m\r\n`);
      try {
        ws.close(1008, 'policy violation');
      } catch {
        /* socket already closed */
      }
    };

    const config = resolveConfig();
    if (!config.enableTerminal) {
      reject('Terminal is disabled by policy.');
      return;
    }
    if (!config.password) {
      reject('Terminal requires AGENT_OS_PASSWORD.');
      return;
    }

    const origin = String(req.headers.origin ?? '');
    if (!origin || !config.allowedOrigins.includes(origin)) {
      reject('WebSocket origin is not approved.');
      return;
    }

    const url = new URL(req.url ?? '', 'http://localhost');
    const supplied = url.searchParams.get('token') ?? '';
    if (!sameSecret(supplied, config.password)) {
      reject('Unauthorized — log in to the dashboard first.');
      return;
    }

    let ptyMod: any;
    try {
      ptyMod = await import('node-pty');
    } catch {
      send(
        'output',
        '\r\n\x1b[33mTerminal support is not installed.\x1b[0m\r\n' +
          'Install node-pty manually after reviewing it, then restart Agent OS.\r\n'
      );
      ws.close();
      return;
    }

    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : process.env.SHELL || 'bash';
    let term: any;
    try {
      term = ptyMod.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env,
      });
    } catch (error) {
      reject(`Failed to start shell: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    term.onData((data: string) => send('output', data));
    term.onExit(() => {
      send('output', '\r\n[process exited]\r\n');
      try {
        ws.close();
      } catch {
        /* no-op */
      }
    });

    ws.on('message', (raw) => {
      if (raw.toString().length > 64 * 1024) {
        reject('Terminal message exceeds the size limit.');
        return;
      }
      let message: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'input' && typeof message.data === 'string') {
        term.write(message.data.slice(0, 16 * 1024));
      } else if (
        message.type === 'resize' &&
        Number.isInteger(message.cols) &&
        Number.isInteger(message.rows) &&
        Number(message.cols) >= 20 &&
        Number(message.cols) <= 400 &&
        Number(message.rows) >= 5 &&
        Number(message.rows) <= 200
      ) {
        try {
          term.resize(Number(message.cols), Number(message.rows));
        } catch {
          /* ignore invalid terminal resize */
        }
      }
    });

    ws.on('close', () => {
      try {
        term.kill();
      } catch {
        /* already gone */
      }
    });
  });
}
