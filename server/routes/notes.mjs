import express from 'express';
import { query, queryOne } from '../db.mjs';
import { parsePositiveId, requireUser, sanitizeString } from './_helpers.mjs';

export const notesRouter = express.Router();

const NOTES_MAX = 200_000; // ~50 pages of writing — generous

/**
 * GET /api/books/:id/notes
 *
 * Returns the per-book notes blob. Notes are stored as a single TEXT column
 * on the per-user `books` row, not as a separate table — multi-highlight
 * (annotations tied to passages) is a future story.
 */
notesRouter.get('/books/:id/notes', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  try {
    const row = await queryOne(
      `select notes, notes_updated_at
         from books
        where id = $1 and user_id = $2`,
      [bookId, userId],
    );
    if (!row) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    res.json({ notes: row.notes ?? '', updatedAt: row.notes_updated_at });
  } catch (err) {
    console.error('[stoa] GET notes error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * PUT /api/books/:id/notes  { notes }
 *
 * Replaces the notes blob entirely. Accepts the empty string so callers can
 * use one endpoint for both save and clear.
 */
notesRouter.put('/books/:id/notes', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  const raw = req.body?.notes;
  if (typeof raw !== 'string') {
    res.status(400).json({ error: 'notes must be a string' });
    return;
  }
  if (raw.length > NOTES_MAX) {
    res.status(413).json({ error: `notes exceeds ${NOTES_MAX} chars` });
    return;
  }

  try {
    const updated = await queryOne(
      `update books
         set notes = $1, notes_updated_at = now()
       where id = $2 and user_id = $3
       returning notes_updated_at`,
      [raw, bookId, userId],
    );
    if (!updated) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    res.json({ updatedAt: updated.notes_updated_at });
  } catch (err) {
    console.error('[stoa] PUT notes error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// Re-export helpers consumers might need for testing.
export { NOTES_MAX };
// query is used inside the route handlers; the import is here to keep
// transient symbol references explicit when the file is read in isolation.
void query;
