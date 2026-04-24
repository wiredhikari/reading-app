import { config, warnIfMissingKey } from './config.mjs';
import { createApp } from './app.mjs';

// Don't let an out-of-band rejection (e.g. an aborted SDK request) kill the process.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('aborted') || msg.includes('Aborted')) return;
  console.error('[unhandledRejection]', reason);
});

warnIfMissingKey();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[reading-companion] api listening on http://localhost:${config.port}`);
  console.log(`[reading-companion] env=${config.nodeEnv}  model=${config.model}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[reading-companion] received ${signal}, shutting down…`);
  server.close(() => process.exit(0));
  // Force-quit if it takes too long
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
