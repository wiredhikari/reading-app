import express from 'express';
import { query, queryOne } from '../db.mjs';
import {
  bookBelongsToUser,
  parsePositiveId,
  requireUser,
  sanitizeString,
} from './_helpers.mjs';

export const chatHistoryRouter = express.Router();

// Hard cap on how many chat rows we return / accept. Token budget, not row
// count, is the real constraint, but a message cap keeps the UX predictable
// and gives a cheap defense against runaway inserts.
const CHAT_HISTORY_LIMIT = 40;
const CHAT_CONTENT_MAX = 16_000; // ~4k tokens; mirrors chatLimits.maxMessageChars intent
const ALLOWED_CHAT_ROLES = new Set(['user', 'assistant']);

/**
 * GET /api/books/:id/chat
 *
 * Returns the saved chat history for a book, oldest first. Capped at the
 * most recent CHAT_HISTORY_LIMIT rows — we pull the tail then reverse so
 * the client receives them in send order.
 */
chatHistoryRouter.get('/books/:id/chat', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  try {
    if (!(await bookBelongsToUser(bookId, userId))) {
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
    console.error('[stoa] GET chat error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * POST /api/books/:id/chat-message  { role, content }
 *
 * Append a single message to a book's chat log. Called twice per turn:
 * once when the user submits, once when the assistant stream completes.
 * The streaming and persistence paths are intentionally separate — either
 * can fail without corrupting the other.
 */
chatHistoryRouter.post('/books/:id/chat-message', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
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
    if (!(await bookBelongsToUser(bookId, userId))) {
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
    console.error('[stoa] POST chat-message error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/** DELETE /api/books/:id/chat — clears a book's chat history. */
chatHistoryRouter.delete('/books/:id/chat', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const bookId = parsePositiveId(req.params.id);
  if (!bookId) {
    res.status(400).json({ error: 'invalid book id' });
    return;
  }

  try {
    if (!(await bookBelongsToUser(bookId, userId))) {
      res.status(404).json({ error: 'book not found' });
      return;
    }
    await query('delete from chat_messages where book_id = $1', [bookId]);
    res.status(204).end();
  } catch (err) {
    console.error('[stoa] DELETE chat error:', err);
    res.status(500).json({ error: 'database error' });
  }
});
