-- 18_project_phase_status.sql
-- One verdict row per (project, phase). Written by the complete-phase Edge
-- Function (service role). Read by managers in the Review tab.
--
-- Sequence: 00_init … 17_photos_phase_hint, 18_project_phase_status ← THIS.
create table if not exists public.project_phase_status (
  project_id      uuid not null references public.projects(id) on delete cascade,
  phase           text not null,
  status          text not null default 'incomplete'
                    check (status in ('complete','incomplete')),
  verdict_text    text,
  blockers        text[] not null default '{}',
  ready_for_next  boolean not null default false,
  model_used      text,
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (project_id, phase)
);

-- RLS: read for any authenticated user (matches `ai_analyses: read`). Writes
-- come from the Edge Function via the service-role key (RLS-exempt), so no
-- insert/update policy is needed.
alter table public.project_phase_status enable row level security;
drop policy if exists "phase_status: read" on public.project_phase_status;
create policy "phase_status: read" on public.project_phase_status
  for select using (auth.role() = 'authenticated');

-- Realtime so the Review tab can reflect a verdict landing live.
-- ALTER PUBLICATION ADD TABLE has no "if not exists"; swallow the dup error.
do $$ begin
  alter publication supabase_realtime add table public.project_phase_status;
exception when duplicate_object then null; end $$;
