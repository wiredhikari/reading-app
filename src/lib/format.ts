// Tiny formatters used in a few places across the UI. Kept centralized so we
// don't drift between e.g. "2.3MB" and "2.3 MB" depending on which list you
// look at. None of these need to allocate, none of them need a date library.

/** "2.3 MB", "412 KB", or "—" for missing/unknown. */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

/**
 * "just now", "5m ago", "2h ago", "yesterday", "3d ago", or "Mar 12" once a
 * row is older than a week. Avoids pulling in a date library for one-off use.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** "h:mm" — local-time clock for "saved at" indicators. */
export function formatClock(d: Date | null | undefined): string {
  if (!d || !Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
