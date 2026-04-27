import { useEffect, useRef, useState } from 'react';
import {
  getNotes,
  saveNotes as saveNotesApi,
  upsertBook,
} from '../lib/persistence';
import { formatClock } from '../lib/format';

interface Props {
  /** Identifies the book whose notes we're editing. */
  fileHash: string;
  fileName: string;
  format: 'pdf' | 'epub';
  title?: string;
  /** Pretty label shown in the header. */
  displayTitle: string;
  onClose: () => void;
}

/**
 * Modal notes editor. Resolves the per-user `books` row for a given file
 * hash (creating one via upsertBook if needed) and reads/writes its notes
 * blob. Auto-saves on blur and on close — no explicit save button needed.
 *
 * One blob per book on purpose — multi-highlight is a future story; this
 * is the "thoughts while reading" pad.
 */
export default function NotesEditor({
  fileHash,
  fileName,
  format,
  title,
  displayTitle,
  onClose,
}: Props) {
  const [bookId, setBookId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  // Track the last-saved text so we don't fire a redundant PUT on close.
  const lastSavedRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Ensure a books row exists. If one already does, upsertBook returns
        // its id without changing anything substantive.
        const { bookId: id } = await upsertBook({
          fileHash,
          fileName,
          format,
          title,
        });
        if (cancelled) return;
        setBookId(id);
        const { notes, updatedAt } = await getNotes(id);
        if (cancelled) return;
        setText(notes);
        lastSavedRef.current = notes;
        setSavedAt(updatedAt ? new Date(updatedAt) : null);
        setLoaded(true);
        // Focus once the data is in so the cursor lands at the end.
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.selectionStart = el.value.length;
            el.selectionEnd = el.value.length;
          }
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fileHash, fileName, format, title]);

  // Esc closes the modal — runs the save first via the close handler below.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void closeAndSave();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, bookId]);

  async function flushSave() {
    if (!bookId) return;
    if (text === lastSavedRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const { updatedAt } = await saveNotesApi(bookId, text);
      lastSavedRef.current = text;
      setSavedAt(new Date(updatedAt));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function closeAndSave() {
    await flushSave();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-label={`Notes for ${displayTitle}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) void closeAndSave();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-rule)] bg-[var(--color-surface)] shadow-2xl"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <header className="flex items-baseline justify-between border-b border-[var(--color-rule)] px-5 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Notes
            </div>
            <div className="mt-0.5 truncate text-sm text-[var(--color-ink)]">
              {displayTitle}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
            {saving ? (
              <span>Saving…</span>
            ) : savedAt ? (
              <span>Saved {formatClock(savedAt)}</span>
            ) : null}
            <button
              onClick={() => void closeAndSave()}
              className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Close
            </button>
          </div>
        </header>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void flushSave()}
          disabled={!loaded}
          placeholder={loaded ? 'Write while you read…' : 'Loading…'}
          className="min-h-[60vh] flex-1 resize-none border-0 bg-transparent px-5 py-4 font-display text-[15px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none"
        />

        {error && (
          <div className="border-t border-[var(--color-rule)] bg-[var(--color-danger-bg)] px-5 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// formatClock lives in src/lib/format.ts now.
