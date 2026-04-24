import { useRef, useState } from 'react';

interface Props {
  onFile: (file: File, buffer: ArrayBuffer) => void;
}

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
      className="flex h-full items-center justify-center px-6 py-12"
    >
      <div
        className={`relative w-full max-w-md rounded-2xl border bg-[var(--color-surface)] p-8 text-center transition-all sm:p-10 ${
          dragOver
            ? 'border-[var(--color-accent)] scale-[1.01]'
            : 'border-[var(--color-rule)]'
        }`}
        style={{ boxShadow: dragOver ? 'var(--shadow-glow)' : 'var(--shadow-card)' }}
      >
        <Eyebrow>An AI for serious reading</Eyebrow>

        <h1
          className="font-display text-[2.25rem] font-light leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-[2.5rem]"
          style={{ fontStyle: 'normal' }}
        >
          A quiet companion
          <br />
          <em className="font-medium" style={{ fontStyle: 'italic', color: 'var(--color-accent)' }}>
            for difficult texts.
          </em>
        </h1>

        <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
          Open a PDF or EPUB. Read on the left. Ask anything on the right — short questions get short
          answers; the rest, real engagement.
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

        <div className="mt-8 border-t border-[var(--color-rule)] pt-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          PDF · EPUB · stays on your machine
        </div>
      </div>
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
