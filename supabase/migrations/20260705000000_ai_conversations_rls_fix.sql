-- Fix cross-user association vulnerability on ai_conversations, same pattern
-- as the notes fix in 20260703000000_notes_rls_fix.sql: the previous policy
-- only checked ai_conversations.user_id, never that document_id actually
-- belongs to that user — a user could attach a conversation to another
-- user's document as long as they set user_id to themselves.

drop policy "users can manage their own ai conversations" on ai_conversations;

create policy "users can manage their own ai conversations"
  on ai_conversations for all
  using (
    auth.uid() = user_id
    and exists (select 1 from documents d where d.id = document_id and d.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from documents d where d.id = document_id and d.user_id = auth.uid())
  );
