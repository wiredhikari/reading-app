import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite-friendly worker URL
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  fileBuffer: ArrayBuffer;
  onLocationChange: (location: string, visibleText: string) => void;
  onSelection: (text: string) => void;
  /**
   * Opaque restore key from a previous session — e.g. "page 42". Applied
   * on first mount only; later changes are ignored (the user's current
   * navigation wins over a stale prop).
   */
  initialRestoreKey?: string | null;
  /**
   * Emits the latest restore key whenever the position changes. Pair with
   * a debounce at the call site — this can fire on every page turn.
   */
  onRestoreKey?: (key: string) => void;
  /** Hide the reader's internal toolbar for a chromeless reading view. */
  hideToolbar?: boolean;
}

/**
 * Scale bounds. Fit-to-width can go below the manual minimum on tiny screens
 * so the PDF always fits — that's why the minimums differ.
 */
const MIN_MANUAL_SCALE = 0.5;
const MIN_FIT_SCALE = 0.25;
const MAX_SCALE = 3;

// Extract a page number from an opaque restore key like "page 42" or
// "page 42 of 108". Tolerates either format so we can accept the same
// string we emit on location changes.
function parsePageFromRestoreKey(key: string | null | undefined): number | null {
  if (!key) return null;
  const m = key.match(/page\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export default function PdfReader({
  fileBuffer,
  onLocationChange,
  onSelection,
  initialRestoreKey,
  onRestoreKey,
  hideToolbar,
}: Props) {
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  // Start at the restored page if one was supplied. Guarded by Math.max in
  // the doc-load effect so we never sit on page 0.
  const [pageNum, setPageNum] = useState(() => parsePageFromRestoreKey(initialRestoreKey) ?? 1);
  // Apply the restore key exactly once — after that, the user's navigation owns this state.
  const restoredRef = useRef(false);
  const [scale, setScale] = useState(1.0);
  // When true, scale auto-adjusts to container width on mount + resize.
  // Flipped off once the user manually zooms; flipped back on with "Fit".
  const [fitWidth, setFitWidth] = useState(true);
  // Native width (at scale 1) of the current page — drives fit calculation.
  const [pageNativeWidth, setPageNativeWidth] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
      // If the user had a restore key, clamp to the doc's page count.
      // Otherwise start at 1. Either way, mark "restored" so this only
      // applies on the first load of this buffer.
      const target = parsePageFromRestoreKey(initialRestoreKey);
      if (target && !restoredRef.current) {
        setPageNum(Math.min(Math.max(1, target), pdf.numPages));
      } else {
        setPageNum(1);
      }
      restoredRef.current = true;
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
      // Record native width so the fit-to-width effect can compute scale.
      // Using native viewport (scale 1) keeps the math simple.
      const nativeWidth = page.getViewport({ scale: 1 }).width;
      if (nativeWidth !== pageNativeWidth) setPageNativeWidth(nativeWidth);

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
      // Emit the restore key separately. The full "page N of M" is a valid
      // key too (the parser just reads the first integer) but we emit the
      // shorter form because it's what a human would save.
      onRestoreKey?.(`page ${pageNum}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum, scale, onLocationChange, onRestoreKey, pageNativeWidth]);

  // Fit-to-width: watch the scroll container and recompute scale so the page
  // exactly spans the available width. Accounts for the container's horizontal
  // padding. No-op when the user has manually zoomed.
  useEffect(() => {
    if (!fitWidth || !pageNativeWidth) return;
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const cs = window.getComputedStyle(container);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const avail = Math.max(100, container.clientWidth - padL - padR);
      const next = Math.max(MIN_FIT_SCALE, Math.min(MAX_SCALE, avail / pageNativeWidth));
      // Round to 2 decimals to avoid sub-pixel churn from tiny ResizeObserver deltas.
      const rounded = Math.round(next * 100) / 100;
      setScale((prev) => (Math.abs(prev - rounded) > 0.01 ? rounded : prev));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitWidth, pageNativeWidth]);

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

  // -----------------------------------------------------------------------
  // Touch gestures — swipe to turn page, pinch to zoom.
  //
  // We need to disambiguate from three other touch uses:
  //   (a) vertical scroll of a tall/zoomed page — must keep working
  //   (b) text selection via long-press — must keep working
  //   (c) tap (no movement) — must keep working
  //
  // The rules below:
  //   - A gesture with 2+ fingers is always a pinch. Prevent default so the
  //     browser doesn't also page-zoom.
  //   - A single-finger gesture only counts as a swipe if it moves ≥ 50px
  //     horizontally AND the horizontal motion is at least 2× the vertical.
  //     That filters out drags during selection and vertical scrolls.
  //   - Below the swipe threshold we do nothing — the browser's native
  //     selection + scroll still work.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    type Gesture =
      | { kind: 'none' }
      | { kind: 'swipe'; startX: number; startY: number; startTime: number }
      | { kind: 'pinch'; startDist: number; startScale: number };
    let g: Gesture = { kind: 'none' };

    function dist(a: Touch, b: Touch) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length >= 2) {
        // Capture baseline scale AT pinch start; further moves re-derive
        // from this so the user can pinch out and back in smoothly.
        g = {
          kind: 'pinch',
          startDist: dist(e.touches[0], e.touches[1]),
          startScale: scale,
        };
        // Pinch means the user is manually zooming — drop fit-to-width.
        if (fitWidth) setFitWidth(false);
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        g = {
          kind: 'swipe',
          startX: t.clientX,
          startY: t.clientY,
          startTime: performance.now(),
        };
      }
    }

    function onMove(e: TouchEvent) {
      if (g.kind === 'pinch' && e.touches.length >= 2) {
        const d = dist(e.touches[0], e.touches[1]);
        if (d > 0 && g.startDist > 0) {
          const ratio = d / g.startDist;
          const next = Math.max(
            MIN_MANUAL_SCALE,
            Math.min(MAX_SCALE, +(g.startScale * ratio).toFixed(2)),
          );
          setScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
        }
        e.preventDefault();
      } else if (g.kind === 'swipe' && e.touches.length === 1) {
        // If the gesture is unambiguously horizontal, preventDefault to stop
        // iOS Safari from claiming it as the edge "swipe-back" navigation
        // (which would yank the user out of the app). We still want vertical
        // pans to scroll natively, so the threshold is asymmetric: a clear
        // horizontal motion locks in, anything else falls through.
        const t = e.touches[0];
        const dx = t.clientX - g.startX;
        const dy = t.clientY - g.startY;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          e.preventDefault();
        }
      }
    }

    function onEnd(e: TouchEvent) {
      if (g.kind === 'swipe' && e.changedTouches.length) {
        const t = e.changedTouches[0];
        const dx = t.clientX - g.startX;
        const dy = t.clientY - g.startY;
        const dt = performance.now() - g.startTime;
        const horizontal = Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 2;
        // Guard against accidental swipes during a long text-selection press.
        const fastEnough = dt < 600;
        if (horizontal && fastEnough) {
          if (dx < 0) {
            setPageNum((p) => (doc ? Math.min(doc.numPages, p + 1) : p));
          } else {
            setPageNum((p) => Math.max(1, p - 1));
          }
        }
      }
      g = { kind: 'none' };
    }

    // passive: false on start/move so preventDefault() actually suppresses
    // the browser's native pinch-zoom on the whole page during gestures.
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [doc, scale, fitWidth]);

  if (!doc) {
    return <div className="p-8 text-sm text-[var(--color-muted)]">Loading PDF…</div>;
  }

  function zoom(delta: number) {
    setFitWidth(false);
    setScale((s) => {
      const next = +(s + delta).toFixed(2);
      return Math.max(MIN_MANUAL_SCALE, Math.min(MAX_SCALE, next));
    });
  }

  return (
    <div className="reader-surface flex h-full flex-col">
      {/* Toolbar — compact on narrow screens. */}
      {!hideToolbar && (
        <div className="flex items-center gap-1.5 border-b border-[var(--color-rule)] bg-[var(--color-paper)] px-2 py-1.5 text-sm sm:gap-2 sm:px-4 sm:py-2">
          <PillButton onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1}>
            ←
          </PillButton>
          <span className="px-1 text-xs tabular-nums text-[var(--color-muted)] sm:text-sm">
            {pageNum} <span className="text-[var(--color-rule-strong)]">/</span> {doc.numPages}
          </span>
          <PillButton
            onClick={() => setPageNum((p) => Math.min(doc.numPages, p + 1))}
            disabled={pageNum >= doc.numPages}
          >
            →
          </PillButton>
          <div className="ml-auto flex items-center gap-1 text-[var(--color-muted)] sm:gap-1.5">
            <PillButton onClick={() => zoom(-0.1)}>−</PillButton>
            {/* Hide the raw percentage on narrow screens — show a Fit button instead. */}
            <span className="hidden w-10 text-center text-xs tabular-nums sm:inline">
              {Math.round(scale * 100)}%
            </span>
            <PillButton onClick={() => zoom(0.1)}>+</PillButton>
            <PillButton
              onClick={() => setFitWidth(true)}
              disabled={fitWidth}
              title="Fit to width"
            >
              Fit
            </PillButton>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[var(--color-surface-2)] p-2 sm:p-6"
      >
        <div
          // `key` re-runs the entry animation on every page change, so the
          // page fades in instead of snapping. Subtle but the eye reads it
          // as a turn rather than a swap.
          key={pageNum}
          className="relative mx-auto inline-block rounded-md bg-white animate-page-in allow-select"
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
      {/* Subtle progress thread along the bottom — Kindle-style. Width is
          driven by the current page over total. Runs even while the toolbar
          is hidden, so the reader always knows where they are. */}
      <div
        aria-hidden
        className="reader-progress shrink-0"
        style={
          {
            ['--p' as string]: `${
              doc.numPages > 0 ? (pageNum / doc.numPages) * 100 : 0
            }%`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function PillButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] disabled:opacity-40 disabled:hover:border-[var(--color-rule)]"
    >
      {children}
    </button>
  );
}
