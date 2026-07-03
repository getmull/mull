-- Fix cross-user association vulnerabilities on junction tables.
--
-- document_tags: previous with check only verified the document belonged to
-- the user, not the tag — a user could attach another user's tag to their doc.
--
-- collection_docs: same pattern — collection ownership was checked but not
-- document ownership, allowing a user to pull another user's document UUID
-- into their collection.

-- ── document_tags ─────────────────────────────────────────────────────────────

drop policy "users can manage their own document tags" on document_tags;

create policy "users can manage their own document tags"
  on document_tags for all
  using (
    exists (select 1 from documents d where d.id = document_id and d.user_id = auth.uid())
  )
  with check (
    exists (select 1 from documents d where d.id = document_id and d.user_id = auth.uid())
    and
    exists (select 1 from tags t where t.id = tag_id and t.user_id = auth.uid())
  );

-- ── collection_docs ───────────────────────────────────────────────────────────

drop policy "users can manage their own collection docs" on collection_docs;

create policy "users can manage their own collection docs"
  on collection_docs for all
  using (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
    and
    exists (select 1 from documents d where d.id = document_id and d.user_id = auth.uid())
  );
