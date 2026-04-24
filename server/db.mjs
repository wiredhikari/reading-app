import pg from 'pg';
import { config } from './config.mjs';

// One Postgres connection pool for the whole process. Created lazily so the
// app still boots when DATABASE_URL is unset (dev mode, or pre-Stage-2 deploys).
//
// Access via `getPool()`. Callers that need the DB should use `hasDatabase()`
// first and gracefully handle the "no DB configured" case — the app's
// Stage 1 behavior must continue to work without a database.

let _pool = null;
let _configured = null;

export function hasDatabase() {
  if (_configured !== null) return _configured;
  _configured = !!config.databaseUrl;
  return _configured;
}

export function getPool() {
  if (!hasDatabase()) {
    throw new Error(
      'Database not configured. Set DATABASE_URL or check hasDatabase() before calling getPool().',
    );
  }
  if (_pool) return _pool;

  // Railway's Postgres requires SSL. Locally (dev), DATABASE_URL usually
  // points at a plaintext localhost instance. Detect by URL; override with
  // PG_SSL=1 / PG_SSL=0 if the heuristic is wrong.
  const explicit = process.env.PG_SSL;
  let ssl;
  if (explicit === '1' || explicit === 'true') ssl = { rejectUnauthorized: false };
  else if (explicit === '0' || explicit === 'false') ssl = false;
  else ssl = config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false };

  _pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl,
    // Small pool — this is a low-traffic app for a handful of friends.
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  _pool.on('error', (err) => {
    console.error('[reading-companion] pg pool error:', err.message);
  });

  return _pool;
}

/** Convenience: run a parameterized query and return the rows. */
export async function query(sql, params) {
  const pool = getPool();
  const res = await pool.query(sql, params);
  return res.rows;
}

/** Convenience: run a query and return the first row, or null. */
export async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Close the pool on shutdown. Safe to call when DB wasn't configured. */
export async function closeDb() {
  if (_pool) {
    try {
      await _pool.end();
    } catch {
      // ignore
    }
    _pool = null;
  }
}
