import { useEffect, useState, useCallback } from 'react';

// Three-way theme:
//   light  — airy cream, everyday app feel
//   sepia  — warmer, deeper paper — reading mode
//   dark   — night reading; low-glow charcoal
export type Theme = 'light' | 'sepia' | 'dark';
const STORAGE_KEY = 'reading-companion:theme';

// Order for the cycle toggle — matches sun → paper → moon metaphor.
const THEME_CYCLE: Theme[] = ['light', 'sepia', 'dark'];

function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'sepia' || v === 'dark';
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

// iOS status bar / Android chrome — keep this in sync with --color-paper.
const THEME_META_COLOR: Record<Theme, string> = {
  light: '#f4ede0',
  sepia: '#ecdec2',
  dark: '#14141a',
};

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_META_COLOR[theme]);
}

// Apply once synchronously at module load so we don't flash the wrong theme.
if (typeof document !== 'undefined') {
  applyTheme(readInitialTheme());
  // After first paint, allow CSS transitions on theme swaps.
  requestAnimationFrame(() => {
    document.documentElement.classList.add('theme-ready');
  });
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme());

  // Keep state and DOM in sync if some other tab changes it.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isTheme(e.newValue)) {
        setThemeState(e.newValue);
        applyTheme(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode etc. */
    }
  }, []);

  // Cycle light → sepia → dark → light. One-tap toggle with a changing icon.
  const toggle = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, toggle, setTheme };
}
