-- Reading recency is independent of upload time and reading state.
alter table documents add column last_read_at timestamptz;
create index documents_reading_recency_idx
  on documents (user_id, last_read_at desc)
  where last_read_at is not null;
