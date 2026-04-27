import express from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { config } from '../config.mjs';
import { hasDatabase, query, queryOne } from '../db.mjs';

export const libraryRouter = express.Router();

// ---- Helpers --------------------------------------------------------------

function currentUserId(req) {
  const raw = req.signedCookies?.rc_user;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Short-circuit: require DB + signed-in user + a configured uploads dir.
// Any of those missing is a 4xx/503 — the UI uses that signal to hide the
// library entirely when the instance isn't set up for it.
function requireLibraryReady(req, res) {
  if (!hasDatabase()) {
    res.status(503).json({ error: 'Persistence not configured on this server.' });
    return null;
  }
  if (!config.uploadsDir) {
    res.status(503).json({ error: 'Library uploads are not enabled on this server.' });
    return null;
  }
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Pick a username first.' });
    return null;
  }
  return userId;
}

const FORMAT_BY_EXT = {
  '.pdf': 'pdf',
  '.epub': 'epub',
};

function formatFromName(name) {
  const ext = extname((name || '').toLowerCase());
  return FORMAT_BY_EXT[ext] ?? null;
}

// Ensure the uploads dir exists *before* multer tries to write into it.
// Called lazily so the server can boot even if the volume mount is slow.
let ensuredUploadsDir = false;
async function ensureUploadsDir() {
  if (ensuredUploadsDir) return;
  await mkdir(config.uploadsDir, { recursive: true });
  ensuredUploadsDir = true;
}

// ---- Multer ---------------------------------------------------------------
//
// We write to a temp name first, hash the bytes off disk, then rename to the
// canonical `<hash>` filename. Doing it this way (vs. memory storage) avoids
// buffering 100MB files in RAM.

const upload = multer({
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await ensureUploadsDir();
        cb(null, config.uploadsDir);
      } catch (err) {
        cb(err, config.uploadsDir);
      }
    },
    filename: (_req, _file, cb) => {
      // Random name; we rename to <hash> after hashing. Extension doesn't
      // matter on disk — we always stream with the right Content-Type.
      const tmp = `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      cb(null, tmp);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const fmt = formatFromName(file.originalname);
    if (!fmt) {
      cb(new Error('Only .pdf and .epub are accepted.'));
      return;
    }
    cb(null, true);
  },
});

async function sha256OfFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * POST /api/library
 *
 * Multipart form upload. Field name: "file". Optional "title" / "author".
 * Idempotent by content hash — re-uploading the same bytes is a no-op and
 * returns the existing row.
 */
libraryRouter.post('/library', (req, res, next) => {
  const userId = requireLibraryReady(req, res);
  if (!userId) return;
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: err.message || 'Upload failed.' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }

    const format = formatFromName(file.originalname);
    if (!format) {
      // fileFilter should have rejected, but belt-and-suspenders.
      await unlink(file.path).catch(() => {});
      res.status(400).json({ error: 'Only .pdf and .epub are accepted.' });
      return;
    }

    try {
      const hash = await sha256OfFile(file.path);
      const canonical = join(config.uploadsDir, hash);

      // If we already have this hash, keep the existing file, drop the temp.
      // Otherwise rename the temp into place.
      const existing = await queryOne(
        'select id, file_name, format, title, author, size_bytes, uploaded_at from library_files where file_hash = $1',
        [hash],
      );

      if (existing) {
        await unlink(file.path).catch(() => {});
        res.json({ library: existing, duplicate: true });
        return;
      }

      try {
        // Rename may fail if two uploads of the same hash race; that's fine —
        // whoever lost the race still gets the existing row on the next try.
        await rename(file.path, canonical);
      } catch (renameErr) {
        // If the canonical exists already (EEXIST or similar), drop temp and
        // fall through to insert-or-select.
        await unlink(file.path).catch(() => {});
        // Don't propagate — the next step will handle it.
        void renameErr;
      }

      const sizeBytes = Number(file.size) || 0;
      const rawName = basename(file.originalname || 'book') || 'book';
      const fileName = rawName.length > 500 ? rawName.slice(0, 500) : rawName;
      const title =
        typeof req.body?.title === 'string' && req.body.title.trim()
          ? req.body.title.trim().slice(0, 500)
          : null;
      const author =
        typeof req.body?.author === 'string' && req.body.author.trim()
          ? req.body.author.trim().slice(0, 500)
          : null;

      const row = await queryOne(
        `insert into library_files (file_hash, file_name, format, size_bytes, title, author, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (file_hash) do update
           set file_name = excluded.file_name
         returning id, file_hash, file_name, format, size_bytes, title, author, uploaded_by, uploaded_at`,
        [hash, fileName, format, sizeBytes, title, author, userId],
      );
      res.status(201).json({ library: row, duplicate: false });
    } catch (handlerErr) {
      console.error('[library] upload error:', handlerErr);
      // Best-effort cleanup if the temp file is still there.
      if (file?.path) await unlink(file.path).catch(() => {});
      res.status(500).json({ error: 'upload failed' });
    }
  });
});

/**
 * GET /api/library
 *
 * Lists every library file uploaded to this instance (shared across friends).
 * Ordered newest first.
 */
libraryRouter.get('/library', async (req, res) => {
  const userId = requireLibraryReady(req, res);
  if (!userId) return;
  try {
    // Join the user's per-user books row + reading_progress so the client can
    // show "where I left off" alongside each library entry — single source
    // of truth for the landing screen.
    const rows = await query(
      `select lf.id, lf.file_hash, lf.file_name, lf.format, lf.size_bytes,
              lf.title, lf.author, lf.uploaded_at, lf.uploaded_by,
              u.username as uploaded_by_username,
              b.id as my_book_id, b.last_opened_at as my_last_opened_at,
              rp.location as my_last_location
         from library_files lf
         left join users u on u.id = lf.uploaded_by
         left join books b on b.file_hash = lf.file_hash and b.user_id = $1
         left join reading_progress rp on rp.book_id = b.id
        order by coalesce(b.last_opened_at, lf.uploaded_at) desc
        limit 200`,
      [userId],
    );
    res.json({ library: rows });
  } catch (err) {
    console.error('[library] GET error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * GET /api/library/:id/file
 *
 * Stream the file bytes. Only accessible to signed-in users (the gate
 * middleware already blocks unauthenticated callers). We stream via
 * createReadStream so a 100MB EPUB doesn't land in Node's heap.
 */
libraryRouter.get('/library/:id/file', async (req, res) => {
  const userId = requireLibraryReady(req, res);
  if (!userId) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  try {
    const row = await queryOne(
      'select file_hash, file_name, format, size_bytes from library_files where id = $1',
      [id],
    );
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    // Defense-in-depth: make sure the resolved path is still inside
    // uploadsDir. The hash is validated by a CHECK on the DB column in
    // practice (hex-only, regex at write time) but we re-check here.
    const base = resolve(config.uploadsDir);
    const full = resolve(join(base, row.file_hash));
    if (!full.startsWith(base + '/') && full !== base) {
      res.status(400).json({ error: 'bad path' });
      return;
    }

    const stats = await stat(full).catch(() => null);
    if (!stats || !stats.isFile()) {
      res.status(410).json({ error: 'file missing on disk' });
      return;
    }

    const contentType =
      row.format === 'pdf' ? 'application/pdf' : 'application/epub+zip';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(stats.size));
    // Content-Disposition with the original name so "Save as…" does the
    // right thing; inline so the browser won't force a download.
    const safeName = row.file_name.replace(/"/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    // Library files are immutable keyed by hash — cache aggressively on
    // the client. The gate cookie still controls access.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    createReadStream(full).on('error', (err) => {
      console.error('[library] stream error:', err.message);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    }).pipe(res);
  } catch (err) {
    console.error('[library] GET file error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

/**
 * DELETE /api/library/:id
 *
 * Only the original uploader (or any signed-in user when the uploader has
 * been deleted via ON DELETE SET NULL) can remove a library file. Removes
 * the DB row and best-effort-unlinks the on-disk blob.
 */
libraryRouter.delete('/library/:id', async (req, res) => {
  const userId = requireLibraryReady(req, res);
  if (!userId) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  try {
    const row = await queryOne(
      'select file_hash, uploaded_by from library_files where id = $1',
      [id],
    );
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (row.uploaded_by != null && row.uploaded_by !== userId) {
      res.status(403).json({ error: 'only the uploader can remove this file' });
      return;
    }
    await query('delete from library_files where id = $1', [id]);
    // Only unlink if no other row still references the hash (uniqueness
    // should guarantee one-to-one, but we ran deletes concurrently here).
    const stillReferenced = await queryOne(
      'select 1 from library_files where file_hash = $1',
      [row.file_hash],
    );
    if (!stillReferenced) {
      const full = join(config.uploadsDir, row.file_hash);
      await unlink(full).catch(() => {});
    }
    res.status(204).end();
  } catch (err) {
    console.error('[library] DELETE error:', err);
    res.status(500).json({ error: 'database error' });
  }
});
