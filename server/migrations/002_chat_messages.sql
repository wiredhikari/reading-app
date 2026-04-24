-- Stage 3: per-book chat history. One row per streamed turn (user or assistant).
-- Kept simple — we store raw text and a role, not tokens or a structured
-- content-block array. That's enough to rebuild the conversation state that
-- the Anthropic Messages API expects.
--
-- When a book is deleted, its chat history goes with it.

create table if not exists chat_messages (
  id bigserial primary key,
  book_id int not null references books(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- We always read history in insertion order for a given book. A single index
-- on (book_id, id) satisfies both the ordering and the filter.
create index if not exists chat_messages_book_id
  on chat_messages(book_id, id);
