import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite-friendly worker URL
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  fileBuffer: ArrayBuffer;
  onLocationChange: (location: string, visibleText: string) => void;
  onSelection: (text: string) => void;
}

export default function PdfReader({ fileBuffer, onLocationChange, onSelection }: Props) {
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.2);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Load the PDF
  useEffect(() => {
    let cancelled = false;
    // pdfjs mutates the buffer; pass a copy
    const data = fileBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data });
    loadingTask.promise.then((pdf) => {
      if (cancelled) {
        pdf.destroy();
        return;
      }
      setDoc(pdf);
      setPageNum(1);
    });
    return () => {
      cancelled = true;
    };
  }, [fileBuffer]);

  // Render the current page
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas || !textLayer) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Cancel any in-flight render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = renderTask;
      try {
        await renderTask.promise;
      } catch (e: unknown) {
        const name = (e as { name?: string } | null)?.name;
        if (name === 'RenderingCancelledException') return;
        throw e;
      }

      // Build a simple text layer for selection.
      const textContent = await page.getTextContent();
      textLayer.innerHTML = '';
      textLayer.style.width = `${Math.floor(viewport.width)}px`;
      textLayer.style.height = `${Math.floor(viewport.height)}px`;
      const fullTextParts: string[] = [];
      for (const item of textContent.items) {
        const it = item as { str: string; transform: number[]; width: number; height: number };
        if (!it.str) continue;
        fullTextParts.push(it.str);
        const span = document.createElement('span');
        span.textContent = it.str;
        // pdf.js transform: [a, b, c, d, e, f]; e is x (PDF coords), f is y baseline (PDF coords).
        const [a, , , , e, f] = it.transform;
        // Approximate: convert PDF baseline y to top in viewport.
        const fontSize = Math.hypot(a, it.transform[1]) * viewport.scale;
        const x = e * viewport.scale;
        const y = viewport.height - f * viewport.scale - fontSize;
        span.style.position = 'absolute';
        span.style.left = `${x}px`;
        span.style.top = `${y}px`;
        span.style.fontSize = `${fontSize}px`;
        span.style.lineHeight = '1';
        span.style.whiteSpace = 'pre';
        span.style.color = 'transparent';
        span.style.cursor = 'text';
        textLayer.appendChild(span);
      }
      const visibleText = fullTextParts.join(' ');
      onLocationChange(`page ${pageNum} of ${doc.numPages}`, visibleText);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum, scale, onLocationChange]);

  // Capture selection inside this pane
  useEffect(() => {
    function handleMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 2) return;
      // Only fire if selection is inside our text layer
      const node = sel.anchorNode;
      if (node && textLayerRef.current?.contains(node)) {
        onSelection(text);
      }
    }
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [onSelection]);

  if (!doc) {
    return <div className="p-8 text-sm text-[var(--color-muted)]">Loading PDF…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-sm sm:px-4">
        <PillButton onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1}>
          ←
        </PillButton>
        <span className="px-1 tabular-nums text-[var(--color-muted)]">
          {pageNum} <span className="text-[var(--color-rule-strong)]">/</span> {doc.numPages}
        </span>
        <PillButton
          onClick={() => setPageNum((p) => Math.min(doc.numPages, p + 1))}
          disabled={pageNum >= doc.numPages}
        >
          →
        </PillButton>
        <div className="ml-auto flex items-center gap-1.5 text-[var(--color-muted)]">
          <PillButton onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}>−</PillButton>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <PillButton onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}>+</PillButton>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-surface-2)] p-3 sm:p-6">
        <div
          className="relative mx-auto inline-block rounded-md bg-white"
          style={{ filter: 'var(--pdf-filter)', boxShadow: 'var(--shadow-card)' }}
        >
          <canvas ref={canvasRef} />
          <div
            ref={textLayerRef}
            className="absolute left-0 top-0 select-text"
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      </div>
    </div>
  );
}

function PillButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] disabled:opacity-40 disabled:hover:border-[var(--color-rule)]"
    >
      {children}
    </button>
  );
}
