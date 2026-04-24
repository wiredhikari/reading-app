import { useEffect, useRef } from 'react';
import { MAX_SELECTION_PREVIEW_CHARS } from '../lib/constants';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  streaming: boolean;
  pendingSelection: string | null;
  onDetachSelection: () => void;
  autoFocus?: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  streaming,
  pendingSelection,
  onDetachSelection,
  autoFocus,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a sane cap.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div
      className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-3 sm:px-4"
      style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom))' }}
    >
      {pendingSelection && (
        <SelectionChip text={pendingSelection} onDetach={onDetachSelection} />
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask the companion…"
          rows={1}
          /* 16px font-size avoids iOS Safari's auto-zoom on focus. */
          className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-2 text-base leading-6 text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        {streaming ? (
          <button
            onClick={onCancel}
            className="rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] hover:border-[var(--color-accent)]"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="rounded-md bg-[var(--color-ink)] px-3 py-2 text-sm text-[var(--color-paper)] disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

function SelectionChip({ text, onDetach }: { text: string; onDetach: () => void }) {
  const truncated =
    text.length > MAX_SELECTION_PREVIEW_CHARS
      ? text.slice(0, MAX_SELECTION_PREVIEW_CHARS) + '…'
      : text;
  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
      <span className="mt-0.5 shrink-0 font-medium text-[var(--color-accent)]">Attached</span>
      <span className="line-clamp-3 italic">"{truncated}"</span>
      <button
        onClick={onDetach}
        className="ml-auto shrink-0 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        title="Detach selection"
        aria-label="Detach selection"
      >
        ✕
      </button>
    </div>
  );
}
