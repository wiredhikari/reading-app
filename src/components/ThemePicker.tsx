import { useEffect, useRef, useState } from 'react';
import {
  THEMES,
  THEME_HINT,
  THEME_IS_DARK,
  THEME_LABEL,
  useTheme,
  type Theme,
} from '../lib/theme';

/**
 * Dropdown theme picker. The trigger is a circular swatch showing the
 * current theme's paper + ink + accent at a glance; clicking opens a list
 * of every available theme grouped into Light and Dark schemes.
 *
 * The list pulls colors directly from the same CSS variables used at the
 * theme level, so each row previews the actual palette without hardcoding.
 */
export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
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

  const lightThemes = THEMES.filter((t) => !THEME_IS_DARK[t]);
  const darkThemes = THEMES.filter((t) => THEME_IS_DARK[t]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Theme: ${THEME_LABEL[theme]}`}
        aria-label="Choose theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]"
        style={{ boxShadow: 'var(--shadow-soft)' }}
      >
        <ThemeSwatch theme={theme} size={18} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Themes"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-2 text-sm"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <ThemeGroup
            heading="Light"
            themes={lightThemes}
            current={theme}
            onPick={(t) => {
              setTheme(t);
              setOpen(false);
            }}
          />
          <div className="my-1 border-t border-[var(--color-rule)]" />
          <ThemeGroup
            heading="Dark"
            themes={darkThemes}
            current={theme}
            onPick={(t) => {
              setTheme(t);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ThemeGroup({
  heading,
  themes,
  current,
  onPick,
}: {
  heading: string;
  themes: readonly Theme[];
  current: Theme;
  onPick: (t: Theme) => void;
}) {
  return (
    <div>
      <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {heading}
      </div>
      <ul className="space-y-0.5">
        {themes.map((t) => (
          <li key={t}>
            <button
              role="option"
              aria-selected={current === t}
              onClick={() => onPick(t)}
              className={
                'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ' +
                (current === t
                  ? 'bg-[var(--color-paper)]'
                  : 'hover:bg-[var(--color-paper)]')
              }
            >
              <ThemeSwatch theme={t} size={20} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[var(--color-ink)]">
                  {THEME_LABEL[t]}
                </span>
                <span className="truncate text-[11px] text-[var(--color-muted)]">
                  {THEME_HINT[t]}
                </span>
              </span>
              {current === t && (
                <span
                  aria-hidden
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Three-color swatch for a theme, rendered as a small circle: paper field,
 * ink half-disc, accent dot. Intentionally readable at 18-20px.
 *
 * The swatch is keyed off `data-theme` so it shows the *target* palette
 * even when a different theme is currently active. We achieve that with a
 * dedicated CSS rule below that scopes the variable lookups.
 */
function ThemeSwatch({ theme, size }: { theme: Theme; size: number }) {
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-full border"
      data-theme-swatch={theme}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* paper */}
      <span
        className="absolute inset-0"
        style={{ background: `var(--swatch-paper-${theme})` }}
      />
      {/* ink half-disc — lower-right corner */}
      <span
        className="absolute right-0 top-1/2 h-1/2 w-1/2"
        style={{ background: `var(--swatch-ink-${theme})` }}
      />
      {/* accent dot */}
      <span
        className="absolute"
        style={{
          width: size * 0.32,
          height: size * 0.32,
          left: size * 0.18,
          top: size * 0.18,
          borderRadius: '50%',
          background: `var(--swatch-accent-${theme})`,
        }}
      />
      {/* subtle ring */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `inset 0 0 0 1px var(--color-rule)`,
        }}
      />
    </span>
  );
}
