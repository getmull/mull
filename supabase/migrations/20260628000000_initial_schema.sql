-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ── Documents ─────────────────────────────────────────────────────────────────

create table documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('pdf', 'article')),
  title         text not null,
  source_url    text,
  storage_path  text,
  word_count    integer,
  page_count    integer,
  is_scanned    boolean default false,
  reading_state text not null default 'unread'
                  check (reading_state in ('unread', 'reading', 'library', 'archived')),
  progress_pct  numeric(5,2) default 0 check (progress_pct >= 0 and progress_pct <= 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table documents enable row level security;

create policy "users can manage their own documents"
  on documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Document pages ─────────────────────────────────────────────────────────────

create table document_pages (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  page_number  integer not null,
  raw_text     text not null default '',
  created_at   timestamptz not null default now(),
  unique (document_id, page_number)
);

alter table document_pages enable row level security;

create policy "users can read pages of their documents"
  on document_pages for select
  using (
    exists (
      select 1 from documents d
      where d.id = document_id and d.user_id = auth.uid()
    )
  );

create policy "users can insert pages for their documents"
  on document_pages for insert
  with check (
    exists (
      select 1 from documents d
      where d.id = document_id and d.user_id = auth.uid()
    )
  );

-- ── Highlights ─────────────────────────────────────────────────────────────────

create table highlights (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  text         text not null,
  color        text not null default 'yellow'
                 check (color in ('yellow', 'green', 'blue', 'pink')),
  page_ref     integer,
  position     jsonb,
  created_at   timestamptz not null default now()
);

alter table highlights enable row level security;

create policy "users can manage their own highlights"
  on highlights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Notes ──────────────────────────────────────────────────────────────────────

create table notes (
  id           uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references highlights(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  content      text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table notes enable row level security;

create policy "users can manage their own notes"
  on notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Bookmarks ──────────────────────────────────────────────────────────────────

create table bookmarks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  page_number  integer not null,
  label        text,
  created_at   timestamptz not null default now()
);

alter table bookmarks enable row level security;

create policy "users can manage their own bookmarks"
  on bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── AI conversations ───────────────────────────────────────────────────────────

create table ai_conversations (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  messages     jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table ai_conversations enable row level security;

create policy "users can manage their own ai conversations"
  on ai_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Reading sessions ───────────────────────────────────────────────────────────

create table reading_sessions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  progress_pct numeric(5,2) check (progress_pct >= 0 and progress_pct <= 100)
);

alter table reading_sessions enable row level security;

create policy "users can manage their own reading sessions"
  on reading_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Tags ───────────────────────────────────────────────────────────────────────

create table tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table tags enable row level security;

create policy "users can manage their own tags"
  on tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table document_tags (
  document_id uuid not null references documents(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  primary key (document_id, tag_id)
);

alter table document_tags enable row level security;

create policy "users can manage their own document tags"
  on document_tags for all
  using (
    exists (
      select 1 from documents d where d.id = document_id and d.user_id = auth.uid()
    )
  );

-- ── Collections ────────────────────────────────────────────────────────────────

create table collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table collections enable row level security;

create policy "users can manage their own collections"
  on collections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table collection_docs (
  collection_id uuid not null references collections(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  primary key (collection_id, document_id)
);

alter table collection_docs enable row level security;

create policy "users can manage their own collection docs"
  on collection_docs for all
  using (
    exists (
      select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()
    )
  );

-- ── updated_at triggers ────────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on documents
  for each row execute function update_updated_at();

create trigger notes_updated_at
  before update on notes
  for each row execute function update_updated_at();

create trigger ai_conversations_updated_at
  before update on ai_conversations
  for each row execute function update_updated_at();
