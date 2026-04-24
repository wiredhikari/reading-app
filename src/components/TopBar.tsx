import ThemeToggle from './ThemeToggle';

interface Props {
  fileName?: string;
  onClose?: () => void;
}

export default function TopBar({ fileName, onClose }: Props) {
  return (
    <header
      className="surface-glass sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-5"
      style={{ paddingTop: 'max(0.625rem, var(--safe-top))' }}
    >
      <Brand />

      {fileName && (
        <span className="hidden min-w-0 truncate text-xs text-[var(--color-muted)] sm:inline">
          <span className="text-[var(--color-rule-strong)]">·</span>&nbsp;
          {fileName}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Close
          </button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <span className="font-display text-[17px] font-medium tracking-tight text-[var(--color-ink)]">
        Reading Companion
      </span>
    </div>
  );
}

/** Tiny serif "RC" mark inside a softly glowing chip. */
function Mark() {
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)]"
      style={{ boxShadow: 'var(--shadow-soft)' }}
      aria-hidden
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 4h6.4c2.3 0 3.9 1.4 3.9 3.5 0 1.7-1 2.9-2.6 3.3l3.3 5.2H13.5l-2.9-4.8H8v4.8H5V4Zm3 5.7h3c1 0 1.6-.5 1.6-1.4S12 7 11 7H8v2.7Z"
          fill="var(--color-accent)"
        />
        <circle cx="18.5" cy="18.5" r="1.6" fill="var(--color-accent)" opacity="0.7" />
      </svg>
    </span>
  );
}

