import { useEffect, useState, useCallback } from 'react';

// Stoa themes. The first three are canonical (light/sepia/dark match the
// design-system primitives); the rest are deliberate variations on the
// reading mood — each is a self-contained CSS block in index.css.
export type Theme =
  | 'light'    // Marble — ivory + wine, daylight on the colonnade
  | 'sepia'    // Parchment — cream + wine, afternoon between the columns
  | 'dark'     // Midnight — navy + cream + gold, the temple at night
  | 'vellum'   // Vellum — ivory page, slate ink, walnut accent
  | 'twilight' // Twilight — dim purple-blue, warm gold accent
  | 'forest'   // Forest — dark moss + cream + lichen-gold
  | 'sage'     // Sage — soft green-cream, deep moss
  | 'rose'     // Rose — warm dawn paper, dusty wine
  | 'iron'     // Iron — neutral grayscale, no chroma
  | 'aged';    // Aged — yellowed paper, deep walnut

const STORAGE_KEY = 'stoa:theme';

/** All themes in display order — used by the dropdown and the cycle toggle. */
export const THEMES: readonly Theme[] = [
  'light',
  'sepia',
  'vellum',
  'sage',
  'rose',
  'aged',
  'dark',
  'twilight',
  'forest',
  'iron',
] as const;

/** Human-readable label for each theme. */
export const THEME_LABEL: Record<Theme, string> = {
  light: 'Marble',
  sepia: 'Parchment',
  dark: 'Midnight',
  vellum: 'Vellum',
  twilight: 'Twilight',
  forest: 'Forest',
  sage: 'Sage',
  rose: 'Rose',
  iron: 'Iron',
  aged: 'Aged',
};

/** Tiny one-line description shown next to each theme in the picker. */
export const THEME_HINT: Record<Theme, string> = {
  light: 'Daylight on the colonnade',
  sepia: 'Cream parchment, afternoon',
  dark: 'The temple at night',
  vellum: 'Old library ivory',
  twilight: 'Dim purple, warm gold',
  forest: 'Dark moss, cream type',
  sage: 'Soft green daylight',
  rose: 'Warm dawn paper',
  iron: 'Neutral grayscale',
  aged: 'Yellowed century paper',
};

/** Whether a given theme uses a dark or light scheme. Used to group the picker. */
export const THEME_IS_DARK: Record<Theme, boolean> = {
  light: false,
  sepia: false,
  dark: true,
  vellum: false,
  twilight: true,
  forest: true,
  sage: false,
  rose: false,
  iron: true,
  aged: false,
};

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

// iOS status bar / Android chrome — keep these in sync with --color-paper
// in index.css. (Browsers don't read CSS variables for theme-color.)
const THEME_META_COLOR: Record<Theme, string> = {
  light:    '#faf9f5',
  sepia:    '#e8e0cf',
  dark:     '#0a0e14',
  vellum:   '#f3eee2',
  twilight: '#1a1825',
  forest:   '#0e1a14',
  sage:     '#ebede2',
  rose:     '#f3e6df',
  iron:     '#1a1a1a',
  aged:     '#e8d8b0',
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

  // Cycle through every theme — kept for users who prefer a single tap to
  // step around the palette rather than picking from a list.
  const toggle = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, toggle, setTheme };
}
