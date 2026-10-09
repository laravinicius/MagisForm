import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = await buildApp({ config });
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }); });
}
