import type { MobileTab } from './TopBar';

interface Props {
  value: MobileTab;
  onChange: (tab: MobileTab) => void;
  unreadChat?: boolean;
}

/**
 * iOS-style bottom tab bar. Two tabs: Read and Chat. Sits above the home
 * indicator (safe-bottom) with a subtle blur, so the reader content can run
 * underneath it without losing legibility.
 *
 * Why not in TopBar: bottom tabs are how every native iPhone app organizes
 * top-level navigation. Putting Read/Chat at the bottom means the user's
 * thumb is on the right tool while reading, and the top of the screen is
 * free for the chrome that auto-hides.
 */
export default function BottomTabBar({ value, onChange, unreadChat }: Props) {
  return (
    <nav
      role="tablist"
      aria-label="View"
      className="surface-glass fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--color-rule)] backdrop-blur-md"
      style={{
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <TabItem
        label="Read"
        selected={value === 'reader'}
        onClick={() => onChange('reader')}
      >
        <ReaderIcon active={value === 'reader'} />
      </TabItem>
      <TabItem
        label="Chat"
        selected={value === 'chat'}
        onClick={() => onChange('chat')}
        badge={unreadChat && value !== 'chat'}
      >
        <ChatIcon active={value === 'chat'} />
      </TabItem>
    </nav>
  );
}

function TabItem({
  label,
  selected,
  onClick,
  badge,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  badge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={
        'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 ' +
        (selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]')
      }
      // iOS HIG calls for ≥44pt touch targets; the py-2 + flex-1 gets us there.
      style={{ minHeight: 56 }}
    >
      <span className="relative">
        {children}
        {badge && (
          <span
            aria-hidden
            className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
          />
        )}
      </span>
      <span className="text-[10px] font-medium tracking-[0.04em]">{label}</span>
    </button>
  );
}

function ReaderIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" opacity={active ? 0.85 : 1} />
      <path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" opacity={active ? 0.85 : 1} />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"
        opacity={active ? 0.85 : 1}
      />
    </svg>
  );
}
