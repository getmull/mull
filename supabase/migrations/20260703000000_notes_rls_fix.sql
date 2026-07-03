-- Fix cross-user association vulnerability on notes, same pattern as the
-- document_tags/collection_docs fix in 20260629000001_rls_junction_fixes.sql:
-- the previous policy only checked notes.user_id, never that highlight_id
-- actually belongs to that user — a user could attach a note to another
-- user's highlight as long as they set user_id to themselves.

drop policy "users can manage their own notes" on notes;

create policy "users can manage their own notes"
  on notes for all
  using (
    auth.uid() = user_id
    and exists (select 1 from highlights h where h.id = highlight_id and h.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from highlights h where h.id = highlight_id and h.user_id = auth.uid())
  );
