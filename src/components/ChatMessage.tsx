import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '../lib/api';

export default function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[90%] rounded-lg bg-[var(--color-user-bubble)] px-3 py-2 text-sm text-[var(--color-ink)] shadow-sm">
        {message.content.split('\n').map((line, i) => (
          <p key={i} className="m-0">
            {line || '\u00a0'}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="max-w-[95%] text-[0.95rem] leading-relaxed text-[var(--color-ink)]">
      <div className="prose-companion">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
    </div>
  );
}
