import { useCallback, useRef, useState } from 'react';
import { streamChat, type ChatMessage } from './api';
import { SYSTEM_PROMPT, buildContextBlock, type ReadingContext } from './systemPrompt';

interface SendArgs {
  text: string;
  readingContext: ReadingContext;
  selection?: string | null;
}

interface UseChatOptions {
  /**
   * Fires once per *committed* message — a user turn when it's sent, and an
   * assistant turn when its stream ends successfully. Aborted or errored
   * assistant turns do NOT fire this. Used by the parent for persistence.
   */
  onMessageAppended?: (role: 'user' | 'assistant', content: string) => void;
  /** Fires per streamed chunk, so the parent can nudge "unread" UI. */
  onAssistantTick?: () => void;
}

interface UseChatResult {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  send: (args: SendArgs) => Promise<void>;
  cancel: () => void;
  clear: () => void;
  /** Replace the message list — e.g. when loading saved history for a book. */
  setInitial: (messages: ChatMessage[]) => void;
}

/**
 * Owns chat state: message list, streaming status, error, and the abort controller
 * for the in-flight request. Pure logic — no UI.
 */
export function useChat(options: UseChatOptions = {}): UseChatResult {
  const { onMessageAppended, onAssistantTick } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the callback in a ref so `send` doesn't need to resubscribe on
  // every parent re-render (would cause redundant effect churn downstream).
  const onAppendedRef = useRef(onMessageAppended);
  onAppendedRef.current = onMessageAppended;
  const onTickRef = useRef(onAssistantTick);
  onTickRef.current = onAssistantTick;

  const send = useCallback(
    async ({ text, readingContext, selection }: SendArgs) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const next: ChatMessage[] = [...messages, userMsg];
      setMessages(next);
      // Fire the save callback for the user message immediately. If the
      // stream later fails, the user turn is still correctly persisted —
      // we just won't have an assistant row for it.
      onAppendedRef.current?.('user', trimmed);

      const turnContext: ReadingContext = {
        ...readingContext,
        selection: selection ?? undefined,
      };
      const fullSystem = `${SYSTEM_PROMPT}\n\n---\n\n${buildContextBlock(turnContext)}`;

      // Add the assistant placeholder we will stream into.
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Accumulate the final assistant text so we can hand it to the save
      // callback on successful completion. Deriving it from state post-stream
      // would risk stale closures.
      let assistantText = '';

      try {
        await streamChat({
          system: fullSystem,
          messages: next,
          signal: controller.signal,
          onChunk: (chunk) => {
            if (!chunk) return;
            assistantText += chunk;
            setMessages((m) => {
              const copy = m.slice();
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + chunk };
              }
              return copy;
            });
            onTickRef.current?.();
          },
        });
        // Stream finished cleanly. Persist the assistant turn. Guard on
        // non-empty text — an empty reply is almost certainly a silent
        // failure we don't want in the history.
        const finalText = assistantText.trim();
        if (finalText) onAppendedRef.current?.('assistant', finalText);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Drop the assistant placeholder if it never received any text.
        setMessages((m) => {
          const copy = m.slice();
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && last.content === '') copy.pop();
          return copy;
        });
        if (!controller.signal.aborted) setError(msg);
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    cancel();
    setMessages([]);
    setError(null);
  }, [cancel]);

  const setInitial = useCallback((msgs: ChatMessage[]) => {
    // Bail out if we're mid-stream — reloading history would clobber the
    // in-flight assistant placeholder. Parent is expected to only call this
    // on book switch, which should happen before any stream starts.
    setMessages(msgs);
    setError(null);
  }, []);

  return { messages, streaming, error, send, cancel, clear, setInitial };
}
