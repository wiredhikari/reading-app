// Shared helpers for the gated API routers. Anything that needs to look up
// the current signed-in user, or that has shared input-validation primitives,
// lives here so the per-concern route files (books, notes, chat history,
// library) stay focused on their own logic.

import { hasDatabase, queryOne } from '../db.mjs';

/** Pull the numeric user id from the signed rc_user cookie, or null. */
export function currentUserId(req) {
  const raw = req.signedCookies?.rc_user;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Require both a configured DB and a signed-in user. Returns the user id on
 * success, or writes a 401/503 response and returns null. Each route should:
 *
 *   const userId = requireUser(req, res);
 *   if (!userId) return;
 *
 * The 503 path is what lets the client gracefully degrade to Stage-1 mode
 * when DATABASE_URL isn't set.
 */
export function requireUser(req, res) {
  if (!hasDatabase()) {
    res.status(503).json({ error: 'Persistence not configured on this server.' });
    return null;
  }
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Pick a username first.' });
    return null;
  }
  return userId;
}

/** Trim and length-cap a string from req.body. Returns null on failure. */
export function sanitizeString(v, max = 500) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

/** Parse and validate a positive numeric path param (e.g. :id). */
export function parsePositiveId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Confirm a books row belongs to a given user. Cheap ownership check. */
export async function bookBelongsToUser(bookId, userId) {
  const owned = await queryOne(
    'select id from books where id = $1 and user_id = $2',
    [bookId, userId],
  );
  return !!owned;
}
