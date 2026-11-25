-- A bookmark must belong to the authenticated user AND to one of their
-- documents. Check the parent on reads, inserts, updates, and deletes so
-- direct PostgREST access cannot attach or move a bookmark to another user.
drop policy "users can manage their own bookmarks" on bookmarks;

create policy "users can manage their own bookmarks"
  on bookmarks for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from documents
      where documents.id = bookmarks.document_id
        and documents.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from documents
      where documents.id = bookmarks.document_id
        and documents.user_id = auth.uid()
    )
  );
