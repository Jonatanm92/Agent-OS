import type Database from 'better-sqlite3';

/**
 * Default settings for the Agent OS dashboard.
 *
 * The dashboard talks to a running Free Claude Code (FCC) proxy over its
 * Anthropic-compatible endpoint, so the defaults below point at FCC rather
 * than directly at any model provider. FCC itself decides which provider /
 * free model the traffic is routed to (configured in the FCC Admin UI).
 */
/**
 * Default settings rows.
 *
 * IMPORTANT: connection settings (fcc_base_url, fcc_auth_token, model) are
 * deliberately NOT seeded here. If we seeded them, a DB row would always exist
 * and would shadow the user's .env (since DB > env in resolveConfig). Leaving
 * them absent lets resolveConfig fall back to env -> built-in default on first
 * run, while values the user saves in the Settings UI still take precedence.
 */
const DEFAULT_SETTINGS: Record<string, string> = {
  // Active project (workspace scoping); blank => default project resolved at boot
  active_project_id: '',
};

export function seedDefaults(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, value);
    }
  });

  transaction();
}

export { DEFAULT_SETTINGS };
