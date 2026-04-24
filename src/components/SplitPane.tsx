import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
  initialLeftPercent?: number;
  minPercent?: number;
  maxPercent?: number;
}

export default function SplitPane({
  left,
  right,
  initialLeftPercent = 62,
  minPercent = 30,
  maxPercent = 80,
}: Props) {
  const [leftPct, setLeftPct] = useState(initialLeftPercent);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(minPercent, Math.min(maxPercent, pct)));
    },
    [minPercent, maxPercent],
  );

  const stopDrag = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDrag);
    };
  }, [onMouseMove, stopDrag]);

  return (
    <div ref={containerRef} className="flex h-full w-full">
      <div style={{ width: `${leftPct}%` }} className="h-full overflow-hidden">
        {left}
      </div>
      <div
        onMouseDown={() => {
          draggingRef.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        className="group relative w-px cursor-col-resize bg-[var(--color-rule)] transition-colors"
        title="Drag to resize"
      >
        {/* wider invisible hit-target */}
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-[var(--color-accent)] opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div style={{ width: `${100 - leftPct}%` }} className="h-full overflow-hidden">
        {right}
      </div>
    </div>
  );
}
