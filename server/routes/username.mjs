import express from 'express';
import { config } from '../config.mjs';
import { hasDatabase, queryOne } from '../db.mjs';

export const usernameRouter = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function userCookieOptions() {
  return {
    signed: true,
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: config.userCookieMaxAgeMs,
    path: '/',
  };
}

/**
 * GET /api/me
 *
 * Returns the current user if their rc_user cookie is valid and the user
 * still exists in the DB. Never 401s — a missing user is a normal state that
 * the frontend handles with the username picker.
 *
 * When the DB isn't configured, returns { persistence: false } so the
 * frontend can skip the whole username dance.
 */
usernameRouter.get('/me', async (req, res) => {
  // `library` mirrors the persistence flag but for the Stage-4 shared library —
  // the frontend uses it to decide whether to show the Library view at all.
  const libraryEnabled = !!config.uploadsDir && hasDatabase();
  if (!hasDatabase()) {
    res.json({ persistence: false, library: false, user: null });
    return;
  }
  try {
    const id = req.signedCookies?.rc_user;
    if (id) {
      const row = await queryOne(
        'select id, username from users where id = $1',
        [Number(id)],
      );
      if (row) {
        res.json({ persistence: true, library: libraryEnabled, user: row });
        return;
      }
      // Cookie pointed at a deleted user — fall through to the auto-mint path.
    }
    // No (or stale) cookie. Single-user mode: behind the shared password we
    // treat every visitor as the same person, so we auto-mint or reuse a
    // default user instead of asking them to pick a handle. The first user
    // in the table wins; if the table is empty we create "owner".
    const existing = await queryOne(
      'select id, username from users order by id asc limit 1',
    );
    let user = existing;
    if (!user) {
      user = await queryOne(
        `insert into users (username) values ($1)
         on conflict (username) do nothing
         returning id, username`,
        ['owner'],
      );
      // Race: another request may have just inserted. Re-select.
      if (!user) {
        user = await queryOne(
          'select id, username from users where username = $1',
          ['owner'],
        );
      }
    }
    if (!user) {
      res.status(500).json({ error: 'failed to mint default user' });
      return;
    }
    res.cookie('rc_user', String(user.id), userCookieOptions());
    res.json({ persistence: true, library: libraryEnabled, user });
  } catch (err) {
    console.error('[username] /me error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * POST /api/username  { username }
 *
 * Upserts the user by username (first write wins; subsequent callers with
 * the same handle get the same row). Sets the signed rc_user cookie.
 *
 * Failure modes:
 *   - invalid format → 400
 *   - DB disabled    → 503 (shouldn't happen; frontend should check /me first)
 */
usernameRouter.post('/username', async (req, res) => {
  if (!hasDatabase()) {
    res.status(503).json({ error: 'Persistence not configured on this server.' });
    return;
  }
  const username = (req.body?.username ?? '').toString().trim();
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({
      error: 'Username must be 3–20 characters, letters / digits / underscore only.',
    });
    return;
  }
  try {
    // Upsert-return idiom: insert on conflict do nothing, then select. This
    // gives us the existing row even when another friend already claimed
    // this username — sharing handles is fine for v1.
    await queryOne(
      `insert into users (username) values ($1)
       on conflict (username) do nothing`,
      [username],
    );
    const row = await queryOne('select id, username from users where username = $1', [username]);
    if (!row) {
      res.status(500).json({ error: 'Failed to resolve user after upsert.' });
      return;
    }
    res.cookie('rc_user', String(row.id), userCookieOptions());
    res.json({ user: row });
  } catch (err) {
    console.error('[username] POST error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/** POST /api/logout-user — clears rc_user but leaves the gate cookie. */
usernameRouter.post('/logout-user', (_req, res) => {
  res.clearCookie('rc_user', { path: '/' });
  res.status(204).end();
});
