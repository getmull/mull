-- Storage RLS for the documents bucket.
-- Objects are stored at {user_id}/{document_id}.pdf so path-based checks
-- ensure users can only access their own files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800, -- 50 MiB
  array['application/pdf']
)
on conflict (id) do nothing;

create policy "users can upload their own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "users can read their own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "users can delete their own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );
