import { useState } from 'react';
import { postUsername } from '../lib/persistence';

interface Props {
  /** Called once a username has been successfully registered with the server. */
  onPicked: (user: { id: number; username: string }) => void;
}

// Keep in sync with the server's USERNAME_RE — show the same constraints up
// front so the user isn't surprised by a 400.
const LOCAL_USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function UsernamePicker({ onPicked }: Props) {
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = username.trim();
  const locallyValid = LOCAL_USERNAME_RE.test(trimmed);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!locallyValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await postUsername(trimmed);
      onPicked(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-[var(--color-rule)] bg-[var(--color-surface)] p-8 text-center sm:p-10"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-rule)] bg-[var(--color-surface-2)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          Pick a name
        </div>

        <h1
          className="font-display text-[2rem] font-light leading-[1.1] tracking-tight text-[var(--color-ink)]"
          style={{ fontStyle: 'normal' }}
        >
          What should your
          <br />
          <em
            className="font-medium"
            style={{ fontStyle: 'italic', color: 'var(--color-accent)' }}
          >
            friends see?
          </em>
        </h1>

        <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
          Your books and progress are tied to this name. Letters, digits, underscore — 3 to 20
          characters.
        </p>

        <div className="mt-7 flex flex-col items-stretch gap-3">
          <input
            type="text"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. atharva_"
            maxLength={20}
            className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 text-center font-display text-lg text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />

          {error && (
            <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}
          {!error && username && !locallyValid && (
            <div className="text-xs text-[var(--color-muted)]">
              3–20 characters, letters / digits / underscore.
            </div>
          )}

          <button
            type="submit"
            disabled={!locallyValid || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-[var(--color-paper)] shadow-[var(--shadow-soft)] transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
