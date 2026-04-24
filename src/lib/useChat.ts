import { useCallback, useRef, useState } from 'react';
import { streamChat, type ChatMessage } from './api';
import { SYSTEM_PROMPT, buildContextBlock, type ReadingContext } from './systemPrompt';

interface SendArgs {
  text: string;
  readingContext: ReadingContext;
  selection?: string | null;
}

interface UseChatResult {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  send: (args: SendArgs) => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

/**
 * Owns chat state: message list, streaming status, error, and the abort controller
 * for the in-flight request. Pure logic — no UI.
 *
 * `onAssistantTick` fires once per streamed chunk so the surrounding UI can react
 * (for example, marking a background tab as having unread content).
 */
export function useChat(onAssistantTick?: () => void): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async ({ text, readingContext, selection }: SendArgs) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const next: ChatMessage[] = [...messages, userMsg];
      setMessages(next);

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

      try {
        await streamChat({
          system: fullSystem,
          messages: next,
          signal: controller.signal,
          onChunk: (chunk) => {
            if (!chunk) return;
            setMessages((m) => {
              const copy = m.slice();
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + chunk };
              }
              return copy;
            });
            onAssistantTick?.();
          },
        });
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
    [messages, streaming, onAssistantTick],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    cancel();
    setMessages([]);
    setError(null);
  }, [cancel]);

  return { messages, streaming, error, send, cancel, clear };
}
