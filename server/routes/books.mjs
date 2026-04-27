import express from 'express';
import { query, queryOne } from '../db.mjs';
import {
  parsePositiveId,
  requireUser,
  sanitizeString,
} from './_helpers.mjs';

export const booksRouter = express.Router();

const HASH_RE = /^[a-f0-9]{64}$/; // SHA-256 hex
const FORMAT_RE = /^(pdf|epub)$/;

/**
 * POST /api/books
 *
 * Body: { fileHash, fileName, format, title?, author? }
 *
 * Idempotent: if (user_id, file_hash) already exists, updates last_opened_at
 * and returns the existing bookId + prior location. Otherwise inserts.
 *
 * Response: { bookId, lastLocation } — lastLocation may be null.
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
    console.error('[stoa] POST books error:', err);
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

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
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
    console.error('[stoa] PUT progress error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * GET /api/books
 *
 * Lists the user's per-user book records, joined with the shared library so
 * the client knows which ones can be re-opened from the server in one click
 * vs. needing the user to re-pick the file.
 */
booksRouter.get('/books', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
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
    console.error('[stoa] GET books error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * DELETE /api/books/:id
 *
 * Removes a per-user book record (and via cascade: progress, chat, notes).
 * Does NOT delete the underlying library_files row — that's separate scope
 * (DELETE /api/library/:id, uploader-only).
 */
booksRouter.delete('/books/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
    res.status(400).json({ error: 'invalid book id' });
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
    await query('delete from books where id = $1', [bookId]);
    res.status(204).end();
  } catch (err) {
    console.error('[stoa] DELETE books error:', err);
    res.status(500).json({ error: 'database error' });
  }
});
