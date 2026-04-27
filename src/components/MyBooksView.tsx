import { useEffect, useRef, useState } from 'react';
import {
  fetchLibraryFile,
  listBooks,
  type LibraryBook,
} from '../lib/persistence';

interface Props {
  /** Open a book the parent will then mount in the reader. */
  onOpen: (args: { name: string; format: 'pdf' | 'epub'; buffer: ArrayBuffer }) => void;
}

/**
 * "My books" — the user's recently-opened books, with reading progress.
 *
 * Each row is a metadata record (file_hash + file_name + last_location). Two
 * cases when the user clicks Open:
 *   - The book is also in the shared library (library_id set) → fetch bytes
 *     from the server and open in one click.
 *   - The book is local-only → we can't re-open it without the file. We show
 *     a "Pick file" affordance that opens a file picker and verifies the
 *     hash matches before loading. (Without that check we'd be loading some
 *     other book under this row's progress, which would corrupt state.)
 */
export default function MyBooksView({ onOpen }: Props) {
  const [items, setItems] = useState<LibraryBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [pickingFor, setPickingFor] = useState<LibraryBook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError(null);
    try {
      const { books } = await listBooks();
      setItems(books);
    } catch (err) {
      console.warn('[mybooks] list failed:', err);
      setError('Couldn’t load your books.');
      setItems([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openFromLibrary(row: LibraryBook) {
    if (row.library_id == null) return;
    setOpeningId(row.id);
    setError(null);
    try {
      const buffer = await fetchLibraryFile(row.library_id);
      onOpen({ name: row.file_name, format: row.format, buffer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setOpeningId(null);
    }
  }

  function startLocalPick(row: LibraryBook) {
    setPickingFor(row);
    setError(null);
    fileInputRef.current?.click();
  }

  async function onPickedFile(file: File) {
    const target = pickingFor;
    setPickingFor(null);
    if (!target) return;
    try {
      const buffer = await file.arrayBuffer();
      // Verify hash so we don't load random bytes under the wrong row.
      const { sha256Hex } = await import('../lib/hashFile');
      const got = await sha256Hex(buffer);
      if (got !== target.file_hash) {
        setError('That file doesn’t match this book — different hash.');
        return;
      }
      onOpen({ name: target.file_name, format: target.format, buffer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  if (items !== null && items.length === 0) {
    // Empty state collapses entirely — the landing screen still has FileDrop
    // and the shared library, so there's nothing to add here for new users.
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-md px-4 pb-6">
      <div className="flex items-baseline justify-between pb-3">
        <h2 className="font-display text-lg text-[var(--color-ink)]">My books</h2>
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
          recently opened
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-xs text-[var(--color-muted)]">Loading your books…</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((row) => {
            const inLibrary = row.library_id != null;
            const opening = openingId === row.id;
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-2"
              >
                <FormatBadge format={row.format} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--color-ink)]">
                    {row.title || row.file_name}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-muted)]">
                    {row.author ? `${row.author} · ` : ''}
                    {row.last_location ? `at ${row.last_location} · ` : ''}
                    {formatRelativeTime(row.last_opened_at)}
                  </div>
                </div>
                {inLibrary ? (
                  <button
                    onClick={() => openFromLibrary(row)}
                    disabled={opening}
                    className="rounded-full bg-[var(--color-ink)] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-paper)] transition-opacity disabled:opacity-60"
                  >
                    {opening ? 'Opening…' : 'Open'}
                  </button>
                ) : (
                  <button
                    onClick={() => startLocalPick(row)}
                    title="This book lives only on your machine. Pick the file again to resume."
                    className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                  >
                    Re-open
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickedFile(f);
          e.target.value = '';
        }}
      />
    </section>
  );
}

function FormatBadge({ format }: { format: 'pdf' | 'epub' }) {
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--color-rule)] bg-[var(--color-paper)] text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]"
      aria-hidden
    >
      {format}
    </span>
  );
}

/**
 * Tiny relative-time formatter — "5m ago", "yesterday", "Mar 12". Avoids
 * pulling in a date library for one-off use. We render absolute date once
 * a row is older than a week since the relative form starts losing signal.
 */
function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
