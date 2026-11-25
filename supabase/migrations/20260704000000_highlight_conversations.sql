-- Persisted chat thread scoped to a single highlight — backs the
-- Explain/Define/Simplify/Translate actions (as seeds) plus any freeform
-- follow-up questions about that highlight. A separate table from
-- ai_conversations (rather than a nullable highlight_id column there) so
-- this feature can't touch/risk Ask AI, and so "one thread per highlight"
-- can be a real unique constraint from day one instead of a follow-up
-- migration (see 20260703000001_ai_conversations_unique.sql).

create table highlight_conversations (
  id           uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references highlights(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Same size guard as ai_conversations.messages — see that table's comment.
  messages     jsonb not null default '[]' check (octet_length(messages::text) < 65536),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (highlight_id, user_id)
);

alter table highlight_conversations enable row level security;

-- Same cross-user association check as notes (20260703000000_notes_rls_fix.sql)
-- and document_tags/collection_docs (20260629000001_rls_junction_fixes.sql):
-- user_id alone isn't enough, since a user could otherwise attach a
-- conversation to another user's highlight_id as long as they set user_id
-- to themselves. Getting this right from day one here rather than needing a
-- follow-up fix migration like those two did.
create policy "users can manage their own highlight conversations"
  on highlight_conversations for all
  using (
    auth.uid() = user_id
    and exists (select 1 from highlights h where h.id = highlight_id and h.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from highlights h where h.id = highlight_id and h.user_id = auth.uid())
  );

create trigger highlight_conversations_updated_at
  before update on highlight_conversations
  for each row execute function update_updated_at();
