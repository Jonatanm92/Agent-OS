import { loadConfig, type PlatformConfig } from '../core/Config.js';
import { createLogger, type Logger } from '../core/Logger.js';
import { openDatabase, type Db } from '../db/Database.js';
import { Store } from '../db/Store.js';
import { AuditStore } from '../db/AuditStore.js';
import { LocalFileStorage, type ObjectStorage } from '../evidence/Storage.js';
import { loadIcpConfig, type IcpConfig } from '../scoring/IcpScoring.js';

/** Everything a service needs, wired once. Keeps constructors honest. */
export interface Platform {
  config: PlatformConfig;
  db: Db;
  store: Store;
  audits: AuditStore;
  storage: ObjectStorage;
  icp: IcpConfig;
  logger: Logger;
  close(): void;
}

export function createPlatform(options: { config?: Partial<PlatformConfig>; dbFile?: string; icpConfigPath?: string } = {}): Platform {
  const config = loadConfig(options.config);
  const db = openDatabase({ dataDir: config.dataDir, filename: options.dbFile });
  return {
    config,
    db,
    store: new Store(db),
    audits: new AuditStore(db),
    storage: new LocalFileStorage(config.dataDir),
    icp: loadIcpConfig(options.icpConfigPath ?? process.env.A11Y_ICP_CONFIG),
    logger: createLogger('a11y'),
    close: () => db.close(),
  };
}
