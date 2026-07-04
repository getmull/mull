-- One conversation per (document, user) so the app can upsert on
-- (document_id, user_id) instead of a manual select-then-insert/update,
-- and so concurrent requests can't create duplicate conversation rows.

alter table ai_conversations
  add constraint ai_conversations_document_user_unique unique (document_id, user_id);
