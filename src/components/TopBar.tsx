import { useEffect, useRef, useState } from 'react';
import ThemePicker from './ThemePicker';

export type MobileTab = 'reader' | 'chat';

interface Props {
  fileName?: string;
  onClose?: () => void;
  showTabs?: boolean;
  mobileTab?: MobileTab;
  onMobileTab?: (tab: MobileTab) => void;
  unreadChat?: boolean;
  /** If provided, shows a "focus mode" button that hides app chrome. */
  onEnterFocus?: () => void;
  /** Signed-in user (when persistence is on). Renders a small account menu. */
  user?: { id: number; username: string };
  onSignOut?: () => void;
}

export default function TopBar({
  fileName,
  onClose,
  showTabs,
  mobileTab,
  onMobileTab,
  unreadChat,
  onEnterFocus,
  user,
  onSignOut,
}: Props) {
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
        {showTabs && mobileTab && onMobileTab && (
          <MobileTabToggle
            value={mobileTab}
            onChange={onMobileTab}
            unreadChat={!!unreadChat}
          />
        )}
        {onEnterFocus && (
          <button
            onClick={onEnterFocus}
            title="Focus mode — hide chrome"
            aria-label="Enter focus mode"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
            style={{ boxShadow: 'var(--shadow-soft)' }}
          >
            <FocusIcon />
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Close
          </button>
        )}
        <ThemePicker />
        {user && onSignOut && <AccountMenu user={user} onSignOut={onSignOut} />}
      </div>
    </header>
  );
}

function AccountMenu({
  user,
  onSignOut,
}: {
  user: { id: number; username: string };
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Initials for the avatar — first two characters of the handle, uppercased.
  // Kept trivially simple; handles are alphanumeric anyway.
  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.username}
        className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)]"
        style={{ boxShadow: 'var(--shadow-soft)' }}
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-2 text-sm"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="px-2 py-1.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-muted)]">
              Signed in as
            </div>
            <div className="truncate font-medium text-[var(--color-ink)]">{user.username}</div>
          </div>
          <div className="my-1 border-t border-[var(--color-rule)]" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function FocusIcon() {
  // Inward corners — "frame the page" metaphor.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  );
}

function MobileTabToggle({
  value,
  onChange,
  unreadChat,
}: {
  value: MobileTab;
  onChange: (t: MobileTab) => void;
  unreadChat: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="View"
      className="inline-flex items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] p-0.5 text-[11px] font-medium uppercase tracking-[0.12em]"
    >
      <TabButton selected={value === 'reader'} onClick={() => onChange('reader')}>
        Read
      </TabButton>
      <TabButton selected={value === 'chat'} onClick={() => onChange('chat')}>
        <span className="relative inline-flex items-center">
          Chat
          {unreadChat && value !== 'chat' && (
            <span
              aria-hidden
              className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
            />
          )}
        </span>
      </TabButton>
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={
        'rounded-full px-3 py-1 transition-colors ' +
        (selected
          ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]')
      }
    >
      {children}
    </button>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[18px] font-semibold tracking-[0.18em] text-[var(--color-ink)]">
          STOA
        </span>
        <span className="hidden text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)] sm:inline">
          the reading room
        </span>
      </span>
    </div>
  );
}

/** Stoa colonnade mark — the logo, simplified for a 28px chip. */
function Mark() {
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)]"
      style={{ boxShadow: 'var(--shadow-soft)' }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        {/* Pediment */}
        <path
          d="M3 9 L12 3 L21 9 Z"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Architrave */}
        <rect x="4" y="9.4" width="16" height="1.6" fill="var(--color-ink)" />
        {/* Columns (3 visible at this size) */}
        <rect x="5.5" y="11" width="1.1" height="8" fill="var(--color-ink)" />
        <rect x="11.5" y="11" width="1.1" height="8" fill="var(--color-ink)" />
        <rect x="17.4" y="11" width="1.1" height="8" fill="var(--color-ink)" />
        {/* Door */}
        <rect x="8.5" y="13" width="7" height="6" fill="var(--color-accent)" />
        {/* Stylobate */}
        <rect x="3.5" y="19.2" width="17" height="1.3" fill="var(--color-ink)" />
      </svg>
    </span>
  );
}

