import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { auth } from '../api';

/**
 * In-dashboard terminal. Connects to the PTY bridge at /api/terminal over a
 * WebSocket and renders a real shell with xterm.js — so you can run the agent
 * CLIs (agentos claude / codex / hermes) from the browser, even on mobile.
 */
export function TerminalTab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      cursorBlink: true,
      theme: { background: '#0d0f14', foreground: '#e6e8ee', cursor: '#d97757' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try {
      fit.fit();
    } catch {
      /* container not measured yet */
    }
    termRef.current = term;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = auth.get();
    const ws = new WebSocket(
      `${proto}://${location.host}/api/terminal${token ? `?token=${encodeURIComponent(token)}` : ''}`
    );
    wsRef.current = ws;

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    ws.onopen = () => {
      term.focus();
      sendResize();
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'output') term.write(m.data);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => term.write('\r\n\x1b[2m[terminal disconnected]\x1b[0m\r\n');

    term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: d }));
    });

    const onResize = () => {
      try {
        fit.fit();
        sendResize();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);
    // initial fit after layout settles
    const t = setTimeout(onResize, 100);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      term.dispose();
    };
  }, []);

  const run = (cmd: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
    }
    termRef.current?.focus();
  };

  return (
    <div className="terminal-wrap">
      <div className="terminal-toolbar">
        <span className="muted small">Quick launch:</span>
        <button className="ghost-btn small-btn" onClick={() => run('npm run cli claude')}>
          claude
        </button>
        <button className="ghost-btn small-btn" onClick={() => run('npm run cli codex')}>
          codex
        </button>
        <button className="ghost-btn small-btn" onClick={() => run('npm run cli hermes')}>
          hermes
        </button>
        <button className="ghost-btn small-btn" onClick={() => run('clear')}>
          clear
        </button>
        <span className="muted tiny term-hint">runs on the machine hosting the dashboard</span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
