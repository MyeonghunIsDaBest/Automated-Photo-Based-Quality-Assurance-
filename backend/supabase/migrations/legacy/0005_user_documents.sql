-- ─────────────────────────────────────────────────────────────────────────────
-- 0005_user_documents.sql — per-user attached documents (licences, IDs,
-- inductions, etc.) plus the storage bucket they live in.
--
-- Run AFTER 0004_profiles.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enum: when to fire the expiry reminder ──────────────────────────────────
do $$ begin
  create type expiry_alert as enum (
    '2_months', '1_month', '3_weeks', '2_weeks', '1_week'
  );
exception when duplicate_object then null; end $$;

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists user_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  document_name  text not null,
  reference_no   text,
  expiry_date    date,
  expiry_alert   expiry_alert,
  notes          text,
  storage_path   text not null,
  file_size_kb   int  not null default 0,
  uploaded_by    uuid references auth.users(id) on delete set null,
  uploaded_at    timestamptz not null default now()
);

create index if not exists idx_user_documents_user_id      on user_documents(user_id);
create index if not exists idx_user_documents_expiry_date  on user_documents(expiry_date) where expiry_date is not null;

-- ── Storage bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

drop policy if exists "user-docs: authed read"   on storage.objects;
drop policy if exists "user-docs: admin insert"  on storage.objects;
drop policy if exists "user-docs: admin delete"  on storage.objects;

-- Anyone signed in can read (so a worker can pull their own induction PDF
-- from the My Profile page). Tighten to `owner = auth.uid() OR is_admin_role`
-- once the profile-self view is built.
create policy "user-docs: authed read" on storage.objects
  for select using (
    bucket_id = 'user-documents' and auth.role() = 'authenticated'
  );

-- Only admins upload / delete (the dashboard is the only place that can
-- attach documents to a profile).
create policy "user-docs: admin insert" on storage.objects
  for insert with check (
    bucket_id = 'user-documents' and is_admin_role(auth.uid())
  );

create policy "user-docs: admin delete" on storage.objects
  for delete using (
    bucket_id = 'user-documents' and is_admin_role(auth.uid())
  );

-- ── Row-level security on the metadata table ────────────────────────────────
alter table user_documents enable row level security;

drop policy if exists "user_documents: authed read"  on user_documents;
drop policy if exists "user_documents: admin write"  on user_documents;

create policy "user_documents: authed read" on user_documents
  for select using (auth.role() = 'authenticated');

create policy "user_documents: admin write" on user_documents
  for all using (is_admin_role(auth.uid()))
  with check (is_admin_role(auth.uid()));
