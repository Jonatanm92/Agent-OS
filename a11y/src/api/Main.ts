import { createPlatform } from '../services/Platform.js';
import { startServer } from './Server.js';

const platform = createPlatform();
const handle = await startServer(platform);
console.log(`A11Y Revenue OS console: http://localhost:${handle.port}`);

const shutdown = async () => {
  await handle.close();
  platform.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
