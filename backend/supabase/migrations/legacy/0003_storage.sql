-- ─────────────────────────────────────────────────────────────────────────────
-- 0003_storage.sql — sets up the `photos` storage bucket and its policies.
--
-- Run AFTER 0002_photos_and_zones.sql.
--
-- Bucket layout used by the frontend:
--   photos/{project_id}/{photo_id}.{ext}            -- full size
--   photos/{project_id}/thumbs/{photo_id}.jpg       -- 400px thumbnail
--
-- The frontend uploads via signed URLs (`createSignedUploadUrl`) so only
-- authenticated users can write, and the file path is checked by the
-- policy below to make sure they can't overwrite someone else's project.
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the bucket if it doesn't exist.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- ── Storage policies ─────────────────────────────────────────────────────────
-- The `objects` table lives in the `storage` schema. RLS is already enabled
-- by Supabase; we just declare what authenticated users may do.

drop policy if exists "photos: authed read"   on storage.objects;
drop policy if exists "photos: authed insert" on storage.objects;
drop policy if exists "photos: authed update" on storage.objects;
drop policy if exists "photos: authed delete" on storage.objects;

create policy "photos: authed read" on storage.objects
  for select using (
    bucket_id = 'photos' and auth.role() = 'authenticated'
  );

create policy "photos: authed insert" on storage.objects
  for insert with check (
    bucket_id = 'photos' and auth.role() = 'authenticated'
  );

-- Only the original uploader (or service role) can mutate / delete an object.
create policy "photos: authed update" on storage.objects
  for update using (
    bucket_id = 'photos' and owner = auth.uid()
  );

create policy "photos: authed delete" on storage.objects
  for delete using (
    bucket_id = 'photos' and owner = auth.uid()
  );
