export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  return LEVELS[(process.env.A11Y_LOG_LEVEL as LogLevel) ?? 'info'] ?? 20;
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope = 'a11y'): Logger {
  const emit = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (LEVELS[level] < threshold()) return;
    const suffix = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${scope} ${msg}${suffix}`;
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, e) => emit('debug', m, e),
    info: (m, e) => emit('info', m, e),
    warn: (m, e) => emit('warn', m, e),
    error: (m, e) => emit('error', m, e),
    child: (child) => createLogger(`${scope}:${child}`),
  };
}
