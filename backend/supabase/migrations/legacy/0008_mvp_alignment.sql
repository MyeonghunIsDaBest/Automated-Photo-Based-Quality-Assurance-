-- ─────────────────────────────────────────────────────────────────────────────
-- 0008_mvp_alignment.sql — align the `tasks` schema with the frontend Task
-- type, replace blanket "any-authed-user" RLS with role-gated policies based
-- on the `security_group` enum from 0004_profiles.sql.
--
-- Run AFTER 0007_suppliers.sql.
-- Idempotent: re-running this is safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Task columns the frontend already expects ────────────────────────────
alter table tasks
  add column if not exists assignee_id    uuid references profiles(id) on delete set null,
  add column if not exists parent_task_id uuid references tasks(id)    on delete cascade,
  add column if not exists update_source  text not null default 'manual'
    check (update_source in ('manual', 'ai_auto', 'supervisor'));

create index if not exists idx_tasks_assignee     on tasks(assignee_id);
create index if not exists idx_tasks_parent_task  on tasks(parent_task_id);

-- ── 2. Convert tasks.notes from text → jsonb array (matches Task.notes:string[]) ─
-- Detect via information_schema so re-running is a no-op.
do $$
declare
  v_type text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tasks' and column_name = 'notes';

  if v_type = 'text' then
    alter table tasks add column if not exists notes_json jsonb not null default '[]'::jsonb;

    update tasks
       set notes_json = case
             when notes is null or length(trim(notes)) = 0 then '[]'::jsonb
             else jsonb_build_array(notes)
           end
     where notes_json = '[]'::jsonb;

    alter table tasks drop column notes;
    alter table tasks rename column notes_json to notes;
  end if;
end $$;

-- ── 3. Replace blanket task RLS with role-gated policies ────────────────────
-- Reads stay open to any authed user (profile dropdowns, assignment, etc.).
-- Writes split by security_group:
--   • create / update any task   → manager-tier (company_admin, administrator,
--                                  construction_mgr, project_manager, site_manager)
--   • update tasks assigned to me → workers (so a worker can move their own % bar)
--   • delete                      → admin only

drop policy if exists "tasks: authed write"            on tasks;
drop policy if exists "tasks: insert by manager+"      on tasks;
drop policy if exists "tasks: update by manager+"      on tasks;
drop policy if exists "tasks: update own assignments"  on tasks;
drop policy if exists "tasks: delete by admin"         on tasks;

create policy "tasks: insert by manager+" on tasks
  for insert with check (
    exists (
      select 1 from profiles p
       where p.id = auth.uid()
         and p.is_active
         and p.security_group in (
           'company_admin','administrator','construction_mgr',
           'project_manager','site_manager'
         )
    )
  );

create policy "tasks: update by manager+" on tasks
  for update using (
    exists (
      select 1 from profiles p
       where p.id = auth.uid()
         and p.is_active
         and p.security_group in (
           'company_admin','administrator','construction_mgr',
           'project_manager','site_manager'
         )
    )
  ) with check (
    exists (
      select 1 from profiles p
       where p.id = auth.uid()
         and p.is_active
         and p.security_group in (
           'company_admin','administrator','construction_mgr',
           'project_manager','site_manager'
         )
    )
  );

create policy "tasks: update own assignments" on tasks
  for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

create policy "tasks: delete by admin" on tasks
  for delete using (is_admin_role(auth.uid()));

-- ── 4. Replace blanket photo RLS with role-aware policies ───────────────────
-- Insert: any authed user (workers must be able to upload).
-- Update / delete: uploader or admin only.

drop policy if exists "photos: authed write"               on photos;
drop policy if exists "photos: insert by authed"           on photos;
drop policy if exists "photos: update by uploader/admin"   on photos;
drop policy if exists "photos: delete by uploader/admin"   on photos;

create policy "photos: insert by authed" on photos
  for insert with check (auth.role() = 'authenticated');

create policy "photos: update by uploader/admin" on photos
  for update using (uploaded_by = auth.uid() or is_admin_role(auth.uid()))
  with check (uploaded_by = auth.uid() or is_admin_role(auth.uid()));

create policy "photos: delete by uploader/admin" on photos
  for delete using (uploaded_by = auth.uid() or is_admin_role(auth.uid()));

-- ── 5. RPC: claim_first_admin() ─────────────────────────────────────────────
-- One-shot bootstrap. Promotes the calling user to company_admin only when
-- no admin (company_admin or administrator) exists yet. Subsequent calls are
-- no-ops, so leaving the RPC in place after first use is safe.
create or replace function claim_first_admin() returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_existing int;
begin
  if v_caller is null then
    return false;
  end if;

  select count(*) into v_existing
    from profiles
   where security_group in ('company_admin','administrator')
     and is_active;

  if v_existing > 0 then
    return false;
  end if;

  update profiles
     set security_group = 'company_admin',
         is_active      = true
   where id = v_caller;

  return true;
end;
$$;

grant execute on function claim_first_admin() to authenticated;
