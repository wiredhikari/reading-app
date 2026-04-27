import { config, warnIfMissingKey, checkAuthConfig } from './config.mjs';
import { createApp } from './app.mjs';
import { runMigrations } from './migrate.mjs';
import { closeDb, hasDatabase } from './db.mjs';

// Don't let an out-of-band rejection (e.g. an aborted SDK request) kill the process.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('aborted') || msg.includes('Aborted')) return;
  console.error('[unhandledRejection]', reason);
});

warnIfMissingKey();
checkAuthConfig();

// Run migrations BEFORE we start serving. If the DB is unreachable and we're
// in production, fail fast — the Railway build should crash loudly rather
// than serve a half-broken app that swallows every persistence call.
try {
  await runMigrations();
} catch (err) {
  console.error('[stoa] migration failed:', err);
  if (config.isProduction && hasDatabase()) {
    console.error('  Refusing to start in production with an unusable DB.');
    process.exit(1);
  }
  console.warn('  Continuing in non-production with migrations unapplied.');
}

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[stoa] api listening on http://localhost:${config.port}`);
  console.log(`[stoa] env=${config.nodeEnv}  model=${config.model}`);
  console.log(`[stoa] persistence=${hasDatabase() ? 'postgres' : 'disabled'}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[stoa] received ${signal}, shutting down…`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  // Force-quit if it takes too long
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
