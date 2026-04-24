import { useCallback, useMemo, useState } from 'react';
import FileDrop from './components/FileDrop';
import PdfReader from './components/PdfReader';
import EpubReader from './components/EpubReader';
import ChatPanel from './components/ChatPanel';
import SplitPane from './components/SplitPane';
import TopBar from './components/TopBar';
import { useMediaQuery } from './lib/useMediaQuery';
import { MOBILE_MEDIA_QUERY } from './lib/constants';
import type { ReadingContext } from './lib/systemPrompt';

interface LoadedFile {
  name: string;
  format: 'pdf' | 'epub';
  buffer: ArrayBuffer;
}

export default function App() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [location, setLocation] = useState<string>('');
  const [visibleText, setVisibleText] = useState<string>('');
  const [meta, setMeta] = useState<{ title?: string; author?: string }>({});
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);

  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  const handleFile = useCallback((f: File, buffer: ArrayBuffer) => {
    const lower = f.name.toLowerCase();
    let format: 'pdf' | 'epub' | null = null;
    if (lower.endsWith('.pdf') || f.type === 'application/pdf') format = 'pdf';
    else if (lower.endsWith('.epub') || f.type === 'application/epub+zip') format = 'epub';
    if (!format) {
      alert('Unsupported file. Please load a PDF or EPUB.');
      return;
    }
    setFile({ name: f.name, format, buffer });
    setLocation('');
    setVisibleText('');
    setMeta({});
    setPendingSelection(null);
  }, []);

  const onPdfLocation = useCallback((loc: string, text: string) => {
    setLocation(loc);
    setVisibleText(text);
  }, []);

  const onEpubLocation = useCallback(
    (loc: string, text: string, m: { title?: string; author?: string }) => {
      setLocation(loc);
      if (text) setVisibleText(text);
      if (m.title || m.author) setMeta(m);
    },
    [],
  );

  const onSelection = useCallback((text: string) => {
    setPendingSelection(text);
  }, []);

  const readingContext: ReadingContext = useMemo(() => {
    if (!file) return { format: 'none' };
    return {
      format: file.format,
      bookTitle: meta.title ?? file.name,
      bookAuthor: meta.author,
      location: location || undefined,
      visibleText: visibleText || undefined,
    };
  }, [file, meta, location, visibleText]);

  const reader = !file ? (
    <FileDrop onFile={handleFile} />
  ) : file.format === 'pdf' ? (
    <PdfReader fileBuffer={file.buffer} onLocationChange={onPdfLocation} onSelection={onSelection} />
  ) : (
    <EpubReader fileBuffer={file.buffer} onLocationChange={onEpubLocation} onSelection={onSelection} />
  );

  const chat = (
    <ChatPanel
      readingContext={readingContext}
      pendingSelection={pendingSelection}
      onSelectionUsed={() => setPendingSelection(null)}
      isMobile={isMobile}
    />
  );

  return (
    <div
      className="flex h-[100dvh] w-screen flex-col"
      style={{
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      <TopBar fileName={file?.name} onClose={file ? () => setFile(null) : undefined} />
      <main className="flex-1 overflow-hidden">
        {isMobile ? (
          !file ? (
            <div className="h-full w-full">{reader}</div>
          ) : (
            // Mobile: reader on top, companion below. Reader takes ~62% of
            // the viewport, chat takes the rest. Each pane has its own scroll.
            <div className="flex h-full w-full flex-col">
              <div className="min-h-0 flex-[0.62] overflow-hidden">{reader}</div>
              <div className="h-px shrink-0 bg-[var(--color-rule)]" />
              <div className="min-h-0 flex-[0.38] overflow-hidden">{chat}</div>
            </div>
          )
        ) : (
          <SplitPane left={reader} right={chat} />
        )}
      </main>
    </div>
  );
}
