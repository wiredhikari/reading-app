import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, hasDatabase } from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Boot-time migration runner. Idempotent: tracks applied migrations in a
 * `_migrations` table and only runs new ones. A Postgres advisory lock
 * prevents two instances that boot simultaneously from both trying to run
 * the same DDL.
 *
 * Safe to call when the DB isn't configured — it no-ops and returns false.
 */
export async function runMigrations() {
  if (!hasDatabase()) {
    console.log('[stoa] no DATABASE_URL set — skipping migrations.');
    return false;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Serialize multi-instance startup.
    await client.query('select pg_advisory_lock($1)', [42]);

    await client.query(`
      create table if not exists _migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await client.query('select name from _migrations')).rows.map((r) => r.name),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
      console.log(`[stoa] applying migration: ${name}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into _migrations (name) values ($1)', [name]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
      ran++;
    }

    if (ran > 0) console.log(`[stoa] applied ${ran} migration(s).`);
    else console.log('[stoa] no new migrations.');

    await client.query('select pg_advisory_unlock($1)', [42]);
    return true;
  } finally {
    client.release();
  }
}
