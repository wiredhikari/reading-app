import { useEffect, useRef, useState } from 'react';
import ePub, { type Book, type Rendition, type NavItem } from 'epubjs';
import { useTheme } from '../lib/theme';

interface Props {
  fileBuffer: ArrayBuffer;
  onLocationChange: (location: string, visibleText: string, meta: { title?: string; author?: string }) => void;
  onSelection: (text: string) => void;
}

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

export default function EpubReader({ fileBuffer, onLocationChange, onSelection }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [chapter, setChapter] = useState<string>('');
  const [meta, setMeta] = useState<{ title?: string; author?: string }>({});
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
    rendition.themes.register('dark', DARK_THEME);
    rendition.themes.select(theme);
    rendition.display();

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
