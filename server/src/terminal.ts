import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { resolveConfig } from './config.js';

/**
 * In-dashboard terminal: a PTY bridge over WebSocket at /api/terminal.
 *
 * The browser (xterm.js) connects, we spawn a real shell via node-pty, and pipe
 * bytes both ways. node-pty is an OPTIONAL dependency — if it isn't installed
 * (e.g. native build skipped), we send a friendly message and close instead of
 * crashing, so the rest of the dashboard is unaffected.
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

    // Auth: browsers can't set WS headers, so the token rides in the query.
    const { password } = resolveConfig();
    if (password) {
      const url = new URL(req.url ?? '', 'http://localhost');
      if (url.searchParams.get('token') !== password) {
        send('output', '\r\n\x1b[31mUnauthorized — log in to the dashboard first.\x1b[0m\r\n');
        ws.close();
        return;
      }
    }

    // Load node-pty lazily so a missing native build doesn't break anything.
    let ptyMod: any;
    try {
      ptyMod = await import('node-pty');
    } catch {
      send(
        'output',
        '\r\n\x1b[33mTerminal support is not installed.\x1b[0m\r\n' +
          'Install it once, then restart the dashboard:\r\n\r\n' +
          '    npm run terminal:install\r\n\r\n' +
          '(That builds node-pty. The rest of Agent OS works without it.)\r\n'
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
    } catch (e) {
      send('output', `\r\n\x1b[31mFailed to start shell: ${e instanceof Error ? e.message : e}\x1b[0m\r\n`);
      ws.close();
      return;
    }

    term.onData((d: string) => send('output', d));
    term.onExit(() => {
      send('output', '\r\n[process exited]\r\n');
      try {
        ws.close();
      } catch {
        /* noop */
      }
    });

    ws.on('message', (raw) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        term.write(msg.data);
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        try {
          term.resize(msg.cols, msg.rows);
        } catch {
          /* ignore bad sizes */
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
