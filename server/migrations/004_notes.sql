-- Stage 5: per-book free-form notes. One blob of markdown / text per book
-- per user. Cheap to read/write and matches the "single notes pad while
-- reading" UX. Multi-note (highlights, annotations) is a future concern.

alter table books
  add column if not exists notes text not null default '';

alter table books
  add column if not exists notes_updated_at timestamptz;
