import { useTheme } from '../lib/theme';

const NEXT_LABEL: Record<string, string> = {
  light: 'Switch to sepia',
  sepia: 'Switch to dark',
  dark: 'Switch to light',
};

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={NEXT_LABEL[theme]}
      aria-label={`Theme: ${theme}. ${NEXT_LABEL[theme]}`}
      className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      style={{ boxShadow: 'var(--shadow-soft)' }}
    >
      {theme === 'light' && <SunIcon />}
      {theme === 'sepia' && <BookIcon />}
      {theme === 'dark' && <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function BookIcon() {
  // Open book — stands in for the "sepia / paper" palette.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4z" />
      <path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7V4z" />
    </svg>
  );
}
