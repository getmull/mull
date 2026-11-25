-- Tracks the page a user last read to, so reopening a document resumes
-- there instead of always starting at page 1. progress_pct already exists
-- but doesn't by itself encode which page to jump back to.
alter table documents
  add column last_page integer check (last_page >= 1);
