-- Stage 4: shared library. Books uploaded here are visible to every friend
-- on the instance — each file is stored once (uniqued on sha256 of bytes)
-- and lives on the host's volume at `<UPLOADS_DIR>/<file_hash>`. Per-user
-- reading progress and chat history stay where they are (on the `books` /
-- `chat_messages` tables); the library is purely a content source.

create table if not exists library_files (
  id serial primary key,
  file_hash text unique not null,
  file_name text not null,
  format text not null check (format in ('pdf', 'epub')),
  size_bytes bigint not null,
  title text,
  author text,
  uploaded_by int references users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

-- We list the library newest-first by default, so index that order.
create index if not exists library_files_uploaded_at
  on library_files(uploaded_at desc);
