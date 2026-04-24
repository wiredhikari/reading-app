import { useEffect, useRef, useState } from 'react';
import {
  type FontFamily,
  FONT_FAMILY_LABEL,
  type Typography,
  TYPOGRAPHY_BOUNDS,
} from '../lib/epubTypography';

interface Props {
  value: Typography;
  onChange: (t: Typography) => void;
}

/**
 * Little popover with font family / size / line height / margin controls.
 * Hangs off a gear button. Closes on outside click or Escape.
 */
export default function TypographyMenu({ value, onChange }: Props) {
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

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Typography"
        aria-label="Typography settings"
        aria-expanded={open}
        className="rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-ink)] hover:border-[var(--color-accent)]"
      >
        Aa
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-4 text-sm"
          style={{ boxShadow: 'var(--shadow-card)' }}
          role="dialog"
          aria-label="Typography"
        >
          <FamilyPicker
            value={value.family}
            onChange={(family) => onChange({ ...value, family })}
          />
          <Slider
            label="Size"
            value={value.sizePct}
            bounds={TYPOGRAPHY_BOUNDS.sizePct}
            format={(v) => `${v}%`}
            onChange={(sizePct) => onChange({ ...value, sizePct })}
          />
          <Slider
            label="Line height"
            value={value.lineHeight}
            bounds={TYPOGRAPHY_BOUNDS.lineHeight}
            format={(v) => v.toFixed(2)}
            onChange={(lineHeight) => onChange({ ...value, lineHeight })}
          />
          <Slider
            label="Margin"
            value={value.marginPct}
            bounds={TYPOGRAPHY_BOUNDS.marginPct}
            format={(v) => `${v}`}
            onChange={(marginPct) => onChange({ ...value, marginPct })}
          />
        </div>
      )}
    </div>
  );
}

function FamilyPicker({
  value,
  onChange,
}: {
  value: FontFamily;
  onChange: (v: FontFamily) => void;
}) {
  const options: FontFamily[] = ['serif', 'sans', 'dyslexic'];
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-muted)]">
        Font
      </div>
      <div className="inline-flex w-full overflow-hidden rounded-md border border-[var(--color-rule)]">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={
              'flex-1 px-2 py-1.5 text-xs transition-colors ' +
              (value === o
                ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-ink)]')
            }
          >
            {FONT_FAMILY_LABEL[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  bounds,
  format,
  onChange,
}: {
  label: string;
  value: number;
  bounds: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-muted)]">
          {label}
        </span>
        <span className="text-xs tabular-nums text-[var(--color-muted)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}
