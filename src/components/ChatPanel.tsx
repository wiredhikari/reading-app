import { useEffect, useRef, useState } from 'react';
import { useChat } from '../lib/useChat';
import type { ReadingContext } from '../lib/systemPrompt';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import {
  clearChatHistory,
  getChatHistory,
  postChatMessage,
} from '../lib/persistence';

interface Props {
  readingContext: ReadingContext;
  pendingSelection: string | null;
  onSelectionUsed: () => void;
  onAssistantTick?: () => void;
  isMobile?: boolean;
  /**
   * When set, chat history is loaded from and saved to the server under this
   * book id. Null means local-only: the chat still works, it just doesn't
   * persist across sessions.
   */
  bookId?: number | null;
}

export default function ChatPanel({
  readingContext,
  pendingSelection,
  onSelectionUsed,
  onAssistantTick,
  isMobile,
  bookId,
}: Props) {
  // When we have a book id, every committed message (user or assistant) is
  // written to the server. Failures are logged but not surfaced — persistence
  // is best-effort; the reader shouldn't know or care if the save hiccupped.
  const bookIdRef = useRef<number | null>(bookId ?? null);
  bookIdRef.current = bookId ?? null;

  const { messages, streaming, error, send, cancel, setInitial, clear } = useChat({
    onAssistantTick,
    onMessageAppended: (role, content) => {
      const id = bookIdRef.current;
      if (!id) return;
      postChatMessage(id, role, content).catch((err: unknown) => {
        console.warn('[chat] save failed:', err);
      });
    },
  });

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load persisted history whenever the bookId changes. A null id means we
  // switched to a state without persistence — clear the pane so stale
  // messages from a prior book don't linger.
  useEffect(() => {
    let cancelled = false;
    if (!bookId) {
      setInitial([]);
      setLoadingHistory(false);
      return () => {
        cancelled = true;
      };
    }
    setLoadingHistory(true);
    getChatHistory(bookId)
      .then((rows) => {
        if (cancelled) return;
        setInitial(rows.map((r) => ({ role: r.role, content: r.content })));
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[chat] load history failed:', err);
        // Fall back to an empty conversation — the stream endpoint still works.
        setInitial([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  async function submit() {
    const text = input.trim();
    if (!text || streaming) return;
    const selection = pendingSelection;
    setInput('');
    if (selection) onSelectionUsed();
    await send({ text, readingContext, selection });
  }

  async function clearConversation() {
    if (streaming) cancel();
    const id = bookIdRef.current;
    clear();
    if (id) {
      try {
        await clearChatHistory(id);
      } catch (err) {
        console.warn('[chat] clear history failed:', err);
      }
    }
  }

  const headerLabel =
    readingContext.format === 'none'
      ? 'No text loaded'
      : readingContext.location ?? readingContext.bookTitle ?? 'Reading';

  return (
    <div className="flex h-full flex-col bg-[var(--color-paper)]">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] px-5 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Companion
          </div>
          <div className="mt-0.5 truncate text-sm text-[var(--color-ink)]">{headerLabel}</div>
        </div>
        <div className="flex items-center gap-3">
          {streaming && (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              </span>
              thinking
            </span>
          )}
          {messages.length > 0 && !streaming && (
            <button
              onClick={clearConversation}
              className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
              title={bookId ? 'Clear this conversation (deletes saved history)' : 'Clear this conversation'}
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {loadingHistory ? (
          <div className="pt-6 text-center text-xs text-[var(--color-muted)]">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            {messages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onCancel={cancel}
        streaming={streaming}
        pendingSelection={pendingSelection}
        onDetachSelection={onSelectionUsed}
        autoFocus={!isMobile}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-sm pt-6 text-center">
      <div
        className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)]"
        style={{ boxShadow: 'var(--shadow-soft)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </div>
      <p className="font-display text-lg leading-snug text-[var(--color-ink)]">
        Quiet by default.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Ask anything about the text. Select a passage in the reader to attach it.
      </p>
    </div>
  );
}
