import express from 'express';
import { hasDatabase, query, queryOne } from '../db.mjs';

export const booksRouter = express.Router();

// Pull the current user from the signed rc_user cookie. Returns the numeric
// id or null. This mirrors what `/api/me` does so the two endpoints agree.
function currentUserId(req) {
  const raw = req.signedCookies?.rc_user;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Everything here needs a DB and a user. Short-circuit both.
function requireUser(req, res) {
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

const HASH_RE = /^[a-f0-9]{64}$/; // SHA-256 hex
const FORMAT_RE = /^(pdf|epub)$/;

function sanitizeString(v, max = 500) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

/**
 * POST /api/books
 *
 * Body: { fileHash, fileName, format, title?, author? }
 *
 * Idempotent: if (user_id, file_hash) already exists, updates last_opened_at
 * and returns the existing bookId + prior location. Otherwise inserts.
 *
 * Response: { bookId, lastLocation }  — lastLocation may be null.
 */
booksRouter.post('/books', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const fileHash = sanitizeString(req.body?.fileHash, 64);
  const fileName = sanitizeString(req.body?.fileName, 500);
  const formatRaw = sanitizeString(req.body?.format, 10);
  if (!fileHash || !HASH_RE.test(fileHash)) {
    res.status(400).json({ error: 'fileHash must be a 64-char sha256 hex.' });
    return;
  }
  if (!fileName) {
    res.status(400).json({ error: 'fileName is required.' });
    return;
  }
  if (!formatRaw || !FORMAT_RE.test(formatRaw)) {
    res.status(400).json({ error: 'format must be "pdf" or "epub".' });
    return;
  }
  const title = sanitizeString(req.body?.title, 500);
  const author = sanitizeString(req.body?.author, 500);

  try {
    const row = await queryOne(
      `insert into books (user_id, file_hash, file_name, format, title, author)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, file_hash) do update
         set last_opened_at = now(),
             file_name = excluded.file_name,
             title = coalesce(excluded.title, books.title),
             author = coalesce(excluded.author, books.author)
       returning id`,
      [userId, fileHash, fileName, formatRaw, title, author],
    );
    const progress = await queryOne(
      'select location from reading_progress where book_id = $1',
      [row.id],
    );
    res.json({ bookId: row.id, lastLocation: progress?.location ?? null });
  } catch (err) {
    console.error('[books] POST error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * PUT /api/books/:id/progress  { location }
 *
 * Ownership check first — a user can only update their own books' progress.
 * The 404 on unowned IDs is intentional: don't leak that the book exists.
 */
booksRouter.put('/books/:id/progress', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = Number(req.params.id);
  if (!Number.isFinite(bookId) || bookId <= 0) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }
  const location = sanitizeString(req.body?.location, 2000);
  if (!location) {
    res.status(400).json({ error: 'location is required (non-empty string).' });
    return;
  }

  try {
    const owned = await queryOne(
      'select id from books where id = $1 and user_id = $2',
      [bookId, userId],
    );
    if (!owned) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    await query(
      `insert into reading_progress (book_id, location, updated_at)
       values ($1, $2, now())
       on conflict (book_id) do update
         set location = excluded.location,
             updated_at = now()`,
      [bookId, location],
    );
    res.status(204).end();
  } catch (err) {
    console.error('[books] PUT progress error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ---- Chat history ---------------------------------------------------------

// Hard cap on how many chat rows we return / accept. Token budget, not row
// count, is the real constraint, but a message cap keeps the UX predictable
// and gives a cheap defense against runaway inserts.
const CHAT_HISTORY_LIMIT = 40;
const CHAT_CONTENT_MAX = 16_000; // ~4k tokens; mirrors chatLimits.maxMessageChars intent

const ALLOWED_CHAT_ROLES = new Set(['user', 'assistant']);

async function assertBookOwned(bookId, userId) {
  const owned = await queryOne(
    'select id from books where id = $1 and user_id = $2',
    [bookId, userId],
  );
  return !!owned;
}

/**
 * GET /api/books/:id/chat
 *
 * Returns the saved chat history for a book, oldest first. Capped at the
 * most recent CHAT_HISTORY_LIMIT rows — we pull the tail then reverse so
 * the client receives them in send order.
 */
booksRouter.get('/books/:id/chat', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = Number(req.params.id);
  if (!Number.isFinite(bookId) || bookId <= 0) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  try {
    if (!(await assertBookOwned(bookId, userId))) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    const rows = await query(
      `select id, role, content, created_at
         from chat_messages
        where book_id = $1
        order by id desc
        limit $2`,
      [bookId, CHAT_HISTORY_LIMIT],
    );
    // Return oldest-first so the client can drop them straight into state.
    res.json({ messages: rows.reverse() });
  } catch (err) {
    console.error('[books] GET chat error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * POST /api/books/:id/chat-message  { role, content }
 *
 * Append a single message to a book's chat log. Called twice per turn:
 * once when the user submits, once when the assistant stream completes.
 * The server is intentionally oblivious to the stream itself — keeping
 * streaming and persistence on separate paths means either can fail without
 * corrupting the other.
 */
booksRouter.post('/books/:id/chat-message', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = Number(req.params.id);
  if (!Number.isFinite(bookId) || bookId <= 0) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  const role = typeof req.body?.role === 'string' ? req.body.role : '';
  if (!ALLOWED_CHAT_ROLES.has(role)) {
    res.status(400).json({ error: 'role must be "user" or "assistant".' });
    return;
  }
  const content = sanitizeString(req.body?.content, CHAT_CONTENT_MAX);
  if (!content) {
    res.status(400).json({ error: 'content must be a non-empty string.' });
    return;
  }

  try {
    if (!(await assertBookOwned(bookId, userId))) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    const row = await queryOne(
      `insert into chat_messages (book_id, role, content)
       values ($1, $2, $3)
       returning id, created_at`,
      [bookId, role, content],
    );
    res.status(201).json({ id: row.id, created_at: row.created_at });
  } catch (err) {
    console.error('[books] POST chat-message error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * DELETE /api/books/:id/chat
 *
 * Clears a book's chat history. Useful when a reader wants to start fresh.
 */
booksRouter.delete('/books/:id/chat', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = Number(req.params.id);
  if (!Number.isFinite(bookId) || bookId <= 0) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  try {
    if (!(await assertBookOwned(bookId, userId))) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    await query('delete from chat_messages where book_id = $1', [bookId]);
    res.status(204).end();
  } catch (err) {
    console.error('[books] DELETE chat error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * GET /api/books
 *
 * Returns the user's books ordered by last_opened_at desc. Useful for a
 * future "Recently opened" list on the landing screen.
 */
booksRouter.get('/books', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    // Left-join with library_files so the client knows whether the book is
    // also available on the server (and can be re-opened in one click) vs.
    // only existing locally (which means the user must re-pick it).
    const rows = await query(
      `select b.id, b.file_hash, b.file_name, b.title, b.author, b.format,
              b.last_opened_at, rp.location as last_location,
              lf.id as library_id
       from books b
       left join reading_progress rp on rp.book_id = b.id
       left join library_files lf on lf.file_hash = b.file_hash
       where b.user_id = $1
       order by b.last_opened_at desc
       limit 50`,
      [userId],
    );
    res.json({ books: rows });
  } catch (err) {
    console.error('[books] GET error:', err);
    res.status(500).json({ error: 'database error' });
  }
});
