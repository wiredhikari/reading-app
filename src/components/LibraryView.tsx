import { useEffect, useRef, useState } from 'react';
import {
  deleteFromLibrary,
  fetchLibraryFile,
  listLibrary,
  uploadToLibrary,
  type LibraryFile,
} from '../lib/persistence';
import NotesEditor from './NotesEditor';
import { formatSize } from '../lib/format';

interface Props {
  /** Signed-in user id — used to show the "delete" action on your own uploads. */
  currentUserId?: number;
  /** Called when a user picks a book from the library. */
  onOpen: (args: {
    name: string;
    format: 'pdf' | 'epub';
    buffer: ArrayBuffer;
  }) => void;
}

/**
 * Shared library panel. Shows every book uploaded to this instance and lets
 * the signed-in user add a new one. Selecting a row fetches the bytes and
 * hands them to the parent, which drives the normal reader open flow.
 *
 * Intentionally thin — the library is an optional Stage-4 surface; if the
 * server isn't configured for uploads, the parent just doesn't render us.
 */
export default function LibraryView({ currentUserId, onOpen }: Props) {
  const [items, setItems] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [notesFor, setNotesFor] = useState<LibraryFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError(null);
    try {
      const rows = await listLibrary();
      setItems(rows);
    } catch (err) {
      console.warn('[library] list failed:', err);
      setError('Couldn’t load the library.');
      setItems([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleUpload(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.epub')) {
      setError('Only .pdf and .epub files can be uploaded.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { library } = await uploadToLibrary(file);
      // Optimistically open what we just uploaded — common flow is
      // "add this book, then read it".
      await openRow(library);
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function openRow(row: LibraryFile) {
    setOpeningId(row.id);
    setError(null);
    try {
      const buffer = await fetchLibraryFile(row.id);
      onOpen({ name: row.file_name, format: row.format, buffer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(row: LibraryFile) {
    if (!window.confirm(`Remove "${row.file_name}" from the shared library?`))
      return;
    try {
      await deleteFromLibrary(row.id);
      setItems((prev) => prev?.filter((r) => r.id !== row.id) ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md px-3 pb-6 pt-4 sm:px-4 sm:pb-10">
      <div className="flex items-baseline justify-between pb-2 sm:pb-3">
        <h2 className="font-display text-base text-[var(--color-ink)] sm:text-lg">
          Your library
        </h2>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {busy ? 'Uploading…' : '+ Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-xs text-[var(--color-muted)]">Loading library…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-rule)] px-4 py-6 text-center text-xs text-[var(--color-muted)]">
          Nothing shared yet. Upload a book and anyone with the password can read it.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((row) => {
            const isMine = currentUserId != null && currentUserId === row.uploaded_by;
            const opening = openingId === row.id;
            return (
              <li
                key={row.id}
                className="group flex items-center gap-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-2"
              >
                <FormatBadge format={row.format} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--color-ink)]">
                    {row.title || row.file_name}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-muted)]">
                    {row.author ? `${row.author} · ` : ''}
                    {row.my_last_location
                      ? `at ${row.my_last_location} · `
                      : ''}
                    {formatSize(row.size_bytes)}
                  </div>
                </div>
                <button
                  onClick={() => openRow(row)}
                  disabled={opening}
                  className="rounded-full bg-[var(--color-ink)] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-paper)] transition-opacity disabled:opacity-60"
                >
                  {opening ? 'Opening…' : 'Open'}
                </button>
                <button
                  onClick={() => setNotesFor(row)}
                  title="Open notes for this book"
                  aria-label="Open notes for this book"
                  className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                >
                  Notes
                </button>
                {isMine && (
                  <button
                    onClick={() => handleDelete(row)}
                    title="Remove from library"
                    aria-label="Remove from library"
                    className="rounded-full px-2 py-1 text-base text-[var(--color-muted)] transition-colors hover:text-[var(--color-danger)]"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notesFor && (
        <NotesEditor
          fileHash={notesFor.file_hash}
          fileName={notesFor.file_name}
          format={notesFor.format}
          title={notesFor.title ?? undefined}
          displayTitle={notesFor.title || notesFor.file_name}
          onClose={() => setNotesFor(null)}
        />
      )}
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

// formatSize lives in src/lib/format.ts now — shared with other lists.
