import { useRef, useState } from 'react';

interface Props {
  onFile: (file: File, buffer: ArrayBuffer) => void;
}

/**
 * Two presentations of the same drop zone:
 *
 *   - Mobile (default): a compact action bar at the top of the screen — one
 *     button + a tiny tagline, taking just a few rem of vertical space so
 *     the library list immediately below is visible without scrolling.
 *   - Desktop (`sm:` and up): the original centered "hero" card with the
 *     headline, description, and pill button. There's room for it.
 *
 * Both share the same input element + drag-and-drop handlers; the only
 * difference is which markup is visible per breakpoint.
 */
export default function FileDrop({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    const buffer = await file.arrayBuffer();
    onFile(file, buffer);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      className="w-full"
    >
      {/* Mobile: compact action bar. ~5rem tall, leaves the rest for the list. */}
      <div className="block sm:hidden">
        <div
          className={
            'mx-3 mt-3 flex items-center gap-3 rounded-2xl border px-3 py-3 transition-all ' +
            (dragOver
              ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
              : 'border-[var(--color-rule)] bg-[var(--color-surface)]')
          }
          style={{ boxShadow: 'var(--shadow-soft)' }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-paper)] text-[var(--color-accent)]"
            aria-hidden
          >
            <UploadIcon />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--color-ink)]">
              Open a book
            </div>
            <div className="truncate text-[11px] text-[var(--color-muted)]">
              PDF or EPUB · syncs across devices
            </div>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--color-paper)]"
          >
            Open
          </button>
        </div>
      </div>

      {/* Desktop: centered hero card with the full headline + description. */}
      <div className="hidden h-full w-full items-center justify-center px-6 py-12 sm:flex">
        <div
          className={`relative w-full max-w-md rounded-2xl border bg-[var(--color-surface)] p-10 text-center transition-all ${
            dragOver
              ? 'border-[var(--color-accent)] scale-[1.01]'
              : 'border-[var(--color-rule)]'
          }`}
          style={{ boxShadow: dragOver ? 'var(--shadow-glow)' : 'var(--shadow-card)' }}
        >
          <Eyebrow>The reading room</Eyebrow>

          <h1
            className="font-display text-[2.25rem] font-light leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-[2.5rem]"
            style={{ fontStyle: 'normal' }}
          >
            A place to think
            <br />
            <em
              className="font-medium"
              style={{ fontStyle: 'italic', color: 'var(--color-accent)' }}
            >
              with the text.
            </em>
          </h1>

          <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
            Open a PDF or EPUB. Read on the left, ask on the right. Your library,
            progress, and notes travel with you across devices.
          </p>

          <div className="mt-7 flex flex-col items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-[var(--color-paper)] shadow-[var(--shadow-soft)] transition-transform hover:scale-[1.02]"
            >
              <UploadIcon />
              Open a file
            </button>
            <span className="text-xs text-[var(--color-muted)]">…or drag one in</span>
          </div>

          <div className="mt-8 border-t border-[var(--color-rule)] pt-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            PDF · EPUB · synced across your devices
          </div>
        </div>
      </div>

      {/* Hidden file input shared by both presentations. */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-rule)] bg-[var(--color-surface-2)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      {children}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
