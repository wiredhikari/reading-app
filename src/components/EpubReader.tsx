import { useEffect, useRef, useState } from 'react';
import ePub, { type Book, type Rendition, type NavItem } from 'epubjs';
import { useTheme } from '../lib/theme';
import {
  type Typography,
  FONT_FAMILY_STACK,
  readTypography,
  writeTypography,
} from '../lib/epubTypography';
import TypographyMenu from './TypographyMenu';

interface Props {
  fileBuffer: ArrayBuffer;
  onLocationChange: (location: string, visibleText: string, meta: { title?: string; author?: string }) => void;
  onSelection: (text: string) => void;
  /** Opaque key from a prior session — for EPUB this is the CFI. */
  initialRestoreKey?: string | null;
  /** Emits the CFI on every location change so the caller can save it. */
  onRestoreKey?: (key: string) => void;
}

// The epub.js iframe can't read our CSS custom properties (it's a separate
// document), so we hand it a concrete palette per theme.
const LIGHT_THEME = {
  body: {
    'font-family': '"Iowan Old Style", "Charter", "Georgia", serif',
    'line-height': '1.7',
    color: '#1a1a1a',
    background: '#fbfaf6',
    padding: '0 8px',
  },
  p: { 'margin-bottom': '1em' },
  a: { color: '#5b4a2e' },
  '::selection': { background: 'rgba(91, 74, 46, 0.25)' },
};

const SEPIA_THEME = {
  body: {
    'font-family': '"Iowan Old Style", "Charter", "Georgia", serif',
    'line-height': '1.75',
    color: '#2a1f12',
    background: '#ecdec2',
    padding: '0 8px',
  },
  p: { 'margin-bottom': '1em' },
  a: { color: '#a35a2b' },
  '::selection': { background: 'rgba(163, 90, 43, 0.22)' },
};

const DARK_THEME = {
  body: {
    'font-family': '"Iowan Old Style", "Charter", "Georgia", serif',
    'line-height': '1.7',
    color: '#e8e6df',
    background: '#14141a',
    padding: '0 8px',
  },
  p: { 'margin-bottom': '1em' },
  a: { color: '#c9b48a' },
  '::selection': { background: 'rgba(201, 180, 138, 0.3)' },
};

export default function EpubReader({
  fileBuffer,
  onLocationChange,
  onSelection,
  initialRestoreKey,
  onRestoreKey,
}: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [chapter, setChapter] = useState<string>('');
  const [meta, setMeta] = useState<{ title?: string; author?: string }>({});
  const [typography, setTypography] = useState<Typography>(() => readTypography());
  const { theme } = useTheme();

  useEffect(() => {
    if (!viewerRef.current) return;
    const book = ePub(fileBuffer);
    bookRef.current = book;
    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      manager: 'default',
      spread: 'none',
    });
    renditionRef.current = rendition;
    rendition.themes.register('light', LIGHT_THEME);
    rendition.themes.register('sepia', SEPIA_THEME);
    rendition.themes.register('dark', DARK_THEME);
    rendition.themes.select(theme);
    // If we have a CFI from a prior session, open the book there.
    // epubjs display() accepts a CFI string; invalid keys fall back to the
    // beginning silently, so no try/catch needed.
    rendition.display(initialRestoreKey || undefined);

    book.loaded.metadata.then((m) => {
      setMeta({ title: m.title, author: m.creator });
    });

    rendition.on('relocated', async (loc: { start: { href: string; cfi: string } }) => {
      try {
        const nav = await book.loaded.navigation;
        const found = findChapter(nav.toc, loc.start.href);
        const label = found?.label?.trim() ?? loc.start.href;
        setChapter(label);
        const contents = rendition.getContents() as unknown as Array<{ document: Document }>;
        const visible = contents
          .map((c) => c.document?.body?.innerText ?? '')
          .join('\n')
          .trim();
        onLocationChange(label, visible, meta);
        // The CFI is the precise restore key. The chapter label above is
        // for humans; this is what we save to the server.
        if (loc.start.cfi) onRestoreKey?.(loc.start.cfi);
      } catch {
        // ignore
      }
    });

    rendition.on('selected', (cfiRange: string, contents: { window: Window }) => {
      try {
        const text = contents.window.getSelection()?.toString().trim() ?? '';
        if (text.length >= 2) onSelection(text);
      } catch {
        // ignore
      }
      void cfiRange;
    });

    return () => {
      try { rendition.destroy(); } catch { /* ignore */ }
      try { book.destroy(); } catch { /* ignore */ }
      bookRef.current = null;
      renditionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileBuffer]);

  // Push meta to parent when it arrives
  useEffect(() => {
    if (chapter) onLocationChange(chapter, '', meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // Swap epub.js theme when the app theme changes.
  useEffect(() => {
    renditionRef.current?.themes.select(theme);
  }, [theme]);

  // Apply typography overrides whenever the user tweaks them. epub.js has a
  // `themes.override` method that targets selectors inside the rendered iframe.
  // Persist alongside so the next session inherits the choices.
  useEffect(() => {
    writeTypography(typography);
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      rendition.themes.override('font-family', FONT_FAMILY_STACK[typography.family], true);
      rendition.themes.override('font-size', `${typography.sizePct}%`, true);
      rendition.themes.override('line-height', String(typography.lineHeight), true);
      // Side padding — compounded with the base padding already in the theme.
      rendition.themes.override(
        'padding-left',
        `${typography.marginPct}%`,
        true,
      );
      rendition.themes.override(
        'padding-right',
        `${typography.marginPct}%`,
        true,
      );
    } catch (err) {
      console.warn('[epub] typography override failed:', err);
    }
  }, [typography]);

  function next() { renditionRef.current?.next(); }
  function prev() { renditionRef.current?.prev(); }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-sm sm:px-4">
        <button
          onClick={prev}
          className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)] hover:border-[var(--color-accent)]"
        >
          ←
        </button>
        <button
          onClick={next}
          className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)] hover:border-[var(--color-accent)]"
        >
          →
        </button>
        <span className="hidden min-w-0 truncate text-[var(--color-muted)] sm:inline">
          {meta.title
            ? `${meta.title}${meta.author ? ' — ' + meta.author : ''}`
            : 'EPUB'}
        </span>
        <span className="ml-auto truncate text-xs text-[var(--color-muted)]">{chapter}</span>
        <TypographyMenu value={typography} onChange={setTypography} />
      </div>
      <div className="flex-1 overflow-hidden bg-[var(--color-paper)]">
        <div ref={viewerRef} className="mx-auto h-full max-w-3xl px-2" />
      </div>
    </div>
  );
}

function findChapter(toc: NavItem[], href: string): NavItem | undefined {
  const target = href.split('#')[0];
  for (const item of toc) {
    if ((item.href ?? '').split('#')[0] === target) return item;
    if (item.subitems && item.subitems.length) {
      const found = findChapter(item.subitems, href);
      if (found) return found;
    }
  }
  return undefined;
}
