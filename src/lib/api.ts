export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatArgs {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}

export async function streamChat({ system, messages, signal, onChunk }: StreamChatArgs): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Chat request failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) onChunk(decoder.decode(value, { stream: true }));
  }
  // flush
  onChunk(decoder.decode());
}
