// Reader-side typography preferences for EPUB rendering. Persisted to
// localStorage so a reader's feel follows them across sessions.
//
// These are intentionally small ranges — the goal is comfortable reading,
// not a design playground. Families mirror what Apple Books / Kindle offer.

export type FontFamily = 'serif' | 'sans' | 'dyslexic';
export const FONT_FAMILY_LABEL: Record<FontFamily, string> = {
  serif: 'Serif',
  sans: 'Sans',
  dyslexic: 'Dyslexic',
};
export const FONT_FAMILY_STACK: Record<FontFamily, string> = {
  serif: '"Iowan Old Style", "Charter", "Georgia", serif',
  sans: '"Inter", "system-ui", "-apple-system", "Segoe UI", sans-serif',
  // OpenDyslexic isn't bundled; fall through to a less-ligatured serif.
  // Still distinct from the default "serif" option visually.
  dyslexic: '"Atkinson Hyperlegible", "Verdana", "Helvetica", sans-serif',
};

export interface Typography {
  family: FontFamily;
  sizePct: number; // 80–160, maps to CSS font-size on body
  lineHeight: number; // 1.4–2.0
  marginPct: number; // 0–10, extra horizontal padding as % of container
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  family: 'serif',
  sizePct: 100,
  lineHeight: 1.7,
  marginPct: 2,
};

export const TYPOGRAPHY_BOUNDS = {
  sizePct: { min: 80, max: 160, step: 5 },
  lineHeight: { min: 1.4, max: 2.0, step: 0.05 },
  marginPct: { min: 0, max: 10, step: 1 },
};

const STORAGE_KEY = 'reading-companion:epub-typography';

export function readTypography(): Typography {
  if (typeof window === 'undefined') return DEFAULT_TYPOGRAPHY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY;
    const parsed = JSON.parse(raw) as Partial<Typography>;
    return {
      family: ['serif', 'sans', 'dyslexic'].includes(parsed.family as string)
        ? (parsed.family as FontFamily)
        : DEFAULT_TYPOGRAPHY.family,
      sizePct: clamp(parsed.sizePct, TYPOGRAPHY_BOUNDS.sizePct) ?? DEFAULT_TYPOGRAPHY.sizePct,
      lineHeight:
        clamp(parsed.lineHeight, TYPOGRAPHY_BOUNDS.lineHeight) ?? DEFAULT_TYPOGRAPHY.lineHeight,
      marginPct:
        clamp(parsed.marginPct, TYPOGRAPHY_BOUNDS.marginPct) ?? DEFAULT_TYPOGRAPHY.marginPct,
    };
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

export function writeTypography(t: Typography) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // private mode — silently accept the loss of persistence
  }
}

function clamp(v: unknown, b: { min: number; max: number }): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(b.min, Math.min(b.max, v));
}
