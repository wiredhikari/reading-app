-- Stage 2 initial schema. All statements are idempotent (CREATE IF NOT EXISTS)
-- so boot-time migration is safe to rerun on every process start.

create table if not exists users (
  id serial primary key,
  username text unique not null,
  created_at timestamptz not null default now()
);

-- Books are identified by (user_id, file_hash). Two friends who open the
-- same PDF independently each get their own books row — that's intentional
-- because progress is per-user. Stage 4 may add a shared library, which is
-- why we don't unique on file_hash alone.
create table if not exists books (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  file_hash text not null,
  file_name text not null,
  title text,
  author text,
  format text not null check (format in ('pdf', 'epub')),
  created_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  unique (user_id, file_hash)
);

create index if not exists books_user_last_opened
  on books(user_id, last_opened_at desc);

-- Separate row so progress writes don't churn the books row (less bloat).
create table if not exists reading_progress (
  book_id int primary key references books(id) on delete cascade,
  location text,
  updated_at timestamptz not null default now()
);
