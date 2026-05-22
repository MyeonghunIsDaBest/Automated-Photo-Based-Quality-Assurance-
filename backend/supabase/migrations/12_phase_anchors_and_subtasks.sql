-- Phase anchors + sub-task hierarchy.
--
-- Until now, tasks were free-form: a user created any task with any
-- construction_phase. That meant projects had inconsistent schedules — one
-- might have a single "Framing" task at 0%, another might have five sub-
-- divisions across the same phase, a third might have nothing at all.
--
-- This migration enforces the invariant that **every project has all 8
-- construction phases as parent rows** at 0% by default. Site managers add
-- child sub-tasks under each phase (e.g. Foundation → Slab A / Slab B).
-- Phase anchors are non-deletable; child tasks behave as before.
--
-- The `parent_task_id` column already exists in `00_init.sql:427`, so the
-- nesting infrastructure is in place. This migration adds the anchor flag,
-- the auto-seed trigger, and the backfill.
--
-- Sequence: 00_init … 11_owner_tier, 12_phase_anchors_and_subtasks ← THIS.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. is_phase_anchor column.
-- ──────────────────────────────────────────────────────────────────────────
alter table public.tasks
  add column if not exists is_phase_anchor boolean not null default false;

-- Partial unique index: each project gets at most one anchor per phase.
-- Idempotent — the seed trigger uses on-conflict-do-nothing against this.
create unique index if not exists idx_tasks_phase_anchor_unique
  on public.tasks (project_id, phase)
  where is_phase_anchor;

-- Sanity: a phase anchor cannot have a parent. Children attach TO anchors,
-- not the other way around.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_phase_anchor_no_parent'
  ) then
    alter table public.tasks
      add constraint tasks_phase_anchor_no_parent
      check (not is_phase_anchor or parent_task_id is null);
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Seed function — inserts 8 phase-anchor rows for a given project.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.seed_phase_anchors(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end   date;
begin
  -- Pull project's date window so the anchor rows have sensible defaults.
  -- (Falls back to today/+90d if for some reason the project row is gone.)
  select start_date, end_date into v_start, v_end
    from public.projects where id = p_project_id;
  if v_start is null then v_start := current_date; end if;
  if v_end   is null then v_end   := current_date + interval '90 days'; end if;

  -- `idx_tasks_phase_anchor_unique` is a partial unique INDEX, not a unique
  -- CONSTRAINT. PG only accepts `on conflict on constraint` for the latter.
  -- Use index inference instead: the column list + the partial WHERE
  -- predicate must match the index's predicate for the arbiter to be
  -- selected.
  insert into public.tasks
    (project_id, name, phase, start_date, end_date, percent_complete, status, is_phase_anchor)
  values
    (p_project_id, 'Excavation', 'excavation', v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Foundation', 'foundation', v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Framing',    'framing',    v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Roofing',    'roofing',    v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Electrical', 'electrical', v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Plumbing',   'plumbing',   v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Drywall',    'drywall',    v_start, v_end, 0, 'not_started', true),
    (p_project_id, 'Finishing',  'finishing',  v_start, v_end, 0, 'not_started', true)
  on conflict (project_id, phase) where is_phase_anchor do nothing;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Auto-seed trigger on project INSERT.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.trg_seed_phase_anchors() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform seed_phase_anchors(new.id);
  return new;
end
$$;

drop trigger if exists trg_seed_phase_anchors on public.projects;
create trigger trg_seed_phase_anchors
  after insert on public.projects
  for each row execute function public.trg_seed_phase_anchors();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Backfill — every existing project gets its 8 anchors.
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in select id from public.projects loop
    perform seed_phase_anchors(r.id);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. SQL helper — rolled-up % for a phase anchor (avg of its children).
--    Leaf tasks return their own percent_complete unchanged.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.rolled_up_pct(p_task_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select * from tasks where id = p_task_id
  )
  select
    case
      when t.is_phase_anchor then
        coalesce(
          (select round(avg(percent_complete))::int
             from tasks where parent_task_id = t.id),
          0
        )
      else t.percent_complete
    end
  from target t;
$$;
